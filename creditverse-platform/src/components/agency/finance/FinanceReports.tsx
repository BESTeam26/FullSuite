/**
 * Finance → Reports.
 *
 * Dee: "Do not create 30 reports." Seven, each answering a question somebody
 * actually asks, each a projection of the canonical ledger rather than a table
 * of its own.
 *
 * Four are live now, from `finance_overview`. The other three need history
 * this database does not have yet — there is not a single recorded payment, so
 * "average days to payment" would be a made-up number. They say so instead of
 * showing zero, because Dee's own rule is that a metric which cannot be
 * calculated shows Not available rather than 0.
 */
import { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoneyIn } from "@/lib/format-money";
import { downloadCsv } from "@/lib/export-csv";
import { useFinanceOverview } from "@/lib/data/use-finance-overview";
import { agingBuckets, cashSeries, monthsEnding } from "@/lib/finance/finance-overview";

const money = (cents: number) => formatMoneyIn(cents / 100, "USD");
const AGE_INK = ["#0f8a5f", "#f0b429", "#f08c29", "#e05a2b", "#c2341f"];

const Report = ({ title, question, children, onExport }: {
  title: string; question: string; children: React.ReactNode; onExport?: () => void;
}) => (
  <section className="rounded-xl border border-border bg-card p-4">
    <header className="mb-3 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        <p className="text-[11px] text-muted-foreground">{question}</p>
      </div>
      {onExport && (
        <Button size="sm" variant="outline" onClick={onExport}>
          <Download className="mr-1 h-3.5 w-3.5" /> CSV
        </Button>
      )}
    </header>
    {children}
  </section>
);

/** A metric that genuinely cannot be worked out yet. Never a zero. */
const NotAvailable = ({ why }: { why: string }) => (
  <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-6 text-center">
    <p className="text-sm font-semibold text-muted-foreground">Not available</p>
    <p className="mt-0.5 text-[11px] text-muted-foreground">{why}</p>
  </div>
);

export function FinanceReports() {
  const overview = useFinanceOverview(12);
  const d = overview.data;

  const model = useMemo(() => {
    if (!d) return null;
    const series = cashSeries(
      d.months.map((m) => ({ on: `${m.month}-15`, amountCents: m.collectedCents })),
      d.months.map((m) => ({ on: `${m.month}-15`, amountCents: m.expensesCents })),
      monthsEnding(d.today.slice(0, 7), d.months.length || 12),
    );
    const buckets = agingBuckets(d.openInvoices, d.today);

    const byPartner = new Map<string, number>();
    for (const i of d.openInvoices) {
      byPartner.set(i.partnerName, (byPartner.get(i.partnerName) ?? 0) + i.balanceCents);
    }
    const partners = [...byPartner.entries()]
      .map(([name, cents]) => ({ name, cents }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 8);

    const byMethod = new Map<string, number>();
    for (const i of d.openInvoices) {
      const key = i.autopay ? "AutoPay" : i.method === "card" ? "Card"
        : i.method.charAt(0).toUpperCase() + i.method.slice(1);
      byMethod.set(key, (byMethod.get(key) ?? 0) + i.balanceCents);
    }
    const methods = [...byMethod.entries()].map(([name, cents]) => ({ name, cents }));

    /* Every payment ever recorded is zero right now. Saying "0 days to
       payment" would be a fabrication, so the report says it cannot be
       calculated and why. */
    const anyPayments = d.months.some((m) => m.collectedCents > 0);

    return { series, buckets, partners, methods, anyPayments };
  }, [d]);

  if (overview.isPending) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-56 animate-pulse rounded-xl border border-border bg-muted/40" />
        ))}
      </div>
    );
  }
  if (overview.isError || !d || !model) {
    return (
      <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-6 text-center">
        <AlertCircle className="mx-auto mb-2 h-5 w-5 text-red-700" />
        <p className="text-sm font-semibold text-foreground">We couldn't load the reports.</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => void overview.refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Report
        title="Revenue collected"
        question="How much money actually arrived, month by month?"
        onExport={() => downloadCsv("revenue-collected",
          ["Month", "Collected", "Expenses", "Net"],
          model.series.map((p) => [p.month, (p.collectedCents / 100).toFixed(2),
            (p.expensesCents / 100).toFixed(2), (p.netCents / 100).toFixed(2)]))}
      >
        {!model.anyPayments ? (
          <NotAvailable why="No payment has been recorded yet, so there is nothing to chart." />
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={model.series} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => `$${Math.round(v / 100_000) / 10}k`} />
                <Tooltip formatter={(v: number) => money(v)}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="collectedCents" name="Collected" fill="#0f8a5f" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Report>

      <Report
        title="Accounts receivable"
        question="What is outstanding, and how old is it?"
        onExport={() => downloadCsv("accounts-receivable",
          ["Age", "Invoices", "Amount"],
          model.buckets.map((b) => [b.label, b.invoices, (b.amountCents / 100).toFixed(2)]))}
      >
        <ul className="space-y-1.5">
          {model.buckets.map((b, i) => (
            <li key={b.key} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: AGE_INK[i] }} />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{b.label}</span>
              <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{b.invoices}</span>
              <span className="w-24 shrink-0 text-right tabular-nums font-semibold text-foreground">
                {money(b.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      </Report>

      <Report
        title="Outstanding by partner"
        question="Who owes the most?"
        onExport={() => downloadCsv("outstanding-by-partner",
          ["Partner", "Outstanding"],
          model.partners.map((p) => [p.name, (p.cents / 100).toFixed(2)]))}
      >
        {model.partners.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Nothing is outstanding.</p>
        ) : (
          <ul className="space-y-1.5">
            {model.partners.map((p) => {
              const widest = model.partners[0].cents || 1;
              return (
                <li key={p.name} className="flex items-center gap-2 text-xs">
                  <span className="w-32 shrink-0 truncate text-foreground">{p.name}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary"
                      style={{ width: `${Math.max((p.cents / widest) * 100, 3)}%` }} />
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums font-semibold text-foreground">
                    {money(p.cents)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Report>

      <Report
        title="Collection methods"
        question="How is what BES is owed going to be collected?"
        onExport={() => downloadCsv("collection-methods",
          ["Method", "Outstanding"],
          model.methods.map((m) => [m.name, (m.cents / 100).toFixed(2)]))}
      >
        {model.methods.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Nothing is outstanding.</p>
        ) : (
          <div className="flex items-center gap-3">
            <div className="h-36 w-36 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={model.methods} dataKey="cents" nameKey="name"
                    innerRadius={40} outerRadius={62} paddingAngle={2} strokeWidth={0}>
                    {model.methods.map((m, i) => <Cell key={m.name} fill={AGE_INK[i % AGE_INK.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => money(v)}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="min-w-0 flex-1 space-y-1">
              {model.methods.map((m, i) => (
                <li key={m.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: AGE_INK[i % AGE_INK.length] }} />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{m.name}</span>
                  <span className="tabular-nums font-semibold text-foreground">{money(m.cents)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Report>

      <Report title="Collections performance" question="How long does BES wait to be paid?">
        <NotAvailable why="This needs paid invoices to measure against. There are none yet, and an average of nothing is not zero." />
      </Report>

      <Report title="AutoPay success rate" question="How often does automatic collection work?">
        <NotAvailable why="AutoPay has not charged anything yet. Production charging is still switched off." />
      </Report>
    </div>
  );
}
