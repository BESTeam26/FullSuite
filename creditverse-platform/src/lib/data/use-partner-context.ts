/**
 * Context for the panel beside a partner conversation.
 *
 * Both rules that matter live in `partner_conversation_context`, not here: it
 * refuses unless the caller is BES staff who may already see that partner, and
 * it returns the balance as NULL unless they hold `partners.invoices.view`.
 * This hook only shapes the answer — `balanceVisible` is carried through so the
 * panel can say "Not available" rather than print a zero nobody established.
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";

export interface PartnerContext {
  partnerName: string;
  lifecycle: string | null;
  primaryContact: string | null;
  services: string[];
  assignedTeam: string[];
  openActions: number;
  activeClients: number;
  balanceCents: number | null;
  balanceVisible: boolean;
}

export function usePartnerContext(groupId: string | null) {
  return useQuery({
    queryKey: ["communication", "partner-context", groupId ?? ""],
    enabled: !!groupId,
    staleTime: 60_000,
    queryFn: async (): Promise<PartnerContext | null> => {
      const { data, error } = await requireSupabase()
        .rpc("partner_conversation_context", { p_group: groupId! });
      if (error) throw error;
      const r = (data ?? [])[0] as Record<string, unknown> | undefined;
      if (!r) return null;
      return {
        partnerName: r.partner_name as string,
        lifecycle: (r.lifecycle as string) ?? null,
        primaryContact: (r.primary_contact as string) ?? null,
        services: (r.services as string[]) ?? [],
        assignedTeam: (r.assigned_team as string[]) ?? [],
        openActions: Number(r.open_actions ?? 0),
        activeClients: Number(r.active_clients ?? 0),
        balanceCents: r.balance_cents === null || r.balance_cents === undefined
          ? null : Number(r.balance_cents),
        balanceVisible: r.balance_visible === true,
      };
    },
  });
}
