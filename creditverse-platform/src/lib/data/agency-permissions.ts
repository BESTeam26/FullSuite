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
  "partners.financials.view", "partners.financials.edit", "partners.revenue.record",
  "reports.view",
] as const;

export type AgencyPermission = (typeof AGENCY_PERMISSIONS)[number];

/**
 * Resolve every capability in one round trip rather than one call per switch.
 * A permissions screen asks about fifteen of these at once; fifteen requests
 * to render one page is the waterfall rule 14 forbids.
 */
async function fetchMyAgencyPermissions(): Promise<Record<string, boolean>> {
  const sb = requireSupabase();
  const results = await Promise.all(
    AGENCY_PERMISSIONS.map(async (key) => {
      const { data, error } = await sb.rpc("agency_can", { p_key: key });
      if (error) throw error;
      return [key, data === true] as const;
    }),
  );
  return Object.fromEntries(results);
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
  /** Only the deliberate exceptions. Absent means "whatever the role says". */
  overrides: Record<string, boolean>;
}

export async function fetchAgencyAccess(agencyId: string): Promise<AgencyMemberAccess[]> {
  const sb = requireSupabase();
  const [members, overrides] = await Promise.all([
    sb.from("agency_memberships")
      .select("id, user_id, role, profiles:profiles!agency_memberships_user_id_fkey(id, full_name, email)")
      .eq("agency_id", agencyId),
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
