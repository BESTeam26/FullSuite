/**
 * Teams and the people on them — creating, renaming, staffing, retiring.
 *
 * ── DELETE OR ARCHIVE, DECIDED BY HISTORY ──────────────────────────────────
 *
 * A team somebody created by mistake five minutes ago should just go. A team
 * that has held work, been assigned clients or appeared on a partner record is
 * a record of how BES was organised, and destroying it destroys the meaning of
 * every row that points at it (rule 11).
 *
 * So `removeTeam` checks first and says which it did. Nothing silently
 * disappears, and nothing that mattered is destroyed.
 *
 * ── LEAVING IS NOT DELETING ────────────────────────────────────────────────
 *
 * Removing somebody from a team removes the membership row — that is a current
 * fact about who is on it, and it carries no history. Removing somebody from
 * the AGENCY does not: their membership is marked inactive and keeps their
 * role, so every record they touched still says who did the work (rule 4).
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";

export interface AgencyDepartment {
  id: string;
  name: string;
  division: string | null;
  key: string | null;
}

export async function fetchDepartments(): Promise<AgencyDepartment[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("departments").select("id, name, division, key").order("name");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string, name: r.name as string,
    division: (r.division as string) ?? null, key: (r.key as string) ?? null,
  }));
}

export async function createTeam(input: {
  agencyId: string; name: string; departmentId?: string | null;
}): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("teams").insert({
    agency_id: input.agencyId,
    name: input.name.trim(),
    department_id: input.departmentId || null,
  } as never).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateTeam(id: string, patch: {
  name?: string; departmentId?: string | null;
}): Promise<void> {
  const sb = requireSupabase();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.departmentId !== undefined) row.department_id = patch.departmentId || null;
  if (Object.keys(row).length === 0) return;
  const { error } = await sb.from("teams").update(row as never).eq("id", id);
  if (error) throw error;
}

export type RemoveTeamOutcome =
  | { kind: "deleted" }
  | { kind: "archived"; because: string };

/**
 * Retire a team.
 *
 * Deleted only when nothing points at it. Otherwise archived, and the caller
 * is told what was holding it — "3 work items" is actionable; "could not
 * delete" is not.
 */
export async function removeTeam(id: string): Promise<RemoveTeamOutcome> {
  const sb = requireSupabase();
  const [work, clients, partners, services, members] = await Promise.all([
    sb.from("work_items").select("id", { count: "exact", head: true }).eq("team_id", id),
    sb.from("fulfillment_clients").select("id", { count: "exact", head: true }).eq("team_id", id),
    sb.from("outsourcing_groups").select("id", { count: "exact", head: true }).eq("team_id", id),
    sb.from("partner_services").select("id", { count: "exact", head: true }).eq("team_id", id),
    /* People count. A team with somebody on it is not "nothing points at it":
       deleting it silently changes what those people can see, because team
       membership IS their scope. */
    sb.from("team_memberships").select("user_id", { count: "exact", head: true }).eq("team_id", id),
  ]);
  for (const r of [work, clients, partners, services, members]) if (r.error) throw r.error;

  const held: string[] = [];
  if ((members.count ?? 0) > 0) held.push(`${members.count} member${members.count === 1 ? "" : "s"}`);
  if ((work.count ?? 0) > 0) held.push(`${work.count} work item${work.count === 1 ? "" : "s"}`);
  if ((clients.count ?? 0) > 0) held.push(`${clients.count} client${clients.count === 1 ? "" : "s"}`);
  if ((partners.count ?? 0) > 0) held.push(`${partners.count} partner${partners.count === 1 ? "" : "s"}`);
  if ((services.count ?? 0) > 0) held.push(`${services.count} service${services.count === 1 ? "" : "s"}`);

  if (held.length === 0) {
    /* Memberships go with it: they are a current fact about a team that is
       about to stop existing, and they carry no history of their own. */
    const { error: memberError } = await sb.from("team_memberships").delete().eq("team_id", id);
    if (memberError) throw memberError;
    const { error } = await sb.from("teams").delete().eq("id", id);
    if (error) throw error;
    return { kind: "deleted" };
  }

  const { error } = await sb.from("teams")
    .update({ archived_at: new Date().toISOString() } as never).eq("id", id);
  if (error) throw error;
  return { kind: "archived", because: held.join(", ") };
}

export async function restoreTeam(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("teams").update({ archived_at: null } as never).eq("id", id);
  if (error) throw error;
}

export async function addTeamMember(teamId: string, userId: string, isLead = false): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("team_memberships")
    .upsert({ team_id: teamId, user_id: userId, is_lead: isLead } as never,
            { onConflict: "team_id,user_id" });
  if (error) throw error;
}

export async function setTeamLead(teamId: string, userId: string, isLead: boolean): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("team_memberships")
    .update({ is_lead: isLead } as never).eq("team_id", teamId).eq("user_id", userId);
  if (error) throw error;
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("team_memberships")
    .delete().eq("team_id", teamId).eq("user_id", userId);
  if (error) throw error;
}

/* ── People ───────────────────────────────────────────────────────────── */

export interface AgencyMember {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: Enums<"agency_role">;
  /** Operational preset for agency_user members; null for admins (0266). */
  accessProfile: Enums<"access_profile"> | null;
  /** Ownership is a flag on the membership, not a role (0234). */
  isOwner: boolean;
  scope: string;
  status: "active" | "inactive";
  since: string;
  deactivatedAt: string | null;
}

export async function fetchAgencyMembers(agencyId: string): Promise<AgencyMember[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("agency_memberships")
    // prettier-ignore
    .select("id, user_id, role, access_profile, is_owner, scope, status, created_at, deactivated_at, profiles!user_id!inner(full_name, email, is_fixture)")
    .eq("agency_id", agencyId)
    .eq("profiles.is_fixture", false)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const p = (r.profiles ?? {}) as { full_name?: string; email?: string };
    return {
      membershipId: r.id as string,
      userId: r.user_id as string,
      name: p.full_name || p.email || "Unnamed",
      email: p.email ?? "",
      role: r.role as Enums<"agency_role">,
      accessProfile: (r.access_profile as Enums<"access_profile">) ?? null,
      isOwner: Boolean(r.is_owner),
      scope: (r.scope as string) ?? "assigned",
      status: (r.status as "active" | "inactive") ?? "active",
      since: r.created_at as string,
      deactivatedAt: (r.deactivated_at as string) ?? null,
    };
  });
}

/** Keeps the role and the history; removes them from where a CURRENT person belongs. */
export async function setMemberStatus(membershipId: string, status: "active" | "inactive"): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_agency_member_status", {
    p_membership: membershipId, p_status: status,
  });
  if (error) throw error;
}

/** What they may do now. Refuses to demote the last active owner. */
export async function setMemberRole(membershipId: string, role: Enums<"agency_role">): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_agency_member_role", {
    p_membership: membershipId, p_role: role,
  });
  if (error) throw error;
}

/** The preset an Agency User starts from. Overrides on the Access page still win. */
export async function setMemberProfile(membershipId: string, profile: Enums<"access_profile">): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_agency_member_profile", {
    p_membership: membershipId, p_profile: profile,
  });
  if (error) throw error;
}
