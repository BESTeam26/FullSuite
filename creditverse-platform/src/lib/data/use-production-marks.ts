/** One person's production logs in a range — dates and actions, for the profile's period facts. */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchProductionMarks } from "@/lib/data/production";

export function useProductionMarks(userId: string | null, from: string, to: string) {
  const auth = useAuth();
  return useQuery({
    queryKey: ["production", "marks", userId ?? "", from, to],
    queryFn: () => fetchProductionMarks(userId!, from, to),
    enabled: auth.mode === "live" && auth.status === "signed-in" && !!userId,
    staleTime: 60_000,
  });
}
