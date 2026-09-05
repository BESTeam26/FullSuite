/**
 * Team members — an organization's own memberships and pending invitations
 * (ARCHITECTURE_PROPOSAL_TEAM_PERMISSIONS.md). Reads are RLS-scoped: members
 * see their organization's roster, BES agency staff see every organization's;
 * writes are judged by the membership policies (owner/admin of the
 * organization or the agency manager, never on one's own row).
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { Enums, TablesUpdate } from "@/lib/supabase/database.types";
import { inviteTeamMember } from "@/lib/data/team-permissions";

export type OrgRole = Enums<"org_role">;
export type ProductKey = Enums<"product_key">;

export interface TeamMember {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
  product: ProductKey | null;
  assignedOnly: boolean;
  since: string;
}
export interface PendingInvitation { id: string; email: string; role: OrgRole | null; invitedBy: string | null; expiresAt: string; createdAt: string; token: string }

export async function fetchTeamMembers(organizationId: string): Promise<TeamMember[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("org_memberships")
    .select("id, user_id, role, product, assigned_only, created_at, profiles(full_name, email)")
    .eq("organization_id", organizationId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((m) => {
    const p = m.profiles as { full_name: string | null; email: string } | null;
    return { membershipId: m.id, userId: m.user_id, name: p?.full_name?.trim() || p?.email || "Member", email: p?.email ?? "", role: m.role, product: m.product, assignedOnly: m.assigned_only, since: m.created_at };
  });
}

export async function fetchPendingInvitations(organizationId: string): Promise<PendingInvitation[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("invitations")
    .select("id, email, org_role, invited_by, expires_at, created_at, token")
    .eq("organization_id", organizationId)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((i) => ({ id: i.id, email: i.email, role: i.org_role, invitedBy: i.invited_by, expiresAt: i.expires_at, createdAt: i.created_at, token: i.token }));
}

/** Role, primary product and the assigned-only scope switch. The policies refuse a member editing their own row. */
export async function updateTeamMember(membershipId: string, patch: { role?: OrgRole; product?: ProductKey | null; assignedOnly?: boolean }): Promise<void> {
  const sb = requireSupabase();
  const row: TablesUpdate<"org_memberships"> = {};
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.product !== undefined) row.product = patch.product;
  if (patch.assignedOnly !== undefined) row.assigned_only = patch.assignedOnly;
  const { data, error } = await sb.from("org_memberships").update(row).eq("id", membershipId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Nothing changed — you may not edit this membership (your own, or outside your authority).");
}

export async function removeTeamMember(membershipId: string): Promise<void> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("org_memberships").delete().eq("id", membershipId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Nothing removed — you may not remove this membership.");
}

/** Invitations go through invite_team_member() (0064): one open invitation per email, audited, authorization decided by the database. */
export async function createInvitation(input: { organizationId: string; email: string; role: OrgRole; invitedBy: string }): Promise<void> {
  await inviteTeamMember(input.organizationId, input.email.trim().toLowerCase(), input.role);
}

export async function cancelInvitation(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("invitations").delete().eq("id", id);
  if (error) throw error;
}
