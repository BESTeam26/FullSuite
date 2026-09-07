/**
 * Subscriptions and payment, from the browser's side.
 *
 * The card never comes through here. Accept.js — loaded from Authorize.Net's
 * own domain — takes the card straight from the customer and returns an opaque
 * nonce; that nonce is the only card-shaped thing this module has ever seen,
 * and it is single-use.
 *
 * Nothing here writes a subscription or a transaction either. Those rows are
 * claims about money, and the only writer is the Edge Function, after the
 * processor has actually answered.
 */
import { requireSupabase } from "@/lib/supabase/client";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled" | "expired";
export type PaymentStatus = "approved" | "declined" | "error" | "held_for_review" | "voided" | "refunded";

export const SUBSCRIPTION_LABEL: Record<SubscriptionStatus, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Payment failed",
  cancelled: "Cancelled",
  expired: "Expired",
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  approved: "Paid",
  declined: "Declined",
  error: "Error",
  held_for_review: "Held for review",
  voided: "Voided",
  refunded: "Refunded",
};

export interface Subscription {
  id: string;
  organizationId: string;
  planKey: string;
  status: SubscriptionStatus;
  interval: "monthly" | "annual";
  priceCents: number;
  seats: number;
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface PaymentMethodSummary {
  id: string;
  cardBrand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
}

export interface PaymentTransaction {
  id: string;
  amountCents: number;
  status: PaymentStatus;
  responseText: string | null;
  last4: string | null;
  description: string | null;
  createdAt: string;
}

export interface PaymentsConfig {
  connected: boolean;
  environment: "production" | "sandbox";
  apiLoginId: string | null;
  clientKey: string | null;
  /** Names of the secrets that are missing, so a screen can say which. */
  missing: string[];
}

const invoke = async <T>(body: Record<string, unknown>): Promise<T> => {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke("payments", { body });
  if (error) {
    const detail = (error as { context?: { body?: unknown } }).context?.body;
    throw new Error(typeof detail === "string" ? detail : (error as Error).message);
  }
  return data as T;
};

export const fetchPaymentsConfig = () => invoke<PaymentsConfig>({ action: "config" });

export const saveCard = (organizationId: string, opaqueData: { dataDescriptor: string; dataValue: string }) =>
  invoke<{ saved: boolean; environment: string }>({ action: "save_card", organizationId, opaqueData });

export const chargeOrganization = (organizationId: string, amountCents: number, description?: string) =>
  invoke<{ status: PaymentStatus; providerTxnId: string | null; reason: string; environment: string }>({
    action: "charge",
    organizationId,
    amountCents,
    description,
  });

export async function fetchSubscription(organizationId: string): Promise<Subscription | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("organization_subscriptions")
    .select("id, organization_id, plan_key, status, interval, price_cents, seats, current_period_start, current_period_end, cancel_at_period_end")
    .eq("organization_id", organizationId)
    .in("status", ["trialing", "active", "past_due"])
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    organizationId: data.organization_id,
    planKey: data.plan_key,
    status: data.status as SubscriptionStatus,
    interval: data.interval as Subscription["interval"],
    priceCents: data.price_cents,
    seats: data.seats,
    currentPeriodStart: data.current_period_start,
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.cancel_at_period_end,
  };
}

export async function fetchPaymentMethods(organizationId: string): Promise<PaymentMethodSummary[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("payment_methods")
    .select("id, card_brand, last4, exp_month, exp_year, is_default")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    cardBrand: r.card_brand,
    last4: r.last4,
    expMonth: r.exp_month,
    expYear: r.exp_year,
    isDefault: r.is_default,
  }));
}

export async function fetchPaymentTransactions(organizationId: string, limit = 25): Promise<PaymentTransaction[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("payment_transactions")
    .select("id, amount_cents, status, response_text, last4, description, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    amountCents: r.amount_cents,
    status: r.status as PaymentStatus,
    responseText: r.response_text,
    last4: r.last4,
    description: r.description,
    createdAt: r.created_at,
  }));
}

export async function chooseSubscriptionPlan(
  organizationId: string,
  planKey: string,
  interval: "monthly" | "annual",
  seats = 1,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("choose_subscription_plan", {
    p_org: organizationId,
    p_plan_key: planKey,
    p_interval: interval,
    p_seats: seats,
  });
  if (error) throw error;
}

export async function cancelSubscription(organizationId: string, immediately = false): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("cancel_subscription", { p_org: organizationId, p_immediately: immediately });
  if (error) throw error;
}
