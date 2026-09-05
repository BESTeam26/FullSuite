import { describe, expect, it } from "vitest";
import { canMoveCommission, computeCommission, nextCommissionStates } from "./commission-math";

describe("commission math", () => {
  it("computes a percentage of gross funded, rounded to cents, and passes a flat amount through", () => {
    expect(computeCommission("pct", 7.5, 45_000)).toBe(3375);
    expect(computeCommission("pct", 3.333, 10_000)).toBe(333.3);
    expect(computeCommission("flat", 1_250, 45_000)).toBe(1250);
  });
  it("never yields a negative or non-finite amount", () => {
    expect(computeCommission("pct", -5, 45_000)).toBe(0);
    expect(computeCommission("flat", Number.NaN, 45_000)).toBe(0);
  });
  it("moves pending → approved → paid, void from open states only, and nowhere from paid or void", () => {
    expect(nextCommissionStates("pending")).toEqual(["approved", "void"]);
    expect(canMoveCommission("approved", "paid")).toBe(true);
    expect(canMoveCommission("pending", "paid")).toBe(false);
    expect(nextCommissionStates("paid")).toEqual([]);
    expect(nextCommissionStates("void")).toEqual([]);
  });
});
