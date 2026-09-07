/**
 * What BES is owed, when, and what actually arrived.
 *
 * ── FIVE NUMBERS THAT ARE NOT THE SAME NUMBER ──────────────────────────────
 *
 * The whole point of this module is that these stay apart. Adding them up
 * produces a figure that looks authoritative and answers no real question:
 *
 *   FIXED MRR                 committed recurring run-rate. $299/month is MRR.
 *   VARIABLE RECURRING        a recurring relationship whose amount moves with
 *                             volume: 19 clients × $25 is $475 this month and
 *                             an unknown next month. Recurring, not committed.
 *   ONE-TIME / PROJECT        a $3,000 build. Never MRR, however it is paid.
 *   INSTALMENT                that same build across three months. Still never
 *                             MRR — it is one project value, paid in parts.
 *   COLLECTED                 money that arrived. Only the payment ledger says
 *                             this. An invoice sent is not an invoice paid.
 *
 * ── NORMALISED RUN-RATE IS NOT THIS MONTH'S BILL ───────────────────────────
 *
 * A $150/week service is a $650/month run-rate (150 × 52 / 12) and either four
 * or five actual charges in a real calendar month. The naive "× 4" is wrong
 * every year by four weeks of revenue, so it is not used anywhere here: MRR
 * normalises by the year, and expected collection counts the occurrences that
 * genuinely fall inside the month.
 *
 * ── CANCELLING IS FORWARD-ONLY ─────────────────────────────────────────────
 *
 * A service cancelled on 20 September stops contributing to MRR from that day.
 * The September invoice already earned stands, and September's collection is
 * untouched. Nothing in this file deletes or restates history.
 *
 * No database, no React. The rules, so they can be tested (rule 9) and so no
 * dashboard re-derives them differently (rule 5).
 */

/* ── How a rate repeats ───────────────────────────────────────────────── */

export type RevenueClass =
  | "fixed_recurring"
  | "variable_recurring"
  | "one_time"
  | "unknown";

const CLASS_BY_MODEL: Record<string, RevenueClass> = {
  RECURRING_WEEKLY: "fixed_recurring",
  RECURRING_BIWEEKLY: "fixed_recurring",
  RECURRING_MONTHLY: "fixed_recurring",
  RECURRING_QUARTERLY: "fixed_recurring",
  RECURRING_ANNUAL: "fixed_recurring",
  RETAINER: "fixed_recurring",
  PER_CLIENT: "variable_recurring",
  PER_ROUND: "variable_recurring",
  PER_AGENT: "variable_recurring",
  HOURLY: "variable_recurring",
  FIXED_PROJECT: "one_time",
  ONE_TIME: "one_time",
  CUSTOM: "unknown",
};

export function revenueClass(billingModel: string | null): RevenueClass {
  if (!billingModel) return "unknown";
  return CLASS_BY_MODEL[billingModel] ?? "unknown";
}

/**
 * The documented normalisation. Every factor is the year divided by twelve —
 * no unexplained multiplier, and no month is treated as exactly four weeks.
 */
const MONTHLY_FACTOR: Record<string, number> = {
  RECURRING_WEEKLY: 52 / 12,
  RECURRING_BIWEEKLY: 26 / 12,
  RECURRING_MONTHLY: 1,
  RETAINER: 1,
  RECURRING_QUARTERLY: 1 / 3,
  RECURRING_ANNUAL: 1 / 12,
};

/** A recurring rate expressed as a monthly run-rate, in cents. */
export function normalizeToMonthly(rateCents: number | null, billingModel: string | null): number {
  if (rateCents === null || !billingModel) return 0;
  const factor = MONTHLY_FACTOR[billingModel];
  if (factor === undefined) return 0;
  return Math.round(rateCents * factor);
}

/* ── Calendar arithmetic, in UTC so a timezone cannot move a due date ─── */

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dayOf = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

export interface Month {
  year: number;
  month: number;
}

