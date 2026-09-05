/**
 * Cross-file record lists for the Deals surface — Submissions, Offers, Funded
 * Deals, Commissions, Renewals. Each list is one bounded query over the
 * canonical table (rule 2); RLS scopes the rows. A tab fetches only when it is
 * open (rule 14). These are records, not queues: the Workspace's queue views
 * read the same rows and add "who does what next".
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";
import type { PricingType, RawOfferTerms } from "@/lib/funding/offer-math";
import type { FitSnapshot } from "@/lib/funding/readiness-engine";

/** The file a record belongs to: borrower first, then business (Dee). */
export interface RecordFileRef { fileId: string; publicId: string | null; clientName: string | null; businessName: string | null; purpose: string | null }

export interface SubmissionRecord {
  id: string;
  file: RecordFileRef;
  lender: string;
  program: string | null;
  amount: number;
  status: Enums<"funding_deal_status">;
  submittedAt: string | null;
  fundedAt: string | null;
  /** The policy the submission was judged against, and the Program Fit at that moment — null for submissions recorded before 0061. */
  policyVersion: number | null;
  fitOutcome: FitSnapshot["outcome"] | null;
  latestDecision: { decision: Enums<"lender_decision_kind">; decidedAt: string; reasonCategory: Enums<"decline_reason_category"> | null } | null;
}
export interface OfferRecord {
  id: string;
  file: RecordFileRef;
  lender: string;
  program: string | null;
  receivedAt: string;
  status: Enums<"offer_status">;
  raw: RawOfferTerms;
  expiresAt: string | null;
  presentedAt: string | null;
  clientDecidedAt: string | null;
}
export interface FundedDealRecord {
  id: string;
  file: RecordFileRef;
  lenderName: string;
  requestedAmount: number;
  acceptedOfferAmount: number | null;
  grossFunded: number;
  netFunded: number;
  fundedAt: string;
  disbursementReference: string | null;
  renewal: { id: string; status: Enums<"renewal_status">; potentialRenewalDate: string | null } | null;
}
export interface CommissionRecord {
  id: string;
  dealId: string;
  file: RecordFileRef;
  lender: string | null;
  dealAmount: number | null;
  partyKind: string;
  partyId: string;
  basis: string;
  rateOrAmount: number;
  computedAmount: number | null;
  state: string;
  fundedAt: string | null;
  paidAt: string | null;
  note: string | null;
}
export interface RenewalRecord {
  id: string;
  file: RecordFileRef;
  lenderName: string | null;
  grossFunded: number | null;
  fundedAt: string | null;
  potentialRenewalDate: string | null;
  status: Enums<"renewal_status">;
  nextFollowUpAt: string | null;
  newFileId: string | null;
}

const LIMIT = 500;
type FileJoin = { public_id: string | null; purpose?: string | null; funding_clients: { name: string } | null; funding_businesses?: { legal_name: string } | null } | null;
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const fileRef = (fileId: string, f: FileJoin): RecordFileRef => ({
  fileId, publicId: f?.public_id ?? null, clientName: f?.funding_clients?.name ?? null, businessName: f?.funding_businesses?.legal_name ?? null, purpose: f?.purpose ?? null,
});
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const FILE = "funding_files(public_id, purpose, funding_clients(name), funding_businesses(legal_name))";
/** renewal_opportunities points at funding_files twice (file_id, new_file_id) — the hint picks the owning file. */
const FILE_BY_FILE_ID = "funding_files!file_id(public_id, purpose, funding_clients(name), funding_businesses(legal_name))";

export async function fetchSubmissionRecords(): Promise<SubmissionRecord[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("funding_deals")
    .select(`id, file_id, lender, program, amount, status, submitted_at, funded_at, fit_snapshot, lender_policy_versions(version), lender_decisions(decision, decided_at, reason_category), ${FILE}`)
    .neq("status", "Draft")
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(LIMIT);
  if (error) throw error;
  return (data ?? []).map((d) => {
    const decisions = [...(d.lender_decisions ?? [])].sort((a, b) => b.decided_at.localeCompare(a.decided_at));
    const latest = decisions[0];
    const snap = d.fit_snapshot && typeof d.fit_snapshot === "object" && !Array.isArray(d.fit_snapshot) ? (d.fit_snapshot as Partial<FitSnapshot>) : null;
    return {
      id: d.id, file: fileRef(d.file_id, d.funding_files as FileJoin), lender: d.lender, program: d.program, amount: Number(d.amount), status: d.status,
      submittedAt: d.submitted_at, fundedAt: d.funded_at, policyVersion: one(d.lender_policy_versions)?.version ?? null, fitOutcome: snap?.outcome ?? null,
      latestDecision: latest ? { decision: latest.decision, decidedAt: latest.decided_at, reasonCategory: latest.reason_category } : null,
    };
  });
}

