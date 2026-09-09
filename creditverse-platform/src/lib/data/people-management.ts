/**
 * People management data layer — schedules, leave, attendance, payroll.
 *
 * Everything here is a thin call onto database functions and RLS-scoped
 * tables; no rule lives in this file. Late/absent/over-break are computed by
 * `attendance_for` in SQL (rule 9), payslips by `generate_payroll`, and every
 * decision path (leave, rates, release) is a named database function that
 * checks its own permission — the browser only asks.
 */
import { requireSupabase } from "@/lib/supabase/client";

/* ── Schedules ─────────────────────────────────────────────────────────── */

export interface WorkSchedule {
  id: string;
  userId: string;
  /** ISO weekday numbers, 1 = Monday … 7 = Sunday. */
  workDays: number[];
  shiftStart: string;   // "09:00:00"
  shiftEnd: string;
  lunchMinutes: number;
  breakMinutes: number;
  graceMinutes: number;
  timezone: string;
  effectiveFrom: string;
}

const mapSchedule = (r: Record<string, unknown>): WorkSchedule => ({
  id: r.id as string,
  userId: r.user_id as string,
  workDays: (r.work_days as number[]) ?? [],
  shiftStart: r.shift_start as string,
  shiftEnd: r.shift_end as string,
  lunchMinutes: Number(r.lunch_minutes ?? 0),
  breakMinutes: Number(r.break_minutes ?? 0),
  graceMinutes: Number(r.grace_minutes ?? 0),
  timezone: r.timezone as string,
  effectiveFrom: r.effective_from as string,
});

/** Every schedule row the caller may see — RLS narrows to self/team/all. */
export async function fetchSchedules(): Promise<WorkSchedule[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("work_schedules").select("*")
    .order("user_id").order("effective_from", { ascending: false });
  if (error) throw error;
  /* Latest row per person is the one in force today. */
  const seen = new Set<string>();
  const current: WorkSchedule[] = [];
  for (const row of data ?? []) {
    const s = mapSchedule(row as Record<string, unknown>);
    if (s.effectiveFrom <= todayISO() && !seen.has(s.userId)) {
      seen.add(s.userId);
      current.push(s);
    }
  }
  return current;
}

export interface ScheduleInput {
  userId: string;
  workDays: number[];
  shiftStart: string;
  shiftEnd: string;
  lunchMinutes: number;
  breakMinutes: number;
  graceMinutes: number;
  timezone: string;
  effectiveFrom?: string;
}

export async function setWorkSchedule(input: ScheduleInput): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_work_schedule", {
    p_user: input.userId,
    p_work_days: input.workDays,
    p_shift_start: input.shiftStart,
    p_shift_end: input.shiftEnd,
    p_lunch_minutes: input.lunchMinutes,
    p_break_minutes: input.breakMinutes,
    p_grace_minutes: input.graceMinutes,
    p_timezone: input.timezone,
    ...(input.effectiveFrom ? { p_effective_from: input.effectiveFrom } : {}),
  });
  if (error) throw error;
}

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ── Leave ─────────────────────────────────────────────────────────────── */

export interface LeaveType {
  id: string;
  code: string;
  label: string;
  paid: boolean;
}

export async function fetchLeaveTypes(): Promise<LeaveType[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("leave_types").select("id, code, label, paid")
    .eq("active", true).order("sort");
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, code: r.code, label: r.label, paid: r.paid }));
}

export interface LeaveRequest {
  id: string;
  userId: string;
  typeId: string;
  typeLabel: string;
  startsOn: string;
  endsOn: string;
  reason: string | null;
  status: "pending" | "approved" | "declined" | "cancelled";
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  requesterName: string | null;
  createdAt: string;
}

const LEAVE_SELECT =
  "id, user_id, type_id, starts_on, ends_on, reason, status, decided_at, decision_note, created_at, " +
  "leave_types(label), " +
  "decider:profiles!leave_requests_decided_by_fkey(full_name, email), " +
  "requester:profiles!leave_requests_user_id_fkey(full_name, email)";

const mapLeave = (r: Record<string, unknown>): LeaveRequest => {
  const t = r.leave_types as { label?: string } | null;
  const d = r.decider as { full_name?: string | null; email?: string | null } | null;
  const u = r.requester as { full_name?: string | null; email?: string | null } | null;
  return {
    id: r.id as string,
    userId: r.user_id as string,
    typeId: r.type_id as string,
    typeLabel: t?.label ?? "Leave",
    startsOn: r.starts_on as string,
    endsOn: r.ends_on as string,
    reason: (r.reason as string) ?? null,
    status: r.status as LeaveRequest["status"],
    decidedByName: d?.full_name?.trim() || d?.email || null,
    decidedAt: (r.decided_at as string) ?? null,
    decisionNote: (r.decision_note as string) ?? null,
    requesterName: u?.full_name?.trim() || u?.email || null,
    createdAt: r.created_at as string,
  };
};

