/**
 * Shared types & constants for the FundingOps client store.
 * Mirrors creditops-store-types.ts but uses the funding-domain model.
 */

import type { FundingClient } from "@/lib/fulfillment/fundingops-domain";
import {
  checkFundingClientConflict,
  normalizeEmail,
} from "@/lib/fulfillment/fundingops-domain";

/* ------------------------------------------------------------------ */
/* Activity log                                                        */
/* ------------------------------------------------------------------ */

export interface FundingActivityEntry {
  id: string;
  clientId: string;
  timestamp: string; // ISO
  actor: string;
  action: string; // e.g. "Status changed"
  detail: string; // e.g. "Readiness Review → Document Review"
  field?: string;
  previousValue?: string;
  newValue?: string;
  /** Pinned comments stay visible at the top of the timeline. */
  pinned?: boolean;
  /** A colored "mark" flag attached to a comment (ClickUp-style). */
  mark?: string;
}

/* ClickUp / Slack-style colored marks that can be attached to any comment. */
export interface FundingCommentMark {
  id: string;
  label: string;
  chip: string;
  dot: string;
  bar: string;
}

export const FUNDING_COMMENT_MARKS: FundingCommentMark[] = [
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

export const getFundingMark = (id?: string) =>
  FUNDING_COMMENT_MARKS.find((m) => m.id === id);

/* ------------------------------------------------------------------ */
/* Stage status per client (for the Funding Work workspace)            */
/* ------------------------------------------------------------------ */

export type FundingDepartment =
  | "Readiness Review"
  | "Document Review"
  | "Lender Matching"
  | "Submissions"
  | "Stipulations"
  | "Offers"
  | "Funded Deals";

export interface FundingDepartmentStatus {
  department: FundingDepartment;
  status: string;
  assignee: string;
  updatedAt: string;
}

/** Seed stage statuses derived from the client's current funding status. */
export function seedFundingDepartmentStatuses(
  client: FundingClient,
): FundingDepartmentStatus[] {
  const assignee = client.assignedAgent ?? "Unassigned";
  const stages: FundingDepartmentStatus[] = [
    {
      department: "Readiness Review",
      status:
        client.status === "Onboarding" || client.status === "Readiness Review"
          ? "IN REVIEW"
          : "COMPLETE",
      assignee,
      updatedAt: client.createdAt,
    },
    {
      department: "Document Review",
      status:
        client.status === "Document Review"
          ? "IN REVIEW"
          : client.status === "Onboarding" ||
              client.status === "Readiness Review"
            ? "NOT STARTED"
            : "COMPLETE",
      assignee,
      updatedAt: client.lastActivity,
    },
    {
      department: "Lender Matching",
      status:
        client.status === "Lender Matching"
          ? "IN PROGRESS"
          : ["Onboarding", "Readiness Review", "Document Review"].includes(
                client.status,
              )
            ? "NOT STARTED"
            : "COMPLETE",
      assignee,
      updatedAt: client.lastActivity,
    },
    {
      department: "Submissions",
      status:
        client.status === "Submitted"
          ? "SUBMITTED"
          : ["Stipulations", "Offer Received", "Funded"].includes(client.status)
            ? "COMPLETE"
            : "NOT STARTED",
      assignee,
      updatedAt: client.lastActivity,
    },
    {
      department: "Stipulations",
      status:
        client.status === "Stipulations"
          ? "OUTSTANDING"
          : ["Offer Received", "Funded"].includes(client.status)
            ? "SATISFIED"
            : "NOT STARTED",
      assignee,
      updatedAt: client.lastActivity,
    },
    {
      department: "Offers",
      status:
        client.status === "Offer Received"
          ? "OFFER RECEIVED"
          : client.status === "Funded"
            ? "ACCEPTED"
            : "NOT STARTED",
      assignee,
      updatedAt: client.lastActivity,
    },
    {
      department: "Funded Deals",
      status: client.status === "Funded" ? "FUNDED" : "NOT STARTED",
      assignee,
      updatedAt: client.lastActivity,
    },
  ];
  return stages;
}

/* ------------------------------------------------------------------ */
/* Duplicate / cross-partner conflict — re-exported for convenience    */
/* ------------------------------------------------------------------ */

export { checkFundingClientConflict, normalizeEmail };
