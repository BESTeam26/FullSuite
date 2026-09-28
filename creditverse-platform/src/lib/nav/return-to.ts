/**
 * "Back" that goes back to where you actually were.
 *
 * Dee, 2026-09-26: *"if I select a client and go back to client list, I wanna
 * make sure we go back to the actual list we're working on and not on the main
 * list or other list."*
 *
 * A CreditOps client is its own page (`/app/creditops/cases/:id`), which is
 * what makes it linkable and openable in a new tab. The cost is that the page
 * it was opened FROM is gone by the time Back is pressed, and the button was
 * sending everybody to one fixed address — so opening a client from Vanquish
 * Ventures' list and pressing Back landed on the shared Main Client List.
 *
 * ── WHY NOT `navigate(-1)` ────────────────────────────────────────────────
 *
 * Browser history has no idea whether the previous entry belongs to this app.
 * Somebody who opened the client from a link in an email, a notification, or
 * a new tab has no previous entry, and `-1` walks them out of BES entirely.
 * An explicit return address is either there or it is not, and when it is not
 * the caller says where to land instead.
 */
import type { Location } from "react-router-dom";

interface ReturnState {
  from?: unknown;
}

/** Router state that records the page being left, to hand to `navigate`. */
export const fromHere = (loc: Pick<Location, "pathname" | "search">) => ({
  from: `${loc.pathname}${loc.search}`,
});

/**
 * The same thing, read at click time instead of subscribed to.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * `useLocation()` SUBSCRIBES a component to the router. On a screen holding a
 * 1,228-row table that is expensive in a way nothing about the call site
 * suggests: `navigate()` changes the location, every subscriber re-renders,
 * and the click that opened a client spends its time re-rendering the list it
 * is leaving. Chrome reported it as an INP of 233ms on the row.
 *
 * I introduced exactly that on 2026-09-27 by adding `useLocation()` to the
 * client list purely to build this value — a hook called for its return value,
 * which quietly brought a subscription with it.
 *
 * Under `BrowserRouter` the browser's own URL is the router's URL, so reading
 * it inside the handler gives the same answer with no subscription and no
 * re-render. Components that genuinely need to RE-RENDER on navigation should
 * still use `useLocation`; this is for the ones that only need to know where
 * they are at the moment somebody clicks.
 */
export const fromCurrentUrl = () => ({
  from: `${window.location.pathname}${window.location.search}`,
});

/**
 * The address to return to, or the caller's fallback.
 *
 * Only an in-app path is accepted. Router state is ordinary client-side data:
 * anything that can push a history entry can put a value here, and a `from`
 * of `https://elsewhere.example` would turn a Back button into an open
 * redirect. A leading `//` is rejected for the same reason — the browser reads
 * it as protocol-relative, so `//evil.example` is NOT a local path.
 */
export function returnTo(state: unknown, fallback: string): string {
  const from = (state as ReturnState | null | undefined)?.from;
  if (typeof from !== "string") return fallback;
  if (!from.startsWith("/") || from.startsWith("//")) return fallback;
  return from;
}
