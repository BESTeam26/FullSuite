/**
 * Work engine data layer — Supabase ⇄ domain `WorkItem`.
 *
 * Reads are RLS-scoped: BES staff see AGENCY work, org members see their own
 * ORGANIZATION work, and an org admin additionally sees AGENCY work performed
 * FOR their organization (done-for-you transparency).
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { Enums, Tables } from "@/lib/supabase/database.types";
import type {
  WorkItem,
  WorkRelatedType,
  WorkScope,
  WorkStage,
} from "@/lib/bes-domain";

export type WorkItemRow = Tables<"work_items">;
/* The generated Tables<> helper resolves views as well as tables. */
export type AttentionRow = Tables<"work_attention">;
export type ActivityRow = Tables<"activity_events">;
export type AssignableProfile = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
};

/** Hours until due, rounded to one decimal. Undefined when there is no due date. */
export const hoursUntil = (dueAt: string | null): number | undefined => {
  if (!dueAt) return undefined;
  return (
    Math.round(((new Date(dueAt).getTime() - Date.now()) / 3_600_000) * 10) / 10
  );
};

const relativeTime = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
};

/** Database row → the domain shape the existing UI already consumes. */
export function mapWorkItem(row: WorkItemRow): WorkItem {
  return {
    id: row.id,
    scope: row.scope as WorkScope,
    organizationId: row.organization_id ?? undefined,
    relatedType: row.related_type as WorkRelatedType,
    relatedId: row.related_ref ?? "",
    title: row.title,
    stage: row.stage as WorkStage,
    assignedTo: row.assigned_to ?? undefined,
    slaHoursRemaining: hoursUntil(row.due_at),
    createdAt: relativeTime(row.created_at),
    workspaceId: row.workspace_id ?? undefined,
    agencyId: row.agency_id,
    division: row.division ?? undefined,
    subjectOrganizationId: row.subject_organization_id ?? undefined,
    description: row.description ?? undefined,
    dueAt: row.due_at ?? undefined,
  };
}

const OPEN_STAGES: Enums<"work_stage">[] = [
  "Queued",
  "Assigned",
  "In Processing",
  "Ready for QA",
  "QA Review",
  "Blocked",
  "Attention",
];

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/** Work assigned to one user, across every scope they can see. */
export async function fetchMyWork(userId: string): Promise<WorkItemRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("work_items")
    .select("*")
    .eq("assigned_to", userId)
    .in("stage", OPEN_STAGES)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

/** All AGENCY-scope work (BES fulfillment desk). */
export async function fetchAgencyWork(): Promise<WorkItemRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("work_items")
    .select("*")
    .eq("scope", "AGENCY")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

/** One organization's self-managed work. */
export async function fetchOrgWork(orgId: string): Promise<WorkItemRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("work_items")
    .select("*")
    .eq("scope", "ORGANIZATION")
    .eq("organization_id", orgId)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

/** Everything that needs a human: blocked, overdue, or inside the 4h SLA window. */
export async function fetchAttention(): Promise<AttentionRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("work_attention")
    .select("*")
    .order("hours_remaining", { ascending: true, nullsFirst: true })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function fetchAssignableProfiles(
  scope: Enums<"work_scope">,
  orgId?: string,
): Promise<AssignableProfile[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("assignable_profiles", {
    p_scope: scope,
    p_org: orgId ?? null,
  });
  if (error) throw error;
  return data ?? [];
}

export async function fetchActivity(
  entityType: string,
  entityId: string,
): Promise<ActivityRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("activity_events")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export interface CreateWorkItemInput {
  scope: Enums<"work_scope">;
  organizationId?: string | null;
  subjectOrganizationId?: string | null;
  relatedType: Enums<"work_related_type">;
  relatedRef?: string;
  title: string;
  description?: string;
  stage?: Enums<"work_stage">;
  priority?: Enums<"work_priority">;
  assignedTo?: string | null;
  /** Hours from now until the SLA deadline. */
  slaHours?: number;
  createdBy: string;
  /**
   * The agency this work belongs to, from the authenticated context.
   * Required since migration 0014 gave work_items its own tenant anchor —
   * without it the insert violates NOT NULL (rule 16: agency comes from the
   * session, never from a component).
   */
  agencyId: string;
}

export async function createWorkItem(
  input: CreateWorkItemInput,
): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("work_items")
    .insert({
      agency_id: input.agencyId,
      scope: input.scope,
      organization_id:
        input.scope === "ORGANIZATION" ? (input.organizationId ?? null) : null,
      subject_organization_id: input.subjectOrganizationId ?? null,
      related_type: input.relatedType,
      related_ref: input.relatedRef ?? null,
      title: input.title,
      description: input.description ?? null,
      stage: input.stage ?? "Queued",
      priority: input.priority ?? "Normal",
      assigned_to: input.assignedTo ?? null,
      created_by: input.createdBy,
      due_at:
        input.slaHours !== undefined
          ? new Date(Date.now() + input.slaHours * 3_600_000).toISOString()
          : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Stage changes are logged to activity_events by a database trigger. */
export async function updateWorkStage(id: string, stage: Enums<"work_stage">) {
  const sb = requireSupabase();
  const { error } = await sb.from("work_items").update({ stage }).eq("id", id);
  if (error) throw error;
}

export async function assignWork(id: string, assigneeId: string | null) {
  const sb = requireSupabase();
  const { error } = await sb
    .from("work_items")
    .update({ assigned_to: assigneeId })
    .eq("id", id);
  if (error) throw error;
}

export async function addComment(input: {
  entityType: string;
  entityId: string;
  organizationId?: string | null;
  actorId: string;
  actorName: string;
  detail: string;
  mark?: string;
  /** From the authenticated context; the database also stamps it defensively. */
  agencyId: string;
}) {
  const sb = requireSupabase();
  const { error } = await sb.from("activity_events").insert({
    agency_id: input.agencyId,
    organization_id: input.organizationId ?? null,
    entity_type: input.entityType,
    entity_id: input.entityId,
    actor_id: input.actorId,
    actor_name: input.actorName,
    action: "Comment",
    detail: input.detail,
    mark: input.mark ?? null,
  });
  if (error) throw error;
}

export async function setActivityPinned(id: number, pinned: boolean) {
  const sb = requireSupabase();
  const { error } = await sb
    .from("activity_events")
    .update({ pinned })
    .eq("id", id);
  if (error) throw error;
}

export async function setActivityMark(id: number, mark: string | null) {
  const sb = requireSupabase();
  const { error } = await sb
    .from("activity_events")
    .update({ mark })
    .eq("id", id);
  if (error) throw error;
}
