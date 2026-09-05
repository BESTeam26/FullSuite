import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchDepartmentStatusesForClients } from "@/lib/data/fulfillment-clients";
import type { DepartmentStatus } from "@/lib/fulfillment/creditops-store-types";

/** One bounded query for a visible page of clients; refetched after a status write. */
export const departmentStatusMapKey = (ids: readonly string[]) => ["creditops", "department-statuses", "batch", [...ids].sort().join(",")];

export function useDepartmentStatusMap(clientIds: readonly string[]) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const key = useMemo(() => departmentStatusMapKey(clientIds), [clientIds]);
  const q = useQuery({
    queryKey: key,
    queryFn: () => fetchDepartmentStatusesForClients(clientIds),
    enabled: live && clientIds.length > 0,
    staleTime: 15_000,
  });
  return {
    byClient: (q.data ?? {}) as Record<string, DepartmentStatus[]>,
    isLoading: live && clientIds.length > 0 && q.isLoading,
  };
}

export function useInvalidateDepartmentStatuses() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["creditops", "department-statuses"] });
}
