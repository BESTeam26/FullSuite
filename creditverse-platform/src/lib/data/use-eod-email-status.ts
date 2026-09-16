/**
 * What happened to the email for one EOD report.
 *
 * Dee, 2026-09-16: *"Email failure must NOT undo a valid EOD submission.
 * Instead show: EOD submitted · Email delivery failed and allow authorized
 * retry."*
 *
 * Both halves are decided in `my_eod_email_status` and `retry_eod_email`, not
 * here — including that the author sees WHETHER it went but not the provider's
 * words, and the lead's NAME rather than their address.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";

export interface EodEmailStatus {
  state: "pending" | "sent" | "failed" | "unavailable";
  attempts: number;
  sentAt: string | null;
  /** Only ever populated for somebody who can act on it. */
  lastError: string | null;
  recipient: string | null;
  mayRetry: boolean;
}

export const emailStatusKey = (eodId: string) => ["eod", "email", eodId] as const;

export function useEodEmailStatus(eodId: string | null) {
  return useQuery({
    queryKey: emailStatusKey(eodId ?? ""),
    enabled: !!eodId,
    staleTime: 20_000,
    queryFn: async (): Promise<EodEmailStatus | null> => {
      const { data, error } = await requireSupabase()
        .rpc("my_eod_email_status", { p_eod: eodId! });
      if (error) throw error;
      const r = (data ?? [])[0] as Record<string, unknown> | undefined;
      if (!r) return null;
      return {
        state: r.state as EodEmailStatus["state"],
        attempts: Number(r.attempts ?? 0),
        sentAt: (r.sent_at as string) ?? null,
        lastError: (r.last_error as string) ?? null,
        recipient: (r.recipient as string) ?? null,
        mayRetry: r.may_retry === true,
      };
    },
  });
}

export function useRetryEodEmail(eodId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await requireSupabase().rpc("retry_eod_email", { p_eod: eodId! });
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: emailStatusKey(eodId ?? "") }); },
  });
}
