/**
 * Credit Reporting Integrity — the rule catalogue (Letter Library proposal,
 * addendum M4). Every rule is data: what it looks at, what it may conclude,
 * which authority it rests on, from when. The engine reads this list; the
 * letter builder and the Hybrid prompt read the same list. Nothing here is
 * a legal conclusion — the strongest output is "potential legal issue".
 *
 * Authority hierarchy (M2): statute > regulation > appellate decision > agency
 * guidance / consent order > Metro 2 (industry) > training material. Citations
 * are carried from Dee's research for counsel to confirm; none were added
 * from memory. Metro 2 is context: our reports are consumer-facing displays,
 * so no rule may claim a raw furnisher field value (`rawMetro2Verified` is
 * always false on a finding).
 */

export type FindingClassification =
  | "observed_difference"          // interface: Data discrepancy
  | "potential_anomaly"            // interface: Potential inaccuracy (review)
  | "evidence_supported_inaccuracy"// interface: Potential inaccuracy (evidence attached)
  | "potential_legal_issue";       // interface: Potential legal issue (route suggestion only)
// "established_violation" is deliberately not a value the engine can produce.

export type FieldVerdict = "expected" | "possible" | "suspicious" | "needs_source_document" | "evidence_supported_inaccuracy" | "legal_review";
export type Remedy = "correct" | "modify" | "delete" | "block" | "dispute_notation" | "no_action" | "investigate_first";
export type DisputeRoute = "cra" | "furnisher_via_cra" | "direct_furnisher_if_consumer_prepared" | "collector" | "identity_theft" | "none";

export type AuthorityLevel = "statute" | "regulation" | "appellate" | "agency_guidance" | "industry_format" | "training_material";
export interface Authority { level: AuthorityLevel; citation: string; note?: string }

export interface IntegrityRule {
  id: string;
  version: number;
  effectiveFrom: string;         // yyyy-mm-dd — when BES adopted this rule
  title: string;
  /** What the rule tests, in one sentence a reviewer can check by hand. */
  test: string;
  classification: FindingClassification;
  verdict: FieldVerdict;
  humanReviewRequired: boolean;
  route: DisputeRoute;
  remedy: Remedy;
  authorities: Authority[];
  /** Which fields of the report item the rule reads. */
  fields: string[];
  /**
   * Set when the rule is CATALOGUED but the engine cannot evaluate it yet, and
   * why — never as an excuse, always as a pointer to what is missing.
   *
   * A catalogue that lists rules nobody runs is worse than a shorter one: it
   * reads as coverage. `RULES_IN_USE` therefore excludes anything blocked, and
   * a structural test in the engine's suite asserts that every UNBLOCKED rule
   * is actually reached by code.
   */
  blockedBy?: string;
}

export const RULES_CATALOGUE_VERSION = "2026.09.05";

