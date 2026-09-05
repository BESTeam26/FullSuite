/**
 * Team permissions (0064): keys as data, role defaults, per-member overrides,
 * Copy Permission, invitations. Every write goes through a database function
 * that decides authorization and writes the audit row; this module only calls
 * them and shapes the rows for the interface.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";

export type OrgRole = Enums<"org_role">;
export interface PermissionKey { key: string; module: string; label: string; description: string | null; securityRelevant: boolean; sort: number }
export interface RolePermission { organizationId: string | null; role: OrgRole; key: string; allowed: boolean }
export interface MemberPermission { membershipId: string; key: string; allowed: boolean; setAt: string; reason: string | null }

export async function fetchPermissionKeys(): Promise<PermissionKey[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("permission_keys").select("*").order("sort");
  if (error) throw error;
  return (data ?? []).map((k) => ({ key: k.key, module: k.module, label: k.label, description: k.description, securityRelevant: k.security_relevant, sort: k.sort }));
}
/** Platform defaults plus this organization's own role rows, in one query. */
export async function fetchRolePermissions(organizationId: string): Promise<RolePermission[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("role_permissions").select("organization_id, role, key, allowed").or(`organization_id.is.null,organization_id.eq.${organizationId}`).limit(5000);
  if (error) throw error;
  return (data ?? []).map((r) => ({ organizationId: r.organization_id, role: r.role, key: r.key, allowed: r.allowed }));
}
export async function fetchMemberPermissions(membershipId: string): Promise<MemberPermission[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("member_permissions").select("membership_id, key, allowed, set_at, reason").eq("membership_id", membershipId);
  if (error) throw error;
  return (data ?? []).map((m) => ({ membershipId: m.membership_id, key: m.key, allowed: m.allowed, setAt: m.set_at, reason: m.reason }));
}
/** What the signed-in person may do in this organization — every key, one call. */
export async function fetchMyPermissions(organizationId: string): Promise<Record<string, boolean>> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("my_permissions", { p_org: organizationId });
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.allowed]));
}

/** The effective answer for a member, computed the same way member_can() does — for display beside the toggle. */
export function effectivePermission(key: string, role: OrgRole, organizationId: string, rolePerms: RolePermission[], overrides: MemberPermission[]): { allowed: boolean; source: "admin" | "override" | "organization" | "default" | "deny" } {
  if (role === "org_admin" || role === "org_manager") return { allowed: true, source: "admin" };
  const o = overrides.find((m) => m.key === key);
  if (o) return { allowed: o.allowed, source: "override" };
  const org = rolePerms.find((r) => r.organizationId === organizationId && r.role === role && r.key === key);
  if (org) return { allowed: org.allowed, source: "organization" };
  const def = rolePerms.find((r) => r.organizationId === null && r.role === role && r.key === key);
  if (def) return { allowed: def.allowed, source: "default" };
  return { allowed: false, source: "deny" };
}

/* ---- writes: the database decides -------------------------------------- */
export async function setMemberPermission(membershipId: string, key: string, allowed: boolean | null, reason?: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_member_permission", { p_membership: membershipId, p_key: key, p_allowed: allowed as boolean, p_reason: reason ?? undefined });
  if (error) throw error;
}
export async function copyMemberPermissions(fromMembershipId: string, toMembershipId: string, copyScope = false): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("copy_member_permissions", { p_from: fromMembershipId, p_to: toMembershipId, p_copy_scope: copyScope });
  if (error) throw error;
}
/** An organization's own default for a role — a row that overrides the platform default for every member with that role. */
export async function setOrganizationRolePermission(organizationId: string, role: OrgRole, key: string, allowed: boolean | null): Promise<void> {
  const sb = requireSupabase();
  if (allowed === null) {
    const { error } = await sb.from("role_permissions").delete().eq("organization_id", organizationId).eq("role", role).eq("key", key);
    if (error) throw error;
    return;
  }
  const { error } = await sb.from("role_permissions").upsert({ organization_id: organizationId, role, key, allowed }, { onConflict: "organization_id,role,key" });
  if (error) throw error;
}
export async function inviteTeamMember(organizationId: string, email: string, role: OrgRole, assignedOnly = true): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("invite_team_member", { p_org: organizationId, p_email: email, p_role: role, p_assigned_only: assignedOnly });
  if (error) throw error;
  return data as string;
}
export async function acceptInvitation(token: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("accept_invitation", { p_token: token });
  if (error) throw error;
  return data as string;
}
