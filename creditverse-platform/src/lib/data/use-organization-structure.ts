import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { workforceKey } from "@/lib/data/use-workforce";
import {
  fetchOrganizationTree, impactOfDepartment, impactOfDivision,
  saveDepartment, saveDivision, setDepartmentArchived, setDivisionArchived,
  setMemberPlacement,
} from "@/lib/data/organization-structure";

const live = (a: ReturnType<typeof useAuth>) => a.mode === "live" && a.status === "signed-in";
export const orgTreeKey = ["agency", "organization-tree"] as const;

export function useOrganizationTree() {
  const auth = useAuth();
  return useQuery({
    queryKey: orgTreeKey,
    queryFn: fetchOrganizationTree,
    enabled: live(auth),
    staleTime: 60_000,
  });
}

/**
 * Structure changes invalidate the workforce and the roster too.
 *
 * A department renamed here shows on People, on Teams, in every assignment
 * selector and on the partner profile. One structure, many views (Dee, §28) —
 * so one change has to refresh all of them or two screens disagree inside one
 * session.
 */
export function useStructureActions() {
  const qc = useQueryClient();
  const auth = useAuth();
  const agencyId = auth.agencyId ?? "";
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: orgTreeKey });
    void qc.invalidateQueries({ queryKey: workforceKey });
    void qc.invalidateQueries({ queryKey: ["agency", "members"] });
  };
  return {
    saveDivision: useMutation({
      mutationFn: (v: Omit<Parameters<typeof saveDivision>[0], "agencyId">) =>
        saveDivision({ ...v, agencyId }),
      onSuccess: refresh,
    }),
    archiveDivision: useMutation({
      mutationFn: (v: { id: string; archived: boolean }) => setDivisionArchived(v.id, v.archived),
      onSuccess: refresh,
    }),
    saveDepartment: useMutation({
      mutationFn: (v: Omit<Parameters<typeof saveDepartment>[0], "agencyId">) =>
        saveDepartment({ ...v, agencyId }),
      onSuccess: refresh,
    }),
    archiveDepartment: useMutation({
      mutationFn: (v: { id: string; archived: boolean }) => setDepartmentArchived(v.id, v.archived),
      onSuccess: refresh,
    }),
    placeMember: useMutation({
      mutationFn: (v: { membershipId: string } & Parameters<typeof setMemberPlacement>[1]) =>
        setMemberPlacement(v.membershipId, v),
      onSuccess: refresh,
    }),
    impactOfDepartment,
    impactOfDivision,
  };
}
