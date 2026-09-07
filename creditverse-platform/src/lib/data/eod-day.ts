/**
 * The End of Day report, built from the day's actual work.
 *
 * The employee does not retype what they did. `eod_day_activity` reads the
 * canonical records — work items, activity, production logs, time entries —
 * and returns the day as it happened. The person adds only what the system
 * cannot know: why something stalled, what help they need, what tomorrow
 * looks like.
 *
 * Submission is honest about itself. A person submitting is named. The system
 * submitting at the cutoff names nobody and is flagged `autoSubmitted`, so
 * nothing ever claims somebody confirmed a report they never opened.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface EodTask { id: string; title: string; stage?: string; priority?: string; due_at?: string | null; completed_at?: string | null; reason?: string }
export interface EodProduction { unit: string; quantity: number }

/** One file completed, and the actions ticked inside it. */
export interface EodFile {
  id: string;
  subject: string;
  department: string | null;
  unit: string;
  actions: string[];
  action_count: number;
  notes: string | null;
  resulting_status: string | null;
  completed_at: string;
}

export interface EodDepartmentTotals {
  department: string;
  files: number;
  units: number;
  actions: number;
}

export interface EodActionCount { action: string; count: number }

/** The day as the system observed it. Every list may legitimately be empty. */
export interface EodActivity {
  workDate: string;
  completed: EodTask[];
  worked: EodTask[];
  inProgress: EodTask[];
  overdue: EodTask[];
  blocked: EodTask[];
  production: EodProduction[];
  /**
   * ONE FILE IS ONE PRODUCTION UNIT, however many actions it contained.
   * `actionsCompleted` is what happened inside those files. The two are never
   * added together: five files with thirty-five actions and a hundred files
   * with a hundred are different days, and one number cannot tell them apart.
   */
  filesWorked: number;
  productionUnits: number;
  actionsCompleted: number;
  actionBreakdown: EodActionCount[];
  byDepartment: EodDepartmentTotals[];
  files: EodFile[];
  minutesLogged: number;
}



export function mapActivity(json: unknown, workDate: string): EodActivity {
  const j = (json ?? {}) as Record<string, unknown>;
  const list = (k: string) => (Array.isArray(j[k]) ? (j[k] as EodTask[]) : []);
  return {
    workDate,
    completed: list("completed"),
    worked: list("worked"),
    inProgress: list("in_progress"),
    overdue: list("overdue"),
    blocked: list("blocked"),
    production: Array.isArray(j.production) ? (j.production as EodProduction[]) : [],
    filesWorked: typeof j.files_worked === "number" ? j.files_worked : 0,
    productionUnits: typeof j.production_units === "number" ? j.production_units : 0,
    actionsCompleted: typeof j.actions_completed === "number" ? j.actions_completed : 0,
    actionBreakdown: Array.isArray(j.action_breakdown) ? (j.action_breakdown as EodActionCount[]) : [],
    byDepartment: Array.isArray(j.by_department) ? (j.by_department as EodDepartmentTotals[]) : [],
    files: Array.isArray(j.files) ? (j.files as EodFile[]) : [],
    minutesLogged: typeof j.minutes_logged === "number" ? j.minutes_logged : 0,
  };
}

/**
 * What one person's day contained. The function is SECURITY INVOKER, so this
 * returns exactly what the caller is allowed to see — their own day, or a
 * team member's if their scope already reaches it.
 */
export async function fetchEodActivity(employeeId: string, workDate: string): Promise<EodActivity> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("eod_day_activity", { p_employee: employeeId, p_date: workDate });
  if (error) throw error;
  return mapActivity(data, workDate);
}

export interface EodSubmissionRow {
  id: string;
  employeeId: string;
  employeeName: string;
  workDate: string;
  state: string;
  submittedAt: string | null;
  submittedBy: string | null;
  autoSubmitted: boolean;
  unfinishedWork: string | null;
  blockers: string | null;
  escalations: string | null;
  additionalNotes: string | null;
  nextWorkdayPriority: string | null;
}

/** How a report reached its submitted state — the distinction that matters. */
export type SubmissionKind = "not_submitted" | "submitted_by_person" | "auto_submitted";

export function submissionKind(row: Pick<EodSubmissionRow, "submittedAt" | "autoSubmitted">): SubmissionKind {
  if (!row.submittedAt) return "not_submitted";
  return row.autoSubmitted ? "auto_submitted" : "submitted_by_person";
}

export const SUBMISSION_LABEL: Record<SubmissionKind, string> = {
  not_submitted: "Not submitted",
  submitted_by_person: "Submitted",
  /* Never "Submitted". The whole value of an EOD is that somebody stood
     behind it, and a label that hides the difference destroys it. */
  auto_submitted: "Auto-submitted at cutoff",
};

