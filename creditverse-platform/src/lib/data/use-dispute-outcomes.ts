import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchDisputeOutcomes, recordDisputeOutcome } from "@/lib/data/dispute-outcomes";

export const disputeOutcomesKey = (clientId: string) => ["credit-reports", "outcomes", clientId] as const;

export function useDisputeOutcomes(clientId: string | null) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  return useQuery({
    queryKey: disputeOutcomesKey(clientId ?? ""),
    queryFn: () => fetchDisputeOutcomes(clientId!),
    enabled: live && !!clientId,
    staleTime: 60_000,
  });
}

export function useRecordDisputeOutcome(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Parameters<typeof recordDisputeOutcome>[0], "clientId">) =>
      recordDisputeOutcome({ ...input, clientId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: disputeOutcomesKey(clientId) }),
  });
}
