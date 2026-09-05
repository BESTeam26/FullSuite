/**
 * Reports — the first live slice of the reporting milestone
 * (ARCHITECTURE_PROPOSAL_REPORTING.md): deterministic figures over canonical
 * rows the caller may see, bucketed by month. Letters and funding are
 * engine-derived outcomes; production feeds the agent ranking for BES staff
 * (organization users receive no production rows). The pivot builder and
 * configurable KPI catalogue follow with their tables.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Award, BarChart3, DollarSign, Loader2, Mail, MailCheck, Send, TrendingUp } from "lucide-react";
import { ChartCard } from "@/components/dashboard/ops/ChartCard";
import { DonutLegend } from "@/components/dashboard/ops/DonutLegend";
import { HorizontalBars } from "@/components/dashboard/ops/HorizontalBars";
import { KpiTile, TONE_FILL } from "@/components/dashboard/ops/KpiTile";
import { MonthlyLines } from "@/components/dashboard/ops/MonthlyLines";
import { StageBarChart } from "@/components/dashboard/ops/StageBarChart";
import { useAuth } from "@/lib/auth/auth-context";
import { useReportingSignals } from "@/lib/data/use-reporting";
import { formatCompactMoney } from "@/lib/funding/dashboard-metrics";
import { bucketByMonth, lastMonths, rate } from "@/lib/reporting/month-series";

const OUTCOME = [
  { key: "Funded", color: TONE_FILL.green }, { key: "Offer Received", color: TONE_FILL.emerald }, { key: "In Review", color: TONE_FILL.blue }, { key: "Stipulations", color: TONE_FILL.amber },
  { key: "Submitted", color: TONE_FILL.purple }, { key: "Declined", color: TONE_FILL.red }, { key: "Withdrawn", color: TONE_FILL.slate },
];

export default function Reporting() {
  const auth = useAuth();
  const now = useMemo(() => new Date(), []);
  const months = useMemo(() => lastMonths(now, 6), [now]);
  const since = months[0].start.toISOString();
  const signals = useReportingSignals(since);
  const d = signals.data;
  const live = auth.mode === "live";

  const mailed = useMemo(() => bucketByMonth(d?.letters ?? [], months, (l) => l.mailedAt), [d, months]);
  const responded = useMemo(() => bucketByMonth(d?.letters ?? [], months, (l) => l.respondedAt), [d, months]);
  const fundedByMonth = useMemo(() => bucketByMonth(d?.funded ?? [], months, (f) => f.fundedAt, (f) => f.gross), [d, months]);
  const submittedByMonth = useMemo(() => bucketByMonth(d?.submissions ?? [], months, (s) => s.submittedAt), [d, months]);
  const totalMailed = mailed.reduce((a, b) => a + b, 0), totalResponded = responded.reduce((a, b) => a + b, 0);
  const fundedTotal = fundedByMonth.reduce((a, b) => a + b, 0), submissionsTotal = submittedByMonth.reduce((a, b) => a + b, 0);
  const fundedCount = (d?.submissions ?? []).filter((s) => s.status === "Funded").length;
  const outcome = useMemo(() => OUTCOME.map((o) => ({ label: o.key, value: (d?.submissions ?? []).filter((s) => s.status === o.key).length, color: o.color })), [d]);
  const topAgents = useMemo(() => {
    const by = new Map<string, { name: string; units: number }>();
    for (const p of d?.production ?? []) { const row = by.get(p.employeeId) ?? { name: p.employeeName, units: 0 }; row.units += p.units; by.set(p.employeeId, row); }
    return [...by.values()].sort((a, b) => b.units - a.units).slice(0, 8).map((r) => ({ label: r.name, value: r.units }));
  }, [d]);

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground">Last six months across CreditOps and FundingOps — deterministic counts over the records you may see. Outcomes here are engine-derived; manual outcomes for clients worked in an outside CRM arrive with the reporting milestone.</p>
        </div>
        {signals.isLoading && <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
        {signals.error && <p role="alert" className="text-xs text-status-danger">Could not load the reports.</p>}
      </div>
      {!live && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Reports read the live database. Demo mode shows nothing here.</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Letters Mailed" value={totalMailed} icon={Mail} tone="emerald" hint="Last six months" />
        <KpiTile label="Responses Received" value={totalResponded} icon={MailCheck} tone="green" />
        <KpiTile label="Response Rate" value={rate(totalResponded, totalMailed) === null ? "—" : `${rate(totalResponded, totalMailed)}%`} icon={TrendingUp} tone="blue" hint="Responded ÷ mailed" />
        <KpiTile label="Submissions" value={submissionsTotal} icon={Send} tone="purple" hint="Sent to lenders" />
        <KpiTile label="Funded Deals" value={fundedCount} icon={Award} tone="green" hint={rate(fundedCount, (d?.submissions ?? []).length) === null ? "No submissions yet" : `${rate(fundedCount, (d?.submissions ?? []).length)}% of submissions`} />
        <KpiTile label="Funded Volume" value={formatCompactMoney(fundedTotal)} icon={DollarSign} tone="amber" hint="Gross, last six months" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Letters mailed vs responses by month" icon={Mail}>
          <MonthlyLines months={months.map((m) => m.label)} series={[{ key: "mailed", label: "Mailed", color: TONE_FILL.emerald, values: mailed }, { key: "responded", label: "Responded", color: TONE_FILL.blue, values: responded }]} />
        </ChartCard>
        <ChartCard title="Funded volume by month" icon={DollarSign}>
          <StageBarChart data={months.map((m, i) => ({ label: m.label, count: fundedByMonth[i] }))} tone="green" height={240} />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Submissions by outcome" icon={BarChart3}>
          <DonutLegend data={outcome} emptyText="No submissions in the period" />
        </ChartCard>
        <ChartCard title="Submissions by month" icon={Send}>
          <StageBarChart data={months.map((m, i) => ({ label: m.label, count: submittedByMonth[i] }))} tone="purple" height={220} />
        </ChartCard>
        <ChartCard title="Top agents by production units" icon={Award} extra={<Link to="/app/lenders" className="text-[11px] font-semibold text-primary hover:underline">Lender scorecard →</Link>}>
          {auth.isAgencyStaff ? <HorizontalBars data={topAgents} tone="amber" unit="Units" emptyText="No production logged in the period." /> : <p className="py-6 text-center text-xs text-muted-foreground">Agent production is a BES-internal figure; your organization's KPIs arrive with the reporting milestone.</p>}
        </ChartCard>
      </div>
    </div>
  );
}
