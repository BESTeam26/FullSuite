import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchReportingSignals } from "@/lib/data/reporting";

export const reportingKey = (since: string) => ["reporting", "signals", since] as const;
export function useReportingSignals(sinceIso: string) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  return useQuery({ queryKey: reportingKey(sinceIso), queryFn: () => fetchReportingSignals(sinceIso), enabled: live, staleTime: 60_000 });
}
