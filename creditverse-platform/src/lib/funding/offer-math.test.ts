import { describe, expect, it } from "vitest";
import { calculateOffer, formatPricing, paymentCount } from "./offer-math";

describe("offer arithmetic (calculated, apart from the lender's raw terms)", () => {
  it("factor-rate payback = amount × factor; cost includes fees; net = amount − fees; factor never labelled APR", () => {
    const c = calculateOffer({ offerAmount: 100_000, pricingType: "factor_rate", pricingValue: 1.24, paymentAmount: null, paymentFrequency: "daily", termText: "12 months", originationFee: 2_500, otherFees: [{ label: "wire", amount: 50 }] });
    expect(c.totalPayback).toBe(124_000);
    expect(c.totalFees).toBe(2_550);
    expect(c.estimatedFinancingCost).toBe(26_550);
    expect(c.netProceeds).toBe(97_450);
    expect(c.notes.some((n) => /not an APR/.test(n))).toBe(true);
    expect(formatPricing("factor_rate", 1.24)).toBe("1.24");
    expect(formatPricing("apr", 18.2)).toBe("18.2%");
    expect(formatPricing("factor_rate", null)).toBe("Not provided");
  });
  it("payment × count when the term states a count; otherwise says what it could not calculate", () => {
    expect(paymentCount("180 daily payments", "daily")).toBe(180);
    expect(paymentCount("12 months", "monthly")).toBe(12);
    expect(paymentCount("12 months", "weekly")).toBe(52);
    expect(paymentCount("as agreed", "monthly")).toBeNull();
    const c = calculateOffer({ offerAmount: 50_000, pricingType: "interest_rate", pricingValue: 9.5, paymentAmount: 4_500, paymentFrequency: "monthly", termText: "12 months", originationFee: null, otherFees: [] });
    expect(c.totalPayback).toBe(54_000);
    const u = calculateOffer({ offerAmount: 50_000, pricingType: "interest_rate", pricingValue: 9.5, paymentAmount: null, paymentFrequency: null, termText: null, originationFee: null, otherFees: [] });
    expect(u.totalPayback).toBeNull();
    expect(u.notes[0]).toMatch(/not calculated/);
  });
});
