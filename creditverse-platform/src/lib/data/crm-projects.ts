/**
 * BES CRM projects: reading the derived state, and the operations that change it.
 *
 * ── WHAT IS NOT HERE ───────────────────────────────────────────────────────
 *
 * No status field is ever written from this file. Progress, engine state,
 * journey stage and health are all COMPUTED by the database (migration 0222)
 * from the work itself, so nobody can mark a project "testing" while its
 * build work is untouched, and the same numbers appear in a dashboard, a
 * report and an end-of-day summary because there is only one of them.
 *
 * What this file does write is EVENTS — a unit completed, QA passed, a wait
 * declared — through the functions in 0223, which hold the rules about
 * handoffs, auto-start and milestones in one place.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type {
  EngineState,
  JourneyStage,
  ProjectHealth,
  QaResult,
  WaitingReason,
  WorkUnitState,
} from "@/lib/crm/crm-domain";

/** One row of the board: a whole project in a single query. */
export interface CrmProjectRow {
  id: string;
  name: string;
  partnerName: string;
  /** The partner's business or brand this build is for; null means the partner itself. */
  businessName: string | null;
  organizationId: string | null;
  engines: string[];
  progress: number | null;
  journey: JourneyStage;
  health: ProjectHealth;
  nextMilestone: string | null;
  targetGoLive: string | null;
  leadName: string | null;
  openUnits: number;
  waitingClient: number;
  blocked: number;
  inQa: number;
  overdue: number;
}

/**
 * Every project the caller may see, with its derived state already computed.
 *
 * One call, not one per project: `crm_project_board` does the aggregation in
 * the database. A loop of `crm_project_progress` per row would be the N+1 on
 * the screen an owner opens most (rule 14).
 */
export async function fetchCrmBoard(): Promise<CrmProjectRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("crm_project_board");
  if (error) throw error;
  return (data ?? []).map((r) => {
    const rec = r as Record<string, unknown>;
    return {
      id: rec.id as string,
      name: rec.name as string,
      partnerName: (rec.partner_name as string) ?? "—",
      businessName: (rec.business_name as string) ?? null,
      organizationId: (rec.organization_id as string) ?? null,
      engines: (rec.engines as string[]) ?? [],
      progress: rec.progress === null ? null : Number(rec.progress),
      journey: rec.journey as JourneyStage,
      health: rec.health as ProjectHealth,
      nextMilestone: (rec.next_milestone as string) ?? null,
      targetGoLive: (rec.target_go_live as string) ?? null,
      leadName: (rec.lead_name as string) ?? null,
      openUnits: Number(rec.open_units ?? 0),
      waitingClient: Number(rec.waiting_client ?? 0),
      blocked: Number(rec.blocked ?? 0),
      inQa: Number(rec.in_qa ?? 0),
      overdue: Number(rec.overdue ?? 0),
    };
  });
}

/** How far each purchased engine has got. */
export interface EngineProgress {
  engineKey: string;
  label: string;
  units: number;
  completed: number;
  inProgress: number;
  waiting: number;
  blocked: number;
  qa: number;
  ready: number;
  planned: number;
  percent: number | null;
  state: EngineState;
  cancelled: boolean;
}

export async function fetchEngineProgress(projectId: string): Promise<EngineProgress[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("crm_project_engine_progress", {
    p_project: projectId,
  });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const rec = r as Record<string, unknown>;
    return {
      engineKey: rec.engine_key as string,
      label: rec.label as string,
      units: Number(rec.units ?? 0),
      completed: Number(rec.completed ?? 0),
      inProgress: Number(rec.in_progress ?? 0),
      waiting: Number(rec.waiting ?? 0),
      blocked: Number(rec.blocked ?? 0),
      qa: Number(rec.qa ?? 0),
      ready: Number(rec.ready ?? 0),
      planned: Number(rec.planned ?? 0),
      percent: rec.percent === null ? null : Number(rec.percent),
      state: rec.state as EngineState,
      cancelled: Boolean(rec.cancelled),
    };
  });
}

/** One task inside an engine. */
export interface CrmWorkUnit {
  id: string;
  title: string;
  engineKey: string;
  state: WorkUnitState;
  assignedTo: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  waitingOn: WaitingReason | null;
  waitingNote: string | null;
  waitingSince: string | null;
  qaResult: QaResult | null;
  qaFeedback: string | null;
  requiresQa: boolean;
  completedAt: string | null;
}

