/**
 * CreditOps Dispute Dashboard — action queues over live dispute data (Dee's
 * request, same shape as the FundingOps dashboard). Every queue is a
 * deterministic predicate over rows the caller may already see; every number
 * is a count, never a forecast. Timers are statutory clocks recorded as data
 * by mark_letter_mailed(); this module reads them, it never invents one.
 */
export interface QueueClient {
  id: string;
  name: string;
  publicId: string | null;
  status: string;
  round: string;
  lifecycle: string;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  lastActivityAt: string;
  hasReport: boolean;
}
export interface QueueLetter {
  id: string;
  clientId: string;
  status: "draft" | "approved" | "printed" | "mailed" | "responded" | "closed";
  attested: boolean;
  recipientKind: string;
  bureau: string | null;
  mailedAt: string | null;
  respondedAt: string | null;
}
export interface QueueTimer { letterId: string; clientId: string; kind: string; dueAt: string; satisfiedAt: string | null }
export interface QueueFinding { clientId: string; humanReviewRequired: boolean; humanDisposition: string | null }
export interface QueueRound { clientId: string; roundNumber: number; openedAt: string }

export interface DisputeQueueInput {
  clients: QueueClient[];
  letters: QueueLetter[];
  timers: QueueTimer[];
  findings: QueueFinding[];
  openRounds: QueueRound[];
  now: Date;
}

export type DisputeQueueKey =
  | "drafts_awaiting_attestation" | "ready_for_approval" | "approved_not_mailed" | "reinvestigation_due_soon" | "response_overdue"
  | "responses_to_review" | "findings_need_review" | "round_complete" | "no_report_on_file" | "no_movement" | "reinsertion_watch" | "awaiting_response_no_clock";

export interface DisputeQueueDefinition { key: DisputeQueueKey; title: string; description: string }
export const DISPUTE_QUEUES: DisputeQueueDefinition[] = [
  { key: "drafts_awaiting_attestation", title: "Drafts awaiting attestation", description: "Letters drafted without the consumer's attestation — nothing can be approved until it exists." },
  { key: "ready_for_approval", title: "Ready for QA approval", description: "Attested drafts waiting for the approval gate." },
  { key: "approved_not_mailed", title: "Approved, not yet mailed", description: "Approved or printed letters whose clocks have not started." },
  { key: "reinvestigation_due_soon", title: "Reinvestigation due within 7 days", description: "Mailed letters whose 30-day reinvestigation clock ends this week." },
  { key: "response_overdue", title: "Response overdue", description: "The reinvestigation clock has passed and no response is recorded." },
  { key: "responses_to_review", title: "Responses to review", description: "Letters marked responded that nobody has closed yet." },
  { key: "findings_need_review", title: "Findings needing human review", description: "Report findings the engine flagged for a person, with no disposition yet." },
  { key: "round_complete", title: "Round complete — decide next step", description: "An open round where every letter has a response or is closed." },
  { key: "no_report_on_file", title: "No credit report on file", description: "Clients past onboarding without an imported report to work from." },
  { key: "no_movement", title: "No movement > 14 days", description: "Active clients with no activity in two weeks." },
  { key: "awaiting_response_no_clock", title: "Awaiting response with no clock", description: "Client status says Awaiting Response, but no mailed letter has an open timer." },
  { key: "reinsertion_watch", title: "Reinsertion watch active", description: "Deleted items being watched for reinsertion — informational." },
];

const DAY = 86_400_000;
const PRE_REPORT_STATUSES = new Set(["Onboarding", "NEW ONBOARDING", "INCOMPLETE ONBOARDING", "ONBOARDING FOLLOWUP"]);
const isActive = (c: QueueClient) => c.lifecycle === "active";

