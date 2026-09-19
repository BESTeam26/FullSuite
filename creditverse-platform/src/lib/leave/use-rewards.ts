import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { electBirthdayReward, fetchRewardCredits } from "@/lib/data/reward-credits";

export function useMyRewards() {
  const auth = useAuth();
  const userId = auth.user?.id ?? "";
  return useQuery({
    queryKey: ["rewards", "mine", userId],
    queryFn: () => fetchRewardCredits(userId),
    enabled: !!userId && auth.mode === "live" && auth.status === "signed-in",
    staleTime: 60_000,
  });
}

export function useElectBirthday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { creditId: string; election: "paid_day" | "work_premium" }) =>
      electBirthdayReward(v.creditId, v.election),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rewards"] });
      void qc.invalidateQueries({ queryKey: ["people", "leave"] });
    },
  });
}
