/**
 * The shape of the company: Division → Department → Team → People.
 *
 * ── ONE STRUCTURE, MANY VIEWS ──────────────────────────────────────────────
 *
 * People, Teams, Workforce, CreditOps, BES CRM and every partner assignment
 * selector read THESE rows. There is no second structure for any of them
 * (Dee, §28) — a person put on the Automation Team here is on it everywhere,
 * without being configured on six screens.
 *
 * ── WHAT A DIVISION IS, AND IS NOT ─────────────────────────────────────────
 *
 * A division may carry a `service` — creditops, fundingops, bes_crm,
 * talentops. That is its AUTHORIZATION identity and the only thing `in_scope()`
 * reads. The NAME is Dee's to change at will, and changing it cannot widen or
 * narrow what anybody sees. A division with no service (Corporate Operations)
 * is an organizational grouping that grants nothing at all.
 *
 * ── ARCHIVE, NEVER DELETE ──────────────────────────────────────────────────
 *
 * A division, department or team that has held people or work is a record of
 * how BES was organised; destroying it destroys the meaning of every row
 * pointing at it (rule 11). `impactOf` is what the interface asks first, so a
 * person sees what they are about to affect rather than a refusal afterwards.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface Division {
  id: string;
  name: string;
  description: string | null;
  /** The authorization identity. `corporate` is the one that grants nothing —
      every division has a service, because a division without one could hold
      no departments (0182/0183). */
  service: string;
  leadId: string | null;
  sort: number;
  archived: boolean;
  /** Organizational nesting only: FundingOps sits under CreditOps (0209). */
  parentDivisionId: string | null;
  /** `leadership` is above or outside the operating divisions (Dee, §10). */
  tier: "leadership" | "operating";
}

export interface Department {
  id: string;
  divisionId: string | null;
  name: string;
  description: string | null;
  managerId: string | null;
  sort: number;
  archived: boolean;
}

export interface OrgTeam {
  id: string;
  departmentId: string | null;
  name: string;
  description: string | null;
  sort: number;
  archived: boolean;
  members: { userId: string; isLead: boolean }[];
}

export interface OrganizationTree {
  divisions: Division[];
  departments: Department[];
  teams: OrgTeam[];
}

/**
 * The whole structure in three parallel queries.
 *
 * Three rather than one nested select because the tree is assembled in the
 * browser anyway and a nested select would return each department once per
 * team. Bounded by construction: an agency has divisions, not thousands.
 */
export async function fetchOrganizationTree(): Promise<OrganizationTree> {
  const sb = requireSupabase();
  const [divisions, departments, teams] = await Promise.all([
    // prettier-ignore
    sb.from("divisions").select("id, name, description, service, lead_id, sort, archived_at, parent_division_id, tier")
      .eq("is_fixture", false).order("sort").order("name"),
    sb.from("departments").select("id, division_id, name, description, manager_id, sort, archived_at")
      .eq("is_fixture", false).order("sort").order("name"),
    // prettier-ignore
    sb.from("teams").select("id, department_id, name, description, sort, archived_at, team_memberships(user_id, is_lead)")
      .eq("is_fixture", false).is("organization_id", null).order("sort").order("name"),
  ]);
  if (divisions.error) throw divisions.error;
  if (departments.error) throw departments.error;
  if (teams.error) throw teams.error;

  return {
    divisions: (divisions.data ?? []).map((r) => ({
      id: r.id, name: r.name, description: r.description,
      service: r.service, leadId: r.lead_id, sort: r.sort,
      archived: r.archived_at !== null,
      parentDivisionId: r.parent_division_id ?? null,
      tier: (r.tier as "leadership" | "operating") ?? "operating",
    })),
    departments: (departments.data ?? []).map((r) => ({
      id: r.id, divisionId: r.division_id, name: r.name, description: r.description,
      managerId: r.manager_id, sort: r.sort, archived: r.archived_at !== null,
    })),
    teams: (teams.data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        departmentId: (r.department_id as string) ?? null,
        name: r.name as string,
        description: (r.description as string) ?? null,
        sort: Number(r.sort ?? 0),
        archived: r.archived_at !== null,
        members: ((r.team_memberships ?? []) as { user_id: string; is_lead: boolean }[])
          .map((m) => ({ userId: m.user_id, isLead: m.is_lead })),
      };
    }),
  };
}

/* ── Divisions ────────────────────────────────────────────────────────── */

export async function saveDivision(input: {
  id?: string; agencyId: string; name: string; description?: string | null;
  service?: string | null; leadId?: string | null; sort?: number;
}): Promise<void> {
  const sb = requireSupabase();
  const row = {
    agency_id: input.agencyId, name: input.name.trim(),
    description: input.description?.trim() || null,
    /* Only set on create, and only deliberately: the service IS the
       authorization identity, so changing it moves what a whole division may
       reach. The interface does not offer it as an edit. */
    ...(input.id ? {} : { service: input.service || "corporate" }),
    lead_id: input.leadId ?? null,
    ...(input.sort === undefined ? {} : { sort: input.sort }),
  };
  const q = input.id
    ? sb.from("divisions").update(row as never).eq("id", input.id)
    : sb.from("divisions").insert(row as never);
  const { error } = await q;
  if (error) throw error;
}

