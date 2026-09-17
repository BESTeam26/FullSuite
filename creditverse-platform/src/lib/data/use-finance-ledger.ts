/**
 * Finance's own reads: the payment ledger across every partner, the exception
 * queue, and the payments that arrived without an invoice.
 *
 * ── THESE READ CANONICAL VIEWS, NOT THEIR OWN DERIVATIONS ─────────────────
 *
 * `billing_attention` and `payment_matching_review` already existed when the
 * Finance module was built, and the first version of this file re-derived both
 * — one in a new database function, one in the browser. Retired in
 * 20260917002400. A screen that re-derives an exception is a second definition
 * of that exception, and the two drift the first time somebody fixes one.
 *
 * Both views carry `security_invoker = true`, so they answer per person: an
 * agent with no financial capability gets no rows rather than an error, and
 * the definer functions beside them refuse outright. Neither is the security —
 * the policies on the tables underneath are.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";

type Raw = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

/* ── The payment ledger ─────────────────────────────────────────────────── */

export interface LedgerPayment {
  id: string;
  paidOn: string;
  groupId: string;
  partnerName: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  amountCents: number;
  refundAmountCents: number;
  currency: string;
  method: string;
  provider: string;
  reference: string | null;
  status: string;
  reconciliationState: string;
  /** `sandbox` marks a test charge. Null for anything that was not a card. */
  environment: string | null;
  source: string;
}

export async function fetchFinancePayments(limit = 200): Promise<LedgerPayment[]> {
  const { data, error } = await requireSupabase()
    .rpc("finance_payments" as never, { p_limit: limit } as never);
  if (error) throw error;
  return ((data as Raw[] | null) ?? []).map((p) => ({
    id: p.id as string,
    paidOn: p.paid_on as string,
    groupId: p.group_id as string,
    partnerName: (p.partner_name as string) ?? "Unknown partner",
    invoiceId: (p.invoice_id as string) ?? null,
    invoiceNumber: (p.invoice_number as string) ?? null,
    amountCents: num(p.amount_cents),
    refundAmountCents: num(p.refund_amount_cents),
    currency: (p.currency as string) ?? "USD",
    method: (p.method as string) ?? "—",
    provider: (p.provider as string) ?? "other",
    reference: (p.reference as string) ?? null,
    status: (p.status as string) ?? "succeeded",
    reconciliationState: (p.reconciliation_state as string) ?? "unreconciled",
    environment: (p.environment as string) ?? null,
    source: (p.source as string) ?? "manual",
  }));
}

export const useFinancePayments = (limit = 200) =>
  useQuery({ queryKey: ["finance", "payments", limit], queryFn: () => fetchFinancePayments(limit), staleTime: 60_000 });

/* ── The exception queue ────────────────────────────────────────────────── */

export interface AttentionRow {
  kind: string;
  label: string;
  severity: "critical" | "high" | "medium";
  groupId: string;
  partnerName: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  amountCents: number;
  since: string | null;
  detail: string;
}

export async function fetchBillingAttention(): Promise<AttentionRow[]> {
  const { data, error } = await requireSupabase()
    .from("billing_attention")
    .select("kind, label, severity, group_id, partner_name, invoice_id, invoice_number, amount_cents, since, detail")
    .order("severity")
    .order("since", { ascending: true });
  if (error) throw error;
  return ((data as Raw[] | null) ?? []).map((r) => ({
    kind: r.kind as string,
    label: (r.label as string) ?? "Billing Attention Required",
    severity: ((r.severity as AttentionRow["severity"]) ?? "medium"),
    groupId: r.group_id as string,
    partnerName: (r.partner_name as string) ?? "Unknown partner",
    invoiceId: (r.invoice_id as string) ?? null,
    invoiceNumber: (r.invoice_number as string) ?? null,
    amountCents: num(r.amount_cents),
    since: (r.since as string) ?? null,
    detail: (r.detail as string) ?? "",
  }));
}

export const useBillingAttention = () =>
  useQuery({ queryKey: ["finance", "attention"], queryFn: fetchBillingAttention, staleTime: 30_000 });

/* ── Payments with no invoice behind them ───────────────────────────────── */

export interface MatchCandidate {
  invoiceId: string;
  invoiceNumber: string;
  dueDate: string;
  balanceCents: number;
}

export interface UnmatchedPayment {
  id: string;
  paidOn: string;
  groupId: string;
  partnerName: string;
  amountCents: number;
  currency: string;
  method: string;
  reference: string | null;
  notes: string | null;
  recordedByName: string | null;
  /** Ranked by the view: closest balance first. */
  candidates: MatchCandidate[];
}

export async function fetchUnmatchedPayments(): Promise<UnmatchedPayment[]> {
  const { data, error } = await requireSupabase()
    .from("payment_matching_review")
    .select("id, paid_on, group_id, partner_name, amount_cents, currency, provider, provider_transaction_id, notes, recorded_by_name, candidate_invoices")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as Raw[] | null) ?? []).map((p) => ({
    id: p.id as string,
    paidOn: p.paid_on as string,
    groupId: p.group_id as string,
    partnerName: (p.partner_name as string) ?? "Unknown partner",
    amountCents: num(p.amount_cents),
    currency: (p.currency as string) ?? "USD",
    method: String(p.provider ?? "—").replace(/_/g, " "),
    reference: (p.provider_transaction_id as string) ?? null,
    notes: (p.notes as string) ?? null,
    recordedByName: (p.recorded_by_name as string) ?? null,
    candidates: (Array.isArray(p.candidate_invoices) ? (p.candidate_invoices as Raw[]) : []).map((c) => ({
      invoiceId: c.invoice_id as string,
      invoiceNumber: (c.invoice_number as string) ?? "—",
      dueDate: c.due_date as string,
      balanceCents: num(c.balance_cents),
    })),
  }));
}

export const useUnmatchedPayments = () =>
  useQuery({ queryKey: ["finance", "unmatched"], queryFn: fetchUnmatchedPayments, staleTime: 30_000 });

export function useMatchPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { paymentId: string; invoiceId: string; note?: string }) => {
      /* `p_note` is part of the canonical signature and is passed explicitly:
         omitting it made the call ambiguous while a second overload existed. */
      const { error } = await requireSupabase()
        .rpc("match_partner_payment" as never,
             { p_payment: input.paymentId, p_invoice: input.invoiceId,
               p_note: input.note ?? null } as never);
      if (error) throw error;
    },
    /* A match moves an invoice's balance, so everything that reads a balance
       is stale — the overview, the ledger and the queue alike. */
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["finance"] }),
  });
}
