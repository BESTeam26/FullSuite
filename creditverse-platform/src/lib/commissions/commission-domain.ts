/**
 * What a commission is worth and what may happen to it next.
 *
 * The arithmetic lives here as well as in the database, and that is deliberate
 * rather than duplication: the screen must be able to show somebody what a
 * plan would pay BEFORE a deal funds, without writing anything. The database
 * is still the authority — it computes the real figure on funding, and these
 * functions are tested against the same rules so the preview and the payment
 * cannot disagree.
 *
 * The lifecycle is the thing worth understanding:
 *
 *   pending → earned → payable → paid
 *                 ↘ reversed        ↘ reversed
 *
 * `earned` and `payable` are separate on purpose. A deal funding means the
 * partner has earned their share — a real obligation, visible immediately. It
 * does NOT mean the organization has been paid. Funding gets clawed back and
 * rescinded, and paying commission on revenue that never arrived is how a
 * funding business loses money one deal at a time.
 */

export type CommissionState = "pending" | "earned" | "payable" | "paid" | "reversed" | "void";
export type CommissionBasis = "pct" | "flat";
export type AppliesTo = "gross_funded" | "net_funded" | "accepted_offer_amount";

export interface CommissionPlan {
  basis: CommissionBasis;
  rateOrAmount: number;
  appliesTo: AppliesTo;
}

export interface DealAmounts {
  grossFunded?: number | null;
  netFunded?: number | null;
  acceptedOfferAmount?: number | null;
}

export type Computation =
  | { ok: true; amount: number; basisAmount: number | null; explain: string }
  | { ok: false; because: string };

/**
 * What a plan pays on a deal.
 *
 * A percentage of a figure the deal does not record is UNKNOWN, not zero.
 * Returning zero there would quietly book a nil commission somebody has
 * genuinely earned, and nobody would ever notice.
 */
export function computeCommission(plan: CommissionPlan, deal: DealAmounts): Computation {
  if (plan.rateOrAmount < 0) return { ok: false, because: "A rate cannot be negative." };

  if (plan.basis === "flat") {
    return {
      ok: true,
      amount: round2(plan.rateOrAmount),
      basisAmount: null,
      explain: `Flat ${money(plan.rateOrAmount)}.`,
    };
  }

  if (plan.rateOrAmount > 100) return { ok: false, because: "A percentage above 100 is not a rate." };

  const basisAmount = deal[
    plan.appliesTo === "gross_funded" ? "grossFunded"
      : plan.appliesTo === "accepted_offer_amount" ? "acceptedOfferAmount"
        : "netFunded"
  ];
  if (basisAmount === null || basisAmount === undefined) {
    return { ok: false, because: `This deal does not record ${label(plan.appliesTo)}, so the percentage cannot be worked out.` };
  }

  const amount = round2((basisAmount * plan.rateOrAmount) / 100);
  return {
    ok: true,
    amount,
    basisAmount,
    explain: `${plan.rateOrAmount}% of ${label(plan.appliesTo)} (${money(basisAmount)}).`,
  };
}

/** Which moves are legal from here. The database enforces the same. */
export function nextStates(state: CommissionState): CommissionState[] {
  switch (state) {
    case "pending": return ["earned", "void"];
    case "earned": return ["payable", "reversed", "void"];
    case "payable": return ["paid", "reversed"];
    case "paid": return ["reversed"];
    default: return [];
  }
}

export function canPay(state: CommissionState): { allowed: boolean; because?: string } {
  if (state === "payable") return { allowed: true };
  if (state === "earned") {
    return { allowed: false, because: "Confirm the money arrived on this deal first. Earned is not the same as received." };
  }
  if (state === "paid") return { allowed: false, because: "Already paid." };
  return { allowed: false, because: `Nothing to pay from ${state}.` };
}

export interface CommissionRow {
  state: CommissionState;
  computedAmount: number;
}

/**
 * Totals by what they mean to the business, not by state name.
 *
 * `owed` deliberately includes both earned and payable, because both are money
 * the organization is going to hand over. Showing only `payable` would flatter
 * the position by hiding what has already been earned on deals whose revenue
 * has not landed.
 */
export function totals(rows: CommissionRow[]) {
  const sum = (s: CommissionState[]) =>
    round2(rows.filter((r) => s.includes(r.state)).reduce((n, r) => n + (r.computedAmount || 0), 0));
  return {
    earned: sum(["earned"]),
    payable: sum(["payable"]),
    owed: sum(["earned", "payable"]),
    paid: sum(["paid"]),
    reversed: sum(["reversed"]),
  };
}

export const STATE_LABELS: Record<CommissionState, string> = {
  pending: "Not yet earned",
  earned: "Earned, awaiting the money",
  payable: "Ready to pay",
  paid: "Paid",
  reversed: "Reversed",
  void: "Cancelled",
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const label = (a: AppliesTo) =>
  a === "gross_funded" ? "gross funded" : a === "accepted_offer_amount" ? "the accepted offer" : "net funded";
