import { prefetchRoute } from "@/lib/nav/route-chunks";

/**
 * Warm the screens this person can actually open, while the browser is idle.
 *
 * Hover prefetching handles a deliberate click. This handles the first one —
 * and the pointer that goes straight from the page to a menu item without
 * pausing. It runs after the shell is interactive, one screen at a time, so
 * it competes with nothing the person is doing.
 *
 * WHAT IT DELIBERATELY WILL NOT DO
 *
 * It takes the menu *as rendered*, which is already filtered by role,
 * permission, entitlement and scope — so it never downloads a screen the
 * person is not allowed to open, and never reveals one either. Prefetching is
 * a network optimisation and carries no authority: the route guard and row
 * level security decide what a screen shows, exactly as before.
 *
 * It also stands down on a connection that should not be spent this way —
 * Data Saver, or 2g/3g — where the cost of speculative downloads lands on
 * someone paying by the megabyte.
 */

type NetworkInformation = {
  saveData?: boolean;
  effectiveType?: string;
};

const affordable = (): boolean => {
  const connection = (navigator as Navigator & { connection?: NetworkInformation })
    .connection;
  if (!connection) return true;
  if (connection.saveData) return false;
  return !/(^|-)(2g|slow-2g)$/.test(connection.effectiveType ?? "");
};

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Run `work` when the browser next has nothing better to do, and return the
 * way to call it off.
 *
 * The canceller travels with the handle on purpose: an idle-callback id and a
 * timeout id are separate counters, so cancelling one kind with the other's
 * function silently does nothing — and can cancel an unrelated timer that
 * happens to share the number.
 */
const whenIdle = (work: () => void): (() => void) => {
  const idle = window as IdleWindow;
  if (idle.requestIdleCallback && idle.cancelIdleCallback) {
    const handle = idle.requestIdleCallback(work, { timeout: 2000 });
    return () => idle.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(work, 300);
  return () => window.clearTimeout(handle);
};

/**
 * How many menu screens the idle pass warms. The menu arrives in its drawn
 * order, so these are the entries at the top: Home, Attention, Communication,
 * My Work, End of Day — the screens every role opens daily.
 *
 * Dee, 2026-10-03: opening one module must not download most of FullSuite.
 * Measured on the production build of 2026-10-14 (static imports from each
 * route's entry chunk, beyond the shell): warming every registered route
 * pulled 323 extra files / 2.6 MB after ANY page; this cap pulls 103 files /
 * 0.7 MB, and one module opened by hand costs about 120 files / 0.5 MB once,
 * then comes from cache. A deliberate click still has hover/focus warming
 * (PrefetchLink); on a phone a tap loads the one screen it asked for.
 */
export const IDLE_WARM_LIMIT = 5;

/**
 * Queue the first `IDLE_WARM_LIMIT` of `hrefs` for background loading,
 * nearest the top of the menu first. Returns a function that abandons
 * whatever has not started yet.
 */
export const prefetchVisibleRoutes = (hrefs: readonly string[]): (() => void) => {
  if (!affordable()) return () => {};

  const queue = hrefs.slice(0, IDLE_WARM_LIMIT);
  let cancelled = false;
  let index = 0;
  let stop = () => {};

  const step = () => {
    if (cancelled || index >= queue.length) return;
    prefetchRoute(queue[index++]);
    stop = whenIdle(step);
  };

  stop = whenIdle(step);
  return () => {
    cancelled = true;
    stop();
  };
};
