/**
 * Invoices, scheduled obligations and the payment ledger.
 *
 * ── WHY THE ARITHMETIC IS NOT IN HERE ──────────────────────────────────────
 *
 * This module fetches and writes rows. Every rule about what counts as MRR,
 * what is expected this month, and what has actually been collected lives in
 * `partners/billing-engine.ts`, where it is unit-tested against Dee's nine
 * cases. Two implementations of "what is MRR" — one in SQL for a dashboard and
 * one in TypeScript for a profile — is exactly how two screens end up showing
 * different numbers and nobody can say which is right (rules 5 and 9).
 *
 * So the dashboard fetches BOUNDED INPUTS — live terms, this month's invoices,
 * this month's payments — and the engine computes. The inputs are small by
 * construction: one agency, one month, filtered server-side.
 *
 * ── WHAT A MANAGER SEES ────────────────────────────────────────────────────
 *
 * Nothing. Not an empty list they might read as "no invoices" — the screens
 * that use this module are not rendered at all without the capability. Every
 * query here would come back empty anyway, because RLS refuses first.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type {
  EngagementTerms, InvoiceRecord, Month, PaymentRecord, ScheduledObligation,
} from "@/lib/partners/billing-engine";

const monthBounds = ({ year, month }: Month) => {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, "0")}` };
};

/* ── Invoices ─────────────────────────────────────────────────────────── */

export interface PartnerInvoice extends InvoiceRecord {
  invoiceNumber: string;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  notes: string | null;
  sentAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
}

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  serviceId: string | null;
  scheduleId: string | null;
  description: string;
  quantity: number;
  unitLabel: string | null;
  unitAmountCents: number;
  amountCents: number;
  sort: number;
}

const INVOICE_COLUMNS =
  "id, group_id, invoice_number, issue_date, due_date, currency, subtotal_cents, discount_cents, tax_cents, total_cents, amount_paid_cents, status, notes, sent_at, paid_at, voided_at";

const mapInvoice = (r: Record<string, unknown>): PartnerInvoice => ({
  id: r.id as string,
  groupId: r.group_id as string,
  invoiceNumber: r.invoice_number as string,
  issueDate: r.issue_date as string,
  dueDate: r.due_date as string,
  currency: (r.currency as string) ?? "USD",
  subtotalCents: Number(r.subtotal_cents ?? 0),
  discountCents: Number(r.discount_cents ?? 0),
  taxCents: Number(r.tax_cents ?? 0),
  totalCents: Number(r.total_cents ?? 0),
  amountPaidCents: Number(r.amount_paid_cents ?? 0),
  status: (r.status as string) ?? "draft",
  notes: (r.notes as string) ?? null,
  sentAt: (r.sent_at as string) ?? null,
  paidAt: (r.paid_at as string) ?? null,
  voidedAt: (r.voided_at as string) ?? null,
});

export async function fetchPartnerInvoices(groupId: string, limit = 50): Promise<PartnerInvoice[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("partner_invoices").select(INVOICE_COLUMNS)
    .eq("group_id", groupId).order("issue_date", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => mapInvoice(r as Record<string, unknown>));
}

export async function fetchInvoiceLines(invoiceId: string): Promise<InvoiceLine[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("partner_invoice_lines").select("*").eq("invoice_id", invoiceId).order("sort");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string, invoiceId: r.invoice_id as string,
      serviceId: (r.service_id as string) ?? null,
      scheduleId: (r.schedule_id as string) ?? null,
      description: r.description as string,
      quantity: Number(r.quantity ?? 1),
      unitLabel: (r.unit_label as string) ?? null,
      unitAmountCents: Number(r.unit_amount_cents ?? 0),
      amountCents: Number(r.amount_cents ?? 0),
      sort: Number(r.sort ?? 0),
    };
  });
}

export interface NewInvoiceLine {
  serviceId?: string | null;
  scheduleId?: string | null;
  description: string;
  quantity?: number;
  unitLabel?: string | null;
  unitAmountCents: number;
}

/**
 * Raise an invoice.
 *
 * The number comes from the database, not from the browser: two people
 * inventing "BES-2026-00042" at the same moment is exactly what a sequence
 * exists to prevent. Totals are computed from the lines here so the header and
 * the lines cannot disagree.
 */
