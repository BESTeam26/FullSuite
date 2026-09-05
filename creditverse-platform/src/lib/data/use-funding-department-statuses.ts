import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchFundingDepartmentStatusesForClients } from "@/lib/data/funding-clients";
import type { FundingDepartmentStatus } from "@/lib/fulfillment/fundingops-store-types";

/** One bounded query for a visible page of funding clients. */
export function useFundingDepartmentStatusMap(clientIds: readonly string[]) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const key = useMemo(() => ["fundingops", "department-statuses", "batch", [...clientIds].sort().join(",")], [clientIds]);
  const q = useQuery({
    queryKey: key,
    queryFn: () => fetchFundingDepartmentStatusesForClients(clientIds),
    enabled: live && clientIds.length > 0,
    staleTime: 15_000,
  });
  return { byClient: (q.data ?? {}) as Record<string, FundingDepartmentStatus[]>, isLoading: live && clientIds.length > 0 && q.isLoading };
}
