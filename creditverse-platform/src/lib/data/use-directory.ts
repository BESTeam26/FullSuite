/**
 * The company directory and departments, one query each per organization,
 * shared by the People page, the Departments page and the member editor.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  archiveOrganizationDepartment,
  fetchOrganizationDepartments,
  fetchOrganizationDirectory,
  saveOrganizationDepartment,
  setMemberDepartment,
  type SaveDepartmentInput,
} from "@/lib/data/directory";

export const directoryKey = (orgId: string | null) => ["directory", "people", orgId] as const;
export const departmentsKey = (orgId: string | null) => ["directory", "departments", orgId] as const;

function useLive() {
  const auth = useAuth();
  return auth.mode === "live" && auth.status === "signed-in";
}

export function useOrganizationDirectory(organizationId: string | null) {
  const live = useLive();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: directoryKey(organizationId),
    queryFn: () => fetchOrganizationDirectory(organizationId!),
    enabled: live && !!organizationId,
    staleTime: 2 * 60_000,
  });
  return {
    live,
    people: q.data ?? [],
    isLoading: live && !!organizationId && q.isLoading,
    error: (q.error as Error | null)?.message ?? null,
    setDepartment: useMutation({
      mutationFn: (v: { membershipId: string; departmentId: string | null; jobTitle?: string }) =>
        setMemberDepartment(v.membershipId, v.departmentId, v.jobTitle),
      onSuccess: () => void qc.invalidateQueries({ queryKey: directoryKey(organizationId) }),
    }),
  };
}

export function useOrganizationDepartments(organizationId: string | null) {
  const live = useLive();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: departmentsKey(organizationId),
    queryFn: () => fetchOrganizationDepartments(organizationId!),
    enabled: live && !!organizationId,
    staleTime: 5 * 60_000,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: departmentsKey(organizationId) });
    void qc.invalidateQueries({ queryKey: directoryKey(organizationId) });
  };
  return {
    live,
    departments: q.data ?? [],
    isLoading: live && !!organizationId && q.isLoading,
    error: (q.error as Error | null)?.message ?? null,
    save: useMutation({ mutationFn: (input: SaveDepartmentInput) => saveOrganizationDepartment(input), onSuccess: refresh }),
    archive: useMutation({ mutationFn: archiveOrganizationDepartment, onSuccess: refresh }),
  };
}
