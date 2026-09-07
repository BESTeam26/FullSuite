/**
 * The four money figures an owner checks before anything else.
 *
 * Rendered only for somebody the database would answer — no capability, no
 * strip. Not a locked card, not four dashes: absent.
 *
 * Deliberately four, not eleven. Home is a place to notice something and go
 * act on it; the rest is one click away on Finance, where the figures that
 * must not be added together are laid out apart.
 */
import { Link } from "react-router-dom";
import { ArrowRight, Banknote } from "lucide-react";
import { useFinancialInputs } from "@/lib/data/use-partner-billing";
import { useExpenses } from "@/lib/data/use-agency-expenses";
import { financialPosition, netCashForMonth, rollUpExpenses, monthOf } from "@/lib/partners/billing-engine";
import { formatMoney } from "@/lib/format-money";

const money = (cents: number) => formatMoney(cents / 100);

export function HomeFinanceStrip() {
  const today = new Date().toISOString().slice(0, 10);
  const month = monthOf(today);
  const inputs = useFinancialInputs(month);
  const expenses = useExpenses(month.year, month.month);

  /* `allowed` is false while permissions resolve too, so nothing flashes in
     and out for somebody who was never going to see it. */
  if (!inputs.allowed || inputs.permissionsLoading) return null;

  const data = inputs.data;
  if (!data) return null;
  const position = financialPosition(
    data.terms, data.schedule, data.invoices, data.payments, month, today,
  );
  const spend = rollUpExpenses(
    (expenses.data ?? []).map((e) => ({
      id: e.id, amountCents: e.amountCents, dueDate: e.dueDate,
      paidOn: e.paidOn, status: e.status,
    })),
    month, today,
  );
  const net = netCashForMonth(position.collectedCents, spend.paidCents);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Banknote className="h-3.5 w-3.5" /> This month
        </h2>
        <Link to="/app/finance" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Finance <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Fixed MRR" value={money(position.recurring.fixedMrrCents)} />
        <Figure label="Expected" value={money(position.expected.totalCents)} />
        <Figure label="Collected" value={money(position.collectedCents)} tone="text-emerald-700" />
        <Figure label="Net cash" value={money(net)}
          tone={net < 0 ? "text-red-700" : "text-emerald-700"} />
      </div>
      {position.overdueCents > 0 && (
        <p className="mt-2 text-xs text-red-700">
          {money(position.overdueCents)} is overdue.
        </p>
      )}
    </section>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${tone ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}