export function disputeQueueMembers(input: DisputeQueueInput): Record<DisputeQueueKey, string[]> {
  const { clients, letters, timers, findings, openRounds, now } = input;
  const active = clients.filter(isActive);
  const activeIds = new Set(active.map((c) => c.id));
  const uniq = (ids: string[]) => [...new Set(ids)].filter((id) => activeIds.has(id));
  const letterById = new Map(letters.map((l) => [l.id, l]));
  const openTimers = timers.filter((t) => t.satisfiedAt === null);
  const reinvestigation = openTimers.filter((t) => t.kind === "reinvestigation");
  const soon = now.getTime() + 7 * DAY;

  const lettersByClient = new Map<string, QueueLetter[]>();
  for (const l of letters) lettersByClient.set(l.clientId, [...(lettersByClient.get(l.clientId) ?? []), l]);
  const clientsWithOpenClock = new Set(openTimers.map((t) => t.clientId));

  return {
    drafts_awaiting_attestation: uniq(letters.filter((l) => l.status === "draft" && !l.attested).map((l) => l.clientId)),
    ready_for_approval: uniq(letters.filter((l) => l.status === "draft" && l.attested).map((l) => l.clientId)),
    approved_not_mailed: uniq(letters.filter((l) => l.status === "approved" || l.status === "printed").map((l) => l.clientId)),
    reinvestigation_due_soon: uniq(reinvestigation.filter((t) => { const d = Date.parse(t.dueAt); return d >= now.getTime() && d <= soon && letterById.get(t.letterId)?.status === "mailed"; }).map((t) => t.clientId)),
    response_overdue: uniq(reinvestigation.filter((t) => Date.parse(t.dueAt) < now.getTime() && letterById.get(t.letterId)?.status === "mailed").map((t) => t.clientId)),
    responses_to_review: uniq(letters.filter((l) => l.status === "responded").map((l) => l.clientId)),
    findings_need_review: uniq(findings.filter((f) => f.humanReviewRequired && f.humanDisposition === null).map((f) => f.clientId)),
    round_complete: uniq(openRounds.filter((r) => { const ls = lettersByClient.get(r.clientId) ?? []; return ls.length > 0 && ls.every((l) => l.status === "responded" || l.status === "closed"); }).map((r) => r.clientId)),
    no_report_on_file: active.filter((c) => !c.hasReport && !PRE_REPORT_STATUSES.has(c.status)).map((c) => c.id),
    no_movement: active.filter((c) => now.getTime() - Date.parse(c.lastActivityAt) > 14 * DAY).map((c) => c.id),
    awaiting_response_no_clock: active.filter((c) => c.status === "Awaiting Response" && !clientsWithOpenClock.has(c.id)).map((c) => c.id),
    reinsertion_watch: uniq(openTimers.filter((t) => t.kind === "reinsertion_watch").map((t) => t.clientId)),
  };
}

export function disputeQueueCounts(input: DisputeQueueInput): Record<DisputeQueueKey, number> {
  const m = disputeQueueMembers(input);
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.length])) as Record<DisputeQueueKey, number>;
}

/** Clients that sit in at least one action queue (the informational watch excluded). */
export function clientsNeedingAction(members: Record<DisputeQueueKey, string[]>): Set<string> {
  const out = new Set<string>();
  for (const [k, ids] of Object.entries(members)) if (k !== "reinsertion_watch") for (const id of ids) out.add(id);
  return out;
}

export const ROUND_ORDER = ["Pre-Round", "Round 1", "Round 2", "Round 3", "Round 4+", "Completed"] as const;
export function clientsByRound(clients: QueueClient[]): { round: string; count: number }[] {
  const active = clients.filter(isActive);
  return ROUND_ORDER.map((round) => ({ round, count: active.filter((c) => c.round === round).length }));
}
export function lettersByStatus(letters: QueueLetter[]): Record<QueueLetter["status"], number> {
  const out: Record<QueueLetter["status"], number> = { draft: 0, approved: 0, printed: 0, mailed: 0, responded: 0, closed: 0 };
  for (const l of letters) out[l.status] += 1;
  return out;
}
