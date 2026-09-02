// Metro 2 Intelligence — Anomaly Detection Engine
// Deterministic rules classify each field. This is NOT AI — hardcoded logic
// avoids compliance issues. The AI only drafts language; it never decides the
// classification or declares a legal conclusion.
//
// Correct logic:
//   Reported Data → Metro 2 Context → Potential Anomaly → Consumer Fact →
//   Documentary Evidence → Applicable Legal Duty → Proper Dispute Channel →
//   Appropriate Remedy

import type { Bureau } from "@/lib/credit-classification";
import {
  type AnomalyClassification,
  type EvidenceStrength,
  type FieldVerdict,
  type BureauFieldValue,
  getFieldMetro2Context,
} from "./metro2-taxonomy";

export interface AnomalyInput {
  field: string;
  values: BureauFieldValue[];
  consumerAssertedValue?: string;
  hasSourceDocument?: boolean;
  sourceDocumentContradictsReport?: boolean;
  sameReportingPeriodConfirmed?: boolean;
  isDebtCollector?: boolean;
  consumerDisputedDebt?: boolean;
  reportCommunicatesDispute?: boolean;
}

export interface AnomalyResult {
  field: string;
  classification: AnomalyClassification;
  fieldVerdict: FieldVerdict;
  evidenceStrength: EvidenceStrength;
  observation: string;
  metro2Context: string;
  legalContext: string[];
  recommendedRoute: string;
  requestedRemedy: string;
  humanReviewRequired: boolean;
  flags: string[];
}

/**
 * The core anomaly detector. Deterministic rules classify each field.
 */