/** The caller's own requests, newest first. */
export async function fetchMyLeave(userId: string): Promise<LeaveRequest[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("leave_requests").select(LEAVE_SELECT)
    .eq("user_id", userId)
    .order("starts_on", { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []).map((r) => mapLeave(r as unknown as Record<string, unknown>));
}

/** Pending requests the caller may see — RLS narrows to their team / all. */
export async function fetchPendingLeave(): Promise<LeaveRequest[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("leave_requests").select(LEAVE_SELECT)
    .eq("status", "pending")
    .order("starts_on").limit(100);
  if (error) throw error;
  return (data ?? []).map((r) => mapLeave(r as unknown as Record<string, unknown>));
}

export async function submitLeave(input: {
  agencyId: string; userId: string; typeId: string;
  startsOn: string; endsOn: string; reason?: string;
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("leave_requests").insert({
    agency_id: input.agencyId,
    user_id: input.userId,
    type_id: input.typeId,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    reason: input.reason?.trim() || null,
  });
  if (error) {
    if (error.code === "23P01") {
      throw new Error("You already have a pending or approved request over those days.");
    }
    throw error;
  }
}

export async function cancelLeave(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb
    .from("leave_requests").update({ status: "cancelled" })
    .eq("id", id).eq("status", "pending");
  if (error) throw error;
}

export async function decideLeave(id: string, approve: boolean, note?: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("decide_leave_request", {
    p_request: id, p_approve: approve, p_note: note ?? null,
  });
  if (error) throw error;
}

/* ── Attendance ────────────────────────────────────────────────────────── */

export interface AttendanceDay {
  userId: string;
  day: string;
  scheduled: boolean;
  onLeave: boolean;
  leaveLabel: string | null;
  firstIn: string | null;
  lastOut: string | null;
  workMinutes: number;
  breakMinutes: number;
  lunchMinutes: number;
  lateMinutes: number;
  overbreakMinutes: number;
  overlunchMinutes: number;
  status: "on_leave" | "no_schedule" | "off" | "absent" | "not_in_yet" | "late" | "present";
}

export async function fetchAttendance(fromDate: string, toDate: string): Promise<AttendanceDay[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("attendance_for", { p_from: fromDate, p_to: toDate });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    userId: r.user_id as string,
    day: r.day as string,
    scheduled: Boolean(r.scheduled),
    onLeave: Boolean(r.on_leave),
    leaveLabel: (r.leave_label as string) ?? null,
    firstIn: (r.first_in as string) ?? null,
    lastOut: (r.last_out as string) ?? null,
    workMinutes: Number(r.work_minutes ?? 0),
    breakMinutes: Number(r.break_minutes ?? 0),
    lunchMinutes: Number(r.lunch_minutes ?? 0),
    lateMinutes: Number(r.late_minutes ?? 0),
    overbreakMinutes: Number(r.overbreak_minutes ?? 0),
    overlunchMinutes: Number(r.overlunch_minutes ?? 0),
    status: r.status as AttendanceDay["status"],
  }));
}

/* ── Payroll ───────────────────────────────────────────────────────────── */

export interface PayRate {
  userId: string;
  rateType: "hourly" | "per_cutoff";
  rateCents: number;
  currency: string;
  effectiveFrom: string;
}

/** The rate in force today per person, RLS-scoped (self, or payroll access). */
export async function fetchPayRates(): Promise<PayRate[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("member_pay_rates").select("user_id, rate_type, rate_cents, currency, effective_from")
    .lte("effective_from", todayISO())
    .order("user_id").order("effective_from", { ascending: false });
  if (error) throw error;
  const seen = new Set<string>();
  const out: PayRate[] = [];
  for (const r of data ?? []) {
    if (seen.has(r.user_id)) continue;
    seen.add(r.user_id);
    out.push({
      userId: r.user_id,
      rateType: r.rate_type as PayRate["rateType"],
      rateCents: Number(r.rate_cents),
      currency: r.currency,
      effectiveFrom: r.effective_from,
    });
  }
  return out;
}

