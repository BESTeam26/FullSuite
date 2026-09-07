import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import {
  fetchPartnerBilling, fetchPartnerCatalogues, fetchPartnerOperations, fetchPartnerRevenue, fetchPartnerServices,
  savePartnerBilling, savePartnerOperations, savePartnerService, saveRevenueEntry,
  type PartnerBilling, type PartnerOperations,
} from "@/lib/data/partner-services";

const live = (a: ReturnType<typeof useAuth>) => a.mode === "live" && a.status === "signed-in";

export const partnerServicesKey = (g: string) => ["partner", "services", g] as const;
export const partnerBillingKey = (g: string) => ["partner", "billing", g] as const;
export const partnerRevenueKey = (g: string, y: number) => ["partner", "revenue", g, y] as const;
export const partnerOpsKey = (g: string) => ["partner", "operations", g] as const;

export function usePartnerServices(groupId: string | null) {
  const auth = useAuth();
  return useQuery({
    queryKey: partnerServicesKey(groupId ?? ""),
    queryFn: () => fetchPartnerServices(groupId!),
    enabled: live(auth) && !!groupId,
    staleTime: 30_000,
  });
}

/**
 * Billing, only when the caller may see it.
 *
 * `enabled` is gated on the capability rather than letting the query run and
 * come back empty: an empty result and "you may not see this" look identical
 * from here, and a screen that could not tell them apart would say "nothing is
 * billed" to somebody who simply lacks access. The database refuses either
 * way — this decides what the screen is entitled to claim.
 */
export function usePartnerBilling(groupId: string | null, serviceIds: string[]) {
  const auth = useAuth();
  const perms = useAgencyPermissions();
  const allowed = perms.can("partners.financials.view");
  const q = useQuery({
    queryKey: [...partnerBillingKey(groupId ?? ""), serviceIds.join(",")],
    queryFn: () => fetchPartnerBilling(serviceIds),
    enabled: live(auth) && !!groupId && allowed && serviceIds.length > 0,
    staleTime: 30_000,
  });
  return { ...q, allowed, permissionsLoading: perms.loading };
}

export function usePartnerRevenue(groupId: string | null, year: number) {
  const auth = useAuth();
  const perms = useAgencyPermissions();
  const allowed = perms.can("partners.financials.view");
  const q = useQuery({
    queryKey: partnerRevenueKey(groupId ?? "", year),
    queryFn: () => fetchPartnerRevenue(groupId!, year),
    enabled: live(auth) && !!groupId && allowed,
    staleTime: 30_000,
  });
  return { ...q, allowed };
}

export function usePartnerOperations(groupId: string | null) {
  const auth = useAuth();
  return useQuery({
    queryKey: partnerOpsKey(groupId ?? ""),
    queryFn: () => fetchPartnerOperations(groupId!),
    enabled: live(auth) && !!groupId,
    staleTime: 30_000,
  });
}

export function usePartnerServiceActions(groupId: string) {
  const qc = useQueryClient();
  const auth = useAuth();
  const agencyId = auth.agencyId ?? "";
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["partner"] });
  };
  return {
    saveService: useMutation({
      mutationFn: (v: Parameters<typeof savePartnerService>[0]) =>
        savePartnerService({ ...v, groupId, agencyId }),
      onSuccess: refresh,
    }),
    saveBilling: useMutation({
      mutationFn: (v: PartnerBilling) => savePartnerBilling({ ...v, agencyId }),
      onSuccess: refresh,
    }),
    saveRevenue: useMutation({
      mutationFn: (v: Omit<Parameters<typeof saveRevenueEntry>[0], "groupId" | "agencyId">) =>
        saveRevenueEntry({ ...v, groupId, agencyId }),
      onSuccess: refresh,
    }),
    saveOperations: useMutation({
      mutationFn: (patch: Partial<PartnerOperations>) => savePartnerOperations(groupId, agencyId, patch),
      onSuccess: refresh,
    }),
  };
}

/**
 * The service, billing-model and payment-channel catalogues.
 *
 * One key for the whole application: several screens offer these lists and
 * they must not each fetch their own copy (rule 14). An hour of staleness is
 * right for a catalogue that changes about once a year.
 */
export function usePartnerCatalogues() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["partner", "catalogues"],
    queryFn: fetchPartnerCatalogues,
    enabled: live(auth),
    staleTime: 3_600_000,
  });
}
