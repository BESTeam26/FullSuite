import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchWorkforce } from "@/lib/data/agency-workforce";

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
