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
export type AccessProfile = Enums<"access_profile">;

export interface AgencyInvitation {
  id: string;
  email: string;
  role: AgencyRole | null;
  accessProfile: AccessProfile | null;
  invitedBy: string | null;
  expiresAt: string;
  createdAt: string;
  token: string;
}

export async function fetchAgencyInvitations(): Promise<AgencyInvitation[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("invitations")
    .select("id, email, agency_role, access_profile, invited_by, expires_at, created_at, token")
    .eq("kind", "agency")
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((i) => ({
    id: i.id,
    email: String(i.email),
    role: i.agency_role,
    accessProfile: (i as { access_profile?: AccessProfile | null }).access_profile ?? null,
    invitedBy: i.invited_by,
    expiresAt: i.expires_at,
    createdAt: i.created_at,
    token: i.token,
  }));
}

export async function inviteAgencyMember(
  email: string,
  role: AgencyRole,
  profile?: AccessProfile,
  leadTeamId?: string,
  /* The modules they are hired to work — granted on activation as their own
     exceptions, because no profile grants a module (§16). */
  moduleKeys?: string[],
): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("invite_agency_member", {
    p_email: email, p_role: role,
    p_profile: profile ?? undefined, p_lead_team: leadTeamId ?? undefined,
    p_modules: moduleKeys && moduleKeys.length > 0 ? moduleKeys : undefined,
  });
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

/* ── Access profiles: operational presets on top of the two roles (0266) ──
   NOT security roles. A profile is the permission DEFAULT an Agency User
   starts from; per-person overrides on the Access page still win. */
export const ACCESS_PROFILES: AccessProfile[] = ["manager", "team_lead", "agent", "custom"];

export const ACCESS_PROFILE_LABELS: Record<AccessProfile, string> = {
  manager: "Manager",
  team_lead: "Team Lead",
  agent: "Agent",
  custom: "Custom",
};

/**
 * One dropdown the way Dee reads it — "Agency Admin", "Agency User ·
 * Manager" — while role and profile stay two stored facts underneath.
 */
export interface InviteChoice {
  value: string;
  label: string;
  role: AgencyRole;
  profile: AccessProfile | null;
  hint: string;
}

export const INVITE_CHOICES: InviteChoice[] = [
  { value: "agency_admin", label: "Agency Admin", role: "agency_admin", profile: null,
    hint: "The full agency management experience. Ownership itself is transferred, never invited." },
  { value: "agency_user:manager", label: "Agency User · Manager", role: "agency_user", profile: "manager",
    hint: "Runs their slice of the operation: team workload, Team EOD, partner operations and assignments within their scope. No money screens by default, and never agency-wide by itself." },
  { value: "agency_user:team_lead", label: "Agency User · Team Lead", role: "agency_user", profile: "team_lead",
    hint: "Leads one team: that team\u2019s workload, EOD and assigned partner work. Pick the team they lead \u2014 activation makes them its lead." },
  { value: "agency_user:agent", label: "Agency User · Agent", role: "agency_user", profile: "agent",
    hint: "The working day: My Work, My Time, EOD, Communication, and whatever is assigned to them. Modules like CreditOps are granted per person on the Access page." },
  { value: "agency_user:custom", label: "Agency User · Custom", role: "agency_user", profile: "custom",
    hint: "Starts with nothing granted. Use when you want to configure this person\u2019s permissions by hand on the Access page." },
];

/**
 * What an invitation will actually produce, in plain words (§22).
 *
 * Read from the SAME preset matrix the database resolves against — passed in
 * rather than restated, so this summary cannot drift from what the person
 * receives. Personal surfaces are listed because they are true for everyone
 * and their absence would read as a restriction.
 */
export interface AccessPreview {
  headline: string;
  sees: string[];
  hidden: string[];
  note: string;
}

const PERSONAL = ["My Work", "My Time", "End of Day", "Notifications", "Communication", "Knowledge Base", "Calendar"];

const MODULE_LABELS: Record<string, string> = {
  "creditops.clients.view": "CreditOps",
  "crm.projects.view": "BES CRM",
  "fundingops.files.view": "FundingOps",
  "talentops.view": "TalentOps",
};

export function previewAccess(
  choice: InviteChoice,
  profileDefaults?: Record<string, Record<string, boolean>>,
  extraModules: string[] = [],
): AccessPreview {
  if (choice.role === "agency_admin") {
    return {
      headline: "Agency Admin · Full Agency Administration",
      sees: ["Everything released to the agency — people, operations, partners, finance, settings"],
      hidden: ["Owner-only actions, which need the owner flag"],
      note: "No access profile applies: the role grants it all.",
    };
  }
  const defaults = (choice.profile && profileDefaults?.[choice.profile]) ?? {};
  const granted = Object.entries(defaults).filter(([, on]) => on).map(([key]) => key);
  const sees = [...PERSONAL];
  if (granted.includes("partners.view")) sees.push("Assigned partners");
  if (granted.includes("partners.clients")) sees.push("Their clients");
  if (granted.includes("reports.view")) sees.push("Reports, within scope");
  if (granted.includes("ops.manage")) sees.push("Team workload, Team EOD and people in their scope");
  if (granted.includes("team.manage")) sees.push("Teams they manage");
  for (const key of extraModules) if (MODULE_LABELS[key]) sees.push(MODULE_LABELS[key]);

  const hidden: string[] = [];
  for (const [key, label] of Object.entries(MODULE_LABELS)) {
    if (!extraModules.includes(key)) hidden.push(label);
  }
  hidden.push("Finance and Payroll", "Agency Settings", "Partner credentials");
  if (!granted.includes("ops.manage")) hidden.push("People and Teams administration");

  return {
    headline: `Agency User · ${choice.profile ? ACCESS_PROFILE_LABELS[choice.profile] : "Custom"}`,
    sees,
    hidden,
    note: choice.profile === "team_lead"
      ? "Team surfaces follow the team they actually lead, which this invitation names."
      : "Scope still decides the records: they see the partners, clients and work assigned to them.",
  };
}

/** "Agency Admin" or "Agency User · Manager" — for lists of people. */
export function memberAccessLabel(role: string | null | undefined, profile?: AccessProfile | null): string {
  const base = roleLabel(role);
  if (role === "agency_user" && profile) return `${base} · ${ACCESS_PROFILE_LABELS[profile]}`;
  return base;
}

/** A readable name for any role value, including retired ones in old rows. */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return (
    AGENCY_ROLE_LABELS[role as AgencyRole] ??
    role.replace(/^agency_/, "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}
