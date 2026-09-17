/**
 * What the Finance overview shows, worked out from canonical records.
 *
 * Pure functions, no queries, no components — so the arithmetic that decides
 * whether BES is owed $12,680 or $8,430 can be tested rather than eyeballed
 * on a chart.
 *
 * ── THE DISTINCTION THAT MATTERS ──────────────────────────────────────────
 *
 * Dee: "Do not use invoice face value as collected revenue." Invoiced is what
 * BES asked for; collected is what arrived; outstanding is the difference on
 * invoices still open. They are three different numbers and they are never
 * allowed to become one.
 */
import type { InvoiceRecord, PaymentRecord } from "@/lib/partners/billing-engine";

/** Invoices that are not asking for money: drafts, voids, and history. */
const OPEN_STATUSES = new Set(["sent", "overdue", "partially_paid"]);

export const invoiceBalanceCents = (i: InvoiceRecord): number =>
  Math.max((i.totalCents ?? 0) - (i.amountPaidCents ?? 0), 0);

export const isOpen = (i: InvoiceRecord): boolean =>
  OPEN_STATUSES.has(i.status) && invoiceBalanceCents(i) > 0;

/** Whole days from `due` to `today`. Negative means not yet due. */
export const daysOverdue = (due: string, today: string): number =>
  Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000);

export interface AgingBucket {
  key: "current" | "1-7" | "8-30" | "31-60" | "60+";
  label: string;
  amountCents: number;
  invoices: number;
}

/**
 * Accounts receivable by age. The buckets are Dee's, exactly — and "current"
 * means not yet due, not "recently overdue", so a bill due tomorrow is not
 * counted as a collections problem.
 */
export function agingBuckets(invoices: InvoiceRecord[], today: string): AgingBucket[] {
  const out: AgingBucket[] = [
    { key: "current", label: "Current", amountCents: 0, invoices: 0 },
    { key: "1-7", label: "1 – 7 days", amountCents: 0, invoices: 0 },
    { key: "8-30", label: "8 – 30 days", amountCents: 0, invoices: 0 },
    { key: "31-60", label: "31 – 60 days", amountCents: 0, invoices: 0 },
    { key: "60+", label: "60+ days", amountCents: 0, invoices: 0 },
  ];
  const at = (k: AgingBucket["key"]) => out.find((b) => b.key === k)!;

  for (const i of invoices) {
    if (!isOpen(i)) continue;
    const late = daysOverdue(i.dueDate, today);
    const bucket = late <= 0 ? at("current")
      : late <= 7 ? at("1-7")
      : late <= 30 ? at("8-30")
      : late <= 60 ? at("31-60")
      : at("60+");
    bucket.amountCents += invoiceBalanceCents(i);
    bucket.invoices += 1;
  }
  return out;
}

export const agingTotalCents = (buckets: AgingBucket[]): number =>
  buckets.reduce((sum, b) => sum + b.amountCents, 0);

