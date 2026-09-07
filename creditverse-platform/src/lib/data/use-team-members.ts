import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { setMemberArchived } from "@/lib/data/seats";
import { useAuth } from "@/lib/auth/auth-context";
import { cancelInvitation, createInvitation, fetchPendingInvitations, fetchTeamMembers, removeTeamMember, updateTeamMember } from "@/lib/data/team-members";

export const teamMembersKey = (orgId: string | null) => ["team-members", orgId] as const;
export const invitationsKey = (orgId: string | null) => ["team-invitations", orgId] as const;

export function useTeamMembers(organizationId: string | null) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const qc = useQueryClient();
  const members = useQuery({ queryKey: teamMembersKey(organizationId), queryFn: () => fetchTeamMembers(organizationId!), enabled: live && !!organizationId, staleTime: 30_000 });
  const invitations = useQuery({ queryKey: invitationsKey(organizationId), queryFn: () => fetchPendingInvitations(organizationId!), enabled: live && !!organizationId, staleTime: 30_000 });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: teamMembersKey(organizationId) });
    void qc.invalidateQueries({ queryKey: invitationsKey(organizationId) });
    void qc.invalidateQueries({ queryKey: ["org-members", organizationId] });
  };
  const update = useMutation({ mutationFn: (v: Parameters<typeof updateTeamMember>) => updateTeamMember(...v), onSuccess: refresh });
  const remove = useMutation({ mutationFn: removeTeamMember, onSuccess: refresh });
  /* Deactivate / reactivate. Not a delete and not a role change: the person
     keeps every attribution, and the seat is freed (0127/0128). Reactivating
     takes a seat back and the database refuses it when the plan is full. */
  const setActive = useMutation({
    mutationFn: (v: { membershipId: string; active: boolean }) => setMemberArchived(v.membershipId, !v.active),
    onSuccess: () => { refresh(); void qc.invalidateQueries({ queryKey: ["seats"] }); },
  });
  const invite = useMutation({ mutationFn: createInvitation, onSuccess: refresh });
  const cancel = useMutation({ mutationFn: cancelInvitation, onSuccess: refresh });
  return {
    live,
    members: members.data ?? [],
    invitations: invitations.data ?? [],
    isLoading: live && !!organizationId && (members.isLoading || invitations.isLoading),
    error: (members.error as Error | null)?.message ?? (invitations.error as Error | null)?.message ?? null,
    update, remove, invite, cancel, setActive,
  };
}
