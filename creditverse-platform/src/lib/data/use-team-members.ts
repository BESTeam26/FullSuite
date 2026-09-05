import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const invite = useMutation({ mutationFn: createInvitation, onSuccess: refresh });
  const cancel = useMutation({ mutationFn: cancelInvitation, onSuccess: refresh });
  return {
    live,
    members: members.data ?? [],
    invitations: invitations.data ?? [],
    isLoading: live && !!organizationId && (members.isLoading || invitations.isLoading),
    error: (members.error as Error | null)?.message ?? (invitations.error as Error | null)?.message ?? null,
    update, remove, invite, cancel,
  };
}
