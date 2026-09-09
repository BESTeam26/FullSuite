/**
 * What the signed-in BES staff member may do.
 *
 * The screen asks the SAME authority the database enforces — `agency_can` —
 * so a control is never rendered that the database will refuse, and never
 * hidden where the database would allow it. That symmetry is the point: this
 * layer decides what to SHOW, and it is not the protection. The protection is
 * the policy on the table.
 *
 * It matters most for money. A manager's billing query returns an empty list
 * rather than an error, so a screen that inferred "no rows means nothing is
 * billed" would tell them something false. The screen asks this instead, and
 * says "you do not have access to billing" when that is the truth.
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

/** Capabilities this release introduced. Mirrors `permission_keys`. */
export const AGENCY_PERMISSIONS = [
  "partners.view", "partners.create", "partners.edit", "partners.archive",
  "partners.contacts", "partners.portal", "partners.clients", "partners.operations",
  "partners.assignments", "partners.files.view", "partners.files.upload",
  "partners.credentials.view", "partners.credentials.manage",
  "partners.financials.view", "partners.financials.edit", "partners.revenue.record",
  "partners.invoices.view", "partners.invoices.manage", "partners.payments.record",
  "finance.dashboard.view", "expenses.view", "expenses.manage",
  "payroll.view", "payroll.manage",
  "org.structure.view", "org.structure.manage",
  "hub.files.manage", "ops.manage",
  "communication.audit", "communication.manage",
  "reports.view",
  /* Module ENTRY keys (§59): the named door into each operational module,
     granted per person — never through ops.manage, never by a preset. */
  "creditops.clients.view", "crm.projects.view", "fundingops.files.view", "talentops.view",
  /* HR documents (§15): a team member's agreements and NDAs — never mere
     staff status, and not part of any preset. */
  "people.documents.manage",
] as const;

export type AgencyPermission = (typeof AGENCY_PERMISSIONS)[number];

/**
 * Every capability, in ONE round trip.
 *
 * This used to call `agency_can` once per key. Parallel, but still one
 * request per capability before the menu could decide what to render — and
 * the count grew with every capability added. `agency_can_all` returns the
 * whole map; it applies the same rule, because both it and `agency_can` call
 * one shared resolver in the database rather than restating the precedence
 * (migration 0226, and matrix phase 67 walks every key for every role to
 * prove the two still agree).
 */
async function fetchMyAgencyPermissions(): Promise<Record<string, boolean>> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("agency_can_all");
  if (error) throw error;
  const map = (data ?? {}) as Record<string, unknown>;
  /* Read through the known list rather than trusting the shape that came
     back: a key the catalogue has and this release does not is not a
     capability this code can honour, and a missing key means NO. */
  return Object.fromEntries(
    AGENCY_PERMISSIONS.map((key) => [key, map[key] === true]),
  );
}

export function useAgencyPermissions() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in" && auth.isAgencyStaff;
  const q = useQuery({
    queryKey: ["agency", "my-permissions", auth.user?.id ?? ""],
    queryFn: fetchMyAgencyPermissions,
    enabled: live,
    /* Short, so revoking a capability takes effect on the next refetch rather
       than at the end of a long session. The database refuses immediately
       either way; this only decides how quickly the screen catches up. */
    staleTime: 30_000,
  });
  const map = q.data ?? {};
  return {
    /** Unknown while loading: assume NO, so nothing flashes into view. */
    can: (key: AgencyPermission) => map[key] === true,
    loading: live && q.isLoading,
    all: map,
  };
}

/* ── Managing somebody else's access ──────────────────────────────────── */

export interface AgencyMemberAccess {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  /** The preset an Agency User starts from; null for admins. */
  accessProfile: string | null;
  /** Only the deliberate exceptions. Absent means "whatever the role says". */
  overrides: Record<string, boolean>;
}

