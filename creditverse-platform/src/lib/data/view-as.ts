/**
 * View As — reading another person's effective access, without becoming them.
 *
 * ── WHAT IS AND IS NOT HAPPENING ───────────────────────────────────────────
 *
 * Dee, §35: "Do NOT swap auth tokens, change auth.uid(), login as employee,
 * create employee sessions, perform writes as employee."
 *
 * None of that happens. `auth.uid()` stays the previewer for every request.
 * What comes back is a set of FACTS ABOUT the target — their role, their
 * grants and denies with the reason for each, their teams, their partner and
 * service assignments — read through functions that only an owner or a
 * capability-holding admin may call.
 *
 * ── THE HONEST LIMIT, STATED RATHER THAN HIDDEN ────────────────────────────
 *
 * Because nothing is impersonated, a preview is a FAITHFUL MODEL and not the
 * thing itself. Navigation is exact: `accessTo()` is the one authority the
 * menu and the route guard already share, and it takes the target's role and
 * capability function unchanged. Partner, service and conversation visibility
 * are exact for the same reason — parameterized copies of the same
 * predicates, with matrix probes asserting they agree with the originals for
 * the current user.
 *
 * A data surface that runs its own RLS-filtered query is NOT previewed. It
 * says so (§37: "If a surface cannot safely render target-user scope: say
 * Preview unavailable there. Never silently show Owner data.") — because the
 * alternative is showing the owner's rows under somebody else's name, which
 * is worse than showing nothing.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface PreviewPosition {
  title: string;
  type: string;
  division: string | null;
  department: string | null;
  team: string | null;
}

export interface PreviewProfile {
  userId: string;
  name: string;
  email: string;
  role: string | null;
  status: string | null;
  scope: string | null;
  jobTitle: string | null;
  positions: PreviewPosition[];
  division: string | null;
  scopeDivision: string | null;
  department: string | null;
  teams: { id: string; name: string; isLead: boolean }[];
  reportsTo: string | null;
}

export interface PreviewCapability {
  key: string;
  module: string;
  label: string;
  allowed: boolean;
  /** WHY, in words — §38. "Denied" without a reason is a support ticket. */
  source: string;
  securityRelevant: boolean;
}

export interface PreviewScopeRow {
  id: string;
  name: string;
  context: string | null;
  allowed: boolean;
  reason: string;
}

export interface PreviewAccess {
  profile: PreviewProfile;
  capabilities: PreviewCapability[];
  partners: PreviewScopeRow[];
  services: PreviewScopeRow[];
  channels: PreviewScopeRow[];
}

export async function canPreviewAsUser(): Promise<boolean> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("can_preview_as_user");
  if (error) throw error;
  return !!data;
}

/** Everybody a previewer may step into: the agency roster, minus fixtures. */
export interface PreviewCandidate {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

export async function fetchPreviewCandidates(): Promise<PreviewCandidate[]> {
  const sb = requireSupabase();
  // prettier-ignore
  const { data, error } = await sb
    .from("agency_memberships")
    .select("user_id, role, status, profiles!user_id!inner(full_name, email, is_fixture)")
    .eq("profiles.is_fixture", false)
    .order("role");
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const p = row.profiles as { full_name: string | null; email: string };
    return {
      userId: row.user_id as string,
      name: p.full_name?.trim() || p.email,
      email: p.email,
      role: row.role as string,
      status: row.status as string,
    };
  });
}

export async function fetchPreviewAccess(userId: string): Promise<PreviewAccess> {
  const sb = requireSupabase();
  /* Four calls in parallel rather than four round trips in series — a preview
     that takes two seconds to open is a preview nobody uses (rule 14). */
  const [profile, capabilities, partners, services, channels] = await Promise.all([
    sb.rpc("access_profile_for_user", { p_user: userId }),
    sb.rpc("access_capabilities_for_user", { p_user: userId }),
    sb.rpc("partners_visible_to_user", { p_user: userId }),
    sb.rpc("services_visible_to_user", { p_user: userId }),
    sb.rpc("channels_visible_to_user", { p_user: userId }),
  ]);
  for (const r of [profile, capabilities, partners, services, channels]) {
    if (r.error) throw r.error;
  }
  if (!profile.data) {
    throw new Error("You are not allowed to preview that person's access.");
  }

  const raw = profile.data as Record<string, unknown>;
  return {
    profile: {
      userId: raw.userId as string,
      name: (raw.name as string) ?? "Someone",
      email: (raw.email as string) ?? "",
      role: (raw.role as string) ?? null,
      status: (raw.status as string) ?? null,
      scope: (raw.scope as string) ?? null,
      jobTitle: (raw.jobTitle as string) ?? null,
      positions: Array.isArray(raw.positions)
        ? (raw.positions as Record<string, unknown>[]).map((p) => ({
            title: String(p.title ?? ""), type: String(p.type ?? "permanent"),
            division: (p.division as string) ?? null,
            department: (p.department as string) ?? null,
            team: (p.team as string) ?? null,
          }))
        : [],
      division: (raw.division as string) ?? null,
      scopeDivision: (raw.scopeDivision as string) ?? null,
      department: (raw.department as string) ?? null,
      teams: Array.isArray(raw.teams)
        ? (raw.teams as Record<string, unknown>[]).map((t) => ({
            id: String(t.id), name: String(t.name), isLead: !!t.isLead,
          }))
        : [],
      reportsTo: (raw.reportsTo as string) ?? null,
    },
    capabilities: (capabilities.data ?? []).map((c) => {
      const x = c as Record<string, unknown>;
      return {
        key: x.key as string, module: x.module as string, label: x.label as string,
        allowed: !!x.allowed, source: (x.source as string) ?? "",
        securityRelevant: !!x.security_relevant,
      };
    }),
    partners: (partners.data ?? []).map((p) => {
      const x = p as Record<string, unknown>;
      return {
        id: x.partner_id as string, name: x.partner_name as string,
        context: null, allowed: !!x.allowed, reason: (x.reason as string) ?? "",
      };
    }),
    services: (services.data ?? []).map((s) => {
      const x = s as Record<string, unknown>;
      return {
        id: x.service_id as string, name: x.service_name as string,
        context: (x.partner_name as string) ?? null,
        allowed: !!x.allowed, reason: (x.reason as string) ?? "",
      };
    }),
    channels: (channels.data ?? []).map((c) => {
      const x = c as Record<string, unknown>;
      return {
        id: x.channel_id as string, name: x.name as string,
        context: (x.owner_kind as string) ?? null,
        allowed: !!x.allowed,
        reason: x.allowed ? "member, team or all-hands" : "not a member",
      };
    }),
  };
}
