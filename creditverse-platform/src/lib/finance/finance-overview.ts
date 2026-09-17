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
  kind: string;
  label: string;
  count: number;
  amountCents: number;
  tone: "bad" | "warn" | "info";
}

/**
 * The exception tiles, from the counts the `billing_attention` view produced.
 *
 * This no longer DERIVES anything. It used to recount overdue invoices, failed
 * cards and missing terms in the browser, which was a second definition of
 * each — and the dashboard and the queue would have disagreed the first time
 * one of them learned a new rule.
 *
 * A zero is kept, never filtered out: "0 suspended" is a real answer worth
 * showing, and a tile that disappears when it is clear reads as a tile nobody
 * checked.
 */
export function attentionCounts(
  counted: { kind: string; severity: string; count: number; amountCents: number }[],
  known: { kind: string; label: string }[],
): AttentionCount[] {
  const byKind = new Map(counted.map((c) => [c.kind, c]));
  return known.map((k) => {
    const found = byKind.get(k.kind);
    const severity = found?.severity ?? "medium";
    return {
      kind: k.kind,
      label: k.label,
      count: found?.count ?? 0,
      amountCents: found?.amountCents ?? 0,
      tone: severity === "critical" || severity === "high" ? "bad" : severity === "medium" ? "warn" : "info",
    };
  });
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
