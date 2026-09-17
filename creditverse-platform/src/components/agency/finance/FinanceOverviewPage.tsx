/**
 * Finance Overview — the executive command centre.
 *
 * Dee's brief, 2026-09-17: in under five seconds, answer how much BES
 * collected, how much is still owed, who is overdue, what will collect
 * automatically, what failed, what needs attention, what was spent, and the
 * net cash position.
 *
 * ── THREE NUMBERS THAT ARE NEVER ONE ──────────────────────────────────────
 *
 * "Do not use invoice face value as collected revenue." Invoiced is what BES
 * asked for. Collected is what arrived. Outstanding is what is still owed on
 * open invoices. They are separate cards with separate words, permanently.
 *
 * ── AND A ZERO THAT IS NOT A ZERO ─────────────────────────────────────────
 *
 * "Never show meaningless zeros after an API failure." A failed query here
 * shows what failed and offers a retry. It does not render $0.00, which reads
 * as "BES collected nothing" rather than "we could not ask".
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Area, AreaChart, CartesianGrid, Cell, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertCircle, AlertTriangle, ArrowRight, Banknote, CircleDollarSign,
  Clock, Receipt, TrendingUp, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format-date";
import { formatMoneyIn } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { useFinanceOverview } from "@/lib/data/use-finance-overview";
import {
  agingBuckets, agingTotalCents, attentionCounts, automaticCents,
  cashSeries, monthsEnding, upcomingCollections,
} from "@/lib/finance/finance-overview";
import { ATTENTION_KINDS } from "@/lib/finance/attention-kinds";

const money = (cents: number) => formatMoneyIn(cents / 100, "USD");

/* Green for money in, red for money out, amber for what needs a person.
   Dee's colour rule, applied once here rather than per chart. */
const INK = {
  in: "hsl(var(--status-success-hsl, 142 71% 33%))",
  out: "hsl(var(--status-danger-hsl, 0 72% 51%))",
  net: "hsl(var(--primary))",
};
const AGE_INK = ["#0f8a5f", "#f0b429", "#f08c29", "#e05a2b", "#c2341f"];

const Card = ({ title, children, action }: {
  title: string; children: React.ReactNode; action?: React.ReactNode;
}) => (
  <section className="rounded-xl border border-border bg-card p-4">
    <header className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      {action}
    </header>
    {children}
  </section>
);

const Figure = ({ label, value, icon: Icon, tone, note }: {
  label: string; value: string; icon: typeof Wallet;
  tone?: "good" | "warn" | "bad"; note?: string;
}) => (
  <div className="rounded-xl border border-border bg-card p-3">
    <div className="flex items-center gap-2">
      <span className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
        tone === "bad" ? "bg-red-500/10 text-red-700"
          : tone === "warn" ? "bg-amber-500/10 text-amber-700"
          : tone === "good" ? "bg-emerald-500/10 text-emerald-700"
          : "bg-primary/10 text-primary",
      )}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <p className="truncate text-[11px] font-semibold text-muted-foreground">{label}</p>
    </div>
    <p className="mt-1.5 text-xl font-bold tabular-nums text-foreground">{value}</p>
    {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
  </div>
);

