/**
 * Dispute Dashboard signals — five bounded, RLS-scoped queries in parallel,
 * never per client (rule 14). Shapes feed `lib/dispute/dispute-queues.ts`.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { QueueClient, QueueFinding, QueueLetter, QueueRound, QueueTimer } from "@/lib/dispute/dispute-queues";

export interface DisputeSignals { clients: QueueClient[]; letters: QueueLetter[]; timers: QueueTimer[]; findings: QueueFinding[]; openRounds: QueueRound[] }

export async function fetchDisputeSignals(): Promise<DisputeSignals> {
  const sb = requireSupabase();
  const [clients, reports, letters, timers, findings, rounds] = await Promise.all([
    sb.from("fulfillment_clients").select("id, name, public_id, status, round, lifecycle, assigned_agent_id, last_activity_at, assignee:profiles!assigned_agent_id(full_name, email)").is("archived_at", null).eq("is_fixture", false).limit(2000),
    sb.from("credit_reports").select("fulfillment_client_id").not("fulfillment_client_id", "is", null).limit(5000),
    sb.from("dispute_letters").select("id, client_id, status, recipient_kind, bureau, mailed_at, responded_at, dispute_attestations(id)").neq("status", "closed").limit(3000),
    sb.from("dispute_timers").select("letter_id, kind, due_at, satisfied_at, dispute_letters(client_id)").is("satisfied_at", null).limit(3000),
    sb.from("report_findings").select("client_id, human_review_required, human_disposition").eq("human_review_required", true).is("human_disposition", null).limit(3000),
    sb.from("dispute_rounds").select("client_id, round_number, opened_at").is("closed_at", null).limit(2000),
  ]);
  for (const r of [clients, reports, letters, timers, findings, rounds]) if (r.error) throw r.error;
  const withReport = new Set((reports.data ?? []).map((r) => r.fulfillment_client_id));
  return {
    clients: (clients.data ?? []).map((c) => ({ id: c.id, name: c.name, publicId: c.public_id, status: c.status, round: c.round, lifecycle: c.lifecycle, assignedAgentId: c.assigned_agent_id, assignedAgentName: (() => { const a = c.assignee as { full_name: string | null; email: string } | null; return a ? a.full_name?.trim() || a.email : null; })(), lastActivityAt: c.last_activity_at, hasReport: withReport.has(c.id) })),
    letters: (letters.data ?? []).map((l) => ({ id: l.id, clientId: l.client_id, status: l.status, attested: ((l.dispute_attestations ?? []) as { id: string }[]).length > 0, recipientKind: l.recipient_kind, bureau: l.bureau, mailedAt: l.mailed_at, respondedAt: l.responded_at })),
    timers: (timers.data ?? []).map((t) => ({ letterId: t.letter_id, clientId: (t.dispute_letters as { client_id: string } | null)?.client_id ?? "", kind: t.kind, dueAt: t.due_at, satisfiedAt: t.satisfied_at })),
    findings: (findings.data ?? []).map((f) => ({ clientId: f.client_id, humanReviewRequired: f.human_review_required, humanDisposition: f.human_disposition })),
    openRounds: (rounds.data ?? []).map((r) => ({ clientId: r.client_id, roundNumber: r.round_number, openedAt: r.opened_at })),
  };
}
