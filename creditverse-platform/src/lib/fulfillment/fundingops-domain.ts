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

/* ------------------------------------------------------------------ */
/* Intake mode + provenance                                            */
/* ------------------------------------------------------------------ */

export type FundingMode = "saas_pulled" | "outsourcing_only";

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

export interface FundingClient {
  id: string;
  /** Display name of the person / business owner. */
  name: string;
  email: string;
  phone?: string;

  /** Which intake mode this client arrived through. */
  mode: FundingMode;
  /** Provenance: BES SaaS Synced vs Agency Manual. */
  provenance: FundingProvenance;

  /* ---- Mode 1: SaaS-Pulled fields ---- */
  organizationId?: string;
  organizationName?: string;
  autoSync: boolean;

  /* ---- Mode 2: Outsourcing-Only fields ---- */
  outsourcingGroupId?: string;
  outsourcingGroupName?: string;

  /* ---- Shared operational fields ---- */
  status: FundingClientStatus;
  /** BES agent assigned to this client's funding work. */
  assignedAgent?: string;
  /** Number of active funding files. */
  openFiles: number;
  /** Total requested funding across active files. */
  totalRequested?: number;
  slaHoursRemaining?: number;
  lastActivity: string;
  createdAt: string;
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

export type FundingFileStage =
  | "Readiness Review"
  | "Document Review"
  | "Lender Matching"
  | "Submitted"
  | "Stipulations"
  | "Offer Received"
  | "Funded"
  | "Declined"
  | "Withdrawn";

export interface FundingFile {
  id: string;
  clientId: string;
  businessId: string;
  businessName: string;
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

export interface FundingDeal {
  id: string;
  fileId: string;
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

export const isSaasPulled = (c: FundingClient): boolean =>
  c.mode === "saas_pulled";

export const clientGroupKey = (c: FundingClient): string =>
  c.mode === "saas_pulled"
    ? (c.organizationId ?? "unassigned")
    : (c.outsourcingGroupId ?? "unassigned");

export const clientGroupLabel = (c: FundingClient): string =>
  c.mode === "saas_pulled"
    ? (c.organizationName ?? "Unassigned Org")
    : (c.outsourcingGroupName ?? "Unassigned Group");

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
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

export interface FundingClientConflictResult {
  /** Same email already exists in the SAME partner scope → hard block. */
  sameScopeDuplicate?: FundingClient;
  /** Same email exists in one or more OTHER partner scopes → warn + confirm. */
  crossScopeMatches: FundingClient[];
}

export const checkFundingClientConflict = (
  email: string,
  scopeId: string,
  allClients: FundingClient[],
): FundingClientConflictResult => {
  const normalized = normalizeEmail(email);
  if (!normalized) return { crossScopeMatches: [] };
  const matches = allClients.filter(
    (c) => normalizeEmail(c.email) === normalized,
  );
  return {
    sameScopeDuplicate: matches.find((c) => clientGroupKey(c) === scopeId),
    crossScopeMatches: matches.filter((c) => clientGroupKey(c) !== scopeId),
  };
};

/* ------------------------------------------------------------------ */
/* Status tone + formatting helpers                                    */
/* ------------------------------------------------------------------ */

export const FUNDING_STATUS_TONE: Record<string, string> = {
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

export const formatCurrency = (amount: number): string => {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${amount}`;
};
