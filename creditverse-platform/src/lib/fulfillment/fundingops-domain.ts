/**
 * FundingOps Domain Model
 * =======================
 * FundingOps is BES's managed funding-fulfillment workspace. It mirrors the
 * CreditOps operational UX but models the funding lifecycle:
 *
 *   PERSON / CLIENT
 *      │
 *      └── BUSINESS(es)  ── a client may own multiple businesses
 *            │
 *            └── FUNDING FILE  ── one funding cycle / application context
 *                  │
 *                  └── DEAL(s)  ── multiple lender deals inside one file
 *
 * Identity vs. service record:
 *   - For BES SaaS subscribers, the PERSON identity is shared across the BES
 *     ecosystem (CreditOps + FundingOps). One email = one person. Their
 *     CreditOps case and FundingOps deals remain separate operational records.
 *   - For manual / non-SaaS partners, the Funding Client record is created
 *     inside this division workspace and is FundingOps-scoped. It is NOT
 *     force-merged into the global SaaS client universe.
 *
 * Provenance is kept on every client: "BES SaaS Synced" or "Agency Manual".
 */

import {
  checkClientConflict,
  clientGroupKey,
  clientGroupLabel,
  formatCurrency,
  isSaasPulled,
  normalizeEmail,
  type ClientConflictResult,
  type OpsClient,
  type OpsIntakeMode,
} from "@/lib/fulfillment/ops-client-domain";

/* Shared rules live in ops-client-domain and are re-exported here so existing
   FundingOps call sites keep one obvious import path. One implementation. */
export {
  clientGroupKey,
  clientGroupLabel,
  formatCurrency,
  isSaasPulled,
  normalizeEmail,
};
export type { OpsClient };

/** The shared conflict check, bound to the FundingOps client type. */
export type FundingClientConflictResult = ClientConflictResult<FundingClient>;
export const checkFundingClientConflict = checkClientConflict<FundingClient>;

/* ------------------------------------------------------------------ */
/* Intake mode + provenance                                            */
/* ------------------------------------------------------------------ */

export type FundingMode = OpsIntakeMode;

export const FUNDING_MODE_LABEL: Record<FundingMode, string> = {
  saas_pulled: "SaaS Synced",
  outsourcing_only: "Agency Manual",
};

export type FundingProvenance = "bes_saas_synced" | "agency_manual";

/* ------------------------------------------------------------------ */
/* Funding client = the PERSON (business owner)                        */
/* ------------------------------------------------------------------ */

export type FundingClientStatus =
  | "Onboarding"
  | "Readiness Review"
  | "Document Review"
  | "Lender Matching"
  | "Submitted"
  | "Stipulations"
  | "Offer Received"
  | "Funded"
  | "Declined"
  | "Withdrawn"
  | "Archived";

/**
 * A FundingOps client: the shared ops client, narrowed to this division's
 * status vocabulary and given its funding-file fields.
 */
export interface FundingClient extends OpsClient {
  /** Linked CreditOps client (funding-readiness hand-off), when any. */
  fulfillmentClientId?: string | null;
  /** Active is the only lifecycle that counts as an active client. */
  lifecycle?: "active" | "program_completed" | "graduated" | "archived" | null;
  archivedAt?: string | null;
  /** Provenance: BES SaaS Synced vs Agency Manual. */
  provenance: FundingProvenance;
  status: FundingClientStatus;
  /** Number of active funding files. */
  openFiles: number;
  /** Total requested funding across active files. */
  totalRequested?: number;
}

/* ------------------------------------------------------------------ */
/* Business — a client may own multiple businesses                      */
/* ------------------------------------------------------------------ */

export interface FundingBusiness {
  id: string;
  clientId: string;
  legalName: string;
  dba?: string;
  industry: string;
  ein?: string;
  annualRevenue?: string;
  timeInBusiness?: string;
}

/* ------------------------------------------------------------------ */
/* Funding File — one funding cycle / application context               */
/* ------------------------------------------------------------------ */

