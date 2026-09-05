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
  requiredDocuments: ["bank_statement", "government_id", "voided_check"],
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
/** FundingOS readiness statuses (Dee's design). Never "approved", never a probability. */
export type ReadinessLevel = "ready_for_placement" | "potential_fit" | "conditional" | "not_currently_ready" | "insufficient_information";
export const READINESS_LEVEL_LABEL: Record<ReadinessLevel, string> = {
  ready_for_placement: "Ready for Placement",
  potential_fit: "Potential Fit",
  conditional: "Conditional / Needs Improvement",
  not_currently_ready: "Not Currently Funding Ready",
  insufficient_information: "Insufficient Information",
};
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
  // Mostly unanswered → say so rather than guess. No failures and nothing
  // unanswered → ready for placement; no failures but gaps → potential fit;
  // one failure → conditional; more → not currently funding ready.
  const level: ReadinessLevel =
    unknowns >= 3 ? "insufficient_information"
    : fails === 0 && unknowns === 0 ? "ready_for_placement"
    : fails === 0 ? "potential_fit"
    : fails === 1 ? "conditional"
    : "not_currently_ready";
  return { level, factors, missingDocuments };
}

/* ------------------------------------------------------------------ */
/* Lender matching — criteria evaluation against a STORED policy        */
/* version. Output is a "potential match", never a probability and     */
/* never an approval: the lender decides credit. A policy nobody has    */
/* verified within the review window cannot produce a match at all.     */
/* ------------------------------------------------------------------ */
/** How strongly a stored criterion binds (Dee's design): only a HARD rule can produce "Does Not Meet". */
export type CriterionStrength = "hard" | "preferred" | "informational" | "manual_review";
export type CriterionKey = "amount" | "credit_score" | "time_in_business" | "monthly_revenue" | "industry";
export interface LenderCriteria {
  id: string;
  name: string;
  program: string | null;
  /** Which stored policy these criteria come from, and when a person last confirmed it with the lender. */
  policyVersion: string | null;
  policyVersionId?: string | null;
  lastVerifiedAt: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  minCreditScore: number | null;
  minTimeInBusinessMonths: number | null;
  minMonthlyRevenue: number | null;
  industriesExcluded: string[];
  /** Per-criterion strength; a criterion not listed is a hard requirement. */
  strengths?: Partial<Record<CriterionKey, CriterionStrength>>;
  active: boolean;
}
export interface MatchInput { requestedAmount: number | null; creditScore: number | null; timeInBusinessMonths: number | null; monthlyRevenue: number | null; industry: string | null }

