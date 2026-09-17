/**
 * Paying a partner invoice by card, from the browser.
 *
 * Nothing in this module ever sees a card number. `AcceptJsCardField` sends it
 * straight to Authorize.Net and hands back an opaque single-use nonce; that
 * nonce, an amount and an invoice id are all that go to the Edge Function.
 *
 * The idempotency key is made HERE, once per checkout, and reused on every
 * retry of that checkout. That is deliberate: a key the server invented would
 * be new on each attempt, which is the same as having none, and a double-
 * clicked button would be two charges.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface CardPaymentConfig {
  connected: boolean;
  environment: "production" | "sandbox";
  apiLoginId: string | null;
  clientKey: string | null;
  missing: string[];
}

export interface SavedCard {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  autopayEnabled: boolean;
  autopayEnabledAt: string | null;
  autopayEnabledBy: string | null;
  addedAt: string;
}

export interface AutopaySchedule {
  invoiceId: string;
  invoiceNumber: string;
  dueDate: string;
  amountCents: number;
  willCharge: boolean;
  reason: string | null;
}

export interface ChargeResult {
  status: "approved" | "declined" | "held_for_review" | "error" | "unknown" | "pending";
  paymentId: string | null;
  providerTxnId: string | null;
  reason?: string;
  alreadyHandled?: boolean;
}

interface OpaqueData { dataDescriptor: string; dataValue: string }
interface CardFacts { brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null }

const invoke = async <T,>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await requireSupabase().functions.invoke("partner-payments", { body });
  /* An Edge Function that answers 402 or 409 is answering, not failing. Its
     body is the useful part, and supabase-js puts a non-2xx in `error`. */
  if (error) {
    const payload = await readErrorBody(error);
    throw new Error(payload ?? error.message);
  }
  return data as T;
};

/** supabase-js wraps a non-2xx as FunctionsHttpError with the Response inside. */
const readErrorBody = async (error: unknown): Promise<string | null> => {
  const response = (error as { context?: Response })?.context;
  if (!response || typeof response.json !== "function") return null;
  try {
    const body = await response.json();
    return typeof body?.error === "string" ? body.error : null;
  } catch {
    return null;
  }
};

export async function fetchCardPaymentConfig(): Promise<CardPaymentConfig> {
  /* `config` is the one action that answers without a partner, because its job
     is to say whether card payment can be offered at all. */
  const { data, error } = await requireSupabase().functions.invoke("partner-payments", {
    body: { action: "config", groupId: "config" },
  });
  if (error) throw error;
  return data as CardPaymentConfig;
}

export async function fetchSavedCard(): Promise<SavedCard | null> {
  const { data, error } = await requireSupabase().rpc("my_partner_card" as never);
  if (error) throw error;
  const r = (data as Record<string, unknown>[] | null)?.[0];
  if (!r) return null;
  return {
    id: r.id as string,
    brand: (r.card_brand as string) ?? null,
    last4: (r.last4 as string) ?? null,
    expMonth: r.exp_month ? Number(r.exp_month) : null,
    expYear: r.exp_year ? Number(r.exp_year) : null,
    autopayEnabled: r.autopay_enabled === true,
    autopayEnabledAt: (r.autopay_enabled_at as string) ?? null,
    autopayEnabledBy: (r.autopay_enabled_by as string) ?? null,
    addedAt: r.added_at as string,
  };
}

export async function fetchAutopaySchedule(): Promise<AutopaySchedule[]> {
  const { data, error } = await requireSupabase().rpc("my_partner_autopay_schedule" as never);
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    invoiceId: r.invoice_id as string,
    invoiceNumber: r.invoice_number as string,
    dueDate: r.due_date as string,
    amountCents: Number(r.amount_cents ?? 0),
    willCharge: r.will_charge === true,
    reason: (r.reason as string) ?? null,
  }));
}

/**
 * One key per checkout. Held by the caller for the life of that checkout, so a
 * second click, a refresh-and-retry or a network retry all carry the same one
 * and the second charge never happens.
 */
export const newIdempotencyKey = (invoiceId: string): string =>
  `inv:${invoiceId}:${crypto.randomUUID()}`;

export async function payInvoiceWithCard(input: {
  groupId: string;
  invoiceId: string;
  amountCents: number;
  idempotencyKey: string;
  opaqueData: OpaqueData;
}): Promise<ChargeResult> {
  return invoke<ChargeResult>({ action: "pay_now", ...input });
}

export async function chargeSavedCard(input: {
  groupId: string;
  invoiceId: string;
  amountCents: number;
  idempotencyKey: string;
}): Promise<ChargeResult> {
  return invoke<ChargeResult>({ action: "card_on_file", ...input });
}

export async function savePartnerCard(input: {
  groupId: string;
  opaqueData: OpaqueData;
  card: CardFacts;
}): Promise<{ saved: boolean }> {
  return invoke<{ saved: boolean }>({
    action: "save_card",
    groupId: input.groupId,
    opaqueData: input.opaqueData,
    cardBrand: input.card.brand,
    last4: input.card.last4,
    expMonth: input.card.expMonth,
    expYear: input.card.expYear,
  });
}

/** Autopay is the partner's own switch, so it goes straight to the database
 *  rather than through the payments function. Nothing is charged by it. */
export async function setAutopay(groupId: string, enabled: boolean): Promise<boolean> {
  const { data, error } = await requireSupabase()
    .rpc("set_partner_autopay" as never, { p_group: groupId, p_enabled: enabled } as never);
  if (error) throw error;
  return data === true;
}
