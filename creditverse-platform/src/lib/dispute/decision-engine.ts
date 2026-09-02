// Decision Engine — routes each item to its legal pathway + state using
// HARDCODED deterministic rules (NOT AI). AI assists with drafting the opening
// language; it never decides the pathway or declares a legal conclusion.
//
// Replaces absolute legal assertions ("inaccurate = must delete") with
// trigger-based, evidence-grounded routing. Based on the deep research review:
// - "Inaccurate = must delete" is too broad → §1681i(a)(5)(A) says delete OR
//   modify, as appropriate.
// - Cross-bureau difference ≠ unverifiable → investigation trigger only.
// - Prior dispute unresolved ≠ willful noncompliance → escalation flag for human.
// - Metro 2 ≠ federal violation → data integrity trigger, not a citation.
// - "USC 666" is wrong → 15 U.S.C. §1666 (FCBA), only with qualifying facts.
// - Direct furnisher disputes carry a Reg V CRO exception.

import type { ClassifiedItem } from "@/lib/credit-classification";
import { getItemLetterCategory } from "./letters-and-channels";
import type {
  DisputeState,
  LegalPathway,
  ConfidenceState,
  ErrorTableEntry,
  PriorDisputeEntry,
  FactualDisputeRecord,
} from "./legal-paths";

export interface DisputeDecisionInput {
  item: ClassifiedItem;
  round: number;
  consumerRecognizesAccount?: boolean;
  isIdentityTheft?: boolean;
  priorDisputeCount?: number;
  hasEvidence?: boolean;
  hasBillingErrorFacts?: boolean;
  wasVerifiedPrior?: boolean;
  hasNewEvidence?: boolean;
  wasPreviouslyDeleted?: boolean;
  reinsertionDetected?: boolean;
  evidenceContradictsVerification?: boolean;
}

export interface DisputeDecision {
  state: DisputeState;
  pathway: LegalPathway;
  confidence: ConfidenceState;
  legalCitations: string[];
  opening: string;
  remedy: string;
  humanReviewRequired: boolean;
  flags: string[];
}

/**
 * The decision engine. Deterministic rules select the correct statutory route
 * based on evidence + prior history. This is NOT AI — it is hardcoded logic to
 * avoid compliance issues. AI only drafts language; it never decides the path.
 */
