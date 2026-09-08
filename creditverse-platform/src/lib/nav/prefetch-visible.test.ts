import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prefetchVisibleRoutes } from "./prefetch-visible";
import { isWarmed, resetWarmed } from "./route-chunks";

/** Drive requestIdleCallback by hand so the schedule is observable. */
const queue: (() => void)[] = [];
let cancelled: number[] = [];

beforeEach(() => {
  resetWarmed();
  queue.length = 0;
  cancelled = [];
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => {
    queue.push(cb);
    return queue.length;
  });
  vi.stubGlobal("cancelIdleCallback", (h: number) => cancelled.push(h));
});
afterEach(() => vi.unstubAllGlobals());

const drain = (times: number) => {
  for (let i = 0; i < times; i++) queue.shift()?.();
};

describe("prefetchVisibleRoutes", () => {
  it("warms the menu one screen at a time, in order", () => {
    prefetchVisibleRoutes(["/app/settings", "/app/reporting", "/app/people"]);
    expect(isWarmed("/app/settings")).toBe(false);

    drain(1);
    expect(isWarmed("/app/settings")).toBe(true);
    expect(isWarmed("/app/reporting")).toBe(false);

    drain(2);
    expect(isWarmed("/app/reporting")).toBe(true);
    expect(isWarmed("/app/people")).toBe(true);
  });

  it("stops scheduling once the menu is warm", () => {
    prefetchVisibleRoutes(["/app/settings"]);
    drain(5);
    expect(queue.length).toBe(0);
  });

  it("abandons the rest when cancelled, and cancels with the matching API", () => {
    const cancel = prefetchVisibleRoutes(["/app/settings", "/app/reporting"]);
    drain(1);
    cancel();
    drain(5);
    expect(isWarmed("/app/settings")).toBe(true);
    expect(isWarmed("/app/reporting")).toBe(false);
    // The idle handle must be released through cancelIdleCallback, never
    // clearTimeout: the two id spaces overlap and would cancel a stranger.
    expect(cancelled.length).toBeGreaterThan(0);
  });

  it("does nothing on a Data Saver connection", () => {
    vi.stubGlobal("navigator", { connection: { saveData: true, effectiveType: "4g" } });
    prefetchVisibleRoutes(["/app/settings"]);
    expect(queue.length).toBe(0);
  });

  it("does nothing on 2g", () => {
    vi.stubGlobal("navigator", { connection: { saveData: false, effectiveType: "2g" } });
    prefetchVisibleRoutes(["/app/settings"]);
    expect(queue.length).toBe(0);
  });

  it("does nothing on slow-2g", () => {
    vi.stubGlobal("navigator", { connection: { saveData: false, effectiveType: "slow-2g" } });
    prefetchVisibleRoutes(["/app/settings"]);
    expect(queue.length).toBe(0);
  });

  it("proceeds on 4g, and on a browser that reports no connection at all", () => {
    vi.stubGlobal("navigator", { connection: { saveData: false, effectiveType: "4g" } });
    prefetchVisibleRoutes(["/app/settings"]);
    expect(queue.length).toBe(1);

    queue.length = 0;
    vi.stubGlobal("navigator", {});
    prefetchVisibleRoutes(["/app/reporting"]);
    expect(queue.length).toBe(1);
  });

  it("is a no-op for an empty menu", () => {
    prefetchVisibleRoutes([]);
    drain(3);
    expect(queue.length).toBe(0);
  });
});