export async function setDivisionArchived(id: string, archived: boolean): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("divisions")
    .update({ archived_at: archived ? new Date().toISOString() : null } as never).eq("id", id);
  if (error) throw error;
}

/* ── Departments ──────────────────────────────────────────────────────── */

export async function saveDepartment(input: {
  id?: string; agencyId: string; divisionId: string; name: string;
  description?: string | null; managerId?: string | null; sort?: number;
}): Promise<void> {
  const sb = requireSupabase();
  /* `division` (the enum RLS reads) is set by a database trigger from the
     parent, so it is never written here and cannot drift from it. */
  const row = {
    agency_id: input.agencyId, division_id: input.divisionId,
    name: input.name.trim(), description: input.description?.trim() || null,
    manager_id: input.managerId ?? null,
    ...(input.sort === undefined ? {} : { sort: input.sort }),
    ...(input.id ? {} : { key: input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40) }),
  };
  const q = input.id
    ? sb.from("departments").update(row as never).eq("id", input.id)
    : sb.from("departments").insert(row as never);
  const { error } = await q;
  if (error) throw error;
}

export async function setDepartmentArchived(id: string, archived: boolean): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("departments")
    .update({ archived_at: archived ? new Date().toISOString() : null } as never).eq("id", id);
  if (error) throw error;
}

/* ── What archiving would affect ──────────────────────────────────────── */

export interface StructureImpact {
  people: number;
  work: number;
  clients: number;
  partners: number;
  children: number;
}

/**
 * What still points at this part of the structure.
 *
 * Asked BEFORE archiving so a person sees the consequence rather than
 * discovering it (Dee, §17: show impact, and do not leave orphaned
 * assignments).
 */
export async function impactOfDepartment(id: string): Promise<StructureImpact> {
  const sb = requireSupabase();
  const [teams, memberships] = await Promise.all([
    sb.from("teams").select("id", { count: "exact", head: true })
      .eq("department_id", id).is("archived_at", null),
    sb.from("agency_memberships").select("id", { count: "exact", head: true })
      .eq("primary_department_id", id).eq("status", "active"),
  ]);

  /* Work belongs to a TEAM, not to a department — `work_items` has no
     department column. So the open work under a department is the open work of
     its teams, counted in one query rather than one per team. */
  const teamIds = (await sb.from("teams").select("id").eq("department_id", id)).data ?? [];
  const work = teamIds.length === 0
    ? { count: 0, error: null }
    : await sb.from("work_items").select("id", { count: "exact", head: true })
        .in("team_id", teamIds.map((t) => t.id))
        .is("archived_at", null).is("completed_at", null);

  return {
    children: teams.count ?? 0,
    people: memberships.count ?? 0,
    work: work.error ? 0 : (work.count ?? 0),
    clients: 0,
    partners: 0,
  };
}

export async function impactOfDivision(id: string): Promise<StructureImpact> {
  const sb = requireSupabase();
  const [departments, memberships] = await Promise.all([
    sb.from("departments").select("id", { count: "exact", head: true })
      .eq("division_id", id).is("archived_at", null),
    sb.from("agency_memberships").select("id", { count: "exact", head: true })
      .eq("primary_division_id", id).eq("status", "active"),
  ]);
  return {
    children: departments.count ?? 0,
    people: memberships.count ?? 0,
    work: 0, clients: 0, partners: 0,
  };
}

/* ── Where a person sits ──────────────────────────────────────────────── */

export async function setMemberPlacement(membershipId: string, patch: {
  jobTitle?: string | null;
  managerId?: string | null;
  primaryDivisionId?: string | null;
  primaryDepartmentId?: string | null;
  primaryTeamId?: string | null;
}): Promise<void> {
  const sb = requireSupabase();
  const row: Record<string, unknown> = {};
  if (patch.jobTitle !== undefined) row.job_title = patch.jobTitle?.trim() || null;
  if (patch.managerId !== undefined) row.manager_id = patch.managerId;
  if (patch.primaryDivisionId !== undefined) row.primary_division_id = patch.primaryDivisionId;
  if (patch.primaryDepartmentId !== undefined) row.primary_department_id = patch.primaryDepartmentId;
  if (patch.primaryTeamId !== undefined) row.primary_team_id = patch.primaryTeamId;
  if (Object.keys(row).length === 0) return;
  const { error } = await sb.from("agency_memberships").update(row as never).eq("id", membershipId);
  if (error) throw error;
}