/**
 * The work units of one project, with each unit's derived state.
 *
 * `crm_work_unit_state` is called once per row by the database rather than
 * once per row over the network — the alternative is a request per task on a
 * screen that shows thirty of them.
 */
export async function fetchProjectUnits(projectId: string): Promise<CrmWorkUnit[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("work_items")
    /* One literal string: supabase-js derives the row type from the SELECT at
       compile time, and a concatenated string widens to `string`, which turns
       every row into an error type. `requires_qa` lives on the TEMPLATE
       deliberately — it is part of the build standard, not something a unit
       can opt out of. */
    .select(
      "id,title,crm_engine_key,assigned_to,due_at,waiting_on,waiting_note,waiting_since,qa_result,qa_feedback,completed_at,stage,template:crm_work_unit_template_id(requires_qa,sort),assignee:assigned_to(full_name,email)",
    )
    .eq("crm_project_id", projectId)
    .is("archived_at", null)
    .order("crm_engine_key")
    .order("created_at");
  if (error) throw error;

  const ids = (data ?? []).map((r) => (r as Record<string, unknown>).id as string);
  const states = await unitStates(ids);

  return (data ?? []).map((r) => {
    const rec = r as Record<string, unknown>;
    const assignee = rec.assignee as unknown as {
      full_name?: string;
      email?: string;
    } | null;
    const template = rec.template as unknown as { requires_qa?: boolean } | null;
    return {
      id: rec.id as string,
      title: rec.title as string,
      engineKey: (rec.crm_engine_key as string) ?? "custom",
      state: states.get(rec.id as string) ?? "PLANNED",
      assignedTo: (rec.assigned_to as string) ?? null,
      assigneeName: assignee?.full_name || assignee?.email || null,
      dueAt: (rec.due_at as string) ?? null,
      waitingOn: (rec.waiting_on as WaitingReason) ?? null,
      waitingNote: (rec.waiting_note as string) ?? null,
      waitingSince: (rec.waiting_since as string) ?? null,
      qaResult: (rec.qa_result as QaResult) ?? null,
      qaFeedback: (rec.qa_feedback as string) ?? null,
      requiresQa: Boolean(template?.requires_qa),
      completedAt: (rec.completed_at as string) ?? null,
    };
  });
}

/** Derived state for many units in ONE round trip. */
async function unitStates(ids: string[]): Promise<Map<string, WorkUnitState>> {
  if (ids.length === 0) return new Map();
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("crm_work_unit_states", { p_units: ids });
  if (error) throw error;
  return new Map(
    (data ?? []).map((r) => {
      const rec = r as Record<string, unknown>;
      return [rec.id as string, rec.state as WorkUnitState];
    }),
  );
}

/* ── Operations. Each one is an event with rules attached, not a field set ── */