export function FinanceOverviewPage() {
  const overview = useFinanceOverview(9);
  const d = overview.data;

  const model = useMemo(() => {
    if (!d) return null;
    const buckets = agingBuckets(d.openInvoices, d.today);
    const outstanding = agingTotalCents(buckets);
    const overdue = buckets.filter((b) => b.key !== "current")
      .reduce((s, b) => s + b.amountCents, 0);
    const overdueCount = buckets.filter((b) => b.key !== "current")
      .reduce((s, b) => s + b.invoices, 0);

    const series = cashSeries(
      d.months.map((m) => ({ on: `${m.month}-15`, amountCents: m.collectedCents })),
      d.months.map((m) => ({ on: `${m.month}-15`, amountCents: m.expensesCents })),
      monthsEnding(d.today.slice(0, 7), d.months.length || 9),
    );

    const partnerNames = Object.fromEntries(d.openInvoices.map((i) => [i.groupId, i.partnerName]));
    const methods = new Map(d.openInvoices.map((i) => [i.groupId, { method: i.method, autopay: i.autopay }]));
    const upcoming = upcomingCollections(
      d.openInvoices, partnerNames,
      (g) => methods.get(g) ?? { method: "manual", autopay: false },
      d.today, 30,
    );

    return {
      buckets, outstanding, overdue, overdueCount, series, upcoming,
      automatic: automaticCents(upcoming),
      attention: attentionCounts(d.attention, ATTENTION_KINDS),
      netCash: d.collectedThisMonthCents - d.expensesThisMonthCents,
    };
  }, [d]);

  if (overview.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-muted/40" />
        ))}
      </div>
    );
  }

  /* Not $0.00. "We could not ask" and "the answer is nothing" are different
     facts and must never share a screen. */
  if (overview.isError || !d || !model) {
    return (
      <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-6 text-center">
        <AlertCircle className="mx-auto mb-2 h-5 w-5 text-red-700" />
        <p className="text-sm font-semibold text-foreground">We couldn't load the financial position.</p>
        <p className="mb-3 text-xs text-muted-foreground">
          These figures are nothing until they load — no number shown here would be true.
        </p>
        <Button size="sm" variant="outline" onClick={() => void overview.refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── The snapshot strip ─────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Figure label="Revenue Collected" value={money(d.collectedThisMonthCents)}
          icon={CircleDollarSign} tone="good" note="this month, money that arrived" />
        <Figure label="Outstanding" value={money(model.outstanding)}
          icon={Wallet} note="owed on open invoices" />
        <Figure label="Overdue" value={money(model.overdue)} icon={AlertTriangle} tone="bad"
          note={`${model.overdueCount} ${model.overdueCount === 1 ? "invoice" : "invoices"}`} />
        <Figure label="Expenses" value={money(d.expensesThisMonthCents)}
          icon={Receipt} tone="warn" note="this month, paid out" />
        <Figure label="Net Cash" value={money(model.netCash)} icon={TrendingUp}
          tone={model.netCash >= 0 ? "good" : "bad"} note="collected minus paid, not accounting" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* ── Cash in vs cash out ──────────────────────────────────────── */}
        <Card title="Cash In vs Cash Out">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={model.series} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="cashIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={INK.in} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={INK.in} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => `$${Math.round(v / 100_000) / 10}k`} />
                <Tooltip
                  formatter={(v: number, name) => [money(v), name]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="collectedCents" name="Collected" stroke={INK.in} fill="url(#cashIn)" strokeWidth={2} />
                <Area type="monotone" dataKey="expensesCents" name="Expenses" stroke={INK.out} fill="transparent" strokeWidth={2} />
                <Line type="monotone" dataKey="netCents" name="Net" stroke={INK.net} strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* ── Accounts receivable ──────────────────────────────────────── */}
        <Card title="Accounts Receivable">
          {model.outstanding === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nothing outstanding. Every invoice is settled 🎉
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <div className="relative h-36 w-36 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={model.buckets.filter((b) => b.amountCents > 0)} dataKey="amountCents"
                      nameKey="label" innerRadius={44} outerRadius={64} paddingAngle={2} strokeWidth={0}>
                      {model.buckets.filter((b) => b.amountCents > 0).map((b) => (
                        <Cell key={b.key} fill={AGE_INK[model.buckets.findIndex((x) => x.key === b.key)]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => money(v)}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-base font-bold tabular-nums text-foreground">{money(model.outstanding)}</span>
                  <span className="text-[10px] text-muted-foreground">Outstanding</span>
                </div>
              </div>
              <ul className="w-full min-w-0 space-y-1">
                {model.buckets.map((b, idx) => (
                  <li key={b.key}>
                    <Link
                      to={`/app/finance/invoices?age=${b.key}`}
                      className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: AGE_INK[idx] }} />
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{b.label}</span>
                      <span className="tabular-nums font-semibold text-foreground">{money(b.amountCents)}</span>
                      <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
                        {model.outstanding ? `${Math.round((b.amountCents / model.outstanding) * 100)}%` : "0%"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {/* ── Needs attention ────────────────────────────────────────────── */}
      <Card
        title="Needs Attention"
        action={
          <Link to="/app/finance/attention" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        }
      >
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {model.attention.map((a) => (
            <li key={a.kind}>
              <Link
                to={`/app/finance/attention?filter=${a.kind}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  a.count === 0
                    ? "border-border bg-muted/30 hover:bg-muted"
                    : a.tone === "bad" ? "border-red-500/40 bg-red-500/5 hover:bg-red-500/10"
                    : a.tone === "warn" ? "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10"
                    : "border-border bg-card hover:bg-muted",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground">{a.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {a.amountCents > 0 ? `Total ${money(a.amountCents)}` : a.count === 0 ? "Nothing to do" : "Needs a person"}
                  </span>
                </span>
                <span className={cn(
                  "shrink-0 text-lg font-bold tabular-nums",
                  a.count === 0 ? "text-muted-foreground"
                    : a.tone === "bad" ? "text-red-700" : a.tone === "warn" ? "text-amber-700" : "text-foreground",
                )}>
                  {a.count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Recent payments ──────────────────────────────────────────── */}
        <Card
          title="Recent Payments"
          action={
            <Link to="/app/finance/payments" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {d.recentPayments.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No payments recorded yet. They appear here the moment one is received or matched.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-1.5 pr-3 font-semibold">Date</th>
                    <th className="py-1.5 pr-3 font-semibold">Partner</th>
                    <th className="py-1.5 pr-3 font-semibold">Invoice</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">Amount</th>
                    <th className="py-1.5 pr-3 font-semibold">Method</th>
                    <th className="py-1.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {d.recentPayments.map((p) => (
                    <tr key={p.id} className="border-b border-border/40 last:border-b-0">
                      <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">{formatDate(p.paidOn)}</td>
                      <td className="py-1.5 pr-3 font-medium text-foreground">{p.partnerName}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{p.invoiceNumber ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-foreground">
                        {formatMoneyIn(p.amountCents / 100, p.currency)}
                      </td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{p.method}</td>
                      <td className="py-1.5">
                        <span className={cn(
                          "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                          p.state === "review_required"
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-900"
                            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-900",
                        )}>
                          {p.state === "review_required" ? "Matching review" : "Succeeded"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── Upcoming collections ─────────────────────────────────────── */}
        <Card
          title="Upcoming Collections"
          action={
            <span className="text-[11px] text-muted-foreground">
              {money(model.automatic)} collects itself
            </span>
          }
        >
          {model.upcoming.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Nothing falls due in the next 30 days.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-1.5 pr-3 font-semibold">Due</th>
                    <th className="py-1.5 pr-3 font-semibold">Partner</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">Amount</th>
                    <th className="py-1.5 pr-3 font-semibold">Method</th>
                    <th className="py-1.5 font-semibold">AutoPay</th>
                  </tr>
                </thead>
                <tbody>
                  {model.upcoming.slice(0, 8).map((u) => (
                    <tr key={u.invoiceId} className="border-b border-border/40 last:border-b-0">
                      <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                        {u.dueDate === d.today ? <span className="font-semibold text-foreground">Today</span> : formatDate(u.dueDate)}
                      </td>
                      <td className="py-1.5 pr-3 font-medium text-foreground">{u.partnerName}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-foreground">{money(u.amountCents)}</td>
                      <td className="py-1.5 pr-3 capitalize text-muted-foreground">
                        {u.method === "autopay" ? "Card" : u.method}
                      </td>
                      <td className="py-1.5">
                        {u.autopay ? (
                          <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-900">
                            On
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <Clock className="h-3 w-3" />
        Net cash is money collected minus expenses paid, in the month the money moved. It is an
        operating figure, not accounting: no accruals, no depreciation, no tax.
        {d.testPartners > 0 && (
          /* Said, not hidden. Their money is excluded from every figure above,
             and somebody looking at a dashboard deserves to know that a test
             world exists rather than wonder why a number looks low. */
          <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-semibold text-amber-900">
            {d.testPartners} [TEST] {d.testPartners === 1 ? "partner" : "partners"} excluded
          </span>
        )}
        <Banknote className="ml-auto h-3 w-3" />
      </p>
    </div>
  );
}
