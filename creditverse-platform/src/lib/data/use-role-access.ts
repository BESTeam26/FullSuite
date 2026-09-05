import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  fetchOrganizationRoleAccess,
  resetOrganizationRoleAccess,
  setOrganizationRoleAccess,
} from "@/lib/data/role-access";
import type { RoleAccess } from "@/lib/fulfillment/role-access-defaults";

export const roleAccessQueryKey = (organizationId: string | null) => ["role-access", organizationId];

/** The organization's configured role rows (empty = all defaults). One query per organization. */
export function useOrganizationRoleAccess(organizationId: string | null) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const q = useQuery({
    queryKey: roleAccessQueryKey(organizationId),
    queryFn: () => fetchOrganizationRoleAccess(organizationId as string),
    enabled: live && !!organizationId,
    staleTime: 60_000,
  });
  return {
    rows: (q.data ?? {}) as Record<string, RoleAccess>,
    isLoading: live && !!organizationId && q.isLoading,
    error: q.error ? (q.error as Error).message : null,
  };
}

export function useRoleAccessMutations(organizationId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: roleAccessQueryKey(organizationId) });
  const save = useMutation({
    mutationFn: (input: Parameters<typeof setOrganizationRoleAccess>[0]["access"] & { role: Parameters<typeof setOrganizationRoleAccess>[0]["role"]; product: Parameters<typeof setOrganizationRoleAccess>[0]["product"] }) =>
      setOrganizationRoleAccess({ organizationId, role: input.role, product: input.product, access: input }),
    onSuccess: invalidate,
  });
  const reset = useMutation({
    mutationFn: (input: { role: Parameters<typeof resetOrganizationRoleAccess>[0]["role"]; product: Parameters<typeof resetOrganizationRoleAccess>[0]["product"] }) =>
      resetOrganizationRoleAccess({ organizationId, ...input }),
    onSuccess: invalidate,
  });
  return { save, reset };
}
