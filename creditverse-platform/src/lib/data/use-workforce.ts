import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchWorkforce } from "@/lib/data/agency-workforce";
import type { AssignedPerson } from "@/lib/fulfillment/ops-client-domain";

export const workforceKey = ["agency", "workforce"] as const;
/**
 * One batch for People, Teams and Workforce; BES staff only by policy (others
 * get empty rows). Callers that only sometimes need it — the mention picker on
 * an agency record — pass `enabled: false` the rest of the time rather than
 * fetching a roster nobody will look at.
 */
export function useWorkforce(options: { enabled?: boolean } = {}) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  return useQuery({
    queryKey: workforceKey,
    queryFn: () => fetchWorkforce(),
    enabled: live && (options.enabled ?? true),
    staleTime: 60_000,
  });
}

/**
 * The people a client file may be assigned to, as identities.
 *
 * "Unassigned" leads, and it is `id: null` — an absence rather than a person
 * by that name, so releasing a file writes nothing to `assigned_agent_id`.
 * Both division client lists and both intake modals read this one list, so
 * the picker on the row and the picker in the modal can never offer different
 * people (rules 2 and 13).
 */
export function useAssignableRoster(): AssignedPerson[] {
  const roster = useWorkforce();
  return useMemo(
    () => [
      { id: null, name: "Unassigned" },
      ...(roster.data?.people ?? [])
        .filter((p) => p.name)
        .map((p) => ({ id: p.userId, name: p.name })),
    ],
    [roster.data],
  );
}
