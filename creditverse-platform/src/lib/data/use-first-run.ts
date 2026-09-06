import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchMemberFirstRun, fetchOrganizationFirstRun } from "@/lib/data/first-run";

/**
 * Kept fresh enough to notice a step being finished in another tab, but not so
 * fresh that walking between Home and Settings re-asks every time.
 */
const STALE = 60_000;

export function useOrganizationFirstRun(organizationId: string | null) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  return useQuery({
    queryKey: ["first-run", "organization", organizationId],
    queryFn: () => fetchOrganizationFirstRun(organizationId!),
    enabled: live && !!organizationId,
    staleTime: STALE,
  });
}

export function useMemberFirstRun(enabled: boolean) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  return useQuery({
    queryKey: ["first-run", "member", auth.user?.id ?? null],
    queryFn: fetchMemberFirstRun,
    enabled: live && enabled,
    staleTime: STALE,
  });
}
