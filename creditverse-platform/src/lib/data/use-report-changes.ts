import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchReportChanges } from "@/lib/data/report-changes";

export const reportChangesKey = (clientId: string) => ["credit-reports", "changes", clientId] as const;
export function useReportChanges(clientId: string | null) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  return useQuery({ queryKey: reportChangesKey(clientId ?? ""), queryFn: () => fetchReportChanges(clientId!), enabled: live && !!clientId, staleTime: 60_000 });
}
