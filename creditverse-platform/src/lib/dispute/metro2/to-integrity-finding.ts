/**
 * Section A's findings, in the shape the rest of CreditOps already speaks.
 *
 * ── WHY AN ADAPTER RATHER THAN A SECOND DETECTOR ──────────────────────────
 *
 * The canonical CreditOps flow is one chain, and it already exists:
 *
 *   report_items  →  evaluateReports()  →  IntegrityFinding[]
 *     →  saveFindings()  →  report_findings
 *       →  human_disposition  ←  A PERSON DECIDES HERE
 *         →  dispute round, letter, mailing
 *
 * Section A was outside it. Its rules ran in `Metro2IdentityPanel` and their
 * output was rendered and thrown away: nothing could be saved to the client
 * record, nothing could be dispositioned, and nothing downstream could act on
 * an identity defect. Giving Section A its own persistence and its own review
 * queue would have been a second chain for the same job (project rules 2, 5
 * and 6). This maps its output into the existing one instead.
 *
 * ── WHAT A FINDING IS STILL NOT ALLOWED TO DO ─────────────────────────────
 *
 * Entering the pipeline is not the same as becoming a dispute. Every finding
 * produced here carries `humanReviewRequired: true`, lands with a null
 * disposition, and reaches a letter only after a person has confirmed it in
 * `SavedFindingsList`. Nothing here creates a round, a letter or a mailing.
 *
 * ── WHAT IS DELIBERATELY DROPPED ──────────────────────────────────────────
 *
 * Only CONFIRMED and APPARENT findings cross over.
 *
 *   UNKNOWN never crosses. "The facts needed were not reported" is not a
 *   finding about the report, and persisting it as one is exactly how a
 *   missing field turns into an allegation. It stays visible in the panel,
 *   where a reviewer can go and find the fact.
 *
 *   NOT_AN_ERROR never crosses. It is recorded so nobody disputes correct
 *   reporting; it is not something to save to a client's record.
 */
import type { IntegrityFinding } from "@/lib/dispute/reporting-integrity-engine";
import type { DisputeRoute, FindingClassification, IntegrityRule, Remedy } from "@/lib/dispute/reporting-integrity-rules";
import type { Metro2Finding, Metro2SectionResult } from "./run-section";
import type { PermittedClaim } from "./types";

/**
 * Bumped when a Section A rule changes what it concludes.
 *
 * It is the `rule_version` half of `report_findings`' uniqueness key, so a
 * bump deliberately produces NEW rows rather than altering decided ones — a
 * disposition already given stays given, against the rule as it was then.
 */
export const SECTION_A_RULE_VERSION = 1;

/** Travels onto every row, so a finding can be traced to the rules that made it. */
export const METRO2_CATALOGUE_VERSION = "2026.09.07";

/**
 * Identity defects are about the consumer, not about one tradeline, so they
 * are filed against the report's personal-information section rather than
 * against an account. A stable literal, because it is half of a uniqueness
 * key — changing it would silently duplicate every saved identity finding.
 */
export const IDENTITY_ACCOUNT_REF = "personal-information";

/**
 * Where the claim is properly addressed.
 *
 * "either" resolves to the bureau, not to the furnisher: a consumer dispute
 * routed through the CRA triggers the reinvestigation duty and reaches the
 * furnisher anyway, whereas a direct furnisher letter is the narrower path and
 * should be a deliberate choice rather than a default.
 */
const ROUTE_FOR: Record<PermittedClaim["recipient"], DisputeRoute> = {
  cra: "cra",
  furnisher: "furnisher_via_cra",
  collector: "collector",
  either: "cra",
};

/**
 * How sure the rule is, in the integrity engine's vocabulary.
 *
 * A confirmed Section A finding rests on something the CONSUMER supplied and
 * verified — their legal name, their address, their signed statement — so
 * `evidence_supported_inaccuracy` is the accurate classification rather than a
 * flattering one. An apparent finding is one fact short of that, which is what
 * `needs_source_document` means.
 *
 * `remedy` is never `delete` or `block`. Deletion is a remedy a person
 * chooses on the evidence; deriving it mechanically from a rule's confidence
 * is how an inaccuracy becomes a demand nobody can support.
 */
const GRADE: Record<"confirmed" | "apparent", {
  classification: FindingClassification;
  verdict: IntegrityRule["verdict"];
  remedy: Remedy;
}> = {
  confirmed: {
    classification: "evidence_supported_inaccuracy",
    verdict: "evidence_supported_inaccuracy",
    remedy: "correct",
  },
  apparent: {
    classification: "potential_anomaly",
    verdict: "needs_source_document",
    remedy: "investigate_first",
  },
};

export interface Metro2FindingContext {
  /** The stored report the finding is read against. */
  reportId: string;
  /** Which item it is filed under. Identity findings use IDENTITY_ACCOUNT_REF. */
  accountRef?: string;
  /** What a reviewer will see as the item's name. */
  itemName?: string;
}

function convert(
  finding: Metro2Finding,
  grade: "confirmed" | "apparent",
  ctx: Metro2FindingContext,
): IntegrityFinding {
  const g = GRADE[grade];
  return {
    reportId: ctx.reportId,
    ruleId: finding.ruleId,
    ruleVersion: SECTION_A_RULE_VERSION,
    catalogueVersion: METRO2_CATALOGUE_VERSION,
    accountRef: ctx.accountRef ?? IDENTITY_ACCOUNT_REF,
    itemName: ctx.itemName ?? finding.title,
    classification: g.classification,
    verdict: g.verdict,
    observation: finding.observation,
    /* Plain values a reviewer can check against the report — never a
       conclusion, and never the letter language itself. */
    evidence: {
      catalogue: finding.provenance.catalogue,
      source_kind: finding.provenance.sourceKind,
      may_assert: grade === "confirmed" ? finding.claim.assertion : null,
      may_ask: grade === "apparent" ? finding.claim.question : null,
      settled_by: finding.needs ?? null,
      guardrails: finding.guardrails,
    },
    fields: finding.fields,
    route: ROUTE_FOR[finding.claim.recipient],
    remedy: g.remedy,
    /* Always. An identity defect names a person, and no automatic path may
       assert one on a consumer's behalf. */
    humanReviewRequired: true,
    rawMetro2Verified: false,
  };
}

/**
 * A section's result as canonical findings.
 *
 * Confirmed first, then apparent, so the review queue reads worst-first the
 * same way the integrity panel already sorts.
 */
export function metro2FindingsToIntegrity(
  result: Metro2SectionResult,
  ctx: Metro2FindingContext,
): IntegrityFinding[] {
  return [
    ...result.confirmed.map((f) => convert(f, "confirmed", ctx)),
    ...result.apparent.map((f) => convert(f, "apparent", ctx)),
  ];
}
