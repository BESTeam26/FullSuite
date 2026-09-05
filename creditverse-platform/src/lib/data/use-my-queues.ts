/**
 * The person's queues: open unassigned department rows in the departments their
 * resolved role access allows (configured by the organization, else default).
 * BES staff in agency view see every department across the clients RLS returns.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgency } from "@/lib/agency-context";
import { fetchOpenUnassignedDepartmentRows } from "@/lib/data/department-queues";
import { useOrganizationRoleAccess } from "@/lib/data/use-role-access";
import { roleAccessKey } from "@/lib/data/role-access";
import { resolveOpsAccess } from "@/lib/fulfillment/ops-role-resolver";

export function useMyQueues() {
  const auth = useAuth();
  const agency = useAgency();
  const live = auth.mode === "live" && auth.status === "signed-in" && !!auth.user;
  const orgId = agency.viewMode === "subaccount" ? agency.activeOrganization?.id ?? null : null;
  const agencyRole = auth.agencyMembership?.role ?? null;
  const orgRole = auth.orgMemberships.find((m) => m.organization_id === orgId)?.role ?? null;
  const configured = useOrganizationRoleAccess(live && !agencyRole && orgRole ? orgId : null);

  const q = useQuery({
    queryKey: ["work", "queues", orgId ?? "all"],
    queryFn: () => fetchOpenUnassignedDepartmentRows(orgId),
    enabled: live,
    staleTime: 15_000,
  });

  const allowed = useMemo(() => {
    const credit = resolveOpsAccess({ agencyRole, orgRole, product: "creditOps", configured: orgRole ? configured.rows[roleAccessKey(orgRole, "creditOps")] ?? null : null });
    const funding = resolveOpsAccess({ agencyRole, orgRole, product: "fundingOps", configured: orgRole ? configured.rows[roleAccessKey(orgRole, "fundingOps")] ?? null : null });
    return { CreditOps: new Set(credit.canLogWork ? credit.departments : []), FundingOps: new Set(funding.canLogWork ? funding.departments : []) };
  }, [agencyRole, orgRole, configured.rows]);

  const rows = useMemo(() => (q.data ?? []).filter((r) => allowed[r.division].has(r.department)), [q.data, allowed]);
  return { rows, isLoading: live && q.isLoading, error: q.error ? (q.error as Error).message : null, live };
}
