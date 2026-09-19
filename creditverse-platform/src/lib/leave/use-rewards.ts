import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  electBirthdayReward, fetchRewardCredits, grantAttendanceReward,
} from "@/lib/data/reward-credits";

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

/** Every reward the caller may see — their own, or their team's. */
export function useTeamRewards() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["rewards", "visible"],
    queryFn: () => fetchRewardCredits(),
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 60_000,
  });
}

export function useGrantAttendanceReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; quarter: string; note?: string }) =>
      grantAttendanceReward(v.userId, v.quarter, v.note),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rewards"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
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
