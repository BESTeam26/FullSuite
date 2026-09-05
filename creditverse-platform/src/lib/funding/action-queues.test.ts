import { describe, expect, it } from "vitest";
import { QUEUES, queueCounts, queueMembers, waitingOnDistribution, type QueueFile } from "./action-queues";

const now = new Date("2026-09-05T12:00:00Z");
const file = (over: Partial<QueueFile>): QueueFile => ({
  id: "f", stage: "Document Collection", secondaryStatus: "Active Funding", waitingOn: "Internal Team", lastActivityAt: "2026-09-05T10:00:00Z",
  assignedAgentId: null, assignedAgentName: null, openRequests: 0, offersAwaitingReview: 0, closingStatus: null, requestedAmount: 50_000, ...over,
});

describe("FundingOps action queues (deterministic predicates)", () => {
  it("defines the fourteen queues of the design", () => {
    expect(QUEUES).toHaveLength(14);
  });
  it("places a file in every queue whose predicate holds, and only active files count", () => {
    const files = [
      file({ id: "a", waitingOn: "Client", openRequests: 2 }),
      file({ id: "b", stage: "Ready for Submission", lastActivityAt: "2026-09-01T00:00:00Z" }),
      file({ id: "c", stage: "Additional Requirements", offersAwaitingReview: 1, closingStatus: "funding_pending" }),
      file({ id: "d", waitingOn: "Client", secondaryStatus: "Lender Declined" }),
    ];
    const m = queueMembers({ files, renewals: [], overdueTasks: 3, now });
    expect(m.needs_client_action).toEqual(["a"]);
    expect(m.documents_missing).toEqual(["a"]);
    expect(m.ready_for_submission).toEqual(["b"]);
    expect(m.no_movement_48h).toEqual(["b"]);
    expect(m.lender_requirements_outstanding).toEqual(["c"]);
    expect(m.offer_requires_review).toEqual(["c"]);
    expect(m.funding_confirmation_pending).toEqual(["c"]);
  });
  it("renewal and task queues count their own records; dates are compared as calendar days", () => {
    const c = queueCounts({
      files: [], overdueTasks: 2, now,
      renewals: [
        { status: "monitoring", potentialRenewalDate: "2026-09-01", nextFollowUpAt: null, newFileId: null },
        { status: "monitoring", potentialRenewalDate: "2026-12-01", nextFollowUpAt: "2026-09-04", newFileId: null },
        { status: "client_interested", potentialRenewalDate: null, nextFollowUpAt: null, newFileId: null },
        { status: "monitoring", potentialRenewalDate: "2026-01-01", nextFollowUpAt: null, newFileId: "new" },
      ],
    });
    expect(c.overdue_tasks).toBe(2);
    expect(c.renewal_review_due).toBe(1);
    expect(c.renewal_follow_up_due).toBe(1);
    expect(c.client_interested_new_file).toBe(1);
  });
  it("waiting-on distribution counts active files only", () => {
    const d = waitingOnDistribution([file({ waitingOn: "Lender" }), file({ waitingOn: "Lender", secondaryStatus: "Withdrawn" }), file({ waitingOn: "Documents" })]);
    expect(d.Lender).toBe(1);
    expect(d.Documents).toBe(1);
  });
});