export function detectAnomaly(input: AnomalyInput): AnomalyResult {
  const { field, values } = input;
  const flags: string[] = [];
  const legalContext: string[] = [];

  const presentValues = values.filter((v) => v.value && v.value !== "-");
  const uniqueValues = new Set(
    presentValues.map((v) => v.value.toLowerCase().trim()),
  );
  const hasCrossBureauDifference = uniqueValues.size > 1;

  // ── DOFD / re-aging — highest priority, specific statute ──
  if (
    field.toLowerCase().includes("dofd") ||
    field.toLowerCase().includes("first delinquency")
  ) {
    legalContext.push(
      "15 U.S.C. § 1681s-2(a)(5)",
      "15 U.S.C. § 1681c(c)",
      "Reg V Appendix E",
    );
    if (hasCrossBureauDifference) {
      flags.push(
        "DOFD differs across bureaus — potential re-aging after transfer/sale",
      );
      flags.push(
        "Reconstruct delinquency chronology before concluding re-aging",
      );
      return {
        field,
        classification: "potential-fcra-reg-v-issue",
        fieldVerdict: "legal-review",
        evidenceStrength: "cross-source-discrepancy",
        observation: `DOFD reported as ${presentValues.map((v) => `${v.bureau}: ${v.value}`).join(", ")}. A DOFD shift after a portfolio sale with no intervening cure may indicate re-aging.`,
        metro2Context: "FCRA Compliance / Date of First Delinquency",
        legalContext,
        recommendedRoute:
          "CRA dispute with DOFD reconstruction + furnisher records",
        requestedRemedy:
          "Correct the DOFD to the month/year of the delinquency immediately preceding the collection/charge-off, or delete if unverifiable.",
        humanReviewRequired: true,
        flags,
      };
    }
  }

  // ── Evidence-supported inaccuracy — source doc contradicts report ──
  if (input.hasSourceDocument && input.sourceDocumentContradictsReport) {
    legalContext.push("FCRA § 1681i", "Regulation V accuracy/integrity");
    flags.push(
      "Source document contradicts same-period report — strong factual dispute",
    );
    if (input.sameReportingPeriodConfirmed) {
      flags.push(
        "Same reporting period confirmed — discrepancy is not a timing artifact",
      );
    }
    return {
      field,
      classification: "evidence-supported-inaccuracy",
      fieldVerdict: "evidence-supported-inaccuracy",
      evidenceStrength: "document-supported-fact",
      observation: `Report shows ${presentValues[0]?.value ?? "—"} but the attached source document shows ${input.consumerAssertedValue ?? "a conflicting value"} for the same period.`,
      metro2Context: getFieldMetro2Context(field),
      legalContext,
      recommendedRoute: "CRA factual accuracy dispute",
      requestedRemedy:
        "Correct the inaccurate field to match the documented value, or delete if the information cannot be verified as complete and accurate.",
      humanReviewRequired: false,
      flags,
    };
  }

  // ── Consumer attested but no document yet ──
  if (input.consumerAssertedValue && !input.hasSourceDocument) {
    legalContext.push("FCRA § 1681i");
    flags.push(
      "Consumer attests a different value — source document required before dispute",
    );
    return {
      field,
      classification: "potential-anomaly",
      fieldVerdict: "needs-source-document",
      evidenceStrength: "consumer-attested-fact",
      observation: `Consumer asserts ${input.consumerAssertedValue} but no supporting document is attached yet.`,
      metro2Context: getFieldMetro2Context(field),
      legalContext,
      recommendedRoute:
        "Collect source document before filing (frivolous-dispute guardrail)",
      requestedRemedy: "Pending evidence collection.",
      humanReviewRequired: false,
      flags,
    };
  }

  // ── FDCPA §1692e(8) — debt collector fails to communicate dispute ──
  if (
    input.isDebtCollector &&
    input.consumerDisputedDebt &&
    !input.reportCommunicatesDispute
  ) {
    legalContext.push("FDCPA § 1692e(8)", "FCRA § 1681s-2");
    flags.push(
      "Debt collector continuing to furnish without communicating the dispute",
    );
    flags.push(
      "Evaluate FDCPA §1692e(8) only if entity/debt fall within FDCPA coverage",
    );
    return {
      field,
      classification: "potential-fcra-reg-v-issue",
      fieldVerdict: "legal-review",
      evidenceStrength: "consumer-attested-fact",
      observation: `A debt collector is furnishing information about a disputed debt without communicating that the debt is disputed.`,
      metro2Context: "Compliance Condition Code / dispute indicator",
      legalContext,
      recommendedRoute: "CRA dispute + separate FDCPA §1692e(8) analysis",
      requestedRemedy:
        "Update the reporting to communicate the dispute status and reinvestigate the underlying accuracy.",
      humanReviewRequired: true,
      flags,
    };
  }

  // ── Cross-bureau difference — investigation trigger, NOT proof ──
  if (hasCrossBureauDifference) {
    legalContext.push("FCRA § 1681i");
    if (!input.sameReportingPeriodConfirmed) {
      flags.push(
        "Reporting period not confirmed — difference may be a timing artifact",
      );
    }
    flags.push(
      "Cross-bureau inconsistency is an investigation trigger, not proof of unverifiability",
    );
    flags.push(
      "Each CRA has its own reinvestigation obligation when its information is challenged",
    );
    return {
      field,
      classification: "observed-difference",
      fieldVerdict: "suspicious",
      evidenceStrength: "cross-source-discrepancy",
      observation: `Bureaus report different values: ${presentValues.map((v) => `${v.bureau}=${v.value}`).join(", ")}.`,
      metro2Context: getFieldMetro2Context(field),
      legalContext,
      recommendedRoute:
        "Ask consumer to verify the correct value and obtain source documentation",
      requestedRemedy:
        "Reinvestigate the specific field and review the enclosed evidence; correct or delete as appropriate.",
      humanReviewRequired: false,
      flags,
    };
  }

  // ── Consistent ──
  return {
    field,
    classification: "consistent",
    fieldVerdict: "expected",
    evidenceStrength: "unverified-observation",
    observation: `All reporting bureaus show ${presentValues[0]?.value ?? "—"} for this field.`,
    metro2Context: getFieldMetro2Context(field),
    legalContext: [],
    recommendedRoute: "No action required",
    requestedRemedy: "None",
    humanReviewRequired: false,
    flags,
  };
}

// ─── Reinsertion Detector ──────────────────────────────────────────────────────

export interface ReinsertionInput {
  previouslyDeleted: boolean;
  reappearedOnNewReport: boolean;
  furnisherCertifiedCompleteAndAccurate?: boolean;
  consumerReceived5DayNotice?: boolean;
}

