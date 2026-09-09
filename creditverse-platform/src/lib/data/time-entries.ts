/**
 * Time tracking data layer — Supabase ⇄ the My Time screen.
 *
 * One row per clock-in, closed on clock-out. `duration_minutes` is a generated
 * column, so nothing here computes elapsed time: the database is the only place
 * that arithmetic lives (rule 9).
 *
 * RLS scopes every read to the signed-in employee, or to the whole agency for
 * staff. Nothing in this file re-checks that — the database decides.
 */

import { requireSupabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";

export type TimeEntryRow = Tables<"time_entries">;

export interface TimeEntry {
  id: string;
  divisionId: string;
  organizationId?: string;
  clientId?: string;
  taskNote?: string;
  workDate: string;
  startedAt: string;
  endedAt?: string;
  /** Minutes, or undefined while the clock is still running. */
  durationMinutes?: number;
  /** The system ended it at the 10-hour cap (0236) — the agent forgot. */
  autoStopped: boolean;
  /** 'work' counts toward production and pay; 'break'/'lunch' are the day's rest. */
  kind: "work" | "break" | "lunch";
}

const mapRow = (r: TimeEntryRow): TimeEntry => ({
  id: r.id,
  divisionId: r.division_id,
  organizationId: r.organization_id ?? undefined,
  clientId: r.client_id ?? undefined,
  taskNote: r.task_note ?? undefined,
  workDate: r.work_date,
  startedAt: r.started_at,
  endedAt: r.ended_at ?? undefined,
  durationMinutes: r.duration_minutes ?? undefined,
  autoStopped: Boolean(r.auto_stopped),
  kind: ((r as { kind?: string }).kind ?? "work") as TimeEntry["kind"],
});

/** Local calendar date as YYYY-MM-DD — a work day is the employee's, not UTC's. */
export function localWorkDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/**
 * One bounded request for the screen's whole range, rather than a query per day
 * (rule 14). The caller slices the result for "today" and "this week".
 */
export async function fetchTimeEntries(
  employeeId: string,
  fromDate: string,
  toDate: string,
): Promise<TimeEntry[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("time_entries")
    .select("*")
    .eq("employee_id", employeeId)
    .gte("work_date", fromDate)
    .lte("work_date", toDate)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** The entry whose clock is still running, if any. */
export async function fetchOpenEntry(
  employeeId: string,
): Promise<TimeEntry | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("time_entries")
    .select("*")
    .eq("employee_id", employeeId)
    .is("ended_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export interface ClockInInput {
  agencyId: string;
  employeeId: string;
  divisionId?: string;
  organizationId?: string;
  clientId?: string;
  taskNote?: string;
}

/**
 * Start the clock.
 *
 * A partial unique index allows only one open entry per employee, so a double
 * click surfaces as a clear message instead of two overlapping entries that
 * quietly corrupt every total downstream.
 */
export async function clockIn(input: ClockInInput): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("time_entries")
    .insert({
      agency_id: input.agencyId,
      employee_id: input.employeeId,
      division_id: input.divisionId ?? "general",
      organization_id: input.organizationId ?? null,
      client_id: input.clientId ?? null,
      task_note: input.taskNote ?? null,
      work_date: localWorkDate(),
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error("You are already clocked in. Clock out first.");
    }
    throw error;
  }
  return data.id;
}

/**
 * Stop the clock on the open entry. No-op when nothing is running.
 *
 * Always "now" — an agent never states a custom time (0236). The database
 * clamps a late clock-out to the 10-hour cap and marks it auto-stopped;
 * anything the record then gets wrong is corrected through an APPROVED
 * adjustment request, never by the agent's own hand.
 */
export async function clockOut(employeeId: string): Promise<boolean> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("time_entries")
    .update({ ended_at: new Date().toISOString() })
    .eq("employee_id", employeeId)
    .is("ended_at", null)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/* ── Adjustments: the agent asks, a manager decides (0236) ─────────────── */

export interface TimeAdjustmentRequest {
  id: string;
  entryId: string;
  requestedBy: string;
  requestedByName: string | null;
  requestedEndedAt: string;
  reason: string;
  status: "pending" | "approved" | "declined";
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  /** The entry's own facts, for the approver to judge against. */
  entryStartedAt: string | null;
  entryEndedAt: string | null;
  entryWorkDate: string | null;
}

const mapRequest = (r: Record<string, unknown>): TimeAdjustmentRequest => {
  const profile = r.requester as { full_name?: string; email?: string } | null;
  const entry = r.entry as { started_at?: string; ended_at?: string; work_date?: string } | null;
  return {
    id: r.id as string,
    entryId: r.entry_id as string,
    requestedBy: r.requested_by as string,
    requestedByName: profile?.full_name || profile?.email || null,
    requestedEndedAt: r.requested_ended_at as string,
    reason: r.reason as string,
    status: r.status as TimeAdjustmentRequest["status"],
    decidedBy: (r.decided_by as string) ?? null,
    decidedAt: (r.decided_at as string) ?? null,
    decisionNote: (r.decision_note as string) ?? null,
    createdAt: r.created_at as string,
    entryStartedAt: entry?.started_at ?? null,
    entryEndedAt: entry?.ended_at ?? null,
    entryWorkDate: entry?.work_date ?? null,
  };
};

export async function requestTimeAdjustment(
  entryId: string,
  endedAt: string,
  reason: string,
): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("request_time_adjustment", {
    p_entry: entryId,
    p_ended_at: endedAt,
    p_reason: reason,
  });
  if (error) throw error;
  return data as string;
}

/** My own requests (any status), or — for a manager — the pending queue. */
export async function fetchTimeAdjustments(
  scope: "mine" | "pending",
): Promise<TimeAdjustmentRequest[]> {
  const sb = requireSupabase();
  let q = sb
    .from("time_adjustment_requests")
    .select(
      "id, entry_id, requested_by, requested_ended_at, reason, status, decided_by, decided_at, decision_note, created_at, requester:requested_by(full_name, email), entry:entry_id(started_at, ended_at, work_date)",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (scope === "pending") q = q.eq("status", "pending");
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => mapRequest(r as Record<string, unknown>));
}

export async function decideTimeAdjustment(
  requestId: string,
  approve: boolean,
  note?: string,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("decide_time_adjustment", {
    p_request: requestId,
    p_approve: approve,
    p_note: note ?? null,
  });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Breaks                                                              */
/* ------------------------------------------------------------------ */

/**
 * Switch the open WORK entry to a break or lunch. One database function does
 * the close-and-open in a single transaction, so a mid-switch failure can
 * never leave someone half clocked-out.
 */
export async function startBreak(kind: "break" | "lunch"): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("start_break", { p_kind: kind });
  if (error) throw error;
}

/** Close the open break and reopen work, carrying the interrupted context. */
export async function resumeWork(): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("resume_work");
  if (error) throw error;
}
