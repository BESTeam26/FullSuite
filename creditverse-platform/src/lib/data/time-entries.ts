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

/** Stop the clock on the open entry. No-op when nothing is running. */
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