export const monthOf = (iso: string): Month => ({
  year: Number(iso.slice(0, 4)),
  month: Number(iso.slice(5, 7)),
});

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * How many times a recurring charge actually falls inside one calendar month.
 *
 * `basis` says how the answer was reached, and the interface must show the
 * difference: "scheduled" counted real dates; "normalized" means the invoice
 * day was free text nobody can parse ("the Friday after invoicing"), so the
 * run-rate was used instead. Reporting a guess as a schedule is how a forecast
 * quietly becomes fiction.
 */
export function occurrencesInMonth(
  billingModel: string | null,
  invoiceDay: string | null,
  { year, month }: Month,
  anchorDate?: string | null,
): { occurrences: number; basis: "scheduled" | "normalized" } {
  const last = daysInMonth(year, month);
  const text = (invoiceDay ?? "").trim().toLowerCase();

  if (billingModel === "RECURRING_WEEKLY") {
    const weekday = WEEKDAYS.findIndex((w) => text.startsWith(w.slice(0, 3)) && text.length >= 3);
    if (weekday < 0) return { occurrences: 52 / 12, basis: "normalized" };
    let n = 0;
    for (let d = 1; d <= last; d += 1) if (new Date(utc(year, month, d)).getUTCDay() === weekday) n += 1;
    return { occurrences: n, basis: "scheduled" };
  }

  if (billingModel === "RECURRING_BIWEEKLY") {
    /* Every fourteen days from the day the terms took effect. Without that
       anchor there is no way to know which fortnight is which, so the
       run-rate is used and said to be a run-rate. */
    if (!anchorDate) return { occurrences: 26 / 12, basis: "normalized" };
    const start = dayOf(anchorDate);
    const from = utc(year, month, 1), to = utc(year, month, last);
    if (!Number.isFinite(start) || start > to) return { occurrences: 0, basis: "scheduled" };
    let n = 0;
    for (let t = start; t <= to; t += 14 * 86_400_000) if (t >= from) n += 1;
    return { occurrences: n, basis: "scheduled" };
  }

  if (billingModel === "RECURRING_MONTHLY" || billingModel === "RETAINER") {
    return { occurrences: 1, basis: "scheduled" };
  }
  if (billingModel === "RECURRING_QUARTERLY" || billingModel === "RECURRING_ANNUAL") {
    /* Which month it lands in needs the anchor; the run-rate is the honest
       answer for a month we cannot place. */
    return { occurrences: MONTHLY_FACTOR[billingModel] ?? 0, basis: "normalized" };
  }
  return { occurrences: 0, basis: "scheduled" };
}

/* ── The inputs, as the rest of the application already holds them ────── */

export interface EngagementTerms {
  serviceId: string;
  groupId: string;
  /** Live now? Cancelled and completed engagements bill nothing forward. */
  live: boolean;
  billingModel: string | null;
  rateCents: number | null;
  /** For PER_CLIENT / PER_ROUND / PER_AGENT / HOURLY. */
  quantity: number | null;
  invoiceDay: string | null;
  /** When these terms took effect — also the fortnight anchor. */
  effectiveFrom: string | null;
  /** Recurring billing stops here. Invoices already earned are untouched. */
  cancellationEffectiveOn: string | null;
  /** Total agreed value of a project. Never recurring revenue. */
  contractValueCents: number | null;
}

export interface ScheduledObligation {
  id: string;
  groupId: string;
  serviceId: string | null;
  kind: "instalment" | "recurring" | "one_time";
  dueOn: string;
  amountCents: number;
  status: "scheduled" | "invoiced" | "cancelled";
}

export interface InvoiceRecord {
  id: string;
  groupId: string;
  totalCents: number;
  amountPaidCents: number;
  dueDate: string;
  issueDate: string;
  status: string;
}

export interface PaymentRecord {
  id: string;
  groupId: string;
  amountCents: number;
  refundAmountCents: number;
  paidOn: string;
  status: string;
}

/* ── Recurring revenue ────────────────────────────────────────────────── */

