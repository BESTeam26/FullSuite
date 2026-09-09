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

/** The two application security roles (0234). Ownership is a flag, not a role. */
export const AGENCY_ROLES: AgencyRole[] = [
  "agency_admin",
  "agency_user",
];

/* Keyed by the LIVE roles. A retired value read from an old row falls back
   through roleLabel() below rather than forcing dead keys to stay here. */
export const AGENCY_ROLE_LABELS: Partial<Record<AgencyRole, string>> & Record<"agency_admin" | "agency_user", string> = {
  agency_admin: "Agency Admin",
  agency_user: "Agency User",
};

export const AGENCY_ROLE_HINTS: Partial<Record<AgencyRole, string>> & Record<"agency_admin" | "agency_user", string> = {
  agency_admin: "The full agency management experience. Ownership itself is transferred, never invited.",
  agency_user: "The operational workspace: their work, their time, their day. Modules, scope and partners are granted on the Access page.",
};

/**
 * The address a live invitation was sent to, for the activation page.
 *
 * Returns null for a token that is unknown, expired or already accepted — the
 * database deliberately cannot tell those three apart, so neither can this.
 * Accepting still requires the caller's own authenticated email to match, so
 * knowing the address gets a stranger no further.
 */
export interface InvitationPreview {
  email: string;
  kind: string;
  expiresAt: string;
}

export async function fetchInvitationPreview(token: string): Promise<InvitationPreview | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("invitation_preview", { p_token: token });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  const r = row as { email: string; kind: string; expires_at: string };
  return { email: r.email, kind: r.kind, expiresAt: r.expires_at };
}

/** A readable name for any role value, including retired ones in old rows. */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return (
    AGENCY_ROLE_LABELS[role as AgencyRole] ??
    role.replace(/^agency_/, "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}
