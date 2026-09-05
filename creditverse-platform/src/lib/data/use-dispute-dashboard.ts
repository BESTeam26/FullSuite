import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchDisputeSignals } from "@/lib/data/dispute-dashboard";

/** Under "creditops" so letter and client writes (which invalidate that prefix) refresh the dashboard. */
export const disputeSignalsKey = ["creditops", "dispute-signals"] as const;
export function useDisputeSignals() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  return useQuery({ queryKey: disputeSignalsKey, queryFn: fetchDisputeSignals, enabled: live, staleTime: 30_000 });
}