export async function createInvoice(input: {
  agencyId: string;
  groupId: string;
  issueDate?: string;
  dueDate: string;
  currency?: string;
  discountCents?: number;
  taxCents?: number;
  notes?: string;
  lines: NewInvoiceLine[];
}): Promise<string> {
  const sb = requireSupabase();
  const { data: number, error: numberError } = await sb.rpc("next_invoice_number", { p_agency: input.agencyId });
  if (numberError) throw numberError;

  const lines = input.lines.map((l, i) => ({
    ...l,
    quantity: l.quantity ?? 1,
    amountCents: Math.round((l.quantity ?? 1) * l.unitAmountCents),
    sort: i,
  }));
  const subtotal = lines.reduce((n, l) => n + l.amountCents, 0);
  const discount = input.discountCents ?? 0;
  const tax = input.taxCents ?? 0;

  const { data, error } = await sb
    .from("partner_invoices")
    .insert({
      agency_id: input.agencyId, group_id: input.groupId,
      invoice_number: number as string,
      issue_date: input.issueDate ?? new Date().toISOString().slice(0, 10),
      due_date: input.dueDate,
      currency: input.currency ?? "USD",
      subtotal_cents: subtotal, discount_cents: discount, tax_cents: tax,
      total_cents: Math.max(subtotal - discount + tax, 0),
      notes: input.notes?.trim() || null,
      status: "draft",
    } as never)
    .select("id").single();
  if (error) throw error;
  const invoiceId = (data as { id: string }).id;

  if (lines.length > 0) {
    const { error: lineError } = await sb.from("partner_invoice_lines").insert(
      lines.map((l) => ({
        invoice_id: invoiceId, service_id: l.serviceId ?? null, schedule_id: l.scheduleId ?? null,
        description: l.description.trim(), quantity: l.quantity,
        unit_label: l.unitLabel ?? null, unit_amount_cents: l.unitAmountCents,
        amount_cents: l.amountCents, sort: l.sort,
      })) as never,
    );
    if (lineError) throw lineError;
  }

  /* A schedule row that has become an invoice must stop counting as a future
     obligation, or the same money is collectible twice. */
  const scheduleIds = lines.map((l) => l.scheduleId).filter((v): v is string => !!v);
  if (scheduleIds.length > 0) {
    const { error: schedError } = await sb.from("partner_billing_schedule")
      .update({ status: "invoiced", invoice_id: invoiceId } as never).in("id", scheduleIds);
    if (schedError) throw schedError;
  }
  return invoiceId;
}

export async function markInvoiceSent(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("partner_invoices")
    .update({ status: "sent", sent_at: new Date().toISOString() } as never).eq("id", id);
  if (error) throw error;
}

/** Void, never delete. An issued invoice is a thing that happened (rule 11). */
export async function voidInvoice(id: string, reason: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("partner_invoices")
    .update({ status: "void", voided_at: new Date().toISOString(), void_reason: reason.trim() || null } as never)
    .eq("id", id);
  if (error) throw error;
}

/* ── Payments ─────────────────────────────────────────────────────────── */

export interface PartnerPayment extends PaymentRecord {
  invoiceId: string | null;
  serviceId: string | null;
  provider: string;
  providerTransactionId: string | null;
  currency: string;
  method: string | null;
  /** 'manual' until a provider confirms it. Shown, not hidden. */
  source: string;
  reconciliationState: string;
  notes: string | null;
}

const PAYMENT_COLUMNS =
  "id, group_id, invoice_id, service_id, provider, provider_transaction_id, amount_cents, currency, paid_on, status, method, source, reconciliation_state, refund_amount_cents, notes";

