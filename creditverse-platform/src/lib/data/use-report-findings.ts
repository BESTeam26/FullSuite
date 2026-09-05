import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchClientFindings } from "@/lib/data/report-findings";

/** Under "creditops" so the Dispute Dashboard's signals refresh with it. */
export const clientFindingsKey = (clientId: string) => ["creditops", "report-findings", clientId] as const;

export function useClientFindings(clientId: string | null) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  return useQuery({ queryKey: clientFindingsKey(clientId ?? ""), queryFn: () => fetchClientFindings(clientId!), enabled: live && !!clientId, staleTime: 30_000 });
}
export function useInvalidateFindings() {
  const qc = useQueryClient();
  return (clientId: string) => {
    void qc.invalidateQueries({ queryKey: clientFindingsKey(clientId) });
    void qc.invalidateQueries({ queryKey: ["creditops", "dispute-signals"] });
  };
}