const shape = (r: Record<string, unknown>, name: string): EodSubmissionRow => ({
  id: r.id as string,
  employeeId: r.employee_id as string,
  employeeName: name,
  workDate: r.work_date as string,
  state: r.state as string,
  submittedAt: (r.submitted_at as string) ?? null,
  submittedBy: (r.submitted_by as string) ?? null,
  autoSubmitted: Boolean(r.auto_submitted),
  unfinishedWork: (r.unfinished_work as string) ?? null,
  blockers: (r.blockers as string) ?? null,
  escalations: (r.escalations as string) ?? null,
  additionalNotes: (r.additional_notes as string) ?? null,
  nextWorkdayPriority: (r.next_workday_priority as string) ?? null,
});

export interface EodNotes {
  unfinishedWork?: string | null;
  blockers?: string | null;
  escalations?: string | null;
  additionalNotes?: string | null;
  nextWorkdayPriority?: string | null;
}

/**
 * Save the employee's own notes, and submit when asked.
 *
 * `submitted_by` is set from the caller's own id on submission: the database
 * constraint refuses a submitted row that names nobody unless it is flagged
 * automatic, so a manual submission cannot be recorded anonymously and an
 * automatic one cannot borrow a person's name.
 */
export async function saveEodDay(input: {
  agencyId: string; employeeId: string; workDate: string;
  notes: EodNotes; submit: boolean; actorId: string;
}): Promise<string> {
  const sb = requireSupabase();
  const patch: Record<string, unknown> = {
    agency_id: input.agencyId,
    employee_id: input.employeeId,
    work_date: input.workDate,
    unfinished_work: input.notes.unfinishedWork ?? null,
    blockers: input.notes.blockers ?? null,
    escalations: input.notes.escalations ?? null,
    additional_notes: input.notes.additionalNotes ?? null,
    next_workday_priority: input.notes.nextWorkdayPriority ?? null,
  };
  if (input.submit) {
    patch.state = "submitted";
    patch.submitted_at = new Date().toISOString();
    patch.submitted_by = input.actorId;
    patch.auto_submitted = false;
    /* The generated summary as it stood at submission, so a later correction
       cannot quietly change what was reported at the time. */
    const { data: snap } = await sb.rpc("eod_day_activity", {
      p_employee: input.employeeId, p_date: input.workDate,
    });
    patch.snapshot = snap ?? null;
  }
  const { data, error } = await sb
    .from("eod_submissions")
    .upsert(patch as never, { onConflict: "employee_id,work_date" })
    .select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function fetchEodDay(employeeId: string, workDate: string, name: string): Promise<EodSubmissionRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("eod_submissions").select("*")
    .eq("employee_id", employeeId).eq("work_date", workDate).maybeSingle();
  if (error) throw error;
  return data ? shape(data as Record<string, unknown>, name) : null;
}

/* ── The manager's day ────────────────────────────────────────────────── */

export interface TeamEodRow extends EodSubmissionRow {
  activity: EodActivity | null;
}

/**
 * Every staff member's EOD for one day, for whoever may see them.
 *
 * Two bounded requests, not one per person: the roster and the day's
 * submissions, joined in memory. The per-person activity summary is fetched
 * only when a manager opens somebody's report — thirty RPCs to render a table
 * nobody has drilled into is the waterfall rule 14 exists to prevent.
 */
export async function fetchTeamEod(agencyId: string, workDate: string): Promise<TeamEodRow[]> {
  const sb = requireSupabase();
  const [roster, submissions] = await Promise.all([
    sb.from("agency_memberships")
      .select("user_id, role, profiles:profiles!agency_memberships_user_id_fkey(id, full_name, email)")
      .eq("agency_id", agencyId),
    sb.from("eod_submissions").select("*").eq("agency_id", agencyId).eq("work_date", workDate),
  ]);
  if (roster.error) throw roster.error;
  if (submissions.error) throw submissions.error;

  const byEmployee = new Map<string, Record<string, unknown>>();
  for (const row of submissions.data ?? []) byEmployee.set((row as Record<string, unknown>).employee_id as string, row as Record<string, unknown>);

  return (roster.data ?? []).map((m) => {
    const member = m as Record<string, unknown>;
    const profile = member.profiles as { id: string; full_name?: string; email?: string } | null;
    const id = (profile?.id ?? member.user_id) as string;
    const name = profile?.full_name || profile?.email || "Unnamed";
    const row = byEmployee.get(id);
    if (row) return { ...shape(row, name), activity: null };
    /* No row at all is "not submitted", not an empty submission. */
    return {
      id: "", employeeId: id, employeeName: name, workDate, state: "draft",
      submittedAt: null, submittedBy: null, autoSubmitted: false,
      unfinishedWork: null, blockers: null, escalations: null,
      additionalNotes: null, nextWorkdayPriority: null, activity: null,
    };
  }).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

/**
 * Submit any draft left open past the agency's cutoff.
 *
 * Called on page load rather than by a scheduler: it is idempotent, it only
 * ever finds drafts whose cutoff has genuinely passed, and it means the
 * feature does not depend on a cron job existing. Returns how many it
 * submitted. A no-op when the agency has not switched auto-submit on.
 */
export async function runEodCutoff(agencyId: string): Promise<number> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("eod_run_cutoff", { p_agency: agencyId });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}
