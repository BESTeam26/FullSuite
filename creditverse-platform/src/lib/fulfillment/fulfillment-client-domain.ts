/**
 * Fulfillment Client Domain Model
 * =================================
 * The Managed Operations divisions (CreditOps, FundingOps, etc.) are BES's
 * internal fulfillment workspaces. They receive client work through TWO
 * distinct intake modes. Keeping these modes separate prevents the data
 * model from becoming spaghetti and makes the boundary rules explicit.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  MODE 1 — SAAS-PULLED                                     │
 * │  The client runs on the BES CreditOps system.              │
 * │  Their record + status are AUTO-SYNCED from CRM actions.  │
 * │  Source = the Organization's own CreditOps tenant.         │
 * ├─────────────────────────────────────────────────────────────┤
 * │  MODE 2 — OUTSOURCING-ONLY                                 │
 * │  The client has their OWN external system (no BES SaaS).   │
 * │  BES creates a manual list under an "Outsourcing" group.   │
 * │  Status is updated manually by the BES fulfillment agent. │
 * │  Source = the outsourcing contract / partner agreement.    │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Both modes feed the SAME shared operations engine (Work Items), but the
 * client intake, status-sync, and grouping rules differ by mode.
 */

import type { WorkStage } from "@/lib/bes-domain";

/* ------------------------------------------------------------------ */
/* Intake mode — the two rules                                          */
/* ------------------------------------------------------------------ */

export type FulfillmentMode = "saas_pulled" | "outsourcing_only";

export const FULFILLMENT_MODE_LABEL: Record<FulfillmentMode, string> = {
  saas_pulled: "SaaS-Pulled",
  outsourcing_only: "Outsourcing Only",
};

export const FULFILLMENT_MODE_DESC: Record<FulfillmentMode, string> = {
  saas_pulled:
    "Client runs on the BES CreditOps system. Status auto-syncs from CRM actions inside their sub-account.",
  outsourcing_only:
    "Client has their own external system. BES processes their work under an Outsourcing group with manual status updates.",
};

/* ------------------------------------------------------------------ */
/* Outsourcing group — groups outsourcing-only clients                  */
/* ------------------------------------------------------------------ */

/**
 * An Outsourcing Group represents a partner/customer that sends BES
 * fulfillment work WITHOUT using the BES SaaS system. Their clients are
 * grouped under this contract so BES agents can organize the work.
 */
export interface OutsourcingGroup {
  id: string;
  name: string;
  /** The external company / partner sending the work. */
  partnerName: string;
  /** Contact for the outsourcing relationship. */
  contactEmail: string;
  /** Contract / agreement reference. */
  contractRef?: string;
  /** Number of clients under this group. */
  clientCount: number;
  status: "Active" | "Paused" | "Onboarding";
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Fulfillment client — unified record for both modes                  */
/* ------------------------------------------------------------------ */

export type FulfillmentClientStatus =
  | "Onboarding"
  | "NEW ONBOARDING"
  | "INCOMPLETE ONBOARDING"
  | "Ready for Processing"
  | "In Processing"
  | "Ready for QA"
  | "In Dispute"
  | "Awaiting Response"
  | "Monitoring Issue"
  | "Completed"
  | "Attention"
  | "BC NEEDED"
  | "BC IN PROGRESS"
  | "BC COMPLETED"
  | "BC NOT NEEDED"
  | "LETTERS PENDING"
  | "LETTERS MAILED"
  | "CFPB FILED"
  | "FTC FILED"
  | "CM COMPLETED"
  | "SUPPORT NEW"
  | "ONBOARDING FOLLOWUP"
  | "READY FOR REIMPORT"
  | "BILLING ISSUE"
  | "WAITING CLIENT RESPONSE"
  | "ESCALATED TO MANAGEMENT"
  | "SUPPORT RESOLVED"
  | "Graduated"
  | "Archived";

export type FulfillmentClientRound =
  "Pre-Round" | "Round 1" | "Round 2" | "Round 3" | "Round 4+" | "Completed";

export interface FulfillmentClient {
  id: string;
  /** Display name of the end client. */
  name: string;
  email: string;
  phone?: string;

  /** Which intake mode this client arrived through. */
  mode: FulfillmentMode;

  /* ---- Mode 1: SaaS-Pulled fields ---- */
  /**
   * For saas_pulled clients: the sub-account (Organization) whose CreditOps
   * tenant this client lives in. null for outsourcing_only clients.
   */
  organizationId?: string;
  organizationName?: string;
  /** Whether status is auto-synced from the CRM (Mode 1 only). */
  autoSync: boolean;

