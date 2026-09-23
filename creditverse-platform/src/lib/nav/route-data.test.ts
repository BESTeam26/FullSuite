/**
 * A prefetch under the wrong key is worse than no prefetch.
 *
 * It fills the cache with an entry nothing reads, so the screen still fetches
 * on mount: the request count doubles, the wait is unchanged, and every
 * measurement says the feature shipped. Nothing fails. That is the failure
 * mode this file exists to make impossible.
 *
 * So these do not test that prefetching "works" — they test the only thing
 * that can quietly rot: that the key and fetcher warmed here are the ones the
 * screen actually renders from.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ROUTE_DATA, prefetchRouteData } from "./route-data";

const src = (f: string) => readFileSync(f, "utf8");

describe("every warmed key is a key some screen reads", () => {
  it("CreditOps clients — the store builds it from its own config", () => {
    /* ops-client-store: `const clientsKey = [config.queryKey, "clients"]`,
       and creditops-client-store passes `queryKey: "creditops"`. Both halves
       are checked, because either one moving breaks the match silently. */
    expect(src("src/lib/fulfillment/ops-client-store.tsx"))
      .toContain('[config.queryKey, "clients"]');
    expect(src("src/lib/fulfillment/creditops-client-store.tsx"))
      .toMatch(/queryKey:\s*"creditops"/);
    expect(Object.keys(ROUTE_DATA)).toContain("/app/creditops");
  });

  it("My Work and Attention — spelled as use-work.ts spells them", () => {
    const work = src("src/lib/data/use-work.ts");
    expect(work).toContain('queryKey: ["work", "mine", userId]');
    expect(work).toContain('queryKey: ["work", "attention"]');
  });

  it("Communication and People — imported from the hook, so they cannot drift", async () => {
    /* These two export their key. Importing it is stronger than any assertion:
       a rename is a compile error rather than a silent miss. */
    const { channelsKey } = await import("@/lib/data/use-channels");
    const { workforceKey } = await import("@/lib/data/use-workforce");
    expect(channelsKey).toEqual(["channels"]);
    expect(workforceKey).toEqual(["agency", "workforce"]);
    for (const r of ["/app/channels", "/app/people", "/app/time"]) {
      expect(Object.keys(ROUTE_DATA)).toContain(r);
    }
  });

  it("warms the fetchers the screens call, not re-implementations of them", () => {
    /* If somebody writes a bespoke query here it can drift from the screen's
       own shape and warm something subtly different. */
    const reg = src("src/lib/nav/route-data.ts");
    expect(reg).toContain('from "@/lib/data/fulfillment-clients"');
    expect(reg).toContain('from "@/lib/data/work-items"');
    expect(reg, "a prefetch must not build its own supabase call")
      .not.toMatch(/\.from\(|supabase/i);
  });
});

describe("prefetchRouteData is safe to call on any hover", () => {
  const client = () => ({ prefetchQuery: vi.fn() });

  it("warms nothing for a route with no entry", () => {
    const qc = client();
    prefetchRouteData(qc as never, "/app/something-else", "u1");
    expect(qc.prefetchQuery).not.toHaveBeenCalled();
  });

  it("warms the route's queries when there is an entry", () => {
    const qc = client();
    prefetchRouteData(qc as never, "/app/creditops", "u1");
    expect(qc.prefetchQuery).toHaveBeenCalledTimes(1);
    expect(qc.prefetchQuery.mock.calls[0][0].queryKey).toEqual(["creditops", "clients"]);
  });

  it("carries the signed-in person into the keys that are per-person", () => {
    const qc = client();
    prefetchRouteData(qc as never, "/app/my-work", "user-42");
    expect(qc.prefetchQuery.mock.calls[0][0].queryKey).toEqual(["work", "mine", "user-42"]);
  });

  it("never lets a hover throw", () => {
    const qc = { prefetchQuery: vi.fn(() => { throw new Error("offline"); }) };
    expect(() => prefetchRouteData(qc as never, "/app/creditops", "u1")).not.toThrow();
  });
});
