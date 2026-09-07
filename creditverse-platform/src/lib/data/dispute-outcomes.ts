/**
 * Reviewed dispute outcomes — `dispute_item_outcomes` (0140).
 *
 * The table is append-only, so a reviewer who reaches a different conclusion
 * records a new row and the earlier one stays inspectable. Reads take the most
 * recent row per item per bureau per field; `history()` returns the rest.
 *
 * The two strongest outcomes — a bureau-confirmed deletion and a correction —
 * are constrained in the database, not here: neither can be recorded from a
 * reimport comparison, and both need a note saying where the statement came
 * from. This module cannot loosen that.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { DisputeOutcome, OutcomeSource } from "@/lib/dispute/outcome-vocabulary";

export interface DisputeItemOutcome {
  id: string;
  clientId: string;
  reportId: string | null;
  prevReportId: string | null;
  roundNumber: number | null;
  accountRef: string;
  bureau: string;
  outcome: DisputeOutcome;
  resultSource: OutcomeSource;
  field: string | null;
  previousValue: string | null;
  currentValue: string | null;
  note: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

const COLUMNS =
  "id, client_id, report_id, prev_report_id, round_number, account_ref, bureau, outcome, result_source, field, previous_value, current_value, note, reviewed_by, reviewed_at, created_at";

function shape(r: Record<string, unknown>): DisputeItemOutcome {
  return {
    id: r.id as string, clientId: r.client_id as string, reportId: (r.report_id as string) ?? null,
    prevReportId: (r.prev_report_id as string) ?? null, roundNumber: (r.round_number as number) ?? null,
    accountRef: r.account_ref as string, bureau: r.bureau as string,
    outcome: r.outcome as DisputeOutcome, resultSource: r.result_source as OutcomeSource,
    field: (r.field as string) ?? null, previousValue: (r.previous_value as string) ?? null,
    currentValue: (r.current_value as string) ?? null, note: (r.note as string) ?? null,
    reviewedBy: (r.reviewed_by as string) ?? null, reviewedAt: (r.reviewed_at as string) ?? null,
    createdAt: r.created_at as string,
  };
}

/** The whole append-only history, newest first. One bounded request. */
export async function fetchDisputeOutcomes(clientId: string): Promise<DisputeItemOutcome[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("dispute_item_outcomes").select(COLUMNS).eq("client_id", clientId)
    .order("created_at", { ascending: false }).limit(1000);
  if (error) throw error;
  return (data ?? []).map((r) => shape(r as Record<string, unknown>));
}

const identity = (o: DisputeItemOutcome) => `${o.accountRef}|${o.bureau}|${o.field ?? ""}`;

/**
 * The current conclusion per item, from the append-only rows. Superseded rows
 * are not deleted and not hidden from `history()` — they are simply not the
 * answer any more.
 */
export function currentOutcomes(rows: DisputeItemOutcome[]): DisputeItemOutcome[] {
  const latest = new Map<string, DisputeItemOutcome>();
  for (const row of rows) {
    const key = identity(row);
    const held = latest.get(key);
    if (!held || row.createdAt > held.createdAt) latest.set(key, row);
  }
  return [...latest.values()];
}

/** Earlier conclusions for one item, oldest last. What was thought, and when. */
export function outcomeHistory(rows: DisputeItemOutcome[], of: DisputeItemOutcome): DisputeItemOutcome[] {
  return rows.filter((r) => identity(r) === identity(of) && r.id !== of.id);
}

export async function recordDisputeOutcome(input: {
  clientId: string; reportId: string | null; prevReportId: string | null; roundNumber: number | null;
  accountRef: string; bureau: string; outcome: DisputeOutcome; resultSource: OutcomeSource;
  field: string | null; previousValue: string | null; currentValue: string | null;
  note: string | null; actorId: string;
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("dispute_item_outcomes").insert({
    client_id: input.clientId, report_id: input.reportId, prev_report_id: input.prevReportId,
    round_number: input.roundNumber, account_ref: input.accountRef, bureau: input.bureau,
    outcome: input.outcome, result_source: input.resultSource, field: input.field,
    previous_value: input.previousValue, current_value: input.currentValue, note: input.note,
    reviewed_by: input.actorId, reviewed_at: new Date().toISOString(), created_by: input.actorId,
  });
  if (error) throw error;
}
