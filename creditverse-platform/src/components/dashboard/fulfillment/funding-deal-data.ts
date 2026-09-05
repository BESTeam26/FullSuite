/**
 * Seed constants for the Funding Deal Workspace — readiness areas, document
 * categories, stipulations, and meaningful work-output groups.
 *
 * These model the FundingOps architecture spec:
 *  - Readiness answers "is this file complete enough to match & submit?" —
 *    NOT "will the client be approved?"
 *  - Document Review is a real operational workspace with per-document status.
 *  - Stipulations belong to the specific lender submission, not globally.
 *  - Work Completion uses meaningful outputs, not micro-steps.
 */

export interface ReadinessArea {
  id: string;
  label: string;
  state: string;
}

export const READINESS_AREAS: ReadinessArea[] = [
  { id: "identity", label: "Identity", state: "READY" },
  { id: "business", label: "Business Verification", state: "READY" },
  { id: "ownership", label: "Ownership", state: "CONDITIONAL" },
  { id: "revenue", label: "Revenue", state: "READY" },
  { id: "bank", label: "Bank Activity", state: "READY" },
  { id: "credit", label: "Credit", state: "HUMAN REVIEW" },
  { id: "debt", label: "Existing Debt", state: "NOT READY" },
  { id: "use", label: "Use of Funds", state: "READY" },
];

export const READINESS_TONE: Record<string, string> = {
  READY: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  CONDITIONAL: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  "NOT READY": "bg-red-500/10 text-red-700 border-red-500/30",
  "HUMAN REVIEW": "bg-blue-500/10 text-blue-700 border-blue-500/30",
  "INSUFFICIENT DATA": "bg-slate-500/10 text-slate-700 border-slate-500/30",
};

export interface DocCategory {
  id: string;
  label: string;
  status: string;
}

export const DOCUMENT_CATEGORIES: DocCategory[] = [
  { id: "gov-id", label: "Government ID", status: "Accepted" },
  { id: "voided-check", label: "Voided Check", status: "Accepted" },
  { id: "bank-stmts", label: "Bank Statements", status: "Accepted" },
  {
    id: "biz-bank-stmts",
    label: "Business Bank Statements",
    status: "Reviewed",
  },
  { id: "pl", label: "P&L", status: "Needs Correction" },
  { id: "balance-sheet", label: "Balance Sheet", status: "Missing Pages" },
  { id: "biz-tax", label: "Business Tax Returns", status: "Accepted" },
  { id: "debt-schedule", label: "Debt Schedule", status: "Requested" },
  { id: "articles", label: "Articles of Organization", status: "Accepted" },
  { id: "ein-letter", label: "EIN Letter", status: "Accepted" },
];

export const DOC_TONE: Record<string, string> = {
  Accepted: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  Reviewed: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  "Needs Correction": "bg-amber-500/10 text-amber-700 border-amber-500/30",
  "Missing Pages": "bg-amber-500/10 text-amber-700 border-amber-500/30",
  Requested: "bg-slate-500/10 text-slate-700 border-slate-500/30",
  Rejected: "bg-red-500/10 text-red-700 border-red-500/30",
};

export interface Stip {
  id: string;
  req: string;
  done: boolean;
  party: string;
}

export const SEED_STIPS: Stip[] = [
  { id: "stip-1", req: "December bank statement", done: true, party: "Client" },
  { id: "stip-2", req: "Updated P&L", done: true, party: "Client" },
  { id: "stip-3", req: "Voided check", done: false, party: "Client" },
  { id: "stip-4", req: "Ownership verification", done: false, party: "Lender" },
];

export interface WorkGroup {
  id: string;
  label: string;
  items: string[];
}

export const WORK_GROUPS: WorkGroup[] = [
  {
    id: "processing",
    label: "Document / Processing",
    items: [
      "Application Reviewed",
      "Documents Reviewed",
      "Bank Statements Reviewed",
      "Financial Review Completed",
      "Funding File Prepared",
      "Missing Documents Followed Up",
    ],
  },
  {
    id: "readiness",
    label: "Underwriting / Readiness",
    items: [
      "Readiness Review Completed",
      "Funding Profile Completed",
      "Cash Flow Review Completed",
      "Credit Review Completed",
      "Deal Packaging Completed",
    ],
  },
  {
    id: "lender",
    label: "Lender / Submission",
    items: [
      "Lender Matches Reviewed",
      "Submission Package Prepared",
      "Lender Submission Completed",
      "Stipulations Submitted",
      "Lender Follow-Up Completed",
    ],
  },
  {
    id: "client",
    label: "Client Support",
    items: [
      "Client Update Completed",
      "Document Follow-Up Completed",
      "Offer Reviewed with Client",
      "Closing Follow-Up Completed",
      "Client Issue Resolved",
    ],
  },
];

/** The reference people use for a deal is its funding file's FND-XXXXXX (Dee). The FD- form survives only for seed deals that have no file id. */
export const dealCode = (deal: { id: string; filePublicId?: string }) =>
  deal.filePublicId ?? `FD-${deal.id.replace(/^fd-/, "").toUpperCase()}`;


/**
 * Production taxonomy: which funding department a work group's unit is logged
 * under. Three groups map onto the funding_department vocabulary; "Client
 * Support" has no funding department, so its unit carries no department and is
 * typed by its label only. Nothing here is invented — see
 * ARCHITECTURE_PROPOSAL_PRODUCTION.md.
 */
export const FUNDING_DEPARTMENT_FOR_GROUP: Record<string, string | null> = {
  "Document / Processing": "Document Review",
  "Underwriting / Readiness": "Readiness Review",
  "Lender / Submission": "Submissions",
  "Client Support": null,
};