export async function setPayRate(input: {
  userId: string; rateType: "hourly" | "per_cutoff"; rateCents: number; currency?: string;
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_member_pay_rate", {
    p_user: input.userId,
    p_rate_type: input.rateType,
    p_rate_cents: input.rateCents,
    p_currency: input.currency ?? "USD",
  });
  if (error) throw error;
}

export interface PayrollCutoff {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "released";
  releasedAt: string | null;
  expenseId: string | null;
  payday: string | null;
  autoGenerated: boolean;
  verificationLocksOn: string | null;
}

export async function fetchCutoffs(): Promise<PayrollCutoff[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("payroll_cutoffs")
    .select("id, period_start, period_end, status, released_at, expense_id, payday, auto_generated, verification_locks_on")
    .order("period_start", { ascending: false }).limit(30);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, periodStart: r.period_start, periodEnd: r.period_end,
    status: r.status as PayrollCutoff["status"],
    releasedAt: r.released_at, expenseId: r.expense_id,
    payday: r.payday, autoGenerated: Boolean(r.auto_generated),
    verificationLocksOn: r.verification_locks_on,
  }));
}

export async function createCutoff(agencyId: string, periodStart: string, periodEnd: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("payroll_cutoffs").insert({
    agency_id: agencyId, period_start: periodStart, period_end: periodEnd,
  });
  if (error) {
    if (error.code === "23P01") throw new Error("A cutoff already covers part of that period.");
    throw error;
  }
}

export async function generatePayroll(cutoffId: string): Promise<number> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("generate_payroll", { p_cutoff: cutoffId });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function adjustPayslip(payslipId: string, cents: number, note: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("adjust_payslip", { p_payslip: payslipId, p_cents: cents, p_note: note });
  if (error) throw error;
}

export async function releasePayroll(cutoffId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("release_payroll", { p_cutoff: cutoffId });
  if (error) throw error;
}

export interface Payslip {
  id: string;
  cutoffId: string;
  userId: string;
  userName: string | null;
  rateType: string;
  rateCents: number;
  currency: string;
  workMinutes: number;
  paidLeaveMinutes: number;
  baseCents: number;
  adjustmentCents: number;
  adjustmentNote: string | null;
  grossCents: number;
}

const PAYSLIP_SELECT =
  "id, cutoff_id, user_id, rate_type, rate_cents, currency, work_minutes, " +
  "paid_leave_minutes, base_cents, adjustment_cents, adjustment_note, gross_cents, " +
  "person:profiles!payslips_user_id_fkey(full_name, email)";

const mapPayslip = (r: Record<string, unknown>): Payslip => {
  const p = r.person as { full_name?: string | null; email?: string | null } | null;
  return {
    id: r.id as string,
    cutoffId: r.cutoff_id as string,
    userId: r.user_id as string,
    userName: p?.full_name?.trim() || p?.email || null,
    rateType: r.rate_type as string,
    rateCents: Number(r.rate_cents),
    currency: r.currency as string,
    workMinutes: Number(r.work_minutes ?? 0),
    paidLeaveMinutes: Number(r.paid_leave_minutes ?? 0),
    baseCents: Number(r.base_cents ?? 0),
    adjustmentCents: Number(r.adjustment_cents ?? 0),
    adjustmentNote: (r.adjustment_note as string) ?? null,
    grossCents: Number(r.gross_cents ?? 0),
  };
};

export async function fetchPayslips(cutoffId: string): Promise<Payslip[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("payslips").select(PAYSLIP_SELECT)
    .eq("cutoff_id", cutoffId).order("created_at");
  if (error) throw error;
  return (data ?? []).map((r) => mapPayslip(r as unknown as Record<string, unknown>));
}


/* ── Payroll automation settings ───────────────────────────────────────── */

export interface PayrollSettings {
  enabled: boolean;
  splitDay: number;
  paydayFirst: number;
  paydaySecond: number;
  verifyWindowDays: number;
  timezone: string;
}

export async function fetchPayrollSettings(): Promise<PayrollSettings | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("payroll_settings").select("*").maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    enabled: data.enabled,
    splitDay: data.split_day,
    paydayFirst: data.payday_first,
    paydaySecond: data.payday_second,
    verifyWindowDays: data.verify_window_days,
    timezone: data.timezone,
  };
}

export async function setPayrollSettings(input: PayrollSettings): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_payroll_settings", {
    p_enabled: input.enabled,
    p_split_day: input.splitDay,
    p_payday_first: input.paydayFirst,
    p_payday_second: input.paydaySecond,
    p_verify_window_days: input.verifyWindowDays,
    p_timezone: input.timezone,
  });
  if (error) throw error;
}
