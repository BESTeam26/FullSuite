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
import {
  checkClientConflict,
  clientGroupKey,
  clientGroupLabel,
  formatCurrency,
  isOutsourcingOnly,
  isSaasPulled,
  isStatusAutoSynced,
  normalizeEmail,
  type ClientConflictResult,
  type OpsClient,
  type OpsIntakeMode,
  type OutsourcingGroup,
} from "@/lib/fulfillment/ops-client-domain";

/* Shared rules live in ops-client-domain and are re-exported here so existing
   CreditOps call sites keep one obvious import path. One implementation. */
export {
  checkClientConflict,
  clientGroupKey,
  clientGroupLabel,
  formatCurrency,
  isOutsourcingOnly,
  isSaasPulled,
  isStatusAutoSynced,
  normalizeEmail,
};
export type { ClientConflictResult, OpsClient, OutsourcingGroup };

/* ------------------------------------------------------------------ */
/* Intake mode — the two rules                                          */
/* ------------------------------------------------------------------ */

export type FulfillmentMode = OpsIntakeMode;

export const FULFILLMENT_MODE_LABEL: Record<FulfillmentMode, string> = {
  saas_pulled: "SaaS-Pulled",
  outsourcing_only: "Outsourcing Only",
};

export const FULFILLMENT_MODE_DESC: Record<FulfillmentMode, string> = {
  saas_pulled:
    "Client runs on the BES CreditOps system. Status auto-syncs from CRM actions inside their organization.",
  outsourcing_only:
    "Client has their own external system. BES processes their work under an Outsourcing group with manual status updates.",
};

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

export type ClientLifecycle = "active" | "program_completed" | "graduated" | "archived";
export const LIFECYCLE_LABELS: Record<ClientLifecycle, string> = {
  active: "Active",
  program_completed: "Program Completed",
  graduated: "Graduated",
  archived: "Archived",
};

export type FulfillmentClientRound =
  "Pre-Round" | "Round 1" | "Round 2" | "Round 3" | "Round 4+" | "Completed";

/**
 * A CreditOps client: the shared ops client, narrowed to this division's
 * status vocabulary and given its dispute-round fields.
 */
export interface FulfillmentClient extends OpsClient {
  status: FulfillmentClientStatus;
  round: FulfillmentClientRound;
  /** Active is the only lifecycle that counts as an active client. */
  lifecycle?: ClientLifecycle;
  archivedAt?: string | null;
  /** Number of dispute items currently in work. */
  openItems: number;
}

/* ------------------------------------------------------------------ */
/* Pure helper functions — the business rules, centralized             */
/* ------------------------------------------------------------------ */

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
/* Identity                                                            */
/*                                                                     */
/* The ONE EMAIL = ONE FILE PER PARTNER rule and its conflict check are */
/* shared across divisions and live in ops-client-domain. This alias    */
/* binds the generic result to the CreditOps client type so call sites  */
/* keep full type information.                                          */
/* ------------------------------------------------------------------ */

export type FulfillmentClientConflictResult =
  ClientConflictResult<FulfillmentClient>;

/** Statuses that doubled as lifecycle before `lifecycle` existed (demo/seed rows). */
const LEGACY_INACTIVE_STATUSES: ReadonlySet<string> = new Set(["Completed", "Archived", "Archived / Inactive", "Graduated"]);

/** The ONE definition of an active client: lifecycle = active (legacy status fallback for seed rows). */
export function isActiveClient(c: { lifecycle?: ClientLifecycle | null; status: string }): boolean {
  if (c.lifecycle) return c.lifecycle === "active";
  return !LEGACY_INACTIVE_STATUSES.has(c.status);
}
