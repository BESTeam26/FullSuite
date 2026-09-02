/**
 * Shared types & constants for the CreditOps client store.
 * Extracted to keep the store provider file focused and under the line limit.
 */

import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import {
  checkClientConflict,
  normalizeEmail,
} from "@/lib/fulfillment/fulfillment-client-domain";

/* ------------------------------------------------------------------ */
/* Activity log                                                        */
/* ------------------------------------------------------------------ */

export interface ActivityEntry {
  id: string;
  clientId: string;
  timestamp: string; // ISO
  actor: string;
  action: string; // e.g. "Status changed"
  detail: string; // e.g. "In Processing → Ready for QA"
  field?: string;
  previousValue?: string;
  newValue?: string;
  /** Pinned comments stay visible at the top of the timeline. */
  pinned?: boolean;
  /** A colored "mark" flag attached to a comment (ClickUp-style). */
  mark?: string;
}

/* ClickUp / Slack-style colored marks that can be attached to any comment. */
export interface CommentMark {
  id: string;
  label: string;
  /** Tailwind classes for the chip + dot. */
  chip: string;
  dot: string;
  bar: string;
}

export const COMMENT_MARKS: CommentMark[] = [
  {
    id: "important",
    label: "Important",
    chip: "bg-red-500/15 text-red-600 border-red-500/30",
    dot: "bg-red-500",
    bar: "bg-red-500",
  },
  {
    id: "question",
    label: "Question",
    chip: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
  },
  {
    id: "followup",
    label: "Follow-up",
    chip: "bg-blue-500/15 text-blue-600 border-blue-500/30",
    dot: "bg-blue-500",
    bar: "bg-blue-500",
  },
  {
    id: "resolved",
    label: "Resolved",
    chip: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
  },
  {
    id: "idea",
    label: "Idea",
    chip: "bg-violet-500/15 text-violet-600 border-violet-500/30",
    dot: "bg-violet-500",
    bar: "bg-violet-500",
  },
];

export const getMark = (id?: string) => COMMENT_MARKS.find((m) => m.id === id);

/* ------------------------------------------------------------------ */
/* Department status per client (for the Client Work workspace)        */
/* ------------------------------------------------------------------ */

export interface DepartmentStatus {
  department:
    "Dispute" | "Support" | "Complaints" | "Bureau Calling" | "Onboarding";
  status: string;
  assignee: string;
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
