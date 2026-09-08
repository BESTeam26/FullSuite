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
