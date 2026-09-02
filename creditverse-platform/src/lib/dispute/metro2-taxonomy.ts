// Metro 2 Intelligence — Taxonomy & Field Definitions
// Metro 2 is NOT a federal statute. It is an industry data-reporting spec.
// A Metro 2 anomaly is EVIDENCE of a data-integrity problem, not an FCRA
// violation. This module defines the corrected, graduated classification scale
// that replaces the dangerous "Metro 2 Violation" label.

import type { Bureau } from "@/lib/credit-classification";

// ─── Corrected Taxonomy ────────────────────────────────────────────────────────

export type AnomalyClassification =
  | "observed-difference"
  | "potential-anomaly"
  | "evidence-supported-inaccuracy"
  | "potential-fcra-reg-v-issue"
  | "established-violation"
  | "consistent";

export interface AnomalyClassificationMeta {
  key: AnomalyClassification;
  label: string;
  description: string;
  tone: string;
  chip: string;
  icon: string;
  requiresEvidence: boolean;
  requiresHumanReview: boolean;
}

export const ANOMALY_CLASSIFICATIONS: AnomalyClassificationMeta[] = [
  {
    key: "consistent",
    label: "Consistent",
    description:
      "No anomaly detected across bureaus for this field within the same reporting period.",
    tone: "text-emerald-600",
    chip: "bg-emerald-500/10 text-emerald-600",
    icon: "CheckCircle2",
    requiresEvidence: false,
    requiresHumanReview: false,
  },
  {
    key: "observed-difference",
    label: "Observed Reporting Difference",
    description:
      "Two data sources differ. No conclusion yet — could be reporting-cycle timing, display formatting, or a real discrepancy.",
    tone: "text-slate-500",
    chip: "bg-slate-500/10 text-slate-600",
    icon: "MinusCircle",
    requiresEvidence: false,
    requiresHumanReview: false,
  },
  {
    key: "potential-anomaly",
    label: "Potential Metro 2 / Data-Integrity Anomaly",
    description:
      "The combination appears inconsistent with expected reporting logic and needs review. Metro 2 is an industry format, not itself the FCRA.",
    tone: "text-amber-600",
    chip: "bg-amber-500/10 text-amber-600",
    icon: "HelpCircle",
    requiresEvidence: true,
    requiresHumanReview: false,
  },
  {
    key: "evidence-supported-inaccuracy",
    label: "Evidence-Supported Reporting Inaccuracy",
    description:
      "Reliable consumer/furnisher/source evidence contradicts the reported data. Strong factual dispute candidate.",
    tone: "text-orange-600",
    chip: "bg-orange-500/10 text-orange-600",
    icon: "FileWarning",
    requiresEvidence: true,
    requiresHumanReview: false,
  },
  {
    key: "potential-fcra-reg-v-issue",
    label: "Potential FCRA / Regulation V Compliance Issue",
    description:
      "Facts may implicate a specific statutory or regulatory duty (e.g., §1681s-2(a)(5) DOFD, Appendix E re-aging). Flagged for legal routing.",
    tone: "text-red-600",
    chip: "bg-red-500/10 text-red-600",
    icon: "Scale",
    requiresEvidence: true,
    requiresHumanReview: true,
  },
  {
    key: "established-violation",
    label: "Established Violation — Human/Counsel Only",
    description:
      "Reserved for situations where the legal elements are actually established, ideally after legal review or adjudication. The AI NEVER produces this automatically.",
    tone: "text-red-700",
    chip: "bg-red-700/10 text-red-700",
    icon: "Gavel",
    requiresEvidence: true,
    requiresHumanReview: true,
  },
];

export function getAnomalyMeta(
  c: AnomalyClassification,
): AnomalyClassificationMeta {
  return (
    ANOMALY_CLASSIFICATIONS.find((a) => a.key === c) ??
    ANOMALY_CLASSIFICATIONS[0]
  );
}

// ─── Evidence Strength Scoring ─────────────────────────────────────────────────

export type EvidenceStrength =
  | "unverified-observation"
  | "cross-source-discrepancy"
  | "consumer-attested-fact"
  | "document-supported-fact"
  | "authoritative-record"
  | "legal-review-required";

export interface EvidenceStrengthMeta {
  key: EvidenceStrength;
  label: string;
  description: string;
  tone: string;
  weight: number;
}

