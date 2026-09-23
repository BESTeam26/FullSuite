import type { QueryClient } from "@tanstack/react-query";

/**
 * The DATA each screen needs first, warmed before the click lands.
 *
 * WHY THIS FILE EXISTS
 *
 * `route-chunks.ts` already warms each screen's JavaScript on hover, and it
 * works — the shell of a screen paints in about 100ms. But the chunk was only
 * ever half the wait. Measured on production, 2026-09-23:
 *
 *     click CreditOps → shell at 83ms → rows and counts at 403ms
 *     click People    → shell at 102ms → settles at 1352ms, over seven repaints
 *
 * Everything after the shell is the screen's own queries, and they cannot
 * start until the component mounts. So the person watches a laid-out page with
 * nothing in it. Dee, 2026-09-23: "i want real time load experience with no
 * feeling of latency at all."
 *
 * A pointer rests on a menu item for a few hundred milliseconds before the
 * click — the same gap that makes chunk prefetching work. Starting the QUERIES
 * in that gap means the cache is warm when the screen mounts and the data is
 * simply there, with no fetch to wait for.
 *
 * ── THE ONE RULE THAT MAKES THIS REAL ─────────────────────────────────────
 *
 * The key and the function here must be THE SAME ONES THE SCREEN USES. A
 * prefetch under a near-miss key fills the cache with something nothing reads:
 * it looks like it is working, doubles the requests, and speeds up nothing. So
 * every entry imports the screen's own fetcher rather than re-implementing the
 * call, and the keys are spelled exactly as the hooks spell them. The test
 * beside this file pins that correspondence.
 *
 * `prefetchQuery` is a no-op when a fresh entry already exists, so hovering a
 * menu repeatedly costs one request, not one per hover.
 */

import { fetchFulfillmentClients } from "@/lib/data/fulfillment-clients";
import { fetchAttention, fetchMyWork } from "@/lib/data/work-items";

/** How long a warmed entry counts as fresh. Matches the hooks' own staleTime. */
const FRESH = 15_000;

type Warm = (qc: QueryClient, userId: string) => void;

/**
 * Route → the queries that screen renders from.
 *
 * Only the query a screen is EMPTY WITHOUT belongs here. Warming a panel that
 * loads lazily further down the page spends a request on something nobody is
 * waiting for, which is the opposite of the point (rule 14).
 */
export const ROUTE_DATA: Record<string, Warm[]> = {
  /* `["creditops", "clients"]` — ops-client-store builds it as
     [config.queryKey, "clients"] and the CreditOps store passes "creditops". */
  "/app/creditops": [
    (qc) => void qc.prefetchQuery({
      queryKey: ["creditops", "clients"],
      queryFn: fetchFulfillmentClients,
      staleTime: FRESH,
    }),
  ],
  "/app/my-work": [
    (qc, userId) => void qc.prefetchQuery({
      queryKey: ["work", "mine", userId],
      queryFn: () => fetchMyWork(userId),
      staleTime: FRESH,
    }),
  ],
  "/app/attention": [
    (qc) => void qc.prefetchQuery({
      queryKey: ["work", "attention"],
      queryFn: fetchAttention,
      staleTime: FRESH,
    }),
  ],
};

/**
 * Warm one route's data. Safe to call on every hover: unknown routes do
 * nothing, and a fresh cache entry is left alone.
 *
 * Failures are swallowed on purpose. A prefetch is an optimisation, and a
 * screen that is about to run the same query will surface any real error
 * through its own loading path — reporting it twice, once from a hover the
 * person did not know they made, would be noise.
 */
export function prefetchRouteData(qc: QueryClient, path: string, userId: string): void {
  const warms = ROUTE_DATA[path];
  if (!warms) return;
  for (const warm of warms) {
    try { warm(qc, userId); } catch { /* an optimisation never breaks a click */ }
  }
}
