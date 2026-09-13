/**
 * One call for everything the Partner Portal's shell needs before it draws.
 *
 * The navigation adapts to the partner — what they have bought, what they owe,
 * whether they are suspended — and asking that as six separate questions would
 * be six round trips before the first paint (rule 14). It is one, cached, and
 * every page reads the same cached answer rather than asking again.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { requireSupabase } from "@/lib/supabase/client";
import type { PortalSummary } from "@/lib/portal/portal-nav";

export const portalSummaryKey = ["portal", "summary"] as const;

export function usePortalSummary() {
  const auth = useAuth();
  return useQuery({
    queryKey: portalSummaryKey,
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 30_000,
    queryFn: async (): Promise<PortalSummary | null> => {
      const { data, error } = await requireSupabase().rpc("my_partner_portal_summary" as never);
      if (error) throw error;
      const r = (data as Record<string, unknown>[] | null)?.[0];
      if (!r) return null;
      return {
        groupId: r.group_id as string,
        partnerName: r.partner_name as string,
        suspended: r.suspended === true,
        activeClients: Number(r.active_clients ?? 0),
        actionsNeeded: Number(r.actions_needed ?? 0),
        activeServices: Number(r.active_services ?? 0),
        unreadMessages: Number(r.unread_messages ?? 0),
        balanceCents: Number(r.balance_cents ?? 0),
        overdueInvoices: Number(r.overdue_invoices ?? 0),
        hasAgreements: r.has_agreements === true,
        hasAccountCredit: r.has_account_credit === true,
        hasProcessingCredits: r.has_processing_credits === true,
        hasReferrals: r.has_referrals === true,
      };
    },
  });
}
