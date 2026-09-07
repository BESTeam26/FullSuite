/**
 * DIY referrals, from the organization's side.
 *
 * An organization refers consumers to BES DIY Credit through a tracked link
 * and earns on what they do next. Everything here reads the canonical tables:
 * `referral_attributions` for who was referred, `referral_events` for what
 * they did, and the ONE `commissions` ledger for what is owed.
 *
 * Attribution is not access. Nothing in this module can reach a referred
 * consumer's credit report, disputes, documents or DIY journey, and the
 * database would refuse it if it tried.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface ReferralRow {
  attributionId: string;
  clientId: string;
  consumerName: string | null;
  consumerEmail: string | null;
  source: string;
  attributedAt: string;
  /** Their DIY stage, when they have a journey. Progress, not credit data. */
  diyStage: string | null;
  signedUp: boolean;
  subscribed: boolean;
  convertedCredit: boolean;
  convertedFunding: boolean;
  commissionEarned: number;
  commissionPaid: number;
}

export interface ReferralCode {
  id: string;
  code: string;
  label: string | null;
  active: boolean;
}

export interface ReferralPlan {
  id: string;
  label: string;
  basis: "pct" | "flat";
  rateOrAmount: number;
  appliesTo: string;
}

/** The five states Dee's model names, mapped onto the ledger that exists. */
export const COMMISSION_STATE_LABEL: Record<string, string> = {
  pending: "Pending",
  earned: "Eligible",
  payable: "Approved",
  paid: "Paid",
  reversed: "Reversed",
  void: "Void",
};

export const REFERRAL_PLAN_LABEL: Record<string, string> = {
  referral_signup: "DIY signup",
  referral_subscription: "Active subscription",
  referral_credit_conversion: "Done-for-you credit conversion",
  referral_funding_conversion: "Funding service conversion",
};

export async function fetchReferrals(organizationId: string): Promise<ReferralRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("referral_list", { p_org: organizationId });
  if (error) throw error;
  return ((data as {
    attribution_id: string; client_id: string; consumer_name: string | null; consumer_email: string | null;
    source: string; attributed_at: string; diy_stage: string | null;
    signed_up: boolean; subscribed: boolean; converted_credit: boolean; converted_funding: boolean;
    commission_earned: number; commission_paid: number;
  }[] | null) ?? []).map((r) => ({
    attributionId: r.attribution_id,
    clientId: r.client_id,
    consumerName: r.consumer_name,
    consumerEmail: r.consumer_email,
    source: r.source,
    attributedAt: r.attributed_at,
    diyStage: r.diy_stage,
    signedUp: r.signed_up,
    subscribed: r.subscribed,
    convertedCredit: r.converted_credit,
    convertedFunding: r.converted_funding,
    commissionEarned: Number(r.commission_earned),
    commissionPaid: Number(r.commission_paid),
  }));
}

export async function fetchReferralCode(organizationId: string): Promise<ReferralCode | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("referral_codes")
    .select("id, code, label, active")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, code: data.code, label: data.label, active: data.active } : null;
}

/** The rules that price a referral. Rows, not constants. */
export async function fetchReferralPlans(organizationId: string): Promise<ReferralPlan[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("commission_plans")
    .select("id, label, basis, rate_or_amount, applies_to")
    .eq("organization_id", organizationId)
    .like("applies_to", "referral_%")
    .order("applies_to");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    basis: r.basis as ReferralPlan["basis"],
    rateOrAmount: Number(r.rate_or_amount),
    appliesTo: r.applies_to,
  }));
}

export async function setReferralCode(organizationId: string, code: string, label?: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_referral_code", { p_org: organizationId, p_code: code, p_label: label ?? undefined });
  if (error) throw error;
}

export interface ReferralTotals {
  referred: number;
  signedUp: number;
  subscribed: number;
  convertedCredit: number;
  convertedFunding: number;
  earned: number;
  paid: number;
  outstanding: number;
}

/** Totals computed from the rows on screen, so the tiles cannot disagree with the list. */
export function referralTotals(rows: ReferralRow[]): ReferralTotals {
  const sum = (f: (r: ReferralRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  const earned = sum((r) => r.commissionEarned);
  const paid = sum((r) => r.commissionPaid);
  return {
    referred: rows.length,
    signedUp: rows.filter((r) => r.signedUp).length,
    subscribed: rows.filter((r) => r.subscribed).length,
    convertedCredit: rows.filter((r) => r.convertedCredit).length,
    convertedFunding: rows.filter((r) => r.convertedFunding).length,
    earned,
    paid,
    outstanding: earned - paid,
  };
}
