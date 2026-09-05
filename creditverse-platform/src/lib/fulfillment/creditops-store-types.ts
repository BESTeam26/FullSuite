/**
 * Shared types & constants for the CreditOps client store.
 * Extracted to keep the store provider file focused and under the line limit.
 */

import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import {
  COMMENT_MARKS,
  getMark,
  type CommentMark,
  type OpsActivityEntry,
} from "@/lib/fulfillment/ops-activity-domain";

export { COMMENT_MARKS, getMark };
export type { CommentMark };
import {
  checkClientConflict,
  normalizeEmail,
} from "@/lib/fulfillment/fulfillment-client-domain";

/* ------------------------------------------------------------------ */
/* Activity log                                                        */
/* ------------------------------------------------------------------ */

/** The shared timeline entry, under this division's long-standing name. */
export type ActivityEntry = OpsActivityEntry;

/* ClickUp / Slack-style colored marks that can be attached to any comment. */

/* ------------------------------------------------------------------ */
/* Department status per client (for the Client Work workspace)        */
/* ------------------------------------------------------------------ */

export interface DepartmentStatus {
  department:
    "Dispute" | "Support" | "Complaints" | "Bureau Calling" | "Onboarding";
  status: string;
  /** Display name of the assignee ("Unassigned" when none). */
  assignee: string;
  /** Stable id of the assignee (live rows); never used to decide access. */
  assigneeId?: string | null;
  updatedAt: string;
}

/* Seed department statuses derived from the client's current status */
export function seedDepartmentStatuses(
  client: FulfillmentClient,
): DepartmentStatus[] {
  return [
    {
      department: "Onboarding",
      status: client.round === "Pre-Round" ? "OB IN REVIEW" : "OB READY FOR R1",
      assignee: client.assignedAgent ?? "Unassigned",
      updatedAt: client.createdAt,
    },
    {
      department: "Dispute",
      status: client.status,
      assignee: client.assignedAgent ?? "Unassigned",
      updatedAt: client.lastActivity,
    },
    {
      department: "Support",
      status: "SUPPORT NEW",
      assignee: "Unassigned",
      updatedAt: client.createdAt,
    },
    {
      department: "Complaints",
      status: "CM NOT NEEDED",
      assignee: "Unassigned",
      updatedAt: client.createdAt,
    },
    {
      department: "Bureau Calling",
      status: "BC NOT NEEDED",
      assignee: "Unassigned",
      updatedAt: client.createdAt,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Duplicate / cross-partner conflict — re-exported for convenience    */
/* ------------------------------------------------------------------ */

export { checkClientConflict, normalizeEmail };
