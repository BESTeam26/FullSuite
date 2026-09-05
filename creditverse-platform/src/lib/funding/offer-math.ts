/**
 * Offer arithmetic — the values FundingOS calculates from a lender's raw terms.
 * Kept apart from what the lender stated (Dee's design): total payback,
 * estimated financing cost and net proceeds are labelled "calculated"; a
 * factor rate is never called an APR; anything the lender did not provide is
 * "Not provided", never invented. Pure; unit-tested.
 */
export type PricingType = "factor_rate" | "interest_rate" | "apr" | "fee_based" | "not_provided";

export interface RawOfferTerms {
  offerAmount: number | null;
  pricingType: PricingType;
  pricingValue: number | null;
  paymentAmount: number | null;
  paymentFrequency: string | null;
  termText: string | null;
  originationFee: number | null;
  otherFees: { label: string; amount: number }[];
}
export interface CalculatedOffer {
  /** Gross amount × factor rate for factor pricing; otherwise only when payments × count are both known. */
  totalPayback: number | null;
  estimatedFinancingCost: number | null;
  netProceeds: number | null;
  totalFees: number;
  /** Which figures could not be computed and why — shown, never hidden. */
  notes: string[];
}

export const PRICING_LABEL: Record<PricingType, string> = {
  factor_rate: "Factor rate", interest_rate: "Interest rate", apr: "APR", fee_based: "Fee-based", not_provided: "Pricing not provided",
};

/** "1.24" for a factor rate, "9.5%" for interest or APR — the type decides the unit. */
export function formatPricing(type: PricingType, value: number | null): string {
  if (value === null) return "Not provided";
  switch (type) {
    case "factor_rate": return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    case "interest_rate": case "apr": return `${value}%`;
    case "fee_based": return `$${value.toLocaleString()}`;
    default: return "Not provided";
  }
}

/** Count of payments from a term text such as "12 months", "180 daily payments", "52 weekly payments"; null when it cannot be read. */
export function paymentCount(termText: string | null, frequency: string | null): number | null {
  if (!termText) return null;
  const m = termText.match(/(\d+)\s*(daily|weekly|bi-?weekly|monthly|payments?|months?|weeks?|days?)/i);
  if (!m) return null;
  const n = Number(m[1]); const unit = m[2].toLowerCase();
  // "180 daily payments", "52 weekly", "12 monthly": the number already counts payments.
  if (/payment|daily|weekly/.test(unit) || unit === "monthly") return n;
  const freq = (frequency ?? "").toLowerCase();
  if (/month/.test(unit)) return freq.startsWith("week") ? Math.round(n * 52 / 12) : freq.startsWith("dai") ? n * 21 : n;
  if (/week/.test(unit)) return freq.startsWith("dai") ? n * 5 : n;
  if (/day/.test(unit)) return n;
  return null;
}

export function calculateOffer(t: RawOfferTerms): CalculatedOffer {
  const notes: string[] = [];
  const totalFees = (t.originationFee ?? 0) + t.otherFees.reduce((s, f) => s + (Number.isFinite(f.amount) ? f.amount : 0), 0);
  let totalPayback: number | null = null;
  if (t.offerAmount !== null && t.pricingType === "factor_rate" && t.pricingValue !== null) {
    totalPayback = Math.round(t.offerAmount * t.pricingValue * 100) / 100;
  } else if (t.paymentAmount !== null) {
    const count = paymentCount(t.termText, t.paymentFrequency);
    if (count !== null) totalPayback = Math.round(t.paymentAmount * count * 100) / 100;
    else notes.push("Total payback not calculated: the term does not state a payment count.");
  } else if (t.offerAmount === null) {
    notes.push("Total payback not calculated: offer amount not provided.");
  } else {
    notes.push(`Total payback not calculated for ${PRICING_LABEL[t.pricingType].toLowerCase()} without a payment amount.`);
  }
  const estimatedFinancingCost = totalPayback !== null && t.offerAmount !== null ? Math.round((totalPayback - t.offerAmount + totalFees) * 100) / 100 : null;
  const netProceeds = t.offerAmount !== null ? Math.round((t.offerAmount - totalFees) * 100) / 100 : null;
  if (t.pricingType === "factor_rate") notes.push("A factor rate is not an APR and is shown as the lender stated it.");
  return { totalPayback, estimatedFinancingCost, netProceeds, totalFees, notes };
}
