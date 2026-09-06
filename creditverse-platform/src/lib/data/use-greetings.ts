/**
 * Birthday greetings for the organization in view. The lists load only when
 * the organization has switched the greeting on, so an organization that does
 * not use it makes no extra request.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  fetchAgencyBirthdays,
  fetchClientBirthdays,
  fetchOrganizationAutomations,
  fetchTeamBirthdays,
  setOrganizationAutomation,
  type AutomationKey,
} from "@/lib/data/greetings";

export const automationsKey = (orgId: string | null) => ["automations", orgId] as const;
export const teamBirthdaysKey = (orgId: string | null) => ["greetings", "team", orgId] as const;
export const clientBirthdaysKey = (orgId: string | null) => ["greetings", "clients", orgId] as const;

function useLive() {
  const auth = useAuth();
  return auth.mode === "live" && auth.status === "signed-in";
}

export function useOrganizationAutomations(organizationId: string | null) {
  const live = useLive();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: automationsKey(organizationId),
    queryFn: () => fetchOrganizationAutomations(organizationId!),
    enabled: live && !!organizationId,
    staleTime: 5 * 60_000,
  });
  const isOn = (key: AutomationKey) => (q.data ?? []).some((a) => a.key === key && a.enabled);
  return {
    live,
    automations: q.data ?? [],
    isOn,
    isLoading: live && !!organizationId && q.isLoading,
    error: (q.error as Error | null)?.message ?? null,
    set: useMutation({
      mutationFn: (v: { key: AutomationKey; enabled: boolean }) => setOrganizationAutomation(organizationId!, v.key, v.enabled),
      onSuccess: () => void qc.invalidateQueries({ queryKey: automationsKey(organizationId) }),
    }),
  };
}

export function useTeamBirthdays(organizationId: string | null, enabled: boolean, withinDays = 14) {
  const live = useLive();
  return useQuery({
    queryKey: teamBirthdaysKey(organizationId),
    queryFn: () => fetchTeamBirthdays(organizationId!, withinDays),
    enabled: live && !!organizationId && enabled,
    staleTime: 30 * 60_000,
  });
}

export function useClientBirthdays(organizationId: string | null, enabled: boolean, withinDays = 14) {
  const live = useLive();
  return useQuery({
    queryKey: clientBirthdaysKey(organizationId),
    queryFn: () => fetchClientBirthdays(organizationId!, withinDays),
    enabled: live && !!organizationId && enabled,
    staleTime: 30 * 60_000,
  });
}

/** BES staff birthdays for the HQ home. Runs only for agency staff. */
export function useAgencyBirthdays(withinDays = 14) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in" && auth.isAgencyStaff;
  return useQuery({
    queryKey: ["greetings", "agency"],
    queryFn: () => fetchAgencyBirthdays(withinDays),
    enabled: live,
    staleTime: 30 * 60_000,
  });
}
