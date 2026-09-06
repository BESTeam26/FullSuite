import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { advanceDiy, fetchDiyConsents, fetchDiyJourney } from "@/lib/data/diy";
import type { DiyStage } from "@/lib/diy/journey";

export function useDiyJourney(clientId: string | null) {
  return useQuery({
    queryKey: ["diy", "journey", clientId],
    queryFn: () => fetchDiyJourney(clientId!),
    enabled: !!clientId,
    staleTime: 30_000,
  });
}

export function useDiyConsents(clientId: string | null) {
  return useQuery({
    queryKey: ["diy", "consents", clientId],
    queryFn: () => fetchDiyConsents(clientId!),
    enabled: !!clientId,
    staleTime: 60_000,
  });
}

export function useAdvanceDiy(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stage: DiyStage) => advanceDiy(clientId!, stage),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["diy"] }); },
  });
}
