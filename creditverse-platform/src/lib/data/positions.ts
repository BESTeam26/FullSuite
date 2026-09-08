/**
 * Positions — the seats in the company, and who is in them.
 *
 * ── ONE CALL FOR THE WHOLE CHART ───────────────────────────────────────────
 *
 * `agency_positions()` returns every seat with its live people, its derived
 * state and the person its reporting line currently resolves to. An org chart
 * drawn by asking each seat who is in it is an N+1 over the entire company,
 * every time somebody opens the page (rule 14).
 *
 * ── NOTHING HERE IS A PERMISSION ───────────────────────────────────────────
 *
 * A position is a job, not an access level. `agency_memberships.role` is the
 * permission set. No authorization helper in the database reads any of these
 * tables, and a matrix probe asserts it stays that way — because "Operations
 * Manager" granting operations-manager access is exactly how a title starts
 * handing out privileges nobody granted (Dee, §5 with §20).
 */
import { requireSupabase } from "@/lib/supabase/client";

export type PositionState = "filled" | "covered" | "vacant";
export type AssignmentType = "permanent" | "acting" | "interim" | "temporary";

export interface PositionHolder {
  assignmentId: string;
  userId: string;
  name: string;
  from: string;
}

export interface PositionCoverage extends PositionHolder {
  type: Exclude<AssignmentType, "permanent">;
  note: string | null;
}

export interface Position {
  id: string;
  title: string;
  description: string | null;
  status: "active" | "frozen" | "closed";
  divisionId: string | null;
  divisionName: string | null;
  divisionTier: "leadership" | "operating" | null;
  divisionParentId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  teamId: string | null;
  teamName: string | null;
  reportsToId: string | null;
  reportsToTitle: string | null;
  /** Whoever occupies the seat this one reports to, right now. Derived (§9). */
  reportsToPerson: string | null;
  headcount: number;
  sort: number;
  archivedAt: string | null;
  state: PositionState;
  holders: PositionHolder[];
  coverage: PositionCoverage[];
}

const holders = (v: unknown): PositionHolder[] =>
  Array.isArray(v)
    ? v.map((h) => {
        const x = h as Record<string, unknown>;
        return {
          assignmentId: String(x.assignmentId), userId: String(x.userId),
          name: String(x.name ?? "Someone"), from: String(x.from ?? ""),
        };
      })
    : [];

const coverage = (v: unknown): PositionCoverage[] =>
  Array.isArray(v)
    ? v.map((h) => {
        const x = h as Record<string, unknown>;
        return {
          assignmentId: String(x.assignmentId), userId: String(x.userId),
          name: String(x.name ?? "Someone"), from: String(x.from ?? ""),
          type: (x.type as PositionCoverage["type"]) ?? "acting",
          note: (x.note as string) ?? null,
        };
      })
    : [];

export async function fetchPositions(agencyId: string): Promise<Position[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("agency_positions", { p_agency: agencyId });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const p = r as Record<string, unknown>;
    return {
      id: p.id as string,
      title: p.title as string,
      description: (p.description as string) ?? null,
      status: (p.status as Position["status"]) ?? "active",
      divisionId: (p.division_id as string) ?? null,
      divisionName: (p.division_name as string) ?? null,
      divisionTier: (p.division_tier as Position["divisionTier"]) ?? null,
      divisionParentId: (p.division_parent_id as string) ?? null,
      departmentId: (p.department_id as string) ?? null,
      departmentName: (p.department_name as string) ?? null,
      teamId: (p.team_id as string) ?? null,
      teamName: (p.team_name as string) ?? null,
      reportsToId: (p.reports_to_id as string) ?? null,
      reportsToTitle: (p.reports_to_title as string) ?? null,
      reportsToPerson: (p.reports_to_person as string) ?? null,
      headcount: Number(p.headcount ?? 1),
      sort: Number(p.sort ?? 0),
      archivedAt: (p.archived_at as string) ?? null,
      state: (p.state as PositionState) ?? "vacant",
      holders: holders(p.holders),
      coverage: coverage(p.coverage),
    };
  });
}

export interface SavePositionInput {
  id?: string | null;
  agencyId: string;
  title: string;
  description?: string | null;
  divisionId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
  reportsToPositionId?: string | null;
  headcount?: number;
}

export async function savePosition(input: SavePositionInput): Promise<void> {
  const sb = requireSupabase();
  const row = {
    agency_id: input.agencyId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    division_id: input.divisionId ?? null,
    department_id: input.departmentId ?? null,
    team_id: input.teamId ?? null,
    reports_to_position_id: input.reportsToPositionId ?? null,
    headcount: input.headcount ?? 1,
  };
  const { error } = input.id
    ? await sb.from("positions").update(row as never).eq("id", input.id)
    : await sb.from("positions").insert(row as never);
  if (error) throw error;
}

/** Archive, never delete — a seat that existed is part of the record (§7). */
export async function setPositionArchived(id: string, archived: boolean): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("positions")
    .update({ archived_at: archived ? new Date().toISOString() : null } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function assignToPosition(input: {
  agencyId: string;
  positionId: string;
  userId: string;
  assignmentType: AssignmentType;
  note?: string | null;
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("position_assignments").insert({
    agency_id: input.agencyId,
    position_id: input.positionId,
    user_id: input.userId,
    assignment_type: input.assignmentType,
    note: input.note?.trim() || null,
  } as never);
  if (error) throw error;
}

/** Ends it. The row stays: who held this in March is a question somebody asks. */
export async function endAssignment(assignmentId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("end_position_assignment", { p_id: assignmentId });
  if (error) throw error;
}

export interface PositionHistoryEntry {
  id: string;
  positionId: string;
  positionTitle: string;
  userId: string;
  name: string;
  assignmentType: AssignmentType;
  from: string;
  until: string | null;
  note: string | null;
}

/** Every holder a seat has ever had, or every seat a person has ever held. */
export async function fetchPositionHistory(
  scope: { positionId: string } | { userId: string },
): Promise<PositionHistoryEntry[]> {
  const sb = requireSupabase();
  let q = sb.from("position_assignments")
    .select("id, position_id, user_id, assignment_type, effective_from, effective_until, note, positions(title), profiles(full_name, email)")
    .order("effective_from", { ascending: false });
  q = "positionId" in scope
    ? q.eq("position_id", scope.positionId)
    : q.eq("user_id", scope.userId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => {
    const a = r as Record<string, unknown>;
    const pos = (a.positions ?? null) as { title?: string } | null;
    const pr = (a.profiles ?? null) as { full_name?: string | null; email?: string } | null;
    return {
      id: a.id as string,
      positionId: a.position_id as string,
      positionTitle: pos?.title ?? "A position",
      userId: a.user_id as string,
      name: pr?.full_name?.trim() || pr?.email || "Someone",
      assignmentType: a.assignment_type as AssignmentType,
      from: a.effective_from as string,
      until: (a.effective_until as string) ?? null,
      note: (a.note as string) ?? null,
    };
  });
}