const mapPayment = (r: Record<string, unknown>): PartnerPayment => ({
  id: r.id as string,
  groupId: r.group_id as string,
  invoiceId: (r.invoice_id as string) ?? null,
  serviceId: (r.service_id as string) ?? null,
  provider: (r.provider as string) ?? "other",
  providerTransactionId: (r.provider_transaction_id as string) ?? null,
  amountCents: Number(r.amount_cents ?? 0),
  refundAmountCents: Number(r.refund_amount_cents ?? 0),
  currency: (r.currency as string) ?? "USD",
  paidOn: r.paid_on as string,
  status: (r.status as string) ?? "succeeded",
  method: (r.method as string) ?? null,
  source: (r.source as string) ?? "manual",
  reconciliationState: (r.reconciliation_state as string) ?? "unreconciled",
  notes: (r.notes as string) ?? null,
});

export async function fetchPartnerPayments(groupId: string, limit = 100): Promise<PartnerPayment[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("partner_payments").select(PAYMENT_COLUMNS)
    .eq("group_id", groupId).order("paid_on", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => mapPayment(r as Record<string, unknown>));
}

/**
 * Record money received.
 *
 * `source` stays 'manual' unless a provider confirmed it. The screen says so —
 * "manually recorded", not "PayPal verified" — because a person typing a
 * figure and a provider confirming a transaction are different facts, and
 * dressing one as the other is how a reconciliation later cannot be trusted.
 */
export async function recordPayment(input: {
  agencyId: string; groupId: string;
  invoiceId?: string | null; serviceId?: string | null;
  provider: string; providerTransactionId?: string | null;
  amountCents: number; currency?: string; paidOn: string;
  method?: string | null; notes?: string | null;
}): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("partner_payments").insert({
    agency_id: input.agencyId, group_id: input.groupId,
    invoice_id: input.invoiceId ?? null, service_id: input.serviceId ?? null,
    provider: input.provider, provider_transaction_id: input.providerTransactionId?.trim() || null,
    amount_cents: input.amountCents, currency: input.currency ?? "USD",
    paid_on: input.paidOn, status: "succeeded", method: input.method?.trim() || null,
    source: "manual", notes: input.notes?.trim() || null,
  } as never).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function refundPayment(id: string, refundCents: number, note?: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("partner_payments")
    .update({ refund_amount_cents: refundCents, notes: note?.trim() || null } as never).eq("id", id);
  if (error) throw error;
}

/* ── Scheduled obligations ────────────────────────────────────────────── */

export async function fetchPartnerSchedule(groupId: string): Promise<ScheduledObligation[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("partner_billing_schedule")
    .select("id, group_id, service_id, kind, due_on, amount_cents, status")
    .eq("group_id", groupId).order("due_on");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string, groupId: r.group_id as string,
      serviceId: (r.service_id as string) ?? null,
      kind: r.kind as ScheduledObligation["kind"],
      dueOn: r.due_on as string,
      amountCents: Number(r.amount_cents ?? 0),
      status: r.status as ScheduledObligation["status"],
    };
  });
}

/**
 * An instalment plan: a project value split across dated obligations.
 *
 * Written as separate rows rather than a repeat rule, because "three payments
 * of $2,000 on the 15th" is a promise somebody made and each part may later be
 * invoiced, moved or cancelled on its own.
 */
export async function createInstalmentPlan(input: {
  agencyId: string; groupId: string; serviceId: string | null;
  parts: { dueOn: string; amountCents: number }[];
  currency?: string; notes?: string;
}): Promise<void> {
  if (input.parts.length === 0) return;
  const sb = requireSupabase();
  const { error } = await sb.from("partner_billing_schedule").insert(
    input.parts.map((p, i) => ({
      agency_id: input.agencyId, group_id: input.groupId, service_id: input.serviceId,
      kind: "instalment", sequence: i + 1, due_on: p.dueOn, amount_cents: p.amountCents,
      currency: input.currency ?? "USD", status: "scheduled", notes: input.notes?.trim() || null,
    })) as never,
  );
  if (error) throw error;
}

export async function cancelScheduleEntry(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("partner_billing_schedule")
    .update({ status: "cancelled" } as never).eq("id", id);
  if (error) throw error;
}

/* ── The agency-wide inputs the dashboard computes from ───────────────── */

export interface FinancialInputs {
  terms: EngagementTerms[];
  schedule: ScheduledObligation[];
  invoices: InvoiceRecord[];
  payments: PaymentRecord[];
  /** Partner name by group id, so the dashboard can name its worst debtor. */
  partnerNames: Record<string, string>;
}

