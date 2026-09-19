/**
 * The reward exceptions a lead should act on.
 *
 * Dee, 2026-09-19, asked for these in the Attention Center. That surface is
 * built around WORK ITEMS — its rows carry a stage and hours-remaining — so
 * widening it is its own change. The data is ready for either home; for now it
 * is read where leads already operate the policy.
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

export interface RewardException {
  kind: "missing_birthday" | "birthday_not_granted" | "reward_needs_review" | "reward_expiring";
  userId: string;
  person: string;
  detail: string;
  creditId: string | null;
  severity: "info" | "warning" | "danger";
}

export const EXCEPTION_TITLE: Record<RewardException["kind"], string> = {
  missing_birthday: "No birthday on file",
  birthday_not_granted: "Birthday Reward not granted",
  reward_needs_review: "Reward needs review",
  reward_expiring: "Reward expiring soon",
};

export function useRewardExceptions() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["rewards", "exceptions"],
    queryFn: async (): Promise<RewardException[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("reward_exceptions" as never);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        kind: r.kind as RewardException["kind"],
        userId: r.user_id as string,
        person: (r.person as string) ?? "Someone",
        detail: (r.detail as string) ?? "",
        creditId: (r.credit_id as string) ?? null,
        severity: (r.severity as RewardException["severity"]) ?? "info",
      }));
    },
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 60_000,
  });
}
