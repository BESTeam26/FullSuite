/**
 * Funding readiness — deterministic (NOT AI). Evaluates a funding application
 * and its document checklist against threshold rules and returns a level plus
 * the factors behind it, each with a reason. Thresholds are data (rule rows
 * with platform defaults) so an organization can tune them without code.
 * Nothing here is a lender decision; it says what the file still needs.
 */
export interface ReadinessRules {
  minTimeInBusinessMonths: number;
  minMonthlyRevenue: number;
  minCreditScore: number;
  /** Existing monthly debt payments / monthly revenue, above which the file is not ready. */
  maxDebtToRevenue: number;
  requiredDocuments: string[];
}

export const DEFAULT_READINESS_RULES: ReadinessRules = {
  minTimeInBusinessMonths: 6,
  minMonthlyRevenue: 10_000,
  minCreditScore: 600,
  maxDebtToRevenue: 0.5,
  requiredDocuments: ["bank_statements", "id", "voided_check"],
};

export interface ReadinessInput {
  timeInBusinessMonths: number | null;
  monthlyRevenue: number | null;
  creditScore: number | null;
  existingMonthlyDebt: number | null;
  /** Document types with status received or reviewed. */
  documentsReceived: string[];
}

export type FactorStatus = "pass" | "fail" | "unknown";
export interface ReadinessFactor { key: string; label: string; status: FactorStatus; reason: string }
export type ReadinessLevel = "ready" | "needs_work" | "not_ready";
export interface ReadinessResult { level: ReadinessLevel; factors: ReadinessFactor[]; missingDocuments: string[] }

export function assessReadiness(input: ReadinessInput, rules: ReadinessRules = DEFAULT_READINESS_RULES): ReadinessResult {
  const factors: ReadinessFactor[] = [];
  const num = (key: string, label: string, value: number | null, ok: (v: number) => boolean, passText: string, failText: string) => {
    if (value === null || Number.isNaN(value)) factors.push({ key, label, status: "unknown", reason: `${label} not provided.` });
    else factors.push({ key, label, status: ok(value) ? "pass" : "fail", reason: ok(value) ? passText : failText });
  };
  num("time_in_business", "Time in business", input.timeInBusinessMonths, (v) => v >= rules.minTimeInBusinessMonths,
    `${input.timeInBusinessMonths} months in business meets the ${rules.minTimeInBusinessMonths}-month minimum.`,
    `${input.timeInBusinessMonths} months in business is under the ${rules.minTimeInBusinessMonths}-month minimum.`);
  num("monthly_revenue", "Monthly revenue", input.monthlyRevenue, (v) => v >= rules.minMonthlyRevenue,
    `Monthly revenue meets the $${rules.minMonthlyRevenue.toLocaleString()} minimum.`,
    `Monthly revenue is under the $${rules.minMonthlyRevenue.toLocaleString()} minimum.`);
  num("credit_score", "Credit score", input.creditScore, (v) => v >= rules.minCreditScore,
    `Credit score meets the ${rules.minCreditScore} minimum.`,
    `Credit score is under the ${rules.minCreditScore} minimum — credit readiness work first.`);
  if (input.monthlyRevenue && input.existingMonthlyDebt !== null) {
    const ratio = input.existingMonthlyDebt / input.monthlyRevenue;
    factors.push({ key: "debt_to_revenue", label: "Existing debt vs revenue", status: ratio <= rules.maxDebtToRevenue ? "pass" : "fail",
      reason: `${Math.round(ratio * 100)}% of monthly revenue goes to existing debt (limit ${Math.round(rules.maxDebtToRevenue * 100)}%).` });
  } else {
    factors.push({ key: "debt_to_revenue", label: "Existing debt vs revenue", status: "unknown", reason: "Existing debt or revenue not provided." });
  }
  const received = new Set(input.documentsReceived);
  const missingDocuments = rules.requiredDocuments.filter((d) => !received.has(d));
  factors.push({ key: "documents", label: "Required documents", status: missingDocuments.length === 0 ? "pass" : "fail",
    reason: missingDocuments.length === 0 ? "All required documents received." : `Missing: ${missingDocuments.join(", ")}.` });

  const fails = factors.filter((f) => f.status === "fail").length;
  const unknowns = factors.filter((f) => f.status === "unknown").length;
  const level: ReadinessLevel = fails === 0 && unknowns === 0 ? "ready" : fails <= 1 ? "needs_work" : "not_ready";
  return { level, factors, missingDocuments };
}

