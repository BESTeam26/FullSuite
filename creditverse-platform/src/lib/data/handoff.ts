/**
 * CreditOps ⇄ FundingOps hand-off — data access. Both moves are one database
 * function each (SECURITY INVOKER): the caller must already be allowed to
 * write both records; the function guarantees the link, the status change and
 * the activity on both sides happen together or not at all.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface LinkedFundingClient {
  id: string;
  name: string;
  status: string;
  fulfillmentClientId: string | null;
}

/** The funding client linked to a CreditOps client, if any (RLS-scoped). */
export async function fetchLinkedFundingClient(fulfillmentClientId: string): Promise<LinkedFundingClient | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("funding_clients")
    .select("id, name, status, fulfillment_client_id")
    .eq("fulfillment_client_id", fulfillmentClientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, name: data.name, status: data.status, fulfillmentClientId: data.fulfillment_client_id } : null;
}

/** Send a funding client to CreditOps for funding readiness; returns the CreditOps client id. */
export async function handoffToCreditOps(fundingClientId: string, existingFulfillmentClientId?: string | null): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("handoff_to_creditops", {
    p_funding_client: fundingClientId,
    p_existing_client: existingFulfillmentClientId ?? null,
  });
  if (error) throw error;
  return data as string;
}

/** Return a qualified client to FundingOps; returns the funding client id. */
export async function handoffToFundingOps(fulfillmentClientId: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("handoff_to_fundingops", { p_fulfillment_client: fulfillmentClientId });
  if (error) throw error;
  return data as string;
}