export async function fetchAgencyAccess(agencyId: string): Promise<AgencyMemberAccess[]> {
  const sb = requireSupabase();
  const [members, overrides] = await Promise.all([
    /* `!inner` so the fixture filter reaches the joined profile. The panel
       used to list the security suite's own @bes.test accounts beside real
       staff, and All Access was toggled on one of them — which both wrote
       overrides nobody wanted and broke what phase 56 measures. */
    sb.from("agency_memberships")
      .select("id, user_id, role, access_profile, profiles:profiles!agency_memberships_user_id_fkey!inner(id, full_name, email, is_fixture)")
      .eq("agency_id", agencyId)
      .eq("profiles.is_fixture", false),
    sb.from("agency_member_permissions").select("membership_id, key, allowed"),
  ]);
  if (members.error) throw members.error;
  if (overrides.error) throw overrides.error;

  const byMembership = new Map<string, Record<string, boolean>>();
  for (const row of overrides.data ?? []) {
    const r = row as Record<string, unknown>;
    const id = r.membership_id as string;
    byMembership.set(id, { ...(byMembership.get(id) ?? {}), [r.key as string]: r.allowed as boolean });
  }

  return (members.data ?? []).map((m) => {
    const row = m as Record<string, unknown>;
    const p = row.profiles as { id: string; full_name?: string; email?: string } | null;
    return {
      membershipId: row.id as string,
      userId: (p?.id ?? row.user_id) as string,
      name: p?.full_name || p?.email || "Unnamed",
      email: p?.email ?? "",
      role: row.role as string,
      accessProfile: (row.access_profile as string) ?? null,
      overrides: byMembership.get(row.id as string) ?? {},
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Set one capability for one person. Audited by the writer. */
export async function setAgencyPermission(membershipId: string, key: string, allowed: boolean, reason?: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_agency_permission", {
    p_membership: membershipId, p_key: key, p_allowed: allowed, p_reason: reason ?? undefined,
  });
  if (error) throw error;
}

/** Remove an exception so the person falls back to their role's default. */
export async function clearAgencyPermission(membershipId: string, key: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("clear_agency_permission", { p_membership: membershipId, p_key: key });
  if (error) throw error;
}

/* ── The catalogue, and what each role gets by default ────────────────── */

export interface PermissionKeyRow {
  key: string;
  module: string;
  label: string;
  description: string | null;
  securityRelevant: boolean;
  sort: number;
}

/**
 * Every capability that exists, and the default each role holds.
 *
 * Two round trips, in parallel, for a screen that shows a grid of both. The
 * alternative — asking `agency_can` once per person per key — is thirty
 * requests to draw one table.
 */
export async function fetchPermissionCatalogue(): Promise<{
  keys: PermissionKeyRow[];
  roleDefaults: Record<string, Record<string, boolean>>;
}> {
  const sb = requireSupabase();
  const [keys, defaults] = await Promise.all([
    sb.from("permission_keys")
      .select("key, module, label, description, security_relevant, sort")
      .in("key", AGENCY_PERMISSIONS as unknown as string[])
      .order("sort"),
    sb.from("agency_role_permissions").select("agency_id, role, key, allowed"),
  ]);
  if (keys.error) throw keys.error;
  if (defaults.error) throw defaults.error;

  /* An agency row overrides the platform default for that role, exactly as
     `agency_can` resolves it. Platform rows are applied first so the agency's
     own row wins wherever both exist. */
  const roleDefaults: Record<string, Record<string, boolean>> = {};
  const rows = (defaults.data ?? []) as Record<string, unknown>[];
  for (const scope of [null, "agency"]) {
    for (const r of rows) {
      const isPlatform = r.agency_id === null;
      if ((scope === null) !== isPlatform) continue;
      const role = r.role as string;
      roleDefaults[role] = { ...(roleDefaults[role] ?? {}), [r.key as string]: r.allowed as boolean };
    }
  }

  return {
    keys: (keys.data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        key: r.key as string, module: r.module as string, label: r.label as string,
        description: (r.description as string) ?? null,
        securityRelevant: Boolean(r.security_relevant),
        sort: Number(r.sort ?? 0),
      };
    }),
    roleDefaults,
  };
}

/**
 * What one person actually holds, resolved the way the database resolves it.
 *
 * Mirrors `agency_can`'s precedence exactly:
 *
 *   owner / admin → true
 *   → their own explicit grant or denial
 *     → their agency's default for that role
 *       → the platform default for that role
 *         → false
 *
 * A mirror, not the authority: this decides what a switch LOOKS like. The
 * database decides what anybody receives, and it re-checks every time.
 */
export function effectiveAgencyPermission(
  role: string,
  key: string,
  overrides: Record<string, boolean>,
  roleDefaults: Record<string, Record<string, boolean>>,
): { allowed: boolean; source: "role" | "granted" | "denied" | "default" } {
  if (role === "agency_owner" || role === "agency_admin") return { allowed: true, source: "role" };
  if (key in overrides) {
    return { allowed: overrides[key], source: overrides[key] ? "granted" : "denied" };
  }
  const fallback = roleDefaults[role]?.[key];
  return { allowed: fallback ?? false, source: "default" };
}
