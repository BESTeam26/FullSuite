/**
 * Inviting people onto the BES team.
 *
 * Every check lives in the database functions (0086): only an owner or admin
 * may invite, only an owner may create another owner, and the invitation is
 * accepted only by the address it was sent to.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";

export type AgencyRole = Enums<"agency_role">;

export interface AgencyInvitation {
  id: string;
  email: string;
  role: AgencyRole | null;
  invitedBy: string | null;
  expiresAt: string;
  createdAt: string;
  token: string;
}

export async function fetchAgencyInvitations(): Promise<AgencyInvitation[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("invitations")
    .select("id, email, agency_role, invited_by, expires_at, created_at, token")
    .eq("kind", "agency")
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((i) => ({
    id: i.id,
    email: String(i.email),
    role: i.agency_role,
    invitedBy: i.invited_by,
    expiresAt: i.expires_at,
    createdAt: i.created_at,
    token: i.token,
  }));
}

export async function inviteAgencyMember(email: string, role: AgencyRole): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("invite_agency_member", { p_email: email, p_role: role });
  if (error) throw error;
  return data as unknown as string;
}

export async function cancelAgencyInvitation(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("cancel_agency_invitation", { p_id: id });
  if (error) throw error;
}

export async function acceptAgencyInvitation(token: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("accept_agency_invitation", { p_token: token });
  if (error) throw error;
  return data as unknown as string;
}

/** The link a person opens; the same accept screen serves both kinds. */
export function invitationLink(token: string): string {
  return `${window.location.origin}/accept-invitation/${token}`;
}

/** The five roles the database actually defines, in order of reach. */
export const AGENCY_ROLES: AgencyRole[] = [
  "agency_owner",
  "agency_admin",
  "agency_manager",
  "agency_team_lead",
  "agency_agent",
];

export const AGENCY_ROLE_LABELS: Record<AgencyRole, string> = {
  agency_owner: "Agency Owner",
  agency_admin: "Agency Admin",
  agency_manager: "Manager",
  agency_team_lead: "Team Lead",
  agency_agent: "Agent",
};

export const AGENCY_ROLE_HINTS: Record<AgencyRole, string> = {
  agency_owner: "Everything, including inviting other owners.",
  agency_admin: "Runs the platform day to day; can invite the team.",
  agency_manager: "Manages divisions and their work.",
  agency_team_lead: "Leads a team and sees its work.",
  agency_agent: "Works what is assigned to them.",
};
