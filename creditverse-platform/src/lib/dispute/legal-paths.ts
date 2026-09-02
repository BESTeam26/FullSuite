// Legal Pathways & Dispute States — the statutory routes the decision engine
// selects between, plus the state-based escalation model that replaces rigid
// Round 1/2/3 letter rotation. Every route is trigger-based and evidence-grounded.
//
// Based on FCRA §1681e(b) (max possible accuracy), §1681i (reinvestigation),
// §1681s-2 (furnisher duties + CRO exception), §1681c-2 (identity theft block),
// 15 U.S.C. §1666 (FCBA billing errors), Regulation V, and CFPB guidance.

import type { Bureau } from "@/lib/credit-classification";

// ─── Dispute State Model ──────────────────────────────────────────────────────

export type DisputeState =
  | "initial-factual"
  | "verified-no-change"
  | "escalation-new-info"
  | "procedure-request"
  | "reimport"
  | "identity-theft"
  | "potential-compliance-failure"
  | "resolved";

export interface DisputeStateMeta {
  key: DisputeState;
  label: string;
  description: string;
  legalBasis: string[];
  whatSoftwareDoes: string;
  icon: string;
  tone: string;
}

export const DISPUTE_STATES: DisputeStateMeta[] = [
  {
    key: "initial-factual",
    label: "Initial Factual Dispute",
    description:
      "Identify the exact field, factual claim, and supporting evidence. The opening states the specific error, never a blanket deletion demand.",
    legalBasis: ["FCRA §1681e(b)", "FCRA §1681i"],
    whatSoftwareDoes:
      "Builds the error table: field disputed, reported value, consumer-asserted correct value, and evidence attachment.",
    icon: "FileSearch",
    tone: "text-emerald-600",
  },
  {
    key: "verified-no-change",
    label: "Verified / No Change",
    description:
      "CRA responded 'verified' without resolving the factual error. Compare the response against the original evidence and prior dispute record.",
    legalBasis: ["FCRA §1681i(a)(5)(A)"],
    whatSoftwareDoes:
      "Imports the CRA response, compares it against the original evidence, and flags whether the evidence was actually addressed.",
    icon: "CheckCircle2",
    tone: "text-amber-600",
  },
  {
    key: "escalation-new-info",
    label: "Escalation With New Information",
    description:
      "Introduce an unresolved fact plus NEW evidence or a NEW discrepancy not previously supplied. This avoids the 'frivolous/substantially identical' trap in Regulation V.",
    legalBasis: ["FCRA §1681i", "Reg V 12 C.F.R. § 1022.43"],
    whatSoftwareDoes:
      "Inserts the prior dispute history, the new discrepancy, and the new document into the dispute record.",
    icon: "ArrowUpCircle",
    tone: "text-blue-600",
  },
  {
    key: "procedure-request",
    label: "Reinvestigation Procedure Request",
    description:
      "After a 'verified' result that contradicts evidence, request the description of the procedure used to determine accuracy. CRA must provide it within 15 days.",
    legalBasis: ["FCRA §1681i(a)(6)", "FCRA §1681i(a)(7)"],
    whatSoftwareDoes:
      "Generates the §1681i(a)(6) procedure request citing the contradictory evidence and requesting the furnisher identification, verification method, and dates.",
    icon: "Search",
    tone: "text-purple-600",
  },
  {
    key: "reimport",
    label: "Re-Import & Change Detection",
    description:
      "Re-import the report to detect corrections, deletions, status changes, or reinsertion. Compare before/after at the field level.",
    legalBasis: ["FCRA §1681i(a)(5)(B)", "FCRA §1681i(a)(5)(C)"],
    whatSoftwareDoes:
      "Runs the historical entity matcher, classifies each change, and flags any reinsertion for a 5-business-day notice check.",
    icon: "RefreshCw",
    tone: "text-emerald-600",
  },
  {
    key: "identity-theft",
    label: "Identity Theft Block (§1681c-2)",
    description:
      "Routed to the blocking pathway, NOT an ordinary dispute. Requires an identity theft report, ID verification, and a consumer statement that the transaction is not theirs.",
    legalBasis: ["FCRA §1681c-2", "IdentityTheft.gov"],
    whatSoftwareDoes:
      "Routes to the identity-theft module: consumer attestation, FTC identity theft report, ID documents, and the 4-business-day blocking request.",
    icon: "ShieldAlert",
    tone: "text-red-600",
  },
  {
    key: "potential-compliance-failure",
    label: "Potential Compliance Failure — Human Review",
    description:
      "Prior dispute + same factual error + supporting evidence + CRA verified + new report still conflicts + evidence apparently not addressed. Flagged for human/counsel review. AI never declares liability.",
    legalBasis: ["FCRA §1681n", "FCRA §1681o"],
    whatSoftwareDoes:
      "Sets the internal escalation-risk flag and routes to a compliance officer. The system proposes escalation; a human decides.",
    icon: "AlertTriangle",
    tone: "text-red-600",
  },
];

