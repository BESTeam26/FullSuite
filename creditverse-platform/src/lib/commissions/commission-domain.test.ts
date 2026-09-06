import { describe, expect, it } from "vitest";
import {
  canPay, computeCommission, nextStates, totals, type CommissionPlan,
} from "./commission-domain";

const pct = (rate: number, appliesTo: CommissionPlan["appliesTo"] = "net_funded"): CommissionPlan =>
  ({ basis: "pct", rateOrAmount: rate, appliesTo });
const flat = (amount: number): CommissionPlan => ({ basis: "flat", rateOrAmount: amount, appliesTo: "net_funded" });
const deal = { grossFunded: 90000, netFunded: 80000, acceptedOfferAmount: 90000 };

describe("computeCommission", () => {
  it("takes a percentage of the figure the plan names", () => {
    const r = computeCommission(pct(5), deal);
    expect(r).toMatchObject({ ok: true, amount: 4000, basisAmount: 80000 });
    expect(r.ok && r.explain).toBe("5% of net funded ($80,000.00).");
  });

  it("uses gross when that is what the plan says", () => {
    expect(computeCommission(pct(5, "gross_funded"), deal)).toMatchObject({ amount: 4500 });
  });

  it("pays a flat plan its exact amount, whatever the deal", () => {
    expect(computeCommission(flat(750), deal)).toMatchObject({ ok: true, amount: 750, basisAmount: null });
    expect(computeCommission(flat(750), {})).toMatchObject({ ok: true, amount: 750 });
  });

  it("REFUSES a percentage of a figure the deal does not record", () => {
    /* Unknown is not zero. Returning zero would book a nil commission somebody
       genuinely earned, and nobody would ever notice. */
    const r = computeCommission(pct(5), { netFunded: null });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.because).toContain("does not record net funded");
  });

  it("refuses a rate that is not a rate", () => {
    expect(computeCommission(pct(140), deal).ok).toBe(false);
    expect(computeCommission(pct(-1), deal).ok).toBe(false);
  });

  it("rounds to the cent", () => {
    expect(computeCommission(pct(3.33), { netFunded: 12345 })).toMatchObject({ amount: 411.09 });
  });
});

describe("the lifecycle", () => {
  it("keeps earned and payable apart", () => {
    expect(nextStates("earned")).toContain("payable");
    expect(nextStates("earned")).not.toContain("paid");
  });

  it("will not pay from earned, and says why in plain words", () => {
    const r = canPay("earned");
    expect(r.allowed).toBe(false);
    expect(r.because).toContain("Earned is not the same as received");
  });

  it("pays from payable", () => {
    expect(canPay("payable").allowed).toBe(true);
  });

  it("does not pay twice", () => {
    expect(canPay("paid")).toEqual({ allowed: false, because: "Already paid." });
  });

  it("lets a reversal happen from anywhere money was owed", () => {
    for (const s of ["earned", "payable", "paid"] as const) {
      expect(nextStates(s)).toContain("reversed");
    }
  });

  it("is a dead end once reversed or void", () => {
    expect(nextStates("reversed")).toEqual([]);
    expect(nextStates("void")).toEqual([]);
  });
});

describe("totals", () => {
  const rows = [
    { state: "earned" as const, computedAmount: 4000 },
    { state: "payable" as const, computedAmount: 750 },
    { state: "paid" as const, computedAmount: 1200 },
    { state: "reversed" as const, computedAmount: 500 },
    { state: "void" as const, computedAmount: 900 },
  ];

  it("counts what is owed as earned PLUS payable", () => {
    /* Showing only payable would flatter the position by hiding money already
       earned on deals whose revenue has not landed. */
    expect(totals(rows).owed).toBe(4750);
  });

  it("keeps paid and reversed out of what is owed", () => {
    const t = totals(rows);
    expect(t.paid).toBe(1200);
    expect(t.reversed).toBe(500);
    expect(t.owed).not.toContain(1200);
  });

  it("ignores cancelled entirely", () => {
    const t = totals(rows);
    expect(t.earned + t.payable + t.paid + t.reversed).toBe(6450);
  });
});