export const INTEGRITY_RULES: readonly IntegrityRule[] = [
  {
    id: "DOFD.BEFORE_OPEN_DATE", version: 1, effectiveFrom: "2026-09-05",
    title: "Date of first delinquency before the account was opened",
    test: "On a non-collection tradeline the reported DOFD is earlier than the reported open date.",
    classification: "potential_legal_issue", verdict: "legal_review", humanReviewRequired: true, route: "cra", remedy: "correct",
    fields: ["dofd", "open_date"],
    authorities: [
      { level: "statute", citation: "15 U.S.C. § 1681s-2(a)(5)", note: "furnisher must report the month and year the delinquency commenced" },
      { level: "statute", citation: "15 U.S.C. § 1681c(c)" },
      { level: "agency_guidance", citation: "CFPB advisory opinion on facially false data", note: "DOFD before open date named as logically inconsistent" },
    ],
  },
  {
    id: "DOFD.ON_CURRENT_ZERO_BALANCE", version: 1, effectiveFrom: "2026-09-05",
    title: "Delinquency date on an account reported current with nothing owed",
    test: "Status reads current or paid, the balance is zero, no derogatory remark, yet a DOFD is populated.",
    classification: "potential_anomaly", verdict: "suspicious", humanReviewRequired: true, route: "cra", remedy: "investigate_first",
    fields: ["dofd", "status", "balance"],
    authorities: [
      { level: "agency_guidance", citation: "CFPB advisory opinion on facially false data" },
      { level: "regulation", citation: "12 C.F.R. Part 1022, Appendix E", note: "information associated with an appropriate time period" },
    ],
  },
  {
    id: "STATUS.PAID_WITH_BALANCE", version: 1, effectiveFrom: "2026-09-05",
    title: "Paid in full with a balance still reported",
    test: "Status says paid / paid in full while the reported balance is greater than zero.",
    classification: "potential_anomaly", verdict: "suspicious", humanReviewRequired: false, route: "cra", remedy: "investigate_first",
    fields: ["status", "balance"],
    authorities: [
      { level: "agency_guidance", citation: "CFPB v. Santander consent order", note: "paid-in-full information furnished with contradictory current balance" },
      { level: "statute", citation: "15 U.S.C. § 1681s-2(a)(1)-(2)" },
    ],
  },
  {
    id: "DOFD.MOVED_LATER", version: 1, effectiveFrom: "2026-09-05",
    title: "Delinquency date moved later between imports",
    test: "The same tradeline reports a later DOFD than an earlier snapshot, with no cure or new delinquency evidenced in between.",
    classification: "potential_legal_issue", verdict: "legal_review", humanReviewRequired: true, route: "cra", remedy: "correct",
    fields: ["dofd"],
    authorities: [
      { level: "statute", citation: "15 U.S.C. § 1681s-2(a)(5)" },
      { level: "statute", citation: "15 U.S.C. § 1681c(c)" },
      { level: "regulation", citation: "12 C.F.R. Part 1022, Appendix E", note: "controls against re-aging after transfer or acquisition" },
    ],
  },
  {
    id: "ITEM.REAPPEARED", version: 1, effectiveFrom: "2026-09-05",
    title: "Item absent from an earlier import has reappeared",
    test: "A tradeline present, then absent, then present again across snapshots — a potential reinsertion event, not proof of one.",
    classification: "potential_anomaly", verdict: "suspicious", humanReviewRequired: true, route: "cra", remedy: "investigate_first",
    fields: ["account_ref"],
    authorities: [{ level: "statute", citation: "15 U.S.C. § 1681i(a)(5)", note: "reinsertion needs furnisher certification and consumer notice — only if the earlier absence was a reinvestigation deletion" }],
  },
  {
    id: "BUREAU.VALUE_DIFFERS", version: 1, effectiveFrom: "2026-09-05",
    title: "Bureaus report different values for the same field",
    test: "Two or more bureaus show different balances, statuses or dates for what appears to be the same account.",
    classification: "observed_difference", verdict: "needs_source_document", humanReviewRequired: false, route: "none", remedy: "investigate_first",
    fields: ["balance", "status", "dofd", "open_date"],
    authorities: [{ level: "agency_guidance", citation: "CFPB consumer guidance", note: "the three nationwide CRAs may hold different information; a difference is a question, not proof of inaccuracy" }],
    /* The canonical stored report holds ONE value per field plus a list of
       bureau names (`report_items.bureaus`), so there is nothing per-bureau to
       compare. The PDF parser does read the tri-merge columns and knows they
       differ — `firstColumn()` returns a `differs` flag, which lowers parse
       confidence and adds a remark — but it keeps only the first column, so
       which bureau said what is lost before storage. Closing this needs the
       parser to keep the columns, a child table to store them, and the engine
       to read them: written up in ENGINE_INVENTORY.md §5. Deliberately NOT
       faked from one value plus a list of bureau names. */
    blockedBy: "report_items stores one value per field; per-bureau values are discarded by the parser before storage",
  },
  {
    id: "BUREAU.MISSING_ON_ONE", version: 1, effectiveFrom: "2026-09-05",
    title: "Account reported by some bureaus and not others",
    test: "The item lists fewer than three bureaus. Deletion or absence at one bureau never proves another cannot verify it.",
    classification: "observed_difference", verdict: "expected", humanReviewRequired: false, route: "none", remedy: "no_action",
    fields: ["bureaus"],
    authorities: [{ level: "statute", citation: "15 U.S.C. § 1681i", note: "each CRA's reinvestigation stands on its own" }],
  },
  {
    id: "STATUS.CHARGEOFF_WITH_BALANCE", version: 1, effectiveFrom: "2026-09-05",
    title: "Charge-off with a remaining balance",
    test: "Status is charge-off and a balance is reported. Not a contradiction: a charge-off is the creditor's accounting event, not debt forgiveness.",
    classification: "observed_difference", verdict: "possible", humanReviewRequired: false, route: "none", remedy: "no_action",
    fields: ["status", "balance"],
    authorities: [{ level: "appellate", citation: "Bibbs v. Trans Union, 43 F.4th 331 (3d Cir. 2022)", note: "read the tradeline as a whole" }],
  },
  {
    id: "STATUS.CURRENT_WITH_HISTORY", version: 1, effectiveFrom: "2026-09-05",
    title: "Current account with historical late remarks",
    test: "Status is current/paid and remarks describe past late payments. Present condition and past performance are different time dimensions.",
    classification: "observed_difference", verdict: "possible", humanReviewRequired: false, route: "none", remedy: "no_action",
    fields: ["status", "remarks"],
    authorities: [{ level: "regulation", citation: "12 C.F.R. Part 1022, Appendix E", note: "performance versus current status" }],
  },
];

export const ruleById = (id: string): IntegrityRule | undefined => INTEGRITY_RULES.find((r) => r.id === id);

/** Route → the duty-bearing party and the citations the letter may use, never more. */
export const ROUTE_GUIDANCE: Record<DisputeRoute, { party: string; cite: string[]; caution: string }> = {
  cra: { party: "consumer reporting agency", cite: ["15 U.S.C. § 1681i", "15 U.S.C. § 1681e(b)"], caution: "Never cite § 1681e(b) to a furnisher; it is a CRA duty." },
  furnisher_via_cra: { party: "furnisher, after CRA notice", cite: ["15 U.S.C. § 1681s-2(b)"], caution: "Triggered by the CRA's notice under § 1681i(a)(2), not by a direct letter." },
  direct_furnisher_if_consumer_prepared: { party: "furnisher, direct dispute", cite: ["15 U.S.C. § 1681s-2(a)(8)", "12 C.F.R. § 1022.43"], caution: "§ 1022.43 excepts disputes a furnisher reasonably believes a credit repair organization prepared; CRO-prepared disputes default to the CRA route." },
  collector: { party: "debt collector", cite: ["FDCPA § 1692e(8)"], caution: "Only if the entity is a debt collector under the Act and the dispute is genuine." },
  identity_theft: { party: "consumer reporting agency", cite: ["15 U.S.C. § 1681c-2"], caution: "Requires the consumer's own attestation, an identity-theft report and proof of identity — never inferred from breach exposure." },
  none: { party: "—", cite: [], caution: "Determine the correct underlying fact before any dispute." },
};
