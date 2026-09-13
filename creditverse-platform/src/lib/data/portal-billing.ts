/**
 * The PARTNER's own view of their billing, read through definer functions
 * gated on `partner_billing_group_of_user()`.
 *
 * Distinct from `partner-billing.ts`, which is BES's internal view of the same
 * money — different reader, different rules, different resolver. The internal
 * module reads tables under the owner-gated policies; this one reads functions
 * that take no id at all, so a partner cannot reach another partner's money by
 * guessing, because there is nothing to guess with.
 *
 * The resolver behind these is deliberately NOT the one the rest of the portal
 * uses. The service chokepoint refuses a suspended partner; this one admits
 * them, because suspension stops the work and must not stop them settling it —
 * the one screen where they can fix the problem cannot be the screen they lose
 * (Dee, 2026-09-13). It still refuses an archived partner and still requires
 * the portal switch to be on.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface PortalBillingSummary {
  groupId: string;
  partnerName: string;
  balanceCents: number;
  overdueCents: number;
  overdueInvoices: number;
  nextBillingOn: string | null;
  nextBillingCents: number;
  paymentMethods: string;
  suspended: boolean;
  suspendedAt: string | null;
  suspensionDetail: string | null;
}

export interface PortalInvoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  totalCents: number;
  amountPaidCents: number;
  balanceCents: number;
  status: string;
  periodKey: string | null;
  notes: string | null;
}

export interface PortalPayment {
  id: string;
  paidOn: string;
  amountCents: number;
  currency: string;
  method: string | null;
  reference: string | null;
  invoiceNumber: string | null;
  status: string;
}

export interface PortalCredits {
  unit: string;
  added: number;
  used: number;
  available: number;
  history: { at: string; kind: string; quantity: number; description: string | null }[];
}

/* eslint-disable @typescript-eslint/no-explicit-any -- these functions are
   newer than the generated types; each mapper names every field it reads,
   which is the check that matters. */
type Row = Record<string, any>;

const rpc = async (fn: string): Promise<Row[]> => {
  const { data, error } = await requireSupabase().rpc(fn as never);
  if (error) throw error;
  return (data ?? []) as Row[];
};

export async function fetchPortalBilling(): Promise<PortalBillingSummary | null> {
  const r = (await rpc("my_partner_billing"))[0];
  if (!r) return null;
  return {
    groupId: r.group_id,
    partnerName: r.partner_name,
    balanceCents: Number(r.balance_cents ?? 0),
    overdueCents: Number(r.overdue_cents ?? 0),
    overdueInvoices: Number(r.overdue_invoices ?? 0),
    nextBillingOn: r.next_billing_on ?? null,
    nextBillingCents: Number(r.next_billing_cents ?? 0),
    paymentMethods: r.payment_methods ?? "Contact BES",
    suspended: r.suspended === true,
    suspendedAt: r.suspended_at ?? null,
    suspensionDetail: r.suspension_detail ?? null,
  };
}

export async function fetchPortalInvoices(): Promise<PortalInvoice[]> {
  return (await rpc("my_partner_invoices")).map((r) => ({
    id: r.id, invoiceNumber: r.invoice_number, issueDate: r.issue_date, dueDate: r.due_date,
    currency: r.currency, totalCents: Number(r.total_cents ?? 0),
    amountPaidCents: Number(r.amount_paid_cents ?? 0), balanceCents: Number(r.balance_cents ?? 0),
    status: r.status, periodKey: r.period_key ?? null, notes: r.notes ?? null,
  }));
}

export async function fetchPortalPayments(): Promise<PortalPayment[]> {
  return (await rpc("my_partner_payments")).map((r) => ({
    id: r.id, paidOn: r.paid_on, amountCents: Number(r.amount_cents ?? 0),
    currency: r.currency, method: r.method ?? null, reference: r.reference ?? null,
    invoiceNumber: r.invoice_number ?? null, status: r.status,
  }));
}

export async function fetchPortalCredits(): Promise<PortalCredits[]> {
  return (await rpc("my_partner_credits")).map((r) => ({
    unit: r.unit, added: Number(r.added ?? 0), used: Number(r.used ?? 0),
    available: Number(r.available ?? 0),
    history: Array.isArray(r.history) ? r.history : [],
  }));
}

/** `creditops_round` → `CreditOps rounds`. */
export const creditUnitLabel = (unit: string): string => {
  const words = unit.replace(/_/g, " ").replace(/^creditops/i, "CreditOps");
  return words.endsWith("s") ? words : `${words}s`;
};