export function getDisputeStateMeta(state: DisputeState): DisputeStateMeta {
  return DISPUTE_STATES.find((s) => s.key === state) ?? DISPUTE_STATES[0];
}

// ─── Legal Pathways ───────────────────────────────────────────────────────────

export type LegalPathway =
  | "cra-accuracy"
  | "cra-reinvestigation-escalation"
  | "procedure-request"
  | "reinsertion"
  | "identity-theft-block"
  | "furnisher-direct"
  | "billing-error"
  | "potential-compliance";

export interface LegalPathwayMeta {
  key: LegalPathway;
  label: string;
  statute: string;
  shortStatute: string;
  description: string;
  trigger: string;
  tone: string;
  icon: string;
}

export const LEGAL_PATHWAYS: LegalPathwayMeta[] = [
  {
    key: "cra-accuracy",
    label: "CRA Factual Accuracy Dispute",
    statute: "15 U.S.C. §§ 1681e(b), 1681i",
    shortStatute: "§1681e(b) + §1681i",
    description:
      "Standard CRA dispute: identify the specific field, state the correct value, attach evidence, request reinvestigation within 30 days (up to 45 in certain circumstances), receive results within 5 business days.",
    trigger:
      "A specific field is believed inaccurate, incomplete, or unverifiable with supporting evidence.",
    tone: "text-emerald-600",
    icon: "Building2",
  },
  {
    key: "cra-reinvestigation-escalation",
    label: "CRA Reinvestigation Escalation",
    statute: "15 U.S.C. § 1681i",
    shortStatute: "§1681i",
    description:
      "Prior dispute verified without resolving the factual error. Escalate with the unresolved field, new evidence, and the prior response record.",
    trigger:
      "Prior dispute returned 'verified' but the specific field still conflicts with submitted evidence.",
    tone: "text-amber-600",
    icon: "ArrowUpCircle",
  },
  {
    key: "procedure-request",
    label: "Reinvestigation Procedure Request",
    statute: "15 U.S.C. § 1681i(a)(6), (a)(7)",
    shortStatute: "§1681i(a)(6)-(7)",
    description:
      "After a 'verified' result that contradicts evidence, request the description of the procedure and furnisher identification used to determine accuracy. CRA must provide within 15 days.",
    trigger:
      "Verified result contradicts attached evidence and the consumer requests the verification method.",
    tone: "text-purple-600",
    icon: "Search",
  },
  {
    key: "reinsertion",
    label: "Reinsertion Dispute",
    statute: "15 U.S.C. § 1681i(a)(5)(B), (a)(5)(C)",
    shortStatute: "§1681i(a)(5)(B)-(C)",
    description:
      "Previously deleted information reappeared. The furnisher must certify completeness and accuracy, and the CRA must notify the consumer within 5 business days of reinsertion.",
    trigger:
      "An item that was deleted after a prior reinvestigation has reappeared on a new report.",
    tone: "text-red-600",
    icon: "RotateCcw",
  },
  {
    key: "identity-theft-block",
    label: "Identity Theft Block",
    statute: "15 U.S.C. § 1681c-2",
    shortStatute: "§1681c-2",
    description:
      "Blocking pathway — the CRA must block information resulting from identity theft within 4 business days after receiving proof of identity, an identity theft report, identification of the disputed info, and a consumer statement.",
    trigger:
      "Consumer does not recognize the account and confirms it resulted from identity theft.",
    tone: "text-red-600",
    icon: "ShieldAlert",
  },
  {
    key: "furnisher-direct",
    label: "Direct Furnisher Dispute",
    statute: "15 U.S.C. § 1681s-2; Reg V 12 C.F.R. § 1022.43",
    shortStatute: "§1681s-2 + Reg V",
    description:
      "Direct dispute to the furnisher under Reg V. NOTE: Reg V contains a CRO exception — a furnisher need not apply its direct-dispute duties if it reasonably believes the dispute was submitted/prepared by or on a form from a CRO. Consumer-originated factual disputes are stronger.",
    trigger:
      "CRA reinvestigation failed and the consumer is disputing directly with the furnisher.",
    tone: "text-blue-600",
    icon: "Building",
  },
  {
    key: "billing-error",
    label: "Billing Error Dispute (FCBA)",
    statute: "15 U.S.C. § 1666",
    shortStatute: "§1666",
    description:
      "Qualifying written billing-error notice — must reach the creditor within 60 days after the statement containing the alleged error. Covers failures to reflect payments/credits and certain computational/accounting errors. NOT for 'I was late but want it removed.'",
    trigger:
      "Consumer has a bank transaction / payment confirmation showing a payment that the creditor's statement failed to credit, within the 60-day window.",
    tone: "text-blue-600",
    icon: "Receipt",
  },
  {
    key: "potential-compliance",
    label: "Potential Compliance Failure — Human Review",
    statute: "15 U.S.C. §§ 1681n, 1681o",
    shortStatute: "§1681n / §1681o",
    description:
      "Internal escalation-risk flag: prior dispute + same factual error + supporting evidence + CRA verified + new report still conflicts + evidence apparently not addressed. Willfulness requires more than ordinary carelessness (Safeco v. Burr). AI never declares this.",
    trigger:
      "Repeated verified results contradicting submitted evidence across multiple rounds.",
    tone: "text-red-600",
    icon: "AlertTriangle",
  },
];

