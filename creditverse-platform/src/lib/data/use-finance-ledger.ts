/**
 * Finance's own reads: the payment ledger across every partner, and the
 * payments that arrived without an invoice.
 *
 * Both go through database functions that check a capability before they
 * return a row, so a person who cannot see money gets an error rather than an
 * empty list — which is the honest answer and also the one that cannot be
 * mistaken for "there is no money".
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";

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

type Raw = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

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

export interface MatchCandidate {
  invoiceId: string;
  invoiceNumber: string;
  dueDate: string;
  balanceCents: number;
  confidence: "high" | "medium" | "low";
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
  candidates: MatchCandidate[];
}

export async function fetchUnmatchedPayments(): Promise<UnmatchedPayment[]> {
  const { data, error } = await requireSupabase().rpc("finance_unmatched_payments" as never);
  if (error) throw error;
  return ((data as Raw[] | null) ?? []).map((p) => ({
    id: p.id as string,
    paidOn: p.paid_on as string,
    groupId: p.group_id as string,
    partnerName: (p.partner_name as string) ?? "Unknown partner",
    amountCents: num(p.amount_cents),
    currency: (p.currency as string) ?? "USD",
    method: (p.method as string) ?? "—",
    reference: (p.reference as string) ?? null,
    notes: (p.notes as string) ?? null,
    candidates: (Array.isArray(p.candidates) ? (p.candidates as Raw[]) : []).map((c) => ({
      invoiceId: c.invoice_id as string,
      invoiceNumber: (c.invoice_number as string) ?? "—",
      dueDate: c.due_date as string,
      balanceCents: num(c.balance_cents),
      confidence: ((c.confidence as MatchCandidate["confidence"]) ?? "low"),
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