/* ------------------------------------------------------------------ */
/* Lender matching — criteria evaluation against a STORED policy        */
/* version. Output is a "potential match", never a probability and     */
/* never an approval: the lender decides credit. A policy nobody has    */
/* verified within the review window cannot produce a match at all.     */
/* ------------------------------------------------------------------ */
export interface LenderCriteria {
  id: string;
  name: string;
  program: string | null;
  /** Which stored policy these criteria come from, and when a person last confirmed it with the lender. */
  policyVersion: string | null;
  lastVerifiedAt: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  minCreditScore: number | null;
  minTimeInBusinessMonths: number | null;
  minMonthlyRevenue: number | null;
  industriesExcluded: string[];
  active: boolean;
}
export interface MatchInput { requestedAmount: number | null; creditScore: number | null; timeInBusinessMonths: number | null; monthlyRevenue: number | null; industry: string | null }
export type MatchOutcome = "potential_match" | "not_matched" | "policy_verification_required";
export interface LenderMatch {
  lender: LenderCriteria;
  outcome: MatchOutcome;
  /** Criteria the stored policy states and the application satisfies. */
  matched: string[];
  /** Criteria the stored policy states and the application fails. */
  failed: string[];
  /** Criteria the stored policy states that the application does not answer yet. */
  unconfirmed: string[];
}
export interface MatchOptions {
  /** Days after `lastVerifiedAt` before a policy must be re-confirmed. */
  policyReviewDays: number;
  now?: Date;
}
export const DEFAULT_MATCH_OPTIONS: MatchOptions = { policyReviewDays: 90 };

function policyIsCurrent(lender: LenderCriteria, options: MatchOptions): boolean {
  if (!lender.lastVerifiedAt) return false;
  const verified = new Date(lender.lastVerifiedAt).getTime();
  if (Number.isNaN(verified)) return false;
  const now = (options.now ?? new Date()).getTime();
  return now - verified <= options.policyReviewDays * 86_400_000;
}

const OUTCOME_ORDER: Record<MatchOutcome, number> = { potential_match: 0, policy_verification_required: 1, not_matched: 2 };

export function matchLenders(input: MatchInput, lenders: LenderCriteria[], options: MatchOptions = DEFAULT_MATCH_OPTIONS): LenderMatch[] {
  const check = (label: string, value: number | null, ok: (v: number) => boolean, bucket: LenderMatch) => {
    if (value === null) bucket.unconfirmed.push(label); else (ok(value) ? bucket.matched : bucket.failed).push(label);
  };
  return lenders
    .filter((l) => l.active)
    .map((l) => {
      const m: LenderMatch = { lender: l, outcome: "not_matched", matched: [], failed: [], unconfirmed: [] };
      if (l.minAmount !== null || l.maxAmount !== null) check("amount", input.requestedAmount, (v) => (l.minAmount === null || v >= l.minAmount) && (l.maxAmount === null || v <= l.maxAmount), m);
      if (l.minCreditScore !== null) check("credit score", input.creditScore, (v) => v >= (l.minCreditScore as number), m);
      if (l.minTimeInBusinessMonths !== null) check("time in business", input.timeInBusinessMonths, (v) => v >= (l.minTimeInBusinessMonths as number), m);
      if (l.minMonthlyRevenue !== null) check("monthly revenue", input.monthlyRevenue, (v) => v >= (l.minMonthlyRevenue as number), m);
      if (l.industriesExcluded.length) { if (input.industry === null) m.unconfirmed.push("industry"); else (l.industriesExcluded.map((i) => i.toLowerCase()).includes(input.industry.toLowerCase()) ? m.failed : m.matched).push("industry"); }
      // A failed criterion is decisive regardless of policy age: the answer is "no" either way.
      // Otherwise a stale policy blocks the match until someone re-confirms it with the lender.
      m.outcome = m.failed.length > 0 ? "not_matched" : policyIsCurrent(l, options) ? "potential_match" : "policy_verification_required";
      return m;
    })
    .sort((a, b) => OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome] || a.unconfirmed.length - b.unconfirmed.length || a.lender.name.localeCompare(b.lender.name));
}
