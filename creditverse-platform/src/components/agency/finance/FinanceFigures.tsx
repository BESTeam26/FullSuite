/**
 * The month's figures, kept apart on purpose.
 *
 * Grouped as three questions an owner actually asks:
 *
 *   WHAT DO WE HAVE?     fixed MRR, variable recurring, project value
 *   WHAT IS THE MONTH?   expected, invoiced, collected
 *   WHAT IS LEFT?        outstanding, overdue, expenses, net cash
 *
 * No card adds a recurring figure to a project figure. A total of "$28,450"
 * that mixes a subscription with a one-off build is not MRR and is not a
 * forecast — it is a number that agrees with nothing next month.
 */
import type { FinancialPosition, ExpenseRollup } from "@/lib/partners/billing-engine";
import { formatMoney } from "@/lib/format-money";

const money = (cents: number) => formatMoney(cents / 100);

export function FinanceFigures({ position, expenses, netCash }: {
  position: FinancialPosition;
  expenses: ExpenseRollup;
  netCash: number;
}) {
  return (
    <div className="space-y-3">
      <Group title="What BES has under agreement">
        <Figure label="Active fixed MRR" value={money(position.recurring.fixedMrrCents)}
          hint="Committed recurring, normalised to a month (rate × period ÷ 12)" />
        <Figure label="Variable expected recurring" value={money(position.recurring.variableExpectedCents)}
          hint="Per client, per round, per agent — recurring but not committed" />
        <Figure label="Live project value" value={money(position.projectValueCents)}
          hint="Builds and fixed-price work. Never counted as MRR" />
      </Group>

      <Group title="This month">
        <Figure label="Expected collection" value={money(position.expected.totalCents)}
          hint={`Fixed ${money(position.expected.fixedRecurringCents)} · variable ${money(position.expected.variableRecurringCents)} · instalments ${money(position.expected.instalmentCents)} · one-time ${money(position.expected.oneTimeCents)}`} />
        <Figure label="Invoiced" value={money(position.invoicedCents)}
          hint="Bills raised. Not income until paid" />
        <Figure label="Collected" value={money(position.collectedCents)} tone="text-emerald-700"
          hint="Payments actually received, by the day the money arrived" />
      </Group>

      <Group title="What is left, and what went out">
        <Figure label="Outstanding" value={money(position.outstandingCents)}
          hint="Invoiced and unpaid" />
        <Figure label="Overdue" value={money(position.overdueCents)}
          tone={position.overdueCents > 0 ? "text-red-700" : undefined}
          hint="Past its due date and still owed" />
        <Figure label="Expenses paid" value={money(expenses.paidCents)}
          hint={`${money(expenses.dueCents)} still due this month · ${money(expenses.overdueCents)} overdue`} />
        <Figure label="Net cash" value={money(netCash)}
          tone={netCash < 0 ? "text-red-700" : "text-emerald-700"}
          hint="Collected less expenses paid. An operating figure, not accounting net income" />
      </Group>

      {position.expected.estimatedLines > 0 && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
          {position.expected.estimatedLines} line{position.expected.estimatedLines === 1 ? "" : "s"} could
          not be placed on a real billing date — an invoice day like "the Friday after invoicing" has no
          date in it — so the monthly run-rate was used instead. Setting a weekday or a day number on
          those terms makes this month's figure exact.
        </p>
      )}
      {position.recurring.unpricedRecurring > 0 && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
          {position.recurring.unpricedRecurring} running service
          {position.recurring.unpricedRecurring === 1 ? " has" : "s have"} no rate or no quantity
          recorded. They are counted as unknown rather than as zero, so the figures above are a floor.
        </p>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </div>
  );
}

function Figure({ label, value, hint, tone }: {
  label: string; value: string; hint?: string; tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone ?? "text-foreground"}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}
