import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchWorkforce } from "@/lib/data/agency-workforce";

export const workforceKey = ["agency", "workforce"] as const;
/** One batch for People, Teams and Workforce; BES staff only by policy (others get empty rows). */
export function useWorkforce() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  return useQuery({ queryKey: workforceKey, queryFn: () => fetchWorkforce(), enabled: live, staleTime: 60_000 });
}
