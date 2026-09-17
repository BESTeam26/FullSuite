/**
 * The Finance overview's data — one query, one document.
 *
 * `finance_overview()` does the joining in the database and returns the whole
 * screen's inputs as JSON. The alternative was eight queries, several of them
 * per-partner, which is the waterfall rule 14 names outright.
 *
 * Nothing here computes money. The arithmetic lives in
 * `lib/finance/finance-overview.ts`, where it is tested; this module only
 * fetches and renames.
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import type { CollectionMethod } from "@/lib/finance/finance-overview";

export interface OverviewInvoice {
  id: string;
  groupId: string;
  invoiceNumber: string;
  partnerName: string;
  dueDate: string;
  currency: string;
  status: string;
  balanceCents: number;
  /** What the invoice is set up to be paid by, today. */
  method: CollectionMethod;
  autopay: boolean;
  /* The billing engine's shape, so the same invoice can go through the shared
     ageing and collection functions without a second mapping. */
  totalCents: number;
  amountPaidCents: number;
  issueDate: string;
}

export interface OverviewPayment {
  id: string;
  paidOn: string;
  partnerName: string;
  invoiceNumber: string | null;
  amountCents: number;
  currency: string;
  method: string;
  status: string;
  state: string;
}

export interface FinanceOverviewData {
  today: string;
  /** Every partner the screen may need to NAME, including ones with no open
   *  invoice — an attention row that cannot say whose problem it is cannot be
   *  acted on. */
  partnerNames: Record<string, string>;
  months: { month: string; collectedCents: number; expensesCents: number }[];
  openInvoices: OverviewInvoice[];
  recentPayments: OverviewPayment[];
  /** Counted by `billing_attention`, the one exception projection. The
   *  dashboard shows what the queue shows, because there is one source. */
  attention: { kind: string; severity: string; count: number; amountCents: number }[];
  collectedThisMonthCents: number;
  expensesThisMonthCents: number;
  /** How many [TEST] fixture partners exist. They are excluded from every
   *  figure above; this is here so their absence is visible, not silent. */
  testPartners: number;
}

type Raw = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);
const list = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);

export async function fetchFinanceOverview(months = 9): Promise<FinanceOverviewData> {
  const { data, error } = await requireSupabase()
    .rpc("finance_overview" as never, { p_months: months } as never);
  if (error) throw error;
  const d = (data ?? {}) as Raw;

  return {
    today: (d.today as string) ?? new Date().toISOString().slice(0, 10),
    partnerNames: (d.partner_names ?? {}) as Record<string, string>,
    months: list(d.months).map((m) => ({
      month: m.month as string,
      collectedCents: num(m.collected_cents),
      expensesCents: num(m.expenses_cents),
    })),
    openInvoices: list(d.open_invoices).map((i) => {
      const balance = num(i.balance_cents);
      return {
        id: i.id as string,
        groupId: i.group_id as string,
        invoiceNumber: (i.invoice_number as string) ?? "—",
        partnerName: (i.partner_name as string) ?? "Unknown partner",
        dueDate: i.due_date as string,
        currency: (i.currency as string) ?? "USD",
        status: (i.status as string) ?? "sent",
        balanceCents: balance,
        method: ((i.method as CollectionMethod) ?? "manual"),
        autopay: i.autopay === true,
        /* The ageing and collection functions work on the billing engine's
           InvoiceRecord. An open invoice's balance IS its unpaid part, so it
           maps cleanly without a second query for the paid figure. */
        totalCents: balance,
        amountPaidCents: 0,
        issueDate: (i.due_date as string) ?? "",
      };
    }),
    recentPayments: list(d.recent_payments).map((p) => ({
      id: p.id as string,
      paidOn: p.paid_on as string,
      partnerName: (p.partner_name as string) ?? "Unknown partner",
      invoiceNumber: (p.invoice_number as string) ?? null,
      amountCents: num(p.amount_cents),
      currency: (p.currency as string) ?? "USD",
      method: (p.method as string) ?? "—",
      status: (p.status as string) ?? "succeeded",
      state: (p.state as string) ?? "unreconciled",
    })),
    attention: list(d.attention).map((a) => ({
      kind: a.kind as string,
      severity: (a.severity as string) ?? "medium",
      count: num(a.count),
      amountCents: num(a.amount_cents),
    })),
    collectedThisMonthCents: num(d.collected_this_month),
    expensesThisMonthCents: num(d.expenses_this_month),
    testPartners: num(d.test_partners),
  };
}

export const useFinanceOverview = (months = 9) =>
  useQuery({
    queryKey: ["finance", "overview", months],
    queryFn: () => fetchFinanceOverview(months),
    staleTime: 60_000,
  });
