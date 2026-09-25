/**
 * How many files are in each CreditOps queue.
 *
 * Dee, 2026-09-25: "I don't see the numbers on here." A queue name without a
 * number tells an agent nothing about where to start.
 *
 * ── THE NUMBER IS WORK, NOT FILES ─────────────────────────────────────────
 *
 * ACTIONABLE only. Dee's queue doctrine is explicit that a round in the post
 * and a file awaiting a client are not work — "Round 8 Sent is waiting
 * externally, NOT completed" — and a badge counting those sends somebody to
 * start on something they cannot touch. The waiting count comes back too, for
 * anywhere that wants to say "and 20 waiting", but it is never the badge.
 *
 * Counted in the database, five rows over the wire, because the sidebar is on
 * every CreditOps screen and fetching every open file to count it in the
 * browser is the rule-14 waterfall.
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

export interface QueueCount {
  department: string;
  actionable: number;
  waiting: number;
}

export const queueCountsKey = ["creditops", "queue-counts"];

export function useQueueCounts() {
  const auth = useAuth();
  return useQuery({
    queryKey: queueCountsKey,
    enabled: auth.mode === "live" && auth.status === "signed-in",
    /* A minute: the sidebar is on every screen, and a count that is thirty
       seconds stale has never cost anybody anything. */
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, QueueCount>> => {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("creditops_queue_counts" as never);
      if (error) throw error;
      const out: Record<string, QueueCount> = {};
      for (const r of (data as unknown as QueueCount[]) ?? []) out[r.department] = r;
      return out;
    },
  });
}