export function decideDisputePath(
  input: DisputeDecisionInput,
): DisputeDecision {
  const { item, round } = input;
  const flags: string[] = [];
  let citations: string[] = [];
  let humanReviewRequired = false;

  // ── Identity theft → blocking pathway, never ordinary dispute ──
  if (input.isIdentityTheft || input.consumerRecognizesAccount === false) {
    return {
      state: "identity-theft",
      pathway: "identity-theft-block",
      confidence: "potential-issue",
      legalCitations: ["15 U.S.C. § 1681c-2"],
      opening:
        "I am reporting that the account identified below resulted from identity theft. Under 15 U.S.C. § 1681c-2, I am requesting that you block the reporting of this information. I have attached my identity theft report, proof of identity, and a statement that this account does not relate to any transaction by me.",
      remedy:
        "Block the reporting of the identity-theft-related information within 4 business days and provide written confirmation.",
      humanReviewRequired: true,
      flags: [
        "Identity theft pathway activated — not an ordinary dispute",
        "Requires FTC identity theft report + ID verification + consumer statement",
        "AI must not infer identity theft — consumer must confirm and attest",
      ],
    };
  }

  // ── Reinsertion after deletion → reinsertion dispute ──
  if (input.reinsertionDetected && input.wasPreviouslyDeleted) {
    flags.push("Reinsertion detected — check 5-business-day consumer notice");
    flags.push("Require furnisher certification of completeness & accuracy");
    citations = ["15 U.S.C. § 1681i(a)(5)(B)", "15 U.S.C. § 1681i(a)(5)(C)"];
    return {
      state: "reimport",
      pathway: "reinsertion",
      confidence: "detected-fact",
      legalCitations: citations,
      opening:
        "Information that was deleted following my prior reinvestigation has reappeared on my report. Under 15 U.S.C. § 1681i(a)(5), reinsertion requires furnisher certification of completeness and accuracy, and I am entitled to notice within 5 business days.",
      remedy:
        "Remove the reinserted information unless it is certified by the furnisher as complete and accurate, and provide the required 5-business-day reinsertion notice.",
      humanReviewRequired: false,
      flags,
    };
  }

  // ── Billing error (FCBA §1666) — only with qualifying facts ──
  if (input.hasBillingErrorFacts && item.category === "Late Payment") {
    flags.push(
      "Billing-error facts present — payment confirmation within 60-day window",
    );
    return {
      state: "initial-factual",
      pathway: "billing-error",
      confidence: "detected-fact",
      legalCitations: ["15 U.S.C. § 1666"],
      opening:
        "I am disputing a billing error on this account. The statement dated in the relevant period failed to reflect a payment I made, which I have documented with the enclosed bank transaction and payment confirmation.",
      remedy:
        "Correct the payment history to reflect the payment, remove the resulting late notation, and provide the results of your investigation.",
      humanReviewRequired: false,
      flags,
    };
  }

  // ── Verified but evidence contradicts → procedure request or escalation ──
  if (input.wasVerifiedPrior && input.evidenceContradictsVerification) {
    if (round >= 2) {
      citations = ["15 U.S.C. § 1681i(a)(6)", "15 U.S.C. § 1681i(a)(7)"];
      flags.push(
        "Verified result contradicts attached evidence — request the reinvestigation procedure",
      );
      return {
        state: "procedure-request",
        pathway: "procedure-request",
        confidence: "potential-issue",
        legalCitations: citations,
        opening:
          "I previously disputed the specific information identified below and provided supporting documentation. Your response stated the information was verified, but the same discrepancy remains and the enclosed evidence was not addressed. I am requesting the description of the procedure used to determine the accuracy and completeness of this information, including the furnisher contacted and the method used.",
        remedy:
          "Provide the reinvestigation procedure description within 15 days, including furnisher identification and verification method, and reinvestigate the unresolved field.",
        humanReviewRequired: false,
        flags,
      };
    }
    citations = ["15 U.S.C. § 1681i", "Reg V 12 C.F.R. § 1022.43"];
    flags.push(
      "New information/evidence introduced — not a substantially identical repeat dispute",
    );
    if (input.hasNewEvidence) {
      flags.push("New evidence attached — supports non-frivolous escalation");
    }
    return {
      state: "escalation-new-info",
      pathway: "cra-reinvestigation-escalation",
      confidence: "potential-issue",
      legalCitations: citations,
      opening:
        "I previously disputed this account on the date shown in the dispute history below. The specific field identified remains on my report despite the enclosed evidence. I am now providing additional information and new supporting documentation that was not previously supplied.",
      remedy:
        "Reinvestigate the unresolved field in light of the new information, review all enclosed evidence, and delete or correct the information as appropriate.",
      humanReviewRequired: false,
      flags,
    };
  }

  // ── Round 3+ and prior disputes failed → potential compliance failure (human) ──
  if (
    round >= 3 &&
    input.priorDisputeCount &&
    input.priorDisputeCount >= 2 &&
    input.wasVerifiedPrior &&
    input.evidenceContradictsVerification &&
    input.hasEvidence
  ) {
    flags.push(
      "Repeated verified results contradicting evidence — potential compliance failure",
    );
    flags.push(
      "Willfulness requires more than ordinary carelessness (Safeco v. Burr) — human review required",
    );
    flags.push("AI must not declare liability — a human/counsel decides");
    humanReviewRequired = true;
    return {
      state: "potential-compliance-failure",
      pathway: "potential-compliance",
      confidence: "potential-issue",
      legalCitations: ["15 U.S.C. § 1681n", "15 U.S.C. § 1681o"],
      opening:
        "I have disputed the specific information identified below on multiple occasions and provided supporting documentation each time. The same discrepancy persists. I am requesting a reasonable reinvestigation and review of all enclosed evidence, and I am escalating this matter for compliance review.",
      remedy:
        "Reinvestigate, review all evidence, and delete or correct as appropriate. This matter is flagged for compliance review and potential further escalation.",
      humanReviewRequired: true,
      flags,
    };
  }

  // ── Round 3+ → direct furnisher dispute (CRO-aware) ──
  if (round >= 3) {
    flags.push(
      "Direct furnisher dispute — Reg V CRO exception applies to CRO-prepared disputes",
    );
    flags.push(
      "Consumer-originated factual disputes are stronger under Reg V than CRO-prepared ones",
    );
    citations = ["15 U.S.C. § 1681s-2", "Reg V 12 C.F.R. § 1022.43"];
    return {
      state: "initial-factual",
      pathway: "furnisher-direct",
      confidence: "detected-fact",
      legalCitations: citations,
      opening:
        "I am disputing the specific information you are furnishing about me directly with you as the data furnisher. I am providing the specific field, the value I believe is correct, and the supporting documentation.",
      remedy:
        "Investigate, review the enclosed information, and modify, delete, or block the information as appropriate under 15 U.S.C. § 1681s-2.",
      humanReviewRequired: false,
      flags,
    };
  }

  // ── Default: initial CRA factual accuracy dispute ──
  citations = ["15 U.S.C. § 1681e(b)", "15 U.S.C. § 1681i"];
  const hasSpecificField = input.hasEvidence;
  if (!hasSpecificField) {
    flags.push(
      "No evidence attached — request evidence before filing (frivolous-dispute guardrail)",
    );
    flags.push(
      "A dispute without a specific field + evidence risks being deemed frivolous/irrelevant",
    );
  }
  const opening = hasSpecificField
    ? "I am disputing the specific information identified in the error table below. I believe this information is inaccurate, and I have attached supporting documentation. Please conduct a reasonable reinvestigation under 15 U.S.C. §§ 1681e(b) and 1681i and review the enclosed documents."
    : "I am requesting that you reinvestigate the information reported about this account. Before filing a formal factual dispute, I am gathering the specific field, the value I believe is correct, and the supporting documentation.";
  return {
    state: "initial-factual",
    pathway: "cra-accuracy",
    confidence: "potential-issue",
    legalCitations: citations,
    opening,
    remedy:
      "If this information cannot be verified as complete and accurate, delete it. If the underlying information can be verified but the fields identified above are inaccurate, correct them and send me the results of your reinvestigation.",
    humanReviewRequired: false,
    flags,
  };
}