export async function createCrmProject(input: {
  name: string;
  engines: string[];
  partnerGroupId?: string | null;
  organizationId?: string | null;
  businessName?: string | null;
  preset?: string | null;
  targetGoLive?: string | null;
  leadId?: string | null;
  teamId?: string | null;
}): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("crm_create_project", {
    p_name: input.name,
    p_engines: input.engines,
    p_partner_group: input.partnerGroupId ?? null,
    p_organization: input.organizationId ?? null,
    p_preset: input.preset ?? null,
    p_target_go_live: input.targetGoLive ?? null,
    p_lead: input.leadId ?? null,
    p_team: input.teamId ?? null,
    p_business: input.businessName ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function addCrmEngine(projectId: string, engineKey: string): Promise<number> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("crm_add_engine", {
    p_project: projectId,
    p_engine: engineKey,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Finish a unit.
 *
 * Returns what the database decided followed from it — units that became
 * ready, a milestone that completed, a handoff that was created — so the
 * screen can say what happened rather than silently refreshing.
 */
export async function completeWorkUnit(input: {
  unitId: string;
  note?: string | null;
  handoffTeamId?: string | null;
  handoffToUserId?: string | null;
}): Promise<Record<string, unknown>> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("crm_complete_work_unit", {
    p_unit: input.unitId,
    p_note: input.note ?? null,
    p_handoff_team: input.handoffTeamId ?? null,
    p_handoff_to: input.handoffToUserId ?? null,
  });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

export async function passQa(unitId: string, note?: string | null) {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("crm_pass_qa", { p_unit: unitId, p_note: note ?? null });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

export async function failQa(unitId: string, feedback: string) {
  const sb = requireSupabase();
  const { error } = await sb.rpc("crm_fail_qa", { p_unit: unitId, p_feedback: feedback });
  if (error) throw error;
}

export async function setWaiting(
  unitId: string,
  reason: WaitingReason,
  note?: string | null,
) {
  const sb = requireSupabase();
  const { error } = await sb.rpc("crm_set_waiting", {
    p_unit: unitId,
    p_reason: reason,
    p_note: note ?? null,
  });
  if (error) throw error;
}

/** An engine the catalogue offers, and whether a project can be built from it. */
export interface CrmEngineOption {
  key: string;
  label: string;
  description: string | null;
  /** Only a published template can start live work; a draft is a proposal. */
  published: boolean;
}

export async function fetchCrmEngineOptions(): Promise<CrmEngineOption[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("crm_engines")
    .select("key,label,description,sort,crm_engine_templates(status)")
    .order("sort");
  if (error) throw error;
  return (data ?? []).map((r) => {
    const rec = r as Record<string, unknown>;
    const templates = (rec.crm_engine_templates as { status: string }[]) ?? [];
    return {
      key: rec.key as string,
      label: rec.label as string,
      description: (rec.description as string) ?? null,
      published: templates.some((t) => t.status === "published"),
    };
  });
}

/* ── Milestones and client requirements: the other two layers on screen ──── */

/** One milestone. Most complete themselves when their work unit does. */
export interface CrmMilestone {
  id: string;
  key: string;
  label: string;
  engineKey: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  clientVisible: boolean;
  /** Set when the milestone derives from a unit — those are never ticked by hand. */
  workItemId: string | null;
  notes: string | null;
  sort: number;
}

export async function fetchProjectMilestones(projectId: string): Promise<CrmMilestone[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("crm_milestones")
    .select("id,key,label,engine_key,scheduled_at,completed_at,client_visible,work_item_id,notes,sort")
    .eq("project_id", projectId)
    .order("sort");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    key: r.key,
    label: r.label,
    engineKey: r.engine_key,
    scheduledAt: r.scheduled_at,
    completedAt: r.completed_at,
    clientVisible: Boolean(r.client_visible),
    workItemId: r.work_item_id,
    notes: r.notes,
    sort: r.sort,
  }));
}

/** Tick a milestone that has no unit of its own — a presentation, a training. */
export async function completeMilestone(id: string, note?: string | null) {
  const sb = requireSupabase();
  const { error } = await sb.rpc("crm_complete_milestone", {
    p_milestone: id,
    p_note: note ?? null,
  });
  if (error) throw error;
}

/** Something the CLIENT owes before work can proceed. */
export interface CrmClientRequirement {
  id: string;
  label: string;
  detail: string | null;
  satisfiedAt: string | null;
  satisfiedNote: string | null;
  /** How many work units are waiting on it right now. */
  blocking: number;
}

export async function fetchClientRequirements(
  projectId: string,
): Promise<CrmClientRequirement[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("crm_client_requirements")
    .select("id,label,detail,satisfied_at,satisfied_note,crm_client_requirement_blocks(work_item_id)")
    .eq("project_id", projectId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    detail: r.detail,
    satisfiedAt: r.satisfied_at,
    satisfiedNote: r.satisfied_note,
    blocking: r.satisfied_at
      ? 0
      : ((r.crm_client_requirement_blocks as { work_item_id: string }[]) ?? []).length,
  }));
}

/**
 * Record that the client delivered. Returns how many units that unblocked —
 * the auto-start rule lives in the database, so the screen reports what
 * happened rather than deciding it.
 */
export async function satisfyClientRequirement(
  id: string,
  note?: string | null,
): Promise<number> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("crm_satisfy_client_requirement", {
    p_requirement: id,
    p_note: note ?? null,
  });
  if (error) throw error;
  return Number(data ?? 0);
}
