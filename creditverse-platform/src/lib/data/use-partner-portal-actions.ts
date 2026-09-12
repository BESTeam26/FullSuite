/**
 * What BES is waiting on this partner for, and what they have been told.
 *
 * Both read definer functions gated on `partner_group_of_user()` — the same
 * boundary as their clients and their files, which now also requires the
 * partner's portal switch to be on. A partner cannot reach another partner's
 * actions by guessing an id, because the function never takes one.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { requireSupabase } from "@/lib/supabase/client";

/**
 * The kinds that are a REVIEW rather than a confirmation.
 *
 * A CreditOps confirmation has one answer — yes — and returns the client to
 * the workflow step that asked. A marketing approval has two, and "change
 * this" is the one that matters: without it a partner can only stall, and the
 * work never comes back to the person who made it.
 */
export const REVIEW_KINDS = ["content_approval", "campaign_approval"] as const;
export const isReview = (kind: string): boolean =>
  (REVIEW_KINDS as readonly string[]).includes(kind);

export interface PartnerActionItem {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  status: "open" | "completed" | "cancelled" | "changes_requested";
  clientName: string | null;
  requestedByName: string | null;
  requestedAt: string;
  respondedAt: string | null;
  response: string | null;
}

export interface PartnerUpdate {
  id: number;
  happenedAt: string;
  clientName: string;
  action: string;
  detail: string | null;
}

export function useMyPartnerActions() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["portal", "partner", "actions"],
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 30_000,
    queryFn: async (): Promise<PartnerActionItem[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("my_partner_actions");
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        kind: r.kind as string,
        title: r.title as string,
        detail: (r.detail as string) ?? null,
        status: r.status as PartnerActionItem["status"],
        clientName: (r.client_name as string) ?? null,
        requestedByName: (r.requested_by_name as string) ?? null,
        requestedAt: r.requested_at as string,
        respondedAt: (r.responded_at as string) ?? null,
        response: (r.response as string) ?? null,
      }));
    },
  });
}

export function useMyPartnerUpdates(limit = 12) {
  const auth = useAuth();
  return useQuery({
    queryKey: ["portal", "partner", "updates", limit],
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 60_000,
    queryFn: async (): Promise<PartnerUpdate[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("my_partner_updates", { p_limit: limit });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as number,
        happenedAt: r.happened_at as string,
        clientName: r.client_name as string,
        action: r.action as string,
        detail: (r.detail as string) ?? null,
      }));
    },
  });
}

/**
 * Approving a piece of marketing work, or asking for changes.
 *
 * A separate call from `my_partner_action_respond` because it is a separate
 * act: that one confirms a CreditOps step and returns the client to the
 * workflow that asked, while this one either completes the work or sends it
 * back to In Progress with the partner's comment attached. Answering a
 * marketing approval through the CreditOps path would mark it done and move
 * nothing — half the job, silently.
 */
export function useMyPartnerReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, approved, comment }: { id: string; approved: boolean; comment: string }) => {
      const sb = requireSupabase();
      const { error } = await sb.rpc("my_partner_review", {
        p_action: id,
        p_approved: approved,
        p_comment: comment.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["portal", "partner"] });
    },
  });
}

/**
 * Answering. The database moves the client to the next step itself — which
 * step is a row in `creditops_status_routing`, not a decision this screen
 * makes.
 */
export function useRespondToPartnerAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, response }: { id: string; response: string }) => {
      const sb = requireSupabase();
      const { error } = await sb.rpc("my_partner_action_respond", {
        p_action: id,
        p_response: response.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["portal", "partner"] });
    },
  });
}