// ─── Build a full factual dispute record for the letter engine ───────────────

export function buildFactualDisputeRecord(
  input: DisputeDecisionInput,
): FactualDisputeRecord {
  const { item } = input;
  const decision = decideDisputePath(input);

  const errorTable: ErrorTableEntry[] = [];
  if (item.balance) {
    errorTable.push({
      field: "Balance",
      reportedValue: item.balance,
      consumerAssertedCorrect: "See supporting evidence",
      evidence: input.hasEvidence ? "Attached statement" : "Pending",
      bureau: "ALL",
    });
  }
  if (item.dofd) {
    errorTable.push({
      field: "Date of First Delinquency",
      reportedValue: item.dofd,
      consumerAssertedCorrect: "See supporting evidence",
      evidence: input.hasEvidence ? "Attached account records" : "Pending",
      bureau: "ALL",
    });
  }
  if (item.status) {
    errorTable.push({
      field: "Account status",
      reportedValue: item.status,
      consumerAssertedCorrect: "See supporting evidence",
      evidence: input.hasEvidence ? "Attached documentation" : "Pending",
      bureau: "ALL",
    });
  }

  return {
    itemId: item.id,
    itemName: item.name,
    state: decision.state,
    pathway: decision.pathway,
    confidence: decision.confidence,
    opening: decision.opening,
    errorTable,
    legalCitations: decision.legalCitations,
    remedy: decision.remedy,
    priorDisputeHistory: buildPriorHistory(input),
    consumerAttestation: false,
    evidenceAttached: !!input.hasEvidence,
    humanReviewRequired: decision.humanReviewRequired,
  };
}

function buildPriorHistory(input: DisputeDecisionInput): PriorDisputeEntry[] {
  const history: PriorDisputeEntry[] = [];
  if (input.priorDisputeCount && input.priorDisputeCount >= 1) {
    history.push({
      date: "Round 1 — see case timeline",
      action: "Initial CRA factual dispute filed",
      response: "CRA reinvestigation",
      result: input.wasVerifiedPrior ? "Verified / no change" : "Pending",
    });
  }
  if (input.priorDisputeCount && input.priorDisputeCount >= 2) {
    history.push({
      date: "Round 2 — see case timeline",
      action: "Method of verification / escalation with new evidence",
      response: "CRA reinvestigation",
      result: input.wasVerifiedPrior ? "Verified / no change" : "Pending",
    });
  }
  return history;
}

// Mark getItemLetterCategory as used (avoids unused-import lints if tree-shaken)
void getItemLetterCategory;