export interface ReinsertionResult {
  isReinsertionEvent: boolean;
  classification: AnomalyClassification;
  observation: string;
  legalContext: string[];
  flags: string[];
}

/**
 * Reinsertion after a §1681i(a)(5)(A) deletion requires furnisher
 * certification and 5-business-day consumer notice. Flags a "Potential
 * Reinsertion Event" — NOT automatically "illegal reinsertion."
 */
export function detectReinsertion(input: ReinsertionInput): ReinsertionResult {
  const legalContext: string[] = [
    "15 U.S.C. § 1681i(a)(5)(B)",
    "15 U.S.C. § 1681i(a)(5)(C)",
  ];
  const flags: string[] = [];

  if (input.previouslyDeleted && input.reappearedOnNewReport) {
    flags.push(
      "Potential reinsertion event — determine why it disappeared and whether it is the same obligation",
    );
    if (!input.furnisherCertifiedCompleteAndAccurate) {
      flags.push(
        "No furnisher certification of completeness and accuracy on file",
      );
    }
    if (!input.consumerReceived5DayNotice) {
      flags.push(
        "No 5-business-day consumer reinsertion notice detected — potential notice failure",
      );
    }
    return {
      isReinsertionEvent: true,
      classification: "potential-fcra-reg-v-issue",
      observation:
        "Information that was deleted after a prior reinvestigation has reappeared. Reinsertion requires furnisher certification and 5-business-day consumer notice.",
      legalContext,
      flags,
    };
  }

  return {
    isReinsertionEvent: false,
    classification: "consistent",
    observation: "No reinsertion detected.",
    legalContext,
    flags,
  };
}

// ─── Recipient-Aware Statute Routing ───────────────────────────────────────────
// Corrects the error of applying §1681e(b) (a CRA duty) to a furnisher.

export type RecipientType = "cra" | "furnisher" | "debt-collector";

export interface StatuteRoutingResult {
  recipient: RecipientType;
  applicableStatutes: string[];
  incorrectAssignment: string[];
  notes: string[];
}

/**
 * Routes the correct statutes to the correct party. §1681e(b) is a CRA duty,
 * NOT a general furnisher reporting statute. §1681s-2(b) is triggered by CRA
 * notice, not by a direct certified-mail dispute.
 */
export function routeStatutes(recipient: RecipientType): StatuteRoutingResult {
  switch (recipient) {
    case "cra":
      return {
        recipient: "cra",
        applicableStatutes: ["15 U.S.C. § 1681e(b)", "15 U.S.C. § 1681i"],
        incorrectAssignment: [
          "Do not cite §1681s-2(b) as a CRA duty — it is a furnisher duty triggered by CRA notice",
        ],
        notes: [
          "§1681e(b) = CRA reasonable procedures for maximum possible accuracy",
          "§1681i = CRA reinvestigation duty (30 days, 5-day notice to furnisher, results)",
        ],
      };
    case "furnisher":
      return {
        recipient: "furnisher",
        applicableStatutes: [
          "15 U.S.C. § 1681s-2(a)",
          "15 U.S.C. § 1681s-2(b)",
          "Reg V 12 C.F.R. § 1022.43",
        ],
        incorrectAssignment: [
          "Do not cite §1681e(b) as a furnisher's general reporting statute — it is a CRA duty",
          "Do not claim a direct certified-mail dispute 'activates §1681s-2(b)' — that duty is triggered by CRA notice under §1681i(a)(2)",
        ],
        notes: [
          "§1681s-2(a) = furnisher accuracy duties (pre-dispute, governmental enforcement)",
          "§1681s-2(b) = furnisher investigation duty AFTER CRA notice",
          "§1022.43 = direct dispute rules, with CRO exception",
        ],
      };
    case "debt-collector":
      return {
        recipient: "debt-collector",
        applicableStatutes: ["FDCPA § 1692e(8)", "15 U.S.C. § 1681s-2"],
        incorrectAssignment: [
          "Do not apply FDCPA §1692e(8) unless the entity/debt fall within FDCPA coverage",
        ],
        notes: [
          "§1692e(8) = failure to communicate that a disputed debt is disputed",
          "Evaluate FDCPA coverage separately from the FCRA analysis",
        ],
      };
  }
}
