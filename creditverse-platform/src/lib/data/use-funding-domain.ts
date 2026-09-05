import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchFundingFileDomain, fetchFundingQueueSignals, fetchLenderCatalogue, fetchLenderOutcomes } from "@/lib/data/funding-domain";

export const fundingFileDomainKey = (fileId: string) => ["fundingops", "file-domain", fileId] as const;
export const lenderCatalogueKey = ["fundingops", "lender-catalogue"] as const;

/** Everything the deal-detail tabs show for one funding file, in one batched request. */
export function useFundingFileDomain(fileId: string | null) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  return useQuery({
    queryKey: fundingFileDomainKey(fileId ?? ""),
    queryFn: () => fetchFundingFileDomain(fileId!),
    enabled: live && !!fileId,
    staleTime: 15_000,
  });
}

export function useLenderCatalogue(enabled = true) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  return useQuery({ queryKey: lenderCatalogueKey, queryFn: fetchLenderCatalogue, enabled: live && enabled, staleTime: 60_000 });
}

export const lenderOutcomesKey = ["fundingops", "lender-outcomes"] as const;
export function useLenderOutcomes(enabled = true) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  return useQuery({ queryKey: lenderOutcomesKey, queryFn: fetchLenderOutcomes, enabled: live && enabled, staleTime: 60_000 });
}

/** After a write: the file's domain, the activity timeline, and the deal lists that read funding_deals. */
export function useInvalidateFundingFile() {
  const qc = useQueryClient();
  return (fileId: string) => {
    void qc.invalidateQueries({ queryKey: fundingFileDomainKey(fileId) });
    void qc.invalidateQueries({ queryKey: ["activity"] });
    void qc.invalidateQueries({ queryKey: ["fundingops"] });
  };
}

export const fundingQueueSignalsKey = ["fundingops", "queue-signals"] as const;
export function useFundingQueueSignals() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  return useQuery({ queryKey: fundingQueueSignalsKey, queryFn: fetchFundingQueueSignals, enabled: live, staleTime: 30_000 });
}