export async function fetchOfferRecords(): Promise<OfferRecord[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("offers")
    .select(`id, file_id, received_at, offer_amount, pricing_type, pricing_value, term_text, payment_frequency, payment_amount, origination_fee, other_fees, expires_at, status, presented_at, client_decided_at, funding_deals(lender, program), ${FILE}`)
    .order("received_at", { ascending: false })
    .limit(LIMIT);
  if (error) throw error;
  return (data ?? []).map((o) => {
    const deal = one(o.funding_deals);
    const fees = Array.isArray(o.other_fees) ? (o.other_fees as { label?: unknown; amount?: unknown }[]).filter((f) => typeof f.amount === "number").map((f) => ({ label: String(f.label ?? "Fee"), amount: f.amount as number })) : [];
    return {
      id: o.id, file: fileRef(o.file_id, o.funding_files as FileJoin), lender: deal?.lender ?? "—", program: deal?.program ?? null, receivedAt: o.received_at, status: o.status,
      raw: { offerAmount: num(o.offer_amount), pricingType: o.pricing_type as PricingType, pricingValue: num(o.pricing_value), paymentAmount: num(o.payment_amount), paymentFrequency: o.payment_frequency, termText: o.term_text, originationFee: num(o.origination_fee), otherFees: fees },
      expiresAt: o.expires_at, presentedAt: o.presented_at, clientDecidedAt: o.client_decided_at,
    };
  });
}

export async function fetchFundedDealRecords(): Promise<FundedDealRecord[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("funded_deals")
    .select(`id, file_id, lender_name, requested_amount, accepted_offer_amount, gross_funded, net_funded, funded_at, disbursement_reference, renewal_opportunities(id, status, potential_renewal_date), ${FILE}`)
    .order("funded_at", { ascending: false })
    .limit(LIMIT);
  if (error) throw error;
  return (data ?? []).map((f) => {
    const r = one(f.renewal_opportunities);
    return {
      id: f.id, file: fileRef(f.file_id, f.funding_files as FileJoin), lenderName: f.lender_name, requestedAmount: Number(f.requested_amount), acceptedOfferAmount: num(f.accepted_offer_amount),
      grossFunded: Number(f.gross_funded), netFunded: Number(f.net_funded), fundedAt: f.funded_at, disbursementReference: f.disbursement_reference,
      renewal: r ? { id: r.id, status: r.status, potentialRenewalDate: r.potential_renewal_date } : null,
    };
  });
}

export async function fetchCommissionRecords(): Promise<CommissionRecord[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("commissions")
    .select("id, deal_id, party_kind, party_id, basis, rate_or_amount, computed_amount, state, funded_at, paid_at, note, funding_deals(lender, amount, file_id, funding_files(public_id, funding_clients(name), funding_businesses(legal_name)))")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) throw error;
  return (data ?? []).map((c) => {
    const deal = one(c.funding_deals);
    return {
      id: c.id, dealId: c.deal_id, file: fileRef(deal?.file_id ?? "", (deal?.funding_files ?? null) as FileJoin), lender: deal?.lender ?? null, dealAmount: num(deal?.amount),
      partyKind: c.party_kind, partyId: c.party_id, basis: c.basis, rateOrAmount: Number(c.rate_or_amount), computedAmount: num(c.computed_amount), state: c.state, fundedAt: c.funded_at, paidAt: c.paid_at, note: c.note,
    };
  });
}

export async function fetchRenewalRecords(): Promise<RenewalRecord[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("renewal_opportunities")
    .select(`id, file_id, potential_renewal_date, status, next_follow_up_at, new_file_id, funded_deals(lender_name, gross_funded, funded_at), ${FILE_BY_FILE_ID}`)
    .order("potential_renewal_date", { ascending: true, nullsFirst: false })
    .limit(LIMIT);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const fd = one(r.funded_deals);
    return {
      id: r.id, file: fileRef(r.file_id, r.funding_files as FileJoin), lenderName: fd?.lender_name ?? null, grossFunded: num(fd?.gross_funded), fundedAt: fd?.funded_at ?? null,
      potentialRenewalDate: r.potential_renewal_date, status: r.status, nextFollowUpAt: r.next_follow_up_at, newFileId: r.new_file_id,
    };
  });
}
