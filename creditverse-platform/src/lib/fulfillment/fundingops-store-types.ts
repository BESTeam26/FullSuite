/**
 * Shared types & constants for the FundingOps client store.
 * Mirrors creditops-store-types.ts but uses the funding-domain model.
 */

import {
  COMMENT_MARKS,
  getMark,
  type CommentMark,
  type OpsActivityEntry,
} from "@/lib/fulfillment/ops-activity-domain";

/* Division-prefixed aliases keep existing FundingOps call sites unchanged. */
export const FUNDING_COMMENT_MARKS = COMMENT_MARKS;
export const getFundingMark = getMark;
export type FundingCommentMark = CommentMark;

import type { FundingClient } from "@/lib/fulfillment/fundingops-domain";
import {
  checkFundingClientConflict,
  normalizeEmail,
} from "@/lib/fulfillment/fundingops-domain";

/* ------------------------------------------------------------------ */
/* Activity log                                                        */
/* ------------------------------------------------------------------ */

/** The shared timeline entry, under this division's long-standing name. */
export type FundingActivityEntry = OpsActivityEntry;

/* ClickUp / Slack-style colored marks that can be attached to any comment. */

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
