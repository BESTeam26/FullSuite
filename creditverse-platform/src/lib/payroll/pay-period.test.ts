import { describe, expect, it } from "vitest";
import { currentPayPeriod, describeRate } from "./pay-period";

const money = (c: number, cur: string) => `${(c / 100).toLocaleString("en-US")} ${cur}`;

describe("the pay period in progress (split day 15)", () => {
  it("the 1st to the 15th in the first half", () => {
    expect(currentPayPeriod("2026-10-01", 15)).toEqual({ start: "2026-10-01", end: "2026-10-15" });
    expect(currentPayPeriod("2026-10-15", 15)).toEqual({ start: "2026-10-01", end: "2026-10-15" });
  });
  it("the 16th to month end in the second half, whatever the month's length", () => {
    expect(currentPayPeriod("2026-10-20", 15)).toEqual({ start: "2026-10-16", end: "2026-10-31" });
    expect(currentPayPeriod("2026-02-28", 15)).toEqual({ start: "2026-02-16", end: "2026-02-28" });
  });
});

describe("how a rate reads", () => {
  it("a monthly package with its derived hour", () => {
    expect(describeRate("monthly", 2500000, "PHP", 14200, money)).toBe("25,000 PHP / month · 142 PHP / hr");
  });
  it("an hourly rate on its own", () => {
    expect(describeRate("hourly", 8000, "PHP", 8000, money)).toBe("80 PHP / hr");
  });
  it("no rate says so", () => {
    expect(describeRate(null, null, null, null, money)).toBe("No rate on file");
  });
});
