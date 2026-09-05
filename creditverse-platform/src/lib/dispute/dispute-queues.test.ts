import { describe, expect, it } from "vitest";
import { clientsByRound, clientsNeedingAction, disputeQueueCounts, disputeQueueMembers, lettersByStatus, type DisputeQueueInput, type QueueClient, type QueueLetter } from "./dispute-queues";

const now = new Date("2026-09-05T12:00:00Z");
const client = (id: string, over: Partial<QueueClient> = {}): QueueClient => ({ id, name: id, publicId: null, status: "In Dispute", round: "Round 1", lifecycle: "active", assignedAgentId: null, assignedAgentName: null, lastActivityAt: "2026-09-04T00:00:00Z", hasReport: true, ...over });
const letter = (id: string, clientId: string, over: Partial<QueueLetter> = {}): QueueLetter => ({ id, clientId, status: "draft", attested: false, recipientKind: "cra", bureau: null, mailedAt: null, respondedAt: null, ...over });
const base = (over: Partial<DisputeQueueInput> = {}): DisputeQueueInput => ({ clients: [], letters: [], timers: [], findings: [], openRounds: [], now, ...over });

describe("disputeQueueMembers", () => {
  it("separates drafts by attestation and approved letters by mailing", () => {
    const m = disputeQueueMembers(base({
      clients: [client("a"), client("b"), client("c")],
      letters: [letter("l1", "a"), letter("l2", "b", { attested: true }), letter("l3", "c", { status: "approved", attested: true })],
    }));
    expect(m.drafts_awaiting_attestation).toEqual(["a"]);
    expect(m.ready_for_approval).toEqual(["b"]);
    expect(m.approved_not_mailed).toEqual(["c"]);
  });
  it("reads the reinvestigation clock: due this week vs already past, only while the letter is still mailed", () => {
    const m = disputeQueueMembers(base({
      clients: [client("a"), client("b"), client("c")],
      letters: [letter("l1", "a", { status: "mailed" }), letter("l2", "b", { status: "mailed" }), letter("l3", "c", { status: "responded" })],
      timers: [
        { letterId: "l1", clientId: "a", kind: "reinvestigation", dueAt: "2026-09-09T00:00:00Z", satisfiedAt: null },
        { letterId: "l2", clientId: "b", kind: "reinvestigation", dueAt: "2026-09-01T00:00:00Z", satisfiedAt: null },
        { letterId: "l3", clientId: "c", kind: "reinvestigation", dueAt: "2026-09-01T00:00:00Z", satisfiedAt: null },
      ],
    }));
    expect(m.reinvestigation_due_soon).toEqual(["a"]);
    expect(m.response_overdue).toEqual(["b"]);
    expect(m.responses_to_review).toEqual(["c"]);
  });
  it("flags a complete round, a missing report, stale files and an Awaiting Response status with no clock", () => {
    const m = disputeQueueMembers(base({
      clients: [
        client("a"), client("b", { hasReport: false, status: "Ready for Processing" }), client("c", { hasReport: false, status: "Onboarding" }),
        client("d", { lastActivityAt: "2026-08-01T00:00:00Z" }), client("e", { status: "Awaiting Response" }), client("z", { lifecycle: "archived", hasReport: false, lastActivityAt: "2026-01-01T00:00:00Z" }),
      ],
      letters: [letter("l1", "a", { status: "responded" }), letter("l2", "a", { status: "closed" })],
      openRounds: [{ clientId: "a", roundNumber: 2, openedAt: "2026-08-01T00:00:00Z" }],
    }));
    expect(m.round_complete).toEqual(["a"]);
    expect(m.no_report_on_file).toEqual(["b"]);          // onboarding clients are not expected to have one yet; archived clients never count
    expect(m.no_movement).toEqual(["d"]);
    expect(m.awaiting_response_no_clock).toEqual(["e"]);
  });
  it("counts findings awaiting a person and keeps the reinsertion watch out of 'needs action'", () => {
    const input = base({
      clients: [client("a"), client("b")],
      findings: [{ clientId: "a", humanReviewRequired: true, humanDisposition: null }, { clientId: "a", humanReviewRequired: true, humanDisposition: "confirmed" }, { clientId: "b", humanReviewRequired: false, humanDisposition: null }],
      timers: [{ letterId: "x", clientId: "b", kind: "reinsertion_watch", dueAt: "2026-12-01T00:00:00Z", satisfiedAt: null }],
    });
    const m = disputeQueueMembers(input);
    expect(disputeQueueCounts(input).findings_need_review).toBe(1);
    expect(m.reinsertion_watch).toEqual(["b"]);
    expect([...clientsNeedingAction(m)]).toEqual(["a"]);
  });
  it("breaks down active clients by round and letters by status", () => {
    expect(clientsByRound([client("a"), client("b", { round: "Round 2" }), client("z", { lifecycle: "graduated", round: "Completed" })]).filter((r) => r.count > 0)).toEqual([{ round: "Round 1", count: 1 }, { round: "Round 2", count: 1 }]);
    expect(lettersByStatus([letter("1", "a"), letter("2", "a", { status: "mailed" })])).toMatchObject({ draft: 1, mailed: 1, closed: 0 });
  });
});
