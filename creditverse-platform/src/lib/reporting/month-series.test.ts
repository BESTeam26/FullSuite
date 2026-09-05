import { describe, expect, it } from "vitest";
import { bucketByMonth, lastMonths, rate } from "./month-series";

describe("month series", () => {
  const now = new Date("2026-09-15T12:00:00Z");
  it("yields the last six calendar months oldest first, labelling other years", () => {
    const b = lastMonths(now, 6);
    expect(b.map((x) => x.key)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(lastMonths(new Date("2026-01-10T00:00:00Z"), 3).map((x) => x.label)).toEqual(["Nov 25", "Dec 25", "Jan"]);
  });
  it("counts and sums into buckets, zero-filling gaps and ignoring rows outside the window", () => {
    const b = lastMonths(now, 3);
    const rows = [{ at: "2026-07-03T00:00:00Z", v: 10 }, { at: "2026-07-20T00:00:00Z", v: 5 }, { at: "2026-09-01T00:00:00Z", v: 1 }, { at: "2025-12-01T00:00:00Z", v: 99 }, { at: null, v: 7 }];
    expect(bucketByMonth(rows, b, (r) => r.at)).toEqual([2, 0, 1]);
    expect(bucketByMonth(rows, b, (r) => r.at, (r) => r.v)).toEqual([15, 0, 1]);
  });
  it("rates are null without a denominator", () => {
    expect(rate(3, 4)).toBe(75);
    expect(rate(0, 0)).toBeNull();
  });
});