export function getLegalPathwayMeta(path: LegalPathway): LegalPathwayMeta {
  return LEGAL_PATHWAYS.find((p) => p.key === path) ?? LEGAL_PATHWAYS[0];
}

// ─── Confidence States — the AI never invents violations ──────────────────────

export type ConfidenceState =
  "detected-fact" | "potential-issue" | "legal-conclusion";

export interface ConfidenceStateMeta {
  key: ConfidenceState;
  label: string;
  description: string;
  example: string;
  tone: string;
}

export const CONFIDENCE_STATES: ConfidenceStateMeta[] = [
  {
    key: "detected-fact",
    label: "Detected Fact",
    description:
      "An observable piece of data the AI can report without interpretation. This is what the credit report actually says.",
    example:
      '"Experian reports the balance as $0 while Equifax reports $4,820."',
    tone: "text-emerald-600",
  },
  {
    key: "potential-issue",
    label: "Potential Issue",
    description:
      "An analysis the AI may propose — a discrepancy that may warrant investigation. Never a legal conclusion.",
    example:
      '"The balance discrepancy may warrant investigation before any dispute is filed."',
    tone: "text-amber-600",
  },
  {
    key: "legal-conclusion",
    label: "Legal Conclusion — Human Only",
    description:
      "A legal conclusion the AI must NEVER generate automatically. It depends on the reporting process, actual accuracy, and other circumstances. A human (or counsel) decides.",
    example:
      '"This is an FCRA violation." — AI must not produce this without human review.',
    tone: "text-red-600",
  },
];

// ─── Factual Error Table (the core dispute artifact) ──────────────────────────

export interface ErrorTableEntry {
  field: string;
  reportedValue: string;
  consumerAssertedCorrect: string;
  evidence: string;
  bureau: Bureau | "ALL";
}

export interface PriorDisputeEntry {
  date: string;
  action: string;
  response: string;
  result: string;
}

export interface FactualDisputeRecord {
  itemId: string;
  itemName: string;
  state: DisputeState;
  pathway: LegalPathway;
  confidence: ConfidenceState;
  opening: string;
  errorTable: ErrorTableEntry[];
  legalCitations: string[];
  remedy: string;
  priorDisputeHistory: PriorDisputeEntry[];
  consumerAttestation: boolean;
  evidenceAttached: boolean;
  humanReviewRequired: boolean;
}