/** Recurring billing still runs on this date. Cancellation is forward-only. */
export function recurringActiveOn(t: EngagementTerms, asOf: string): boolean {
  if (!t.live) return false;
  if (!t.cancellationEffectiveOn) return true;
  return dayOf(asOf) < dayOf(t.cancellationEffectiveOn);
}

export interface RecurringRollup {
  /** Committed monthly run-rate. The only figure that may be called MRR. */
  fixedMrrCents: number;
  /** Recurring, but volume-dependent. Reported beside MRR, never inside it. */
  variableExpectedCents: number;
  /** Live recurring lines with no rate recorded. Not zero — unknown. */
  unpricedRecurring: number;
}

export function rollUpRecurring(terms: EngagementTerms[], asOf: string): RecurringRollup {
  let fixedMrrCents = 0, variableExpectedCents = 0, unpricedRecurring = 0;
  for (const t of terms) {
    const kind = revenueClass(t.billingModel);
    if (kind !== "fixed_recurring" && kind !== "variable_recurring") continue;
    if (!recurringActiveOn(t, asOf)) continue;
    if (t.rateCents === null) { unpricedRecurring += 1; continue; }

    if (kind === "fixed_recurring") {
      fixedMrrCents += normalizeToMonthly(t.rateCents, t.billingModel);
    } else if (t.quantity !== null) {
      variableExpectedCents += Math.round(t.rateCents * t.quantity);
    } else {
      /* A per-client rate with no client count is not $0 of revenue — it is a
         number nobody has supplied. Counting it as zero would understate the
         month and nobody would see why. */
      unpricedRecurring += 1;
    }
  }
  return { fixedMrrCents, variableExpectedCents, unpricedRecurring };
}

/**
 * MRR that stops when a cancellation takes effect.
 *
 * Returns what is lost, so churn can be reported without a second engine.
 */
export function mrrLostToCancellation(terms: EngagementTerms[], from: string, to: string): number {
  let lost = 0;
  for (const t of terms) {
    if (revenueClass(t.billingModel) !== "fixed_recurring") continue;
    if (!t.cancellationEffectiveOn) continue;
    const at = dayOf(t.cancellationEffectiveOn);
    if (at >= dayOf(from) && at <= dayOf(to)) lost += normalizeToMonthly(t.rateCents, t.billingModel);
  }
  return lost;
}

/* ── What BES expects to collect in one calendar month ────────────────── */

export interface ExpectedCollection {
  fixedRecurringCents: number;
  variableRecurringCents: number;
  instalmentCents: number;
  oneTimeCents: number;
  totalCents: number;
  /** Lines whose invoice day could not be read, so a run-rate was used. */
  estimatedLines: number;
}

/**
 * Expected collection uses the SCHEDULE, not the run-rate.
 *
 * A weekly service with five Fridays in a month is expected to bill five
 * times. That is why this number and MRR differ, and why the dashboard shows
 * both rather than choosing one.
 */
