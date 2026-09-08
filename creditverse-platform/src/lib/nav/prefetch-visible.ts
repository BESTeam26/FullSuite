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
 * Queue `hrefs` for background loading, nearest the top of the menu first.
 * Returns a function that abandons whatever has not started yet.
 */
export const prefetchVisibleRoutes = (hrefs: readonly string[]): (() => void) => {
  if (!affordable()) return () => {};

  let cancelled = false;
  let index = 0;
  let stop = () => {};

  const step = () => {
    if (cancelled || index >= hrefs.length) return;
    prefetchRoute(hrefs[index++]);
    stop = whenIdle(step);
  };

  stop = whenIdle(step);
  return () => {
    cancelled = true;
    stop();
  };
};
