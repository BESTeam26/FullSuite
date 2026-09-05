/**
 * Lender catalogue → matching criteria. A program's criteria come from the
 * policy version that is EFFECTIVE on the day of matching (not the newest row),
 * and the match carries that version's number and last-verified date so a
 * reviewer can see what the "potential match" is based on. Pure; unit-tested.
 */
import type { CriterionKey, CriterionStrength, LenderCriteria } from "@/lib/funding/readiness-engine";

export interface CataloguePolicyVersion {
  /** Row id — stored on a submission so the snapshot points at the exact policy it was judged against. */
  id?: string;
  version: number;
  criteria: Record<string, unknown>;
  sourceType: string;
  sourceReference: string | null;
  sourcePublishedDate?: string | null;
  effectiveFrom: string;      // yyyy-mm-dd
  effectiveUntil: string | null;
  lastVerifiedAt: string | null;
}
export interface CatalogueProgram {
  id: string;
  name: string;
  productFamily: string;
  productSubtype: string | null;
  statesAllowed: string[];
  active: boolean;
  policyVersions: CataloguePolicyVersion[];
}
export interface CatalogueLender {
  id: string;
  name: string;
  lenderKind: string;
  organizationId: string | null;
  active: boolean;
  programs: CatalogueProgram[];
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

const STRENGTHS: readonly CriterionStrength[] = ["hard", "preferred", "informational", "manual_review"];
const CRITERION_KEYS: readonly CriterionKey[] = ["amount", "credit_score", "time_in_business", "monthly_revenue", "industry"];
/** `criteria.strength` = { credit_score: "preferred", … }; anything unlisted or unknown stays a hard requirement. */
function strengthsOf(v: unknown): Partial<Record<CriterionKey, CriterionStrength>> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Partial<Record<CriterionKey, CriterionStrength>> = {};
  for (const [k, s] of Object.entries(v as Record<string, unknown>)) {
    if ((CRITERION_KEYS as readonly string[]).includes(k) && typeof s === "string" && (STRENGTHS as readonly string[]).includes(s)) out[k as CriterionKey] = s as CriterionStrength;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The version in force on `asOf` (yyyy-mm-dd); the highest version wins when several overlap. */
export function effectivePolicy(program: CatalogueProgram, asOf: string): CataloguePolicyVersion | null {
  const live = program.policyVersions.filter((v) => v.effectiveFrom <= asOf && (v.effectiveUntil === null || v.effectiveUntil >= asOf));
  if (live.length === 0) return null;
  return live.reduce((best, v) => (v.version > best.version ? v : best));
}

/** One matching row per active program with an effective policy. Programs without a policy cannot be matched at all. */
export function toLenderCriteria(lenders: CatalogueLender[], asOf: string): LenderCriteria[] {
  const out: LenderCriteria[] = [];
  for (const lender of lenders) {
    if (!lender.active) continue;
    for (const program of lender.programs) {
      if (!program.active) continue;
      const policy = effectivePolicy(program, asOf);
      if (!policy) continue;
      const c = policy.criteria;
      out.push({
        id: program.id,
        name: `${lender.name} · ${program.name}`,
        program: program.name,
        policyVersion: `v${policy.version}`,
        policyVersionId: policy.id ?? null,
        lastVerifiedAt: policy.lastVerifiedAt,
        minAmount: num(c.min_amount),
        maxAmount: num(c.max_amount),
        minCreditScore: num(c.min_credit_score),
        minTimeInBusinessMonths: num(c.min_time_in_business_months),
        minMonthlyRevenue: num(c.min_monthly_revenue),
        industriesExcluded: strs(c.industries_excluded),
        strengths: strengthsOf(c.strength),
        active: true,
      });
    }
  }
  return out;
}