export const EVIDENCE_STRENGTHS: EvidenceStrengthMeta[] = [
  {
    key: "unverified-observation",
    label: "Unverified Observation",
    description: "Credit-report display only — no supporting documentation.",
    tone: "text-slate-500",
    weight: 10,
  },
  {
    key: "cross-source-discrepancy",
    label: "Cross-Source Discrepancy",
    description:
      "Two bureaus or report sources conflict. Investigation trigger, not proof.",
    tone: "text-amber-600",
    weight: 30,
  },
  {
    key: "consumer-attested-fact",
    label: "Consumer-Attested Fact",
    description:
      "Consumer has specifically stated the facts under attestation.",
    tone: "text-blue-600",
    weight: 50,
  },
  {
    key: "document-supported-fact",
    label: "Document-Supported Fact",
    description:
      "Statement, bank record, agreement, payment receipt, or court record attached.",
    tone: "text-emerald-600",
    weight: 75,
  },
  {
    key: "authoritative-record",
    label: "Authoritative Record",
    description:
      "Source data strongly establishes the underlying fact (e.g., furnisher's own ledger).",
    tone: "text-emerald-700",
    weight: 90,
  },
  {
    key: "legal-review-required",
    label: "Legal Review Required",
    description:
      "Correct outcome depends on contract, statute, or court interpretation.",
    tone: "text-red-600",
    weight: 100,
  },
];

export function getEvidenceMeta(s: EvidenceStrength): EvidenceStrengthMeta {
  return EVIDENCE_STRENGTHS.find((e) => e.key === s) ?? EVIDENCE_STRENGTHS[0];
}

// ─── Field Verdict Model ───────────────────────────────────────────────────────

export type FieldVerdict =
  | "expected"
  | "possible"
  | "suspicious"
  | "needs-source-document"
  | "evidence-supported-inaccuracy"
  | "legal-review";

export interface FieldVerdictMeta {
  key: FieldVerdict;
  label: string;
  description: string;
  tone: string;
}

export const FIELD_VERDICTS: FieldVerdictMeta[] = [
  {
    key: "expected",
    label: "Expected",
    description:
      "The combination is normal and consistent with reporting logic.",
    tone: "text-emerald-600",
  },
  {
    key: "possible",
    label: "Possible",
    description:
      "The combination is plausible (e.g., current status with historical lates).",
    tone: "text-blue-600",
  },
  {
    key: "suspicious",
    label: "Suspicious",
    description:
      "The combination warrants review but is not automatically an error.",
    tone: "text-amber-600",
  },
  {
    key: "needs-source-document",
    label: "Needs Source Document",
    description:
      "Consumer statement conflicts with report — requires documentation to proceed.",
    tone: "text-orange-600",
  },
  {
    key: "evidence-supported-inaccuracy",
    label: "Evidence-Supported Inaccuracy",
    description:
      "Source document contradicts same-period report — strong dispute candidate.",
    tone: "text-red-600",
  },
  {
    key: "legal-review",
    label: "Legal Review",
    description:
      "Outcome depends on contract/statute/court interpretation — escalate to counsel.",
    tone: "text-red-700",
  },
];

export function getFieldVerdictMeta(v: FieldVerdict): FieldVerdictMeta {
  return FIELD_VERDICTS.find((f) => f.key === v) ?? FIELD_VERDICTS[0];
}

// ─── Metro 2 Field Analysis Definitions ────────────────────────────────────────

export interface Metro2FieldAnalysis {
  field: string;
  metro2Context: string;
  whatItTests: string;
  whatItMustNotAssume: string;
  legalHook: string;
  category:
    | "identity"
    | "responsibility"
    | "status"
    | "history"
    | "balance"
    | "dates"
    | "dofd"
    | "dispute"
    | "transfer";
}

