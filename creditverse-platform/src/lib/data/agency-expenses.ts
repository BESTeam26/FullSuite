/**
 * What BES pays out.
 *
 * Deliberately small (Dee, 2026-09-07: "the goal is NOT to build Xero"). No
 * journals, no chart of accounts, no period close. It exists to complete one
 * owner question:
 *
 *   NET CASH THIS MONTH = collected − expenses actually paid
 *
 * The distinction that carries the whole file: `due_date` is when a bill is
 * owed, `paid_on` is when the money left. A bill that is due is not money out,
 * and the dashboard shows the two separately because the difference is the
 * thing an owner is actually deciding about.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface AgencyExpense {
  id: string;
  vendor: string;
  description: string | null;
  category: string | null;
  dueDate: string | null;
  paidOn: string | null;
  amountCents: number;
  currency: string;
  paymentMethod: string | null;
  transactionType: string | null;
  status: "upcoming" | "due" | "paid" | "overdue" | "void";
  invoiceUrl: string | null;
  receiptUrl: string | null;
  notes: string | null;
  templateId: string | null;
}

export interface ExpenseTemplate {
  id: string;
  vendor: string;
  description: string | null;
  category: string | null;
  amountCents: number;
  currency: string;
  cadence: string;
  dueDay: number | null;
  paymentMethod: string | null;
  active: boolean;
}

// prettier-ignore
const EXPENSE_COLUMNS = "id, vendor, description, category, due_date, paid_on, amount_cents, currency, payment_method, transaction_type, status, invoice_url, receipt_url, notes, template_id";

const mapExpense = (r: Record<string, unknown>): AgencyExpense => ({
  id: r.id as string,
  vendor: r.vendor as string,
  description: (r.description as string) ?? null,
  category: (r.category as string) ?? null,
  dueDate: (r.due_date as string) ?? null,
  paidOn: (r.paid_on as string) ?? null,
  amountCents: Number(r.amount_cents ?? 0),
  currency: (r.currency as string) ?? "USD",
  paymentMethod: (r.payment_method as string) ?? null,
  transactionType: (r.transaction_type as string) ?? null,
  status: (r.status as AgencyExpense["status"]) ?? "upcoming",
  invoiceUrl: (r.invoice_url as string) ?? null,
  receiptUrl: (r.receipt_url as string) ?? null,
  notes: (r.notes as string) ?? null,
  templateId: (r.template_id as string) ?? null,
});

/**
 * One month of expenses: everything paid in it, plus everything still owed.
 *
 * Two windows in one bounded query rather than "all expenses ever" — an
 * unpaid bill from two months ago is still money BES owes and belongs in the
 * outstanding figure, so it cannot be filtered out by date alone.
 */
export async function fetchExpenses(year: number, month: number): Promise<AgencyExpense[]> {
  const sb = requireSupabase();
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  const from = `${year}-${mm}-01`;
  const to = `${year}-${mm}-${String(last).padStart(2, "0")}`;
  const { data, error } = await sb
    .from("agency_expenses").select(EXPENSE_COLUMNS)
    .or(`and(paid_on.gte.${from},paid_on.lte.${to}),status.in.(upcoming,due,overdue)`)
    .order("due_date", { nullsFirst: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((r) => mapExpense(r as Record<string, unknown>));
}

export async function fetchExpenseTemplates(): Promise<ExpenseTemplate[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("agency_expense_templates")
    .select("id, vendor, description, category, amount_cents, currency, cadence, due_day, payment_method, active")
    .order("vendor");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string, vendor: r.vendor as string,
      description: (r.description as string) ?? null,
      category: (r.category as string) ?? null,
      amountCents: Number(r.amount_cents ?? 0),
      currency: (r.currency as string) ?? "USD",
      cadence: (r.cadence as string) ?? "monthly",
      dueDay: r.due_day === null || r.due_day === undefined ? null : Number(r.due_day),
      paymentMethod: (r.payment_method as string) ?? null,
      active: Boolean(r.active),
    };
  });
}

export async function saveExpense(input: {
  id?: string; agencyId: string; vendor: string; description?: string;
  category?: string; dueDate?: string | null; paidOn?: string | null;
  amountCents: number; currency?: string; paymentMethod?: string | null;
  transactionType?: string | null; invoiceUrl?: string | null;
  receiptUrl?: string | null; notes?: string | null;
}): Promise<void> {
  const sb = requireSupabase();
  const row = {
    agency_id: input.agencyId, vendor: input.vendor.trim(),
    description: input.description?.trim() || null,
    category: input.category?.trim() || null,
    due_date: input.dueDate || null, paid_on: input.paidOn || null,
    amount_cents: input.amountCents, currency: input.currency ?? "USD",
    payment_method: input.paymentMethod?.trim() || null,
    transaction_type: input.transactionType || null,
    invoice_url: input.invoiceUrl?.trim() || null,
    receipt_url: input.receiptUrl?.trim() || null,
    notes: input.notes?.trim() || null,
  };
  /* `status` is never sent: a database trigger derives it from the dates, so a
     bill cannot be marked paid without a date the money left. */
  const q = input.id
    ? sb.from("agency_expenses").update(row as never).eq("id", input.id)
    : sb.from("agency_expenses").insert(row as never);
  const { error } = await q;
  if (error) throw error;
}

/** Record that a bill was actually paid, on the day it left. */
export async function markExpensePaid(id: string, paidOn: string, receiptUrl?: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("agency_expenses")
    .update({ paid_on: paidOn, receipt_url: receiptUrl?.trim() || null } as never).eq("id", id);
  if (error) throw error;
}

export async function saveExpenseTemplate(input: {
  id?: string; agencyId: string; vendor: string; description?: string;
  category?: string; amountCents: number; currency?: string;
  cadence?: string; dueDay?: number | null; paymentMethod?: string | null;
  active?: boolean;
}): Promise<void> {
  const sb = requireSupabase();
  const row = {
    agency_id: input.agencyId, vendor: input.vendor.trim(),
    description: input.description?.trim() || null,
    category: input.category?.trim() || null,
    amount_cents: input.amountCents, currency: input.currency ?? "USD",
    cadence: input.cadence ?? "monthly", due_day: input.dueDay ?? null,
    payment_method: input.paymentMethod?.trim() || null,
    active: input.active ?? true,
  };
  const q = input.id
    ? sb.from("agency_expense_templates").update(row as never).eq("id", input.id)
    : sb.from("agency_expense_templates").insert(row as never);
  const { error } = await q;
  if (error) throw error;
}

/**
 * Create this month's recurring bills from the templates.
 *
 * Idempotent — (template, due date) is unique — so pressing it twice does not
 * double the month's outgoings.
 */
export async function generateMonthlyExpenses(agencyId: string, year: number, month: number): Promise<number> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("generate_expenses_for_month", {
    p_agency: agencyId, p_year: year, p_month: month,
  });
  if (error) throw error;
  return Number(data ?? 0);
}