export interface CashPoint {
  /** `2026-09`, so it sorts and reads the same way. */
  month: string;
  label: string;
  collectedCents: number;
  expensesCents: number;
  netCents: number;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The last `count` months ending with `endMonth`, oldest first. */
export function monthsEnding(endMonth: string, count: number): string[] {
  const [y, m] = endMonth.split("-").map(Number);
  const out: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const total = y * 12 + (m - 1) - back;
    out.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

export interface DatedAmount { on: string; amountCents: number }

/**
 * Cash in against cash out, by month.
 *
 * Money is counted in the month it MOVED, not the month it was invoiced or
 * incurred. That is what makes this a cash view rather than an accounting one
 * — and Dee's rule from the existing Finance page still holds: "the goal is
 * NOT to build Xero."
 */
export function cashSeries(
  collected: DatedAmount[],
  spent: DatedAmount[],
  months: string[],
): CashPoint[] {
  const blank = () => new Map(months.map((m) => [m, 0]));
  const inflow = blank();
  const outflow = blank();

  for (const c of collected) {
    const key = c.on.slice(0, 7);
    if (inflow.has(key)) inflow.set(key, inflow.get(key)! + c.amountCents);
  }
  for (const s of spent) {
    const key = s.on.slice(0, 7);
    if (outflow.has(key)) outflow.set(key, outflow.get(key)! + s.amountCents);
  }

  return months.map((m) => {
    const collectedCents = inflow.get(m) ?? 0;
    const expensesCents = outflow.get(m) ?? 0;
    return {
      month: m,
      label: MONTH_SHORT[Number(m.slice(5, 7)) - 1] ?? m,
      collectedCents,
      expensesCents,
      netCents: collectedCents - expensesCents,
    };
  });
}

export interface AttentionCount {
  key: string;
  label: string;
  detail: string;
  count: number;
  /** Which filter the Billing Attention page should open with. */
  filter: string;
  tone: "bad" | "warn" | "info";
}

export interface AttentionInputs {
  invoices: InvoiceRecord[];
  today: string;
  /** Group ids whose most recent card charge failed. */
  autopayFailedGroups: string[];
  /** Group ids with a live service but no billing rate set. */
  missingTermsGroups: string[];
  /** Payments that arrived without an invoice to sit against. */
  unmatchedPayments: number;
  /** Group ids currently suspended for non-payment. */
  suspendedGroups: string[];
  /** Invoices whose final reminder has gone and which are still unpaid. */
  finalReminderInvoices: number;
}

/**
 * The exception queue, counted.
 *
 * A zero here is a real answer — "0 suspended" is worth saying — so these are
 * never filtered out. What must never happen is a zero standing in for a
 * failed query; the caller passes measured inputs or does not call this.
 */
export function attentionCounts(input: AttentionInputs): AttentionCount[] {
  const pastDue = input.invoices.filter(
    (i) => isOpen(i) && daysOverdue(i.dueDate, input.today) > 0,
  );
  const pastDueCents = pastDue.reduce((s, i) => s + invoiceBalanceCents(i), 0);

  return [
    {
      key: "past-due", label: "Past Due Invoices",
      detail: pastDueCents > 0 ? `Total ${(pastDueCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}` : "Nothing overdue",
      count: pastDue.length, filter: "past-due", tone: "bad",
    },
    {
      key: "autopay-failed", label: "AutoPay Failed",
      detail: "Card charge did not go through",
      count: input.autopayFailedGroups.length, filter: "autopay-failed", tone: "bad",
    },
    {
      key: "missing-terms", label: "Missing Billing Terms",
      detail: "Live service with no rate",
      count: input.missingTermsGroups.length, filter: "missing-terms", tone: "warn",
    },
    {
      key: "matching", label: "Payment Matching Review",
      detail: "Payment with no invoice",
      count: input.unmatchedPayments, filter: "matching", tone: "warn",
    },
    {
      key: "final-reminder", label: "Final Reminder Sent",
      detail: "Awaiting response",
      count: input.finalReminderInvoices, filter: "final-reminder", tone: "warn",
    },
    {
      key: "suspended", label: "Suspended (Non-Payment)",
      detail: "Work is stopped",
      count: input.suspendedGroups.length, filter: "suspended", tone: "info",
    },
  ];
}

export type CollectionMethod = "autopay" | "card" | "paypal" | "wise" | "manual";

export interface UpcomingCollection {
  invoiceId: string;
  invoiceNumber: string;
  groupId: string;
  partnerName: string;
  dueDate: string;
  amountCents: number;
  method: CollectionMethod;
  /** Only meaningful for a card: whether it will charge itself. */
  autopay: boolean;
}

/**
 * What should arrive, and how.
 *
 * "This lets us see how much money should arrive soon." So it is deliberately
 * forward-looking: already-overdue invoices are the Attention queue's problem,
 * not this panel's, and mixing them would make the total mean nothing.
 */
export function upcomingCollections(
  invoices: (InvoiceRecord & { invoiceNumber: string })[],
  partnerNames: Record<string, string>,
  methodFor: (groupId: string) => { method: CollectionMethod; autopay: boolean },
  today: string,
  withinDays = 30,
): UpcomingCollection[] {
  return invoices
    .filter((i) => {
      if (!isOpen(i)) return false;
      const late = daysOverdue(i.dueDate, today);
      return late <= 0 && -late <= withinDays;
    })
    .map((i) => {
      const how = methodFor(i.groupId);
      return {
        invoiceId: i.id,
        invoiceNumber: i.invoiceNumber,
        groupId: i.groupId,
        partnerName: partnerNames[i.groupId] ?? "Unknown partner",
        dueDate: i.dueDate,
        amountCents: invoiceBalanceCents(i),
        method: how.method,
        autopay: how.autopay,
      };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.partnerName.localeCompare(b.partnerName));
}

/** What the panel says will arrive by itself, versus what somebody has to chase. */
export const automaticCents = (rows: UpcomingCollection[]): number =>
  rows.filter((r) => r.autopay).reduce((s, r) => s + r.amountCents, 0);
