/**
 * What a client can see of their own file.
 *
 * Every read here goes through row-level security as the signed-in client, so
 * this module cannot show more than the database already allows. That is the
 * point: the portal is a VIEW on the canonical client record (C3), not a
 * second identity with its own rules. If a query here were wrong, the worst it
 * could do is show the client less than they are entitled to.
 *
 * Nothing in this file filters for privacy. The four activity visibilities do
 * that, and they do it on the row: a client reads `client_visible` and nothing
 * else. An internal note is not hidden by a condition in TypeScript — it never
 * arrives.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface PortalHome {
  clientId: string;
  publicId: string;
  fullName: string;
  organizationName: string | null;
  hasCreditOps: boolean;
  creditStatus: string | null;
  creditRound: string | null;
  hasFundingOps: boolean;
  fundingStatus: string | null;
  openFundingFiles: number;
  openDocumentRequests: number;
  presentedOffers: number;
  publishedUpdates: number;
}

/** One round trip. A phone on a bad connection should not make eight (rule 14). */
export async function fetchPortalHome(): Promise<PortalHome | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("client_portal_home").maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    clientId: data.client_id,
    publicId: data.public_id,
    fullName: data.full_name,
    organizationName: data.organization_name,
    hasCreditOps: data.has_creditops ?? false,
    creditStatus: data.credit_status,
    creditRound: data.credit_round,
    hasFundingOps: data.has_fundingops ?? false,
    fundingStatus: data.funding_status,
    openFundingFiles: data.open_funding_files ?? 0,
    openDocumentRequests: data.open_document_requests ?? 0,
    presentedOffers: data.presented_offers ?? 0,
    publishedUpdates: data.published_updates ?? 0,
  };
}

export interface PortalUpdate {
  id: number;
  action: string;
  detail: string | null;
  at: string;
}

/** Published updates only. The visibility filter is the database's, not ours. */
export async function fetchPortalUpdates(limit = 40): Promise<PortalUpdate[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("activity_events")
    .select("id, action, detail, created_at")
    .eq("visibility", "client_visible")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, action: r.action, detail: r.detail, at: r.created_at }));
}

export interface PortalDocumentRequest {
  id: string;
  documentType: string;
  period: string | null;
  requirement: string;
  status: string;
  requestedAt: string;
}

export async function fetchDocumentRequests(): Promise<PortalDocumentRequest[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("document_requests")
    .select("id, document_type, period, requirement, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, documentType: r.document_type, period: r.period,
    requirement: r.requirement, status: r.status, requestedAt: r.created_at,
  }));
}

export interface PortalOffer {
  id: string;
  amount: number | null;
  termText: string | null;
  paymentAmount: number | null;
  paymentFrequency: string | null;
  expiresAt: string | null;
  status: string;
  presentedAt: string | null;
}

/**
 * Offers a person chose to put in front of this client.
 *
 * `presented_at` is the switch, enforced in the policy. An offer still being
 * negotiated, or one the organization decided not to forward, never arrives —
 * which is why there is no filter for it here.
 */
export async function fetchPresentedOffers(): Promise<PortalOffer[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("offers")
    .select("id, offer_amount, term_text, payment_amount, payment_frequency, expires_at, status, presented_at")
    .order("presented_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, amount: r.offer_amount, termText: r.term_text,
    paymentAmount: r.payment_amount, paymentFrequency: r.payment_frequency,
    expiresAt: r.expires_at, status: r.status, presentedAt: r.presented_at,
  }));
}
