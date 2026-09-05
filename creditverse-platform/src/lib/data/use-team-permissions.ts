import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchMemberPermissions, fetchMyPermissions, fetchPermissionKeys, fetchRolePermissions } from "@/lib/data/team-permissions";

export const permissionKeysKey = ["permissions", "keys"] as const;
export const rolePermissionsKey = (orgId: string) => ["permissions", "roles", orgId] as const;
export const memberPermissionsKey = (membershipId: string) => ["permissions", "member", membershipId] as const;
export const myPermissionsKey = (orgId: string) => ["permissions", "mine", orgId] as const;

function useLive() { const auth = useAuth(); return auth.mode === "live" && auth.status === "signed-in"; }

export function usePermissionKeys() { const live = useLive(); return useQuery({ queryKey: permissionKeysKey, queryFn: fetchPermissionKeys, enabled: live, staleTime: 5 * 60_000 }); }
export function useRolePermissions(orgId: string | null) { const live = useLive(); return useQuery({ queryKey: rolePermissionsKey(orgId ?? ""), queryFn: () => fetchRolePermissions(orgId!), enabled: live && !!orgId, staleTime: 60_000 }); }
/** Fetched only for the member page that is open (rule 14). */
export function useMemberPermissions(membershipId: string | null) { const live = useLive(); return useQuery({ queryKey: memberPermissionsKey(membershipId ?? ""), queryFn: () => fetchMemberPermissions(membershipId!), enabled: live && !!membershipId, staleTime: 30_000 }); }
/** The signed-in person's own answers for the active organization — one call, cached for the session. */
export function useMyPermissions(orgId: string | null) { const live = useLive(); return useQuery({ queryKey: myPermissionsKey(orgId ?? ""), queryFn: () => fetchMyPermissions(orgId!), enabled: live && !!orgId, staleTime: 5 * 60_000 }); }

export function useInvalidatePermissions() {
  const qc = useQueryClient();
  return (membershipId?: string, orgId?: string) => {
    if (membershipId) void qc.invalidateQueries({ queryKey: memberPermissionsKey(membershipId) });
    if (orgId) void qc.invalidateQueries({ queryKey: rolePermissionsKey(orgId) });
    void qc.invalidateQueries({ queryKey: ["permissions", "mine"] });
    void qc.invalidateQueries({ queryKey: ["team-members"] });
    void qc.invalidateQueries({ queryKey: ["team-invitations"] });
  };
}