export const METRO2_FIELD_ANALYSES: Metro2FieldAnalysis[] = [
  {
    field: "Consumer / Account Identity",
    metro2Context: "Account identification fields",
    whatItTests:
      "Does the account appear to belong to this consumer? Do identifying data and responsibility match?",
    whatItMustNotAssume:
      "A masked account-number difference automatically means two accounts.",
    legalHook:
      "Regulation V accuracy includes identifying the appropriate consumer.",
    category: "identity",
  },
  {
    field: "Responsibility (ECOA Code)",
    metro2Context: "ECOA / Account Designator",
    whatItTests:
      "Is the relationship (individual, joint, authorized user) consistent with records?",
    whatItMustNotAssume: "Every unfamiliar relationship is identity theft.",
    legalHook: "§1022.43 expressly covers liability/responsibility disputes.",
    category: "responsibility",
  },
  {
    field: "Current Status",
    metro2Context: "Account Status Code",
    whatItTests: "Does current status match the present account condition?",
    whatItMustNotAssume:
      "'Current' means there can be no historical late payment.",
    legalHook:
      "Current status and historical performance are different concepts (Reg V).",
    category: "status",
  },
  {
    field: "Payment History",
    metro2Context: "Payment History Profile (PHP)",
    whatItTests:
      "Does the month-by-month sequence match statements? Are the same months being compared?",
    whatItMustNotAssume:
      "An apparent sequence is wrong before determining chronological orientation and missing-data periods.",
    legalHook:
      "Regulation V requires accurate consumer performance information.",
    category: "history",
  },
  {
    field: "Current Balance",
    metro2Context: "Current Balance",
    whatItTests:
      "Does the balance match source records as of the same reporting period?",
    whatItMustNotAssume: "Balance must equal past-due amount.",
    legalHook: "Account terms/performance accuracy (Reg V).",
    category: "balance",
  },
  {
    field: "Amount Past Due",
    metro2Context: "Amount Past Due",
    whatItTests:
      "Does the amount presently past due match contractual/payment facts?",
    whatItMustNotAssume:
      "$0 past due means the consumer was never delinquent historically.",
    legalHook: "Account terms/performance accuracy (Reg V).",
    category: "balance",
  },
  {
    field: "Credit Limit / High Credit",
    metro2Context: "Credit Limit / High Credit / Original Amount",
    whatItTests: "Are the values being used according to their actual roles?",
    whatItMustNotAssume:
      "A difference between limit, high credit, and balance is necessarily an error.",
    legalHook:
      "Regulation V explicitly identifies credit-limit integrity where applicable.",
    category: "balance",
  },
  {
    field: "Date Opened",
    metro2Context: "Date Opened",
    whatItTests: "Does it match the actual origination/open date?",
    whatItMustNotAssume: "Different display formatting means a different date.",
    legalHook: "Objectively verifiable account term.",
    category: "dates",
  },
  {
    field: "Date Closed",
    metro2Context: "Date Closed",
    whatItTests: "Does it match closure records and actual account condition?",
    whatItMustNotAssume: "Missing/blank always means a violation.",
    legalHook: "§1022.43 can reach open/close date disputes.",
    category: "dates",
  },
  {
    field: "Date of Last Payment",
    metro2Context: "Date of Last Payment",
    whatItTests: "Compare against payment ledger / source records.",
    whatItMustNotAssume: "DLP is the same thing as DOFD.",
    legalHook: "Different concepts — do not conflate.",
    category: "dates",
  },
  {
    field: "Date of Account Information / Update",
    metro2Context: "Date Reported",
    whatItTests: "Is the report describing the same reporting period?",
    whatItMustNotAssume: "A recent update date has 're-aged' the debt.",
    legalHook: "Appendix E emphasizes period/date context.",
    category: "dates",
  },
  {
    field: "DOFD / FCRA Delinquency Date",
    metro2Context: "FCRA Compliance / Date of First Delinquency",
    whatItTests:
      "Does the statutory delinquency sequence match the commencement of delinquency immediately preceding collection/charge-off?",
    whatItMustNotAssume:
      "'Date updated' or 'last activity' automatically controls obsolescence.",
    legalHook: "§1681s-2(a)(5) and §1681c(c).",
    category: "dofd",
  },
  {
    field: "Dispute Indicator / Context",
    metro2Context: "Compliance Condition Code / CII",
    whatItTests:
      "Was a bona fide dispute made and was dispute status properly communicated where legally required?",
    whatItMustNotAssume:
      "Every prior complaint automatically requires permanent dispute notation under every statute.",
    legalHook: "§1681s-2 and, for debt collectors, FDCPA §1692e(8).",
    category: "dispute",
  },
  {
    field: "Transfer / Sale",
    metro2Context: "Original Creditor / Portfolio Type",
    whatItTests:
      "Is the original creditor/owner/collector relationship understandable? Are duplicates or re-aging present?",
    whatItMustNotAssume:
      "Original creditor plus collector on report automatically means unlawful duplicate debt.",
    legalHook:
      "Appendix E specifically addresses transfers, duplicates, and re-aging.",
    category: "transfer",
  },
];

export function getFieldMetro2Context(field: string): string {
  const match = METRO2_FIELD_ANALYSES.find((a) =>
    field.toLowerCase().includes(a.field.toLowerCase().split(" ")[0]),
  );
  return match?.metro2Context ?? "Base Segment";
}

// ─── Shared Types ───────────────────────────────────────────────────────────────

export interface BureauFieldValue {
  bureau: Bureau;
  value: string;
}
