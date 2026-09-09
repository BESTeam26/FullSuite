import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  decideTimeAdjustment,
  fetchTimeAdjustments,
  requestTimeAdjustment,
} from "@/lib/data/time-entries";

const live = (a: ReturnType<typeof useAuth>) =>
  a.mode === "live" && a.status === "signed-in";

export const timeAdjustmentsKey = (scope: "mine" | "pending") =>
  ["time", "adjustments", scope] as const;

/** My own adjustment requests, so an agent can see where each one stands. */
export function useMyTimeAdjustments() {
  const auth = useAuth();
  return useQuery({
    queryKey: timeAdjustmentsKey("mine"),
    queryFn: () => fetchTimeAdjustments("mine"),
    enabled: live(auth),
    staleTime: 15_000,
  });
}

/** The pending queue, for whoever holds management authority. */
export function usePendingTimeAdjustments(enabled: boolean) {
  const auth = useAuth();
  return useQuery({
    queryKey: timeAdjustmentsKey("pending"),
    queryFn: () => fetchTimeAdjustments("pending"),
    enabled: live(auth) && enabled,
    staleTime: 15_000,
  });
}

export function useRequestTimeAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, endedAt, reason }: { entryId: string; endedAt: string; reason: string }) =>
      requestTimeAdjustment(entryId, endedAt, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: timeAdjustmentsKey("mine") });
      void qc.invalidateQueries({ queryKey: timeAdjustmentsKey("pending") });
    },
  });
}

export function useDecideTimeAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, approve, note }: { requestId: string; approve: boolean; note?: string }) =>
      decideTimeAdjustment(requestId, approve, note),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: timeAdjustmentsKey("pending") });
      void qc.invalidateQueries({ queryKey: timeAdjustmentsKey("mine") });
      /* An approval rewrites an entry, so every time view is stale. */
      void qc.invalidateQueries({ queryKey: ["time"] });
    },
  });
}