export function expectedCollectionForMonth(
  terms: EngagementTerms[],
  schedule: ScheduledObligation[],
  month: Month,
): ExpectedCollection {
  let fixedRecurringCents = 0, variableRecurringCents = 0, estimatedLines = 0;
  const monthStart = `${month.year}-${String(month.month).padStart(2, "0")}-01`;
  const lastDay = daysInMonth(month.year, month.month);
  const monthEnd = `${month.year}-${String(month.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  for (const t of terms) {
    const kind = revenueClass(t.billingModel);
    if (kind !== "fixed_recurring" && kind !== "variable_recurring") continue;
    if (!t.live || t.rateCents === null) continue;
    /* Cancelled before the month began: nothing is expected. Cancelled part
       way through: the occurrences before that date still are. */
    if (t.cancellationEffectiveOn && dayOf(t.cancellationEffectiveOn) <= dayOf(monthStart)) continue;

    if (kind === "variable_recurring") {
      if (t.quantity === null) { estimatedLines += 1; continue; }
      variableRecurringCents += Math.round(t.rateCents * t.quantity);
      continue;
    }

    const { occurrences, basis } = occurrencesInMonth(t.billingModel, t.invoiceDay, month, t.effectiveFrom);
    if (basis === "normalized") estimatedLines += 1;
    fixedRecurringCents += Math.round(t.rateCents * occurrences);
  }

  let instalmentCents = 0, oneTimeCents = 0;
  for (const s of schedule) {
    if (s.status === "cancelled") continue;
    if (s.dueOn < monthStart || s.dueOn > monthEnd) continue;
    if (s.kind === "instalment") instalmentCents += s.amountCents;
    else if (s.kind === "one_time") oneTimeCents += s.amountCents;
    /* kind 'recurring' rows are generated FROM the terms above; counting both
       would bill the same month twice. */
  }

  return {
    fixedRecurringCents,
    variableRecurringCents,
    instalmentCents,
    oneTimeCents,
    totalCents: fixedRecurringCents + variableRecurringCents + instalmentCents + oneTimeCents,
    estimatedLines,
  };
}

/* ── What arrived, and what has not ───────────────────────────────────── */

const inMonth = (iso: string, m: Month) =>
  Number(iso.slice(0, 4)) === m.year && Number(iso.slice(5, 7)) === m.month;

/**
 * Cash collected in a month, by the date the money arrived.
 *
 * An invoice issued 28 August and paid 3 September is September's income on an
 * operating dashboard. Accrual reporting is a different question asked of the
 * same rows, and is deliberately not answered here.
 */
export function collectedInMonth(payments: PaymentRecord[], month: Month): number {
  let total = 0;
  for (const p of payments) {
    if (p.status !== "succeeded") continue;
    if (!inMonth(p.paidOn, month)) continue;
    total += Math.max(p.amountCents - p.refundAmountCents, 0);
  }
  return total;
}

export function refundedInMonth(payments: PaymentRecord[], month: Month): number {
  let total = 0;
  for (const p of payments) {
    if (!inMonth(p.paidOn, month)) continue;
    total += p.refundAmountCents;
  }
  return total;
}

export function invoicedInMonth(invoices: InvoiceRecord[], month: Month): number {
  let total = 0;
  for (const i of invoices) {
    if (i.status === "void" || i.status === "cancelled" || i.status === "draft") continue;
    if (!inMonth(i.issueDate, month)) continue;
    total += i.totalCents;
  }
  return total;
}

export interface Collectible {
  /** Everything still genuinely expected: unpaid invoices plus scheduled work. */
  totalCents: number;
  invoicedUnpaidCents: number;
  notYetInvoicedCents: number;
  overdueCents: number;
}

/**
 * Money BES currently expects to receive.
 *
 * Excludes what a person has closed out — void and cancelled invoices,
 * cancelled schedule rows — and everything already paid. A collectible figure
 * that included them would never go down.
 */
export function runningCollectible(
  invoices: InvoiceRecord[],
  schedule: ScheduledObligation[],
  asOf: string,
): Collectible {
  let invoicedUnpaidCents = 0, overdueCents = 0, notYetInvoicedCents = 0;
  for (const i of invoices) {
    if (["void", "cancelled", "paid", "draft"].includes(i.status)) continue;
    const outstanding = Math.max(i.totalCents - i.amountPaidCents, 0);
    if (outstanding === 0) continue;
    invoicedUnpaidCents += outstanding;
    if (dayOf(i.dueDate) < dayOf(asOf)) overdueCents += outstanding;
  }
  for (const s of schedule) {
    /* Only what has not become an invoice yet — otherwise the same obligation
       is counted twice, once as a plan and once as a bill. */
    if (s.status !== "scheduled") continue;
    notYetInvoicedCents += s.amountCents;
  }
  return {
    totalCents: invoicedUnpaidCents + notYetInvoicedCents,
    invoicedUnpaidCents,
    notYetInvoicedCents,
    overdueCents,
  };
}

/**
 * What an invoice's status should be, given its payments and today.
 *
 * The database trigger is the authority — this mirrors it so a screen can show
 * the right thing before a refetch, and so the rule can be tested without a
 * round trip. Void and cancelled are decisions a person made: money arriving
 * afterwards does not silently reopen them.
 */
export function invoiceStatus(
  totalCents: number,
  paidCents: number,
  dueDate: string,
  today: string,
  current: string,
): string {
  if (current === "void" || current === "cancelled") return current;
  if (totalCents > 0 && paidCents >= totalCents) return "paid";
  if (paidCents > 0) return "partially_paid";
  if (current === "draft") return "draft";
  if (dayOf(dueDate) < dayOf(today)) return "overdue";
  return current;
}

/* ── One partner's position, and the agency's ─────────────────────────── */

export interface FinancialPosition {
  expected: ExpectedCollection;
  recurring: RecurringRollup;
  invoicedCents: number;
  collectedCents: number;
  outstandingCents: number;
  overdueCents: number;
  refundedCents: number;
  /** Contract value of live project engagements. Never recurring revenue. */
  projectValueCents: number;
}

export function financialPosition(
  terms: EngagementTerms[],
  schedule: ScheduledObligation[],
  invoices: InvoiceRecord[],
  payments: PaymentRecord[],
  month: Month,
  asOf: string,
): FinancialPosition {
  const collectible = runningCollectible(invoices, schedule, asOf);
  let projectValueCents = 0;
  for (const t of terms) {
    if (revenueClass(t.billingModel) === "one_time" && t.live) {
      projectValueCents += t.contractValueCents ?? t.rateCents ?? 0;
    }
  }
  return {
    expected: expectedCollectionForMonth(terms, schedule, month),
    recurring: rollUpRecurring(terms, asOf),
    invoicedCents: invoicedInMonth(invoices, month),
    collectedCents: collectedInMonth(payments, month),
    outstandingCents: collectible.invoicedUnpaidCents,
    overdueCents: collectible.overdueCents,
    refundedCents: refundedInMonth(payments, month),
    projectValueCents,
  };
}

/* ── The other side: what BES pays out ────────────────────────────────── */

export interface ExpenseRecord {
  id: string;
  amountCents: number;
  dueDate: string | null;
  paidOn: string | null;
  status: string;
}

export interface ExpenseRollup {
  /** Money that actually left the bank this month. */
  paidCents: number;
  /** Bills falling due this month that are not paid yet. */
  dueCents: number;
  /** Unpaid and past their date — from any month, because they are still owed. */
  overdueCents: number;
}

/**
 * Expenses split the same way revenue is: what moved, and what is owed.
 *
 * `paid_on` is the cash date and `due_date` is the obligation. A bill that is
 * due is not money out — and an owner deciding what to pay this week needs
 * them apart, not summed.
 */
export function rollUpExpenses(expenses: ExpenseRecord[], month: Month, asOf: string): ExpenseRollup {
  let paidCents = 0, dueCents = 0, overdueCents = 0;
  for (const e of expenses) {
    if (e.status === "void") continue;
    if (e.paidOn) {
      if (inMonth(e.paidOn, month)) paidCents += e.amountCents;
      continue;
    }
    if (!e.dueDate) continue;
    if (dayOf(e.dueDate) < dayOf(asOf)) overdueCents += e.amountCents;
    else if (inMonth(e.dueDate, month)) dueCents += e.amountCents;
  }
  return { paidCents, dueCents, overdueCents };
}

/**
 * The owner's operating figure: cash in less cash out, this month.
 *
 * NOT accounting net income. It ignores accruals, depreciation, tax and
 * anything else an accountant would insist on — it answers "did more come in
 * than went out this month", which is the question being asked.
 */
export function netCashForMonth(collectedCents: number, expensesPaidCents: number): number {
  return collectedCents - expensesPaidCents;
}
