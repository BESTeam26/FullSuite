/**
 * Commission arithmetic and the state machine — deterministic, tested, and
 * the only place the amount is computed. Basis is a percentage of gross
 * funded or a flat amount; states move pending → approved → paid, or to void
 * from pending/approved. Nothing here decides who is owed what — that is the
 * organization's agreement, recorded as data.
 */
export type CommissionBasis = "pct" | "flat";
export type CommissionState = "pending" | "approved" | "paid" | "void";
export type CommissionPartyKind = "agency" | "org_user" | "partner" | "lender_referral";

export const PARTY_KIND_LABEL: Record<CommissionPartyKind, string> = { agency: "BES", org_user: "Team member", partner: "Partner", lender_referral: "Lender referral" };
export const COMMISSION_STATE_LABEL: Record<CommissionState, string> = { pending: "Pending", approved: "Approved", paid: "Paid", void: "Void" };

/** pct: rate is a percentage (7.5 = 7.5%) of gross funded; flat: rate is the amount. Never negative; rounded to cents. */
export function computeCommission(basis: CommissionBasis, rateOrAmount: number, grossFunded: number): number {
  if (!Number.isFinite(rateOrAmount) || rateOrAmount < 0) return 0;
  const raw = basis === "pct" ? (grossFunded * rateOrAmount) / 100 : rateOrAmount;
  return Math.round(Math.max(0, raw) * 100) / 100;
}

const NEXT: Record<CommissionState, CommissionState[]> = { pending: ["approved", "void"], approved: ["paid", "void"], paid: [], void: [] };
export const nextCommissionStates = (state: CommissionState): CommissionState[] => NEXT[state];
export const canMoveCommission = (from: CommissionState, to: CommissionState): boolean => NEXT[from].includes(to);