/** Program Fit vocabulary — per criterion and overall. Never "approved", "qualified" or a probability. */
export type CriterionResult = "meets" | "does_not_meet" | "needs_review" | "missing_information" | "not_applicable";
export type ProgramFitOutcome = "apparent_fit" | "conditional_fit" | "needs_review" | "insufficient_information" | "apparent_mismatch" | "policy_unavailable";
/** Kept as an alias so older call sites read naturally. */
export type MatchOutcome = ProgramFitOutcome;
export const PROGRAM_FIT_LABEL: Record<ProgramFitOutcome, string> = {
  apparent_fit: "Apparent Fit",
  conditional_fit: "Conditional Fit",
  needs_review: "Needs Review",
  insufficient_information: "Insufficient Information",
  apparent_mismatch: "Current Criteria Mismatch",
  policy_unavailable: "Policy Unavailable",
};
export interface CriterionEvaluation { key: CriterionKey; label: string; strength: CriterionStrength; result: CriterionResult; reason: string }
export interface LenderMatch {
  lender: LenderCriteria;
  outcome: ProgramFitOutcome;
  criteria: CriterionEvaluation[];
  /** Convenience views of `criteria` by result. */
  matched: string[];
  failed: string[];
  needsReview: string[];
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

/** Display order is operational, not a ranking: fits first, then what needs work, then what cannot be used. */
const OUTCOME_ORDER: Record<ProgramFitOutcome, number> = { apparent_fit: 0, conditional_fit: 1, needs_review: 2, insufficient_information: 3, policy_unavailable: 4, apparent_mismatch: 5 };

function evaluateCriterion(key: CriterionKey, label: string, strength: CriterionStrength, value: number | string | null, ok: boolean | null): CriterionEvaluation {
  if (strength === "informational") return { key, label, strength, result: "not_applicable", reason: `${label} is informational in this policy.` };
  if (strength === "manual_review") return { key, label, strength, result: "needs_review", reason: `${label} requires a person's interpretation under this policy.` };
  if (value === null || ok === null) return { key, label, strength, result: "missing_information", reason: `${label} not provided on the application.` };
  if (ok) return { key, label, strength, result: "meets", reason: `${label} meets the stored criterion.` };
  return strength === "hard"
    ? { key, label, strength, result: "does_not_meet", reason: `${label} is outside the stored hard requirement.` }
    : { key, label, strength, result: "needs_review", reason: `${label} is below the stored guidance; a person decides.` };
}

export function matchLenders(input: MatchInput, lenders: LenderCriteria[], options: MatchOptions = DEFAULT_MATCH_OPTIONS): LenderMatch[] {
  return lenders
    .filter((l) => l.active)
    .map((l) => {
      const s = (k: CriterionKey): CriterionStrength => l.strengths?.[k] ?? "hard";
      const criteria: CriterionEvaluation[] = [];
      if (l.minAmount !== null || l.maxAmount !== null) {
        const v = input.requestedAmount;
        criteria.push(evaluateCriterion("amount", "Requested amount", s("amount"), v, v === null ? null : (l.minAmount === null || v >= l.minAmount) && (l.maxAmount === null || v <= l.maxAmount)));
      }
      if (l.minCreditScore !== null) criteria.push(evaluateCriterion("credit_score", "Credit score", s("credit_score"), input.creditScore, input.creditScore === null ? null : input.creditScore >= l.minCreditScore));
      if (l.minTimeInBusinessMonths !== null) criteria.push(evaluateCriterion("time_in_business", "Time in business", s("time_in_business"), input.timeInBusinessMonths, input.timeInBusinessMonths === null ? null : input.timeInBusinessMonths >= l.minTimeInBusinessMonths));
      if (l.minMonthlyRevenue !== null) criteria.push(evaluateCriterion("monthly_revenue", "Monthly revenue", s("monthly_revenue"), input.monthlyRevenue, input.monthlyRevenue === null ? null : input.monthlyRevenue >= l.minMonthlyRevenue));
      if (l.industriesExcluded.length) {
        const v = input.industry;
        criteria.push(evaluateCriterion("industry", "Industry", s("industry"), v, v === null ? null : !l.industriesExcluded.map((i) => i.toLowerCase()).includes(v.toLowerCase())));
      }
      const by = (r: CriterionResult) => criteria.filter((c) => c.result === r).map((c) => c.label);
      const failed = by("does_not_meet"), unconfirmed = by("missing_information"), needsReview = by("needs_review"), matched = by("meets");
      // A hard mismatch is decisive whatever the policy's age. Otherwise a policy nobody has
      // re-confirmed inside the review window cannot produce a fit at all.
      const outcome: ProgramFitOutcome =
        failed.length > 0 ? "apparent_mismatch"
        : !policyIsCurrent(l, options) ? "policy_unavailable"
        : unconfirmed.length > 0 ? "insufficient_information"
        : criteria.some((c) => c.result === "needs_review" && c.strength === "manual_review") ? "needs_review"
        : needsReview.length > 0 ? "conditional_fit"
        : "apparent_fit";
      return { lender: l, outcome, criteria, matched, failed, needsReview, unconfirmed };
    })
    .sort((a, b) => OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome] || a.unconfirmed.length - b.unconfirmed.length || a.lender.name.localeCompare(b.lender.name));
}

/* ------------------------------------------------------------------ */
/* Submission snapshot                                                  */
/* ------------------------------------------------------------------ */
/**
 * What a submission is judged against is frozen at the moment of submission.
 * The snapshot is descriptive (which policy, which criteria, what the outcome
 * vocabulary said) so a later decline or approval can be read against the
 * policy that was in force — never re-evaluated against today's policy.
 */
export interface FitSnapshot {
  outcome: ProgramFitOutcome;
  policyVersion: string | null;
  lastVerifiedAt: string | null;
  evaluatedAt: string;
  criteria: CriterionEvaluation[];
}
export function buildFitSnapshot(match: LenderMatch, now: Date = new Date()): FitSnapshot {
  return { outcome: match.outcome, policyVersion: match.lender.policyVersion, lastVerifiedAt: match.lender.lastVerifiedAt, evaluatedAt: now.toISOString(), criteria: match.criteria };
}
