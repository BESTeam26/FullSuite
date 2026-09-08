import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { workforceKey } from "@/lib/data/use-workforce";
import {
  addTeamMember, createTeam, fetchAgencyMembers, fetchDepartments, removeTeam,
  removeTeamMember, restoreTeam, setMemberRole, setMemberStatus, setTeamLead, updateTeam,
} from "@/lib/data/agency-teams";
import type { Enums } from "@/lib/supabase/database.types";

const live = (a: ReturnType<typeof useAuth>) => a.mode === "live" && a.status === "signed-in";

export function useDepartments() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["agency", "departments"],
    queryFn: fetchDepartments,
    enabled: live(auth),
    staleTime: 600_000,
  });
}

export function useAgencyMembers() {
  const auth = useAuth();
  const agencyId = auth.agencyId ?? "";
  return useQuery({
    queryKey: ["agency", "members", agencyId],
    queryFn: () => fetchAgencyMembers(agencyId),
    enabled: live(auth) && !!agencyId,
    staleTime: 30_000,
  });
}

/**
 * Every mutation invalidates the WORKFORCE key as well as its own.
 *
 * The roster feeds the assignee pickers, the team cards and the People page;
 * a team renamed here and stale there is how two screens disagree about the
 * same fact within one session.
 */
export function useTeamActions() {
  const qc = useQueryClient();
  const auth = useAuth();
  const agencyId = auth.agencyId ?? "";
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: workforceKey });
    void qc.invalidateQueries({ queryKey: ["agency", "members"] });
  };
  return {
    create: useMutation({
      mutationFn: (v: { name: string; departmentId?: string | null }) =>
        createTeam({ ...v, agencyId }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (v: { id: string; name?: string; departmentId?: string | null }) =>
        updateTeam(v.id, v),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: removeTeam, onSuccess: refresh }),
    restore: useMutation({ mutationFn: restoreTeam, onSuccess: refresh }),
    addMember: useMutation({
      mutationFn: (v: { teamId: string; userId: string; isLead?: boolean }) =>
        addTeamMember(v.teamId, v.userId, v.isLead),
      onSuccess: refresh,
    }),
    setLead: useMutation({
      mutationFn: (v: { teamId: string; userId: string; isLead: boolean }) =>
        setTeamLead(v.teamId, v.userId, v.isLead),
      onSuccess: refresh,
    }),
    removeMember: useMutation({
      mutationFn: (v: { teamId: string; userId: string }) =>
        removeTeamMember(v.teamId, v.userId),
      onSuccess: refresh,
    }),
  };
}

export function useMemberActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: workforceKey });
    void qc.invalidateQueries({ queryKey: ["agency", "members"] });
    void qc.invalidateQueries({ queryKey: ["agency", "access"] });
  };
  return {
    setStatus: useMutation({
      mutationFn: (v: { membershipId: string; status: "active" | "inactive" }) =>
        setMemberStatus(v.membershipId, v.status),
      onSuccess: refresh,
    }),
    setRole: useMutation({
      mutationFn: (v: { membershipId: string; role: Enums<"agency_role"> }) =>
        setMemberRole(v.membershipId, v.role),
      onSuccess: refresh,
    }),
  };
}
