/**
 * FundingOps Dashboard — action queues (Dee's design): the dashboard answers
 * "what needs attention today?", not "how are we doing?". Every queue is a
 * deterministic predicate over the file's three axes and its records; the
 * counts are of files, and a file can sit in several queues at once.
 */
import type { FundingFileStage, FundingSecondaryStatus, FundingWaitingOn } from "@/lib/fulfillment/fundingops-domain";

export interface QueueFile {
  id: string;
  stage: FundingFileStage;
  secondaryStatus: FundingSecondaryStatus;
  waitingOn: FundingWaitingOn;
  lastActivityAt: string;         // ISO
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  openRequests: number;
  offersAwaitingReview: number;   // offers in received / internal_review
  closingStatus: string | null;   // open closing's status
  requestedAmount: number;
}
export interface RenewalSignal { status: string; potentialRenewalDate: string | null; nextFollowUpAt: string | null; newFileId: string | null }
export interface QueueInput { files: QueueFile[]; renewals: RenewalSignal[]; overdueTasks: number; now: Date }

export type QueueKey =
  | "needs_client_action" | "documents_missing" | "ready_for_file_review" | "ready_for_submission" | "lender_requirements_outstanding"
  | "offer_requires_review" | "closing_stipulations_outstanding" | "awaiting_client_signature" | "funding_confirmation_pending"
  | "overdue_tasks" | "no_movement_48h" | "renewal_review_due" | "renewal_follow_up_due" | "client_interested_new_file";

export interface QueueDefinition { key: QueueKey; title: string; description: string }
export const QUEUES: readonly QueueDefinition[] = [
  { key: "needs_client_action", title: "Needs Client Action", description: "Active files waiting on the client to respond." },
  { key: "documents_missing", title: "Documents Missing", description: "Required documents still missing or requested." },
  { key: "ready_for_file_review", title: "Ready for File Review", description: "Files ready for internal file review." },
  { key: "ready_for_submission", title: "Ready for Submission", description: "Files cleared and ready to submit to a lender." },
  { key: "lender_requirements_outstanding", title: "Lender Requirements Outstanding", description: "Open lender-owned requirements tied to an active submission." },
  { key: "offer_requires_review", title: "Offer Requires Review", description: "Received offers awaiting internal review or presentation." },
  { key: "no_movement_48h", title: "No Movement > 48 Hours", description: "Active files with no activity in over 48 hours." },
  { key: "overdue_tasks", title: "Overdue Tasks", description: "Unfinished tasks past their due date." },
  { key: "closing_stipulations_outstanding", title: "Closing Stipulations Outstanding", description: "Active closing with open final stipulations." },
  { key: "awaiting_client_signature", title: "Awaiting Client Signature", description: "Closing documents sent for signature, awaiting return." },
  { key: "funding_confirmation_pending", title: "Funding Confirmation Pending", description: "Closing ready for disbursement — awaiting funding confirmation." },
  { key: "renewal_review_due", title: "Renewal Review Due", description: "Funded deals with a potential renewal review date reached and no new funding file created." },
  { key: "renewal_follow_up_due", title: "Renewal Follow-Up Due", description: "Renewal opportunities with a next follow-up date in the past." },
  { key: "client_interested_new_file", title: "Client Interested — New File Needed", description: "Client expressed interest but no new funding file has been created yet." },
];

const active = (f: QueueFile) => f.secondaryStatus === "Active Funding";
const HOURS_48 = 48 * 3_600_000;

export function queueMembers(input: QueueInput): Record<QueueKey, string[]> {
  const files = input.files;
  const ids = (pred: (f: QueueFile) => boolean) => files.filter((f) => active(f) && pred(f)).map((f) => f.id);
  return {
    needs_client_action: ids((f) => f.waitingOn === "Client" || f.stage === "Needs Client Action"),
    documents_missing: ids((f) => f.openRequests > 0),
    ready_for_file_review: ids((f) => f.stage === "File Review" || f.stage === "Ready for Funding Review"),
    ready_for_submission: ids((f) => f.stage === "Ready for Submission"),
    lender_requirements_outstanding: ids((f) => f.stage === "Additional Requirements"),
    offer_requires_review: ids((f) => f.offersAwaitingReview > 0),
    no_movement_48h: ids((f) => input.now.getTime() - new Date(f.lastActivityAt).getTime() > HOURS_48),
    overdue_tasks: [],
    closing_stipulations_outstanding: ids((f) => f.closingStatus === "requirements_outstanding"),
    awaiting_client_signature: ids((f) => f.closingStatus === "awaiting_signatures"),
    funding_confirmation_pending: ids((f) => f.closingStatus === "funding_pending"),
    renewal_review_due: [],
    renewal_follow_up_due: [],
    client_interested_new_file: [],
  };
}

/** Counts per queue; renewal and task queues count their own records rather than files. */
export function queueCounts(input: QueueInput): Record<QueueKey, number> {
  const members = queueMembers(input);
  const today = input.now.toISOString().slice(0, 10);
  const counts = Object.fromEntries((Object.keys(members) as QueueKey[]).map((k) => [k, members[k].length])) as Record<QueueKey, number>;
  counts.overdue_tasks = input.overdueTasks;
  counts.renewal_review_due = input.renewals.filter((r) => r.status === "monitoring" && !r.newFileId && !!r.potentialRenewalDate && r.potentialRenewalDate <= today).length;
  counts.renewal_follow_up_due = input.renewals.filter((r) => !r.newFileId && !!r.nextFollowUpAt && r.nextFollowUpAt < today).length;
  counts.client_interested_new_file = input.renewals.filter((r) => r.status === "client_interested" && !r.newFileId).length;
  return counts;
}

export function waitingOnDistribution(files: QueueFile[]): Record<FundingWaitingOn, number> {
  const out: Record<FundingWaitingOn, number> = { Client: 0, "Internal Team": 0, Lender: 0, "Third Party": 0, Documents: 0, Approval: 0, "No Action Required": 0 };
  for (const f of files) if (active(f)) out[f.waitingOn] += 1;
  return out;
}
