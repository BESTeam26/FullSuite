import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  assignPartner, endAssignment, fetchAllLiveAssignments, fetchPartnerAssignments,
} from "@/lib/data/partner-assignments";

const live = (a: ReturnType<typeof useAuth>) => a.mode === "live" && a.status === "signed-in";

export function usePartnerAssignments(groupId: string | null) {
  const auth = useAuth();
  return useQuery({
    queryKey: ["partner", "assignments", groupId ?? ""],
    queryFn: () => fetchPartnerAssignments(groupId!),
    enabled: live(auth) && !!groupId,
    staleTime: 30_000,
  });
}

/** Live assignments for every partner, under one key so the directory and a
    profile header share the request. */
export function useAllPartnerAssignments() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["agency", "partner-assignments"],
    queryFn: fetchAllLiveAssignments,
    enabled: live(auth),
    staleTime: 60_000,
  });
}

/**
 * Assigning FROM the person's side — the same writers the partner's own Team
 * tab uses, so there is one implementation and one set of rules (§28). The
 * person is fixed; the partner varies.
 */
export function useMemberAssignmentActions(userId: string) {
  const qc = useQueryClient();
  const auth = useAuth();
  const agencyId = auth.agencyId ?? "";
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["partner"] });
    void qc.invalidateQueries({ queryKey: ["agency", "partner-assignments"] });
    void qc.invalidateQueries({ queryKey: ["agency", "partners"] });
    void qc.invalidateQueries({ queryKey: ["agency", "member-partners"] });
  };
  return {
    assign: useMutation({
      mutationFn: (v: { groupId: string; role?: Parameters<typeof assignPartner>[0]["role"] }) =>
        assignPartner({ agencyId, groupId: v.groupId, userId, role: v.role }),
      onSuccess: refresh,
    }),
    /* Every partner at once — for somebody whose job really is all of them.
       Sequential on purpose: each insert is its own authorization check, and
       one refusal must not silently skip the rest. */
    assignMany: useMutation({
      mutationFn: async (groupIds: string[]) => {
        for (const groupId of groupIds) {
          await assignPartner({ agencyId, groupId, userId });
        }
        return groupIds.length;
      },
      onSuccess: refresh,
    }),
    end: useMutation({ mutationFn: (id: string) => endAssignment(id), onSuccess: refresh }),
  };
}

export function useAssignmentActions(groupId: string) {
  const qc = useQueryClient();
  const auth = useAuth();
  const agencyId = auth.agencyId ?? "";
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["partner"] });
    void qc.invalidateQueries({ queryKey: ["agency", "partner-assignments"] });
    /* Assignment decides who can SEE the partner, so the directory itself
       changes shape for whoever was just added or removed. */
    void qc.invalidateQueries({ queryKey: ["agency", "partners"] });
  };
  return {
    assign: useMutation({
      mutationFn: (v: Omit<Parameters<typeof assignPartner>[0], "agencyId" | "groupId">) =>
        assignPartner({ ...v, agencyId, groupId }),
      onSuccess: refresh,
    }),
    end: useMutation({ mutationFn: (id: string) => endAssignment(id), onSuccess: refresh }),
  };
}