  /* ---- Mode 2: Outsourcing-Only fields ---- */
  /**
   * For outsourcing_only clients: the outsourcing group they belong to.
   * null for saas_pulled clients.
   */
  outsourcingGroupId?: string;
  outsourcingGroupName?: string;

  /* ---- Shared operational fields ---- */
  status: FulfillmentClientStatus;
  round: FulfillmentClientRound;
  /** BES agent assigned to this client's fulfillment work. */
  assignedAgent?: string;
  /** Number of dispute items currently in work. */
  openItems: number;
  slaHoursRemaining?: number;
  lastActivity: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Pure helper functions — the business rules, centralized             */
/* ------------------------------------------------------------------ */

/** A client is SaaS-pulled if and only if mode === saas_pulled. */
export const isSaasPulled = (c: FulfillmentClient): boolean =>
  c.mode === "saas_pulled";

/** A client is outsourcing-only if and only if mode === outsourcing_only. */
export const isOutsourcingOnly = (c: FulfillmentClient): boolean =>
  c.mode === "outsourcing_only";

/**
 * SaaS-pulled clients are grouped by their Organization (sub-account).
 * Outsourcing-only clients are grouped by their Outsourcing Group.
 */
export const clientGroupKey = (c: FulfillmentClient): string =>
  c.mode === "saas_pulled"
    ? (c.organizationId ?? "unassigned")
    : (c.outsourcingGroupId ?? "unassigned");

export const clientGroupLabel = (c: FulfillmentClient): string =>
  c.mode === "saas_pulled"
    ? (c.organizationName ?? "Unassigned Org")
    : (c.outsourcingGroupName ?? "Unassigned Group");

/**
 * Status-sync rule:
 * - SaaS-pulled: status is derived from CRM actions (auto-sync ON).
 *   The agent should NOT manually override unless doing an accuracy check.
 * - Outsourcing-only: status is manually maintained by the BES agent.
 */
export const canManuallyUpdateStatus = (c: FulfillmentClient): boolean => {
  // SaaS-pulled clients allow manual correction for accuracy checks,
  // but the system flags it as an override.
  // Outsourcing-only clients are fully manual.
  return true;
};

export const isStatusAutoSynced = (c: FulfillmentClient): boolean =>
  c.mode === "saas_pulled" && c.autoSync;

/**
 * Maps a WorkStage from the shared operations engine to a
 * FulfillmentClientStatus. This is the bridge between the shared WorkItem
 * engine and the fulfillment client record.
 */
export const stageToClientStatus = (
  stage: WorkStage,
): FulfillmentClientStatus => {
  switch (stage) {
    case "Queued":
      return "Ready for Processing";
    case "Assigned":
      return "Ready for Processing";
    case "In Processing":
      return "In Processing";
    case "Ready for QA":
      return "Ready for QA";
    case "QA Review":
      return "Ready for QA";
    case "Completed":
      return "Completed";
    case "Blocked":
      return "Attention";
    case "Attention":
      return "Attention";
    default:
      return "In Processing";
  }
};

/**
 * Attention filter — clients that need the agent's focus regardless of mode.
 */
export const needsAttention = (c: FulfillmentClient): boolean =>
  c.status === "Attention" ||
  c.status === "Monitoring Issue" ||
  (c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 4);

/* ------------------------------------------------------------------ */
/* Duplicate & cross-partner conflict rules — ONE EMAIL, ONE FILE      */
/* ------------------------------------------------------------------ */

/**
 * Identity rule: a client is identified by their EMAIL address.
 *
 * 1. ONE EMAIL = ONE FILE PER PARTNER.
 *    The same email may exist on AT MOST ONE record inside a given Partner's
 *    list. Adding it a second time to the SAME Partner is a HARD block — the
 *    record already exists there and must not be duplicated.
 *
 * 2. The same person MAY legitimately appear on a DIFFERENT Partner's list.
 *    Real-world reasons: they canceled with one company and re-enrolled with
 *    another, or they are shopping both at once. This is ALLOWED, but the
 *    system must WARN the agent and require explicit confirmation so it is
 *    not a silent data-entry mistake.
 *
 * These rules are centralized here so every intake surface (Add Client modal,
 * CSV import, future API) enforces the exact same logic.
 */
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

export interface ClientConflictResult {
  /** Same email already exists in the SAME partner scope → hard block. */
  sameScopeDuplicate?: FulfillmentClient;
  /** Same email exists in one or more OTHER partner scopes → warn + confirm. */
  crossScopeMatches: FulfillmentClient[];
}

/**
 * Check a candidate email against the existing client set for a given scope.
 * `scopeId` is the Partner's scopeId (organizationId or outsourcingGroupId).
 */
export const checkClientConflict = (
  email: string,
  scopeId: string,
  allClients: FulfillmentClient[],
): ClientConflictResult => {
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
