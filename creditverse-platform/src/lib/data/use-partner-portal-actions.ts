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

export interface PartnerActionItem {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  status: "open" | "completed" | "cancelled";
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
