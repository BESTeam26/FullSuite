import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchAiCredits } from "@/lib/data/ai-credits";

export const aiCreditsKey = (orgId: string, since: string) => ["ai-credits", orgId, since] as const;
export function useAiCredits(orgId: string | null, sinceIso: string) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  return useQuery({ queryKey: aiCreditsKey(orgId ?? "", sinceIso), queryFn: () => fetchAiCredits(orgId!, sinceIso), enabled: live && !!orgId, staleTime: 30_000 });
}
export function useInvalidateAiCredits() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ["ai-credits"] });
}