/** The 17-stage spine (Dee's FundingOS design; migration 0060). Dispositions live on `secondaryStatus`, never here. */
export type FundingFileStage =
  | "New Application" | "Application Review"
  | "Document Collection" | "File Review" | "Needs Client Action" | "Ready for Funding Review"
  | "Lender Selection" | "Ready for Submission" | "Submitted"
  | "Lender Review" | "Additional Requirements" | "Conditional Approval" | "Offer Received" | "Offer Accepted"
  | "Final Approval" | "Funding" | "Funded";
export type FundingSecondaryStatus =
  | "Active Funding" | "Funded" | "Not Funding Ready" | "No Current Program Fit" | "Endorsed to Readiness"
  | "Client Declined Offer" | "Lender Declined" | "Withdrawn" | "Unable to Contact" | "Duplicate"
  | "Verification Concern" | "Closed" | "Renewal Candidate";
export type FundingWaitingOn = "Client" | "Internal Team" | "Lender" | "Third Party" | "Documents" | "Approval" | "No Action Required";

export interface FundingFile {
  id: string;
  /** FND-XXXXXX — display and support reference, never authorization. */
  publicId?: string;
  clientId: string;
  /** The borrower — the person above the business. */
  clientName?: string;
  businessId: string;
  businessName: string;
  secondaryStatus?: FundingSecondaryStatus;
  waitingOn?: FundingWaitingOn;
  /** Purpose of this funding request. */
  purpose: string;
  /** Requested amount in dollars. */
  requestedAmount: number;
  stage: FundingFileStage;
  assignedAgent?: string;
  /** Number of lender deals inside this file. */
  dealCount: number;
  slaHoursRemaining?: number;
  lastActivity: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Deal — a lender submission inside a funding file                    */
/* ------------------------------------------------------------------ */

export type DealStatus =
  | "Draft"
  | "Submitted"
  | "In Review"
  | "Stipulations"
  | "Offer Received"
  | "Funded"
  | "Declined"
  | "Withdrawn";

/**
 * Every deal status, in lifecycle order. Kept beside the type so a new status
 * cannot be added to one without the other, and so the status picker and the
 * status filter can never drift apart.
 */
export const DEAL_STATUSES: readonly DealStatus[] = [
  "Draft",
  "Submitted",
  "In Review",
  "Stipulations",
  "Offer Received",
  "Funded",
  "Declined",
  "Withdrawn",
];

export interface FundingDeal {
  id: string;
  fileId: string;
  /** The file's FND-XXXXXX — the reference people use for a deal (Dee); a deal is a submission under that file. */
  filePublicId?: string;
  clientId: string;
  lender: string;
  program: string;
  amount: number;
  rate?: string;
  term?: string;
  status: DealStatus;
  /** Stipulations outstanding on this deal. */
  stipsOutstanding: number;
  submittedAt: string;
  fundedDate?: string;
}

/* ------------------------------------------------------------------ */
/* Pure helper functions — the business rules, centralized             */
/* ------------------------------------------------------------------ */

export const provenanceLabel = (c: FundingClient): string =>
  c.provenance === "bes_saas_synced" ? "BES SaaS Synced" : "Agency Manual";

/* ------------------------------------------------------------------ */
/* Duplicate & cross-partner conflict rules — ONE EMAIL, ONE FILE      */
/* ------------------------------------------------------------------ */

/**
 * Identity rule (mirrors CreditOps):
 *
 * 1. ONE EMAIL = ONE FILE PER PARTNER.
 *    The same email may exist on AT MOST ONE FundingClient record inside a
 *    given Partner's list. Adding it a second time to the SAME Partner is a
 *    HARD block — the record already exists there and must not be duplicated.
 *
 * 2. The same person MAY legitimately appear on a DIFFERENT Partner's list.
 *    Real-world reasons: they canceled with one company and re-enrolled with
 *    another, or they are shopping both at once. This is ALLOWED, but the
 *    system must WARN the agent and require explicit confirmation.
 *
 * NOTE on cross-division identity: for BES SaaS subscribers the PERSON is
 * shared across CreditOps + FundingOps. A SaaS-synced FundingOps client with
 * the same email as a CreditOps client is the SAME person (intended), so that
 * is NOT treated as a conflict here. Only intra-FundingOps partner-scope
 * duplicates are blocked/warned. Manual (outsourcing_only) clients are
 * FundingOps-scoped and are never auto-merged across divisions.
 */
/* ------------------------------------------------------------------ */
/* Status tone + formatting helpers                                    */
/* ------------------------------------------------------------------ */

export const FUNDING_STATUS_TONE: Record<string, string> = {
  // 17-stage spine
  "New Application": "bg-blue-500/10 text-blue-700 border-blue-500/30",
  "Application Review": "bg-blue-500/10 text-blue-700 border-blue-500/30",
  "Document Collection": "bg-amber-500/10 text-amber-700 border-amber-500/30",
  "File Review": "bg-amber-500/10 text-amber-700 border-amber-500/30",
  "Needs Client Action": "bg-orange-500/10 text-orange-700 border-orange-500/30",
  "Ready for Funding Review": "bg-amber-500/10 text-amber-700 border-amber-500/30",
  "Lender Selection": "bg-purple-500/10 text-purple-700 border-purple-500/30",
  "Ready for Submission": "bg-purple-500/10 text-purple-700 border-purple-500/30",
  "Lender Review": "bg-cyan-500/10 text-cyan-800 border-cyan-500/30",
  "Additional Requirements": "bg-cyan-500/10 text-cyan-800 border-cyan-500/30",
  "Conditional Approval": "bg-cyan-500/10 text-cyan-800 border-cyan-500/30",
  "Offer Accepted": "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  "Final Approval": "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  Funding: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  // dispositions (secondary status)
  "Active Funding": "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  "Not Funding Ready": "bg-amber-500/10 text-amber-700 border-amber-500/30",
  "No Current Program Fit": "bg-slate-500/10 text-slate-700 border-slate-500/30",
  "Endorsed to Readiness": "bg-indigo-500/10 text-indigo-700 border-indigo-500/30",
  "Client Declined Offer": "bg-slate-500/10 text-slate-700 border-slate-500/30",
  "Lender Declined": "bg-red-500/10 text-red-700 border-red-500/30",
  "Unable to Contact": "bg-slate-500/10 text-slate-700 border-slate-500/30",
  Duplicate: "bg-slate-500/10 text-slate-700 border-slate-500/30",
  "Verification Concern": "bg-orange-500/10 text-orange-700 border-orange-500/30",
  Closed: "bg-slate-500/10 text-slate-700 border-slate-500/30",
  "Renewal Candidate": "bg-indigo-500/10 text-indigo-700 border-indigo-500/30",
  // client statuses (funding_client_status) and shared words
  Onboarding: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  "Readiness Review": "bg-blue-500/10 text-blue-700 border-blue-500/30",
  "Document Review": "bg-blue-500/10 text-blue-700 border-blue-500/30",
  "Lender Matching": "bg-indigo-500/10 text-indigo-700 border-indigo-500/30",
  Submitted: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  Stipulations: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  "Offer Received": "bg-purple-500/10 text-purple-700 border-purple-500/30",
  Funded: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  Declined: "bg-red-500/10 text-red-700 border-red-500/30",
  Withdrawn: "bg-slate-500/10 text-slate-700 border-slate-500/30",
  Archived: "bg-slate-500/10 text-slate-700 border-slate-500/30",
};

export const ALL_FUNDING_STATUSES: FundingClientStatus[] = [
  "Onboarding",
  "Readiness Review",
  "Document Review",
  "Lender Matching",
  "Submitted",
  "Stipulations",
  "Offer Received",
  "Funded",
  "Declined",
  "Withdrawn",
  "Archived",
];

export const INACTIVE_FUNDING_STATUSES = [
  "Funded",
  "Declined",
  "Withdrawn",
  "Archived",
];

export const isActiveFunding = (status: string) =>
  !INACTIVE_FUNDING_STATUSES.includes(status);

/** The ONE definition of an active funding client: lifecycle = active (status fallback for seed rows). */
export function isActiveFundingClient(c: { lifecycle?: string | null; status: string }): boolean {
  if (c.lifecycle) return c.lifecycle === "active";
  return isActiveFunding(c.status as FundingClientStatus);
}
