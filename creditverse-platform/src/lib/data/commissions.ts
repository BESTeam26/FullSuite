/**
 * Commissions, read and settled.
 *
 * Every state change is a database function, never a table write. A commission
 * whose amount or state could be edited from a browser is not a record of what
 * was owed, it is a note somebody could change after the fact.
 *
 * One query for the list, with the deal and the partner joined in — a page
 * showing thirty commissions must not make sixty more requests to name them
 * (rule 14).
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { CommissionState } from "@/lib/commissions/commission-domain";

export interface CommissionListRow {
  id: string;
  dealId: string;
  /** The funded-deal record, which is what revenue is confirmed against. */
  fundedDealId: string | null;
  partyName: string;
  state: CommissionState;
  computedAmount: number;
  basis: "pct" | "flat";
  rateOrAmount: number;
  basisAmount: number | null;
  fundedAt: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  /** Whether the organization has confirmed the money on this deal arrived. */
  revenueConfirmed: boolean;
}

export async function fetchCommissions(): Promise<CommissionListRow[]> {
  const sb = requireSupabase();
  /* One call. `party_id` has no foreign key on purpose — party_kind decides
     what it points at — so the join is done in SQL rather than by asking for
     each party's name separately (rule 14). */
  const { data, error } = await sb.rpc("commission_list");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    dealId: c.deal_id,
    fundedDealId: c.funded_deal_id,
    partyName: c.party_name,
    state: c.state as CommissionState,
    computedAmount: Number(c.computed_amount ?? 0),
    basis: c.basis as "pct" | "flat",
    rateOrAmount: Number(c.rate_or_amount ?? 0),
    basisAmount: c.basis_amount === null ? null : Number(c.basis_amount),
    fundedAt: c.funded_at,
    paidAt: c.paid_at,
    paymentReference: c.payment_reference,
    revenueConfirmed: c.revenue_confirmed ?? false,
  }));
}

/** Releases every earned commission on the deal. Administrators only. */
export async function confirmDealRevenue(fundedDealId: string, amount: number): Promise<number> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("confirm_deal_revenue", { p_funded_deal: fundedDealId, p_amount: amount });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function markCommissionPaid(commissionId: string, reference: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("mark_commission_paid", { p_commission: commissionId, p_reference: reference });
  if (error) throw error;
}

export async function reverseCommission(commissionId: string, reason: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("reverse_commission", { p_commission: commissionId, p_reason: reason });
  if (error) throw error;
}
