import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchDepartmentStatusesForClients, fetchDepartmentStatusesForScope } from "@/lib/data/fulfillment-clients";
import type { DepartmentStatus } from "@/lib/fulfillment/creditops-store-types";

/** One bounded query for a visible page of clients; refetched after a status write. */
export const departmentStatusMapKey = (ids: readonly string[]) => ["creditops", "department-statuses", "batch", [...ids].sort().join(",")];

/**
 * A whole scope's rows in one request. `groupId` null means everything the
 * caller may see. Given by the Main Client List, whose columns need every
 * row in the scope; queues and pickers keep asking by id.
 */
export interface DepartmentStatusScope { groupId: string | null }

export const departmentStatusScopeKey = (scope: DepartmentStatusScope) =>
  ["creditops", "department-statuses", "scope", scope.groupId ?? "all"];

export function useDepartmentStatusMap(clientIds: readonly string[], scope?: DepartmentStatusScope) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const key = useMemo(
    () => (scope ? departmentStatusScopeKey(scope) : departmentStatusMapKey(clientIds)),
    [clientIds, scope],
  );
  const q = useQuery({
    queryKey: key,
    queryFn: () => (scope ? fetchDepartmentStatusesForScope(scope.groupId) : fetchDepartmentStatusesForClients(clientIds)),
    enabled: live && (scope ? true : clientIds.length > 0),
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