/**
 * Everything the financial dashboard needs, in four parallel queries.
 *
 * Bounded on purpose: live service lines and their current terms, and one
 * month of invoices and payments. Not "every invoice ever", which is the
 * "fetch an entire tenant dataset to calculate one card" that rule 14 names
 * outright.
 */
export async function fetchFinancialInputs(month: Month): Promise<FinancialInputs> {
  const sb = requireSupabase();
  const { from, to } = monthBounds(month);
  const today = new Date().toISOString().slice(0, 10);

  const [services, invoices, payments, schedule] = await Promise.all([
    /* One string literal — supabase-js infers the row shape from the literal
       itself, and a concatenation degrades the whole result to unknown. */
    // prettier-ignore
    sb.from("partner_services").select("id, group_id, status, cancellation_effective_on, contract_value_cents, outsourcing_groups!inner(name), partner_service_billing(billing_model, rate_cents, quantity, invoice_day, effective_from, effective_to)"),
    sb.from("partner_invoices")
      .select("id, group_id, total_cents, amount_paid_cents, due_date, issue_date, status")
      .or(`issue_date.gte.${from},status.in.(sent,partially_paid,overdue,scheduled)`),
    sb.from("partner_payments")
      .select("id, group_id, amount_cents, refund_amount_cents, paid_on, status")
      .gte("paid_on", from).lte("paid_on", to),
    sb.from("partner_billing_schedule")
      .select("id, group_id, service_id, kind, due_on, amount_cents, status")
      .neq("status", "cancelled"),
  ]);
  if (services.error) throw services.error;
  if (invoices.error) throw invoices.error;
  if (payments.error) throw payments.error;
  if (schedule.error) throw schedule.error;

  const partnerNames: Record<string, string> = {};
  const terms: EngagementTerms[] = [];
  for (const row of services.data ?? []) {
    const r = row as Record<string, unknown>;
    const group = (r.outsourcing_groups ?? {}) as { name?: string };
    if (group.name) partnerNames[r.group_id as string] = group.name;

    /* The terms in force TODAY. Older rows are history and price nothing now. */
    const all = (r.partner_service_billing ?? []) as Record<string, unknown>[];
    const current = all.find((b) => {
      const start = (b.effective_from as string) ?? "0000-01-01";
      const end = (b.effective_to as string) ?? null;
      return start <= today && (end === null || end >= today);
    }) ?? all[0];

    const status = r.status as string;
    terms.push({
      serviceId: r.id as string,
      groupId: r.group_id as string,
      live: status === "active" || status === "onboarding",
      billingModel: (current?.billing_model as string) ?? null,
      rateCents: current?.rate_cents === null || current?.rate_cents === undefined ? null : Number(current.rate_cents),
      quantity: current?.quantity === null || current?.quantity === undefined ? null : Number(current.quantity),
      invoiceDay: (current?.invoice_day as string) ?? null,
      effectiveFrom: (current?.effective_from as string) ?? null,
      cancellationEffectiveOn: (r.cancellation_effective_on as string) ?? null,
      contractValueCents: r.contract_value_cents === null || r.contract_value_cents === undefined
        ? null : Number(r.contract_value_cents),
    });
  }

  return {
    terms,
    partnerNames,
    invoices: (invoices.data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string, groupId: r.group_id as string,
        totalCents: Number(r.total_cents ?? 0),
        amountPaidCents: Number(r.amount_paid_cents ?? 0),
        dueDate: r.due_date as string, issueDate: r.issue_date as string,
        status: r.status as string,
      };
    }),
    payments: (payments.data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string, groupId: r.group_id as string,
        amountCents: Number(r.amount_cents ?? 0),
        refundAmountCents: Number(r.refund_amount_cents ?? 0),
        paidOn: r.paid_on as string, status: r.status as string,
      };
    }),
    schedule: (schedule.data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string, groupId: r.group_id as string,
        serviceId: (r.service_id as string) ?? null,
        kind: r.kind as ScheduledObligation["kind"],
        dueOn: r.due_on as string, amountCents: Number(r.amount_cents ?? 0),
        status: r.status as ScheduledObligation["status"],
      };
    }),
  };
}
