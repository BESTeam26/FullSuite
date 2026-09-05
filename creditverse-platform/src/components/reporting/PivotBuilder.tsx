/**
 * Pivot builder — rows (a whitelisted dimension) × KPIs (from the catalogue)
 * over a period, with optional filters. One report_pivot() call per layout;
 * the layout is remembered per browser. Values are the database's; totals are
 * computed only where a total means something (never for distinct counts).
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Table2 } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import { ChartCard } from "@/components/dashboard/ops/ChartCard";
import { useOrgMembers } from "@/lib/data/use-workspaces";
import type { PivotDimension, PivotFilters } from "@/lib/data/reporting-engine";
import { useKpiDefinitions, usePivot } from "@/lib/data/use-reporting-engine";
import { formatKpiValue, monthLabel, shapePivot } from "@/lib/reporting/pivot-shape";
import { cn } from "@/lib/utils";

const DIMENSIONS: { value: PivotDimension; label: string }[] = [
  { value: "month", label: "Month" }, { value: "employee", label: "Team member" }, { value: "department", label: "Department" }, { value: "service", label: "Service" }, { value: "client", label: "Client" }, { value: "organization", label: "Organization" },
];
const STORAGE = "bes.reports.pivot";
interface Layout { rows: PivotDimension; kpis: string[]; months: number }
const DEFAULT: Layout = { rows: "month", kpis: ["letters.mailed", "letters.responded", "funding.submissions", "funding.funded_gross"], months: 6 };
const load = (): Layout => { try { const raw = localStorage.getItem(STORAGE); return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<Layout>) } : DEFAULT; } catch { return DEFAULT; } };

export function PivotBuilder({ organizationId, memberOrganizationId }: { organizationId: string | null; memberOrganizationId: string | null }) {
  const kpis = useKpiDefinitions();
  const { members } = useOrgMembers(memberOrganizationId);
  const [layout, setLayout] = useState<Layout>(load);
  useEffect(() => { try { localStorage.setItem(STORAGE, JSON.stringify(layout)); } catch { /* per-browser convenience only */ } }, [layout]);
  const period = useMemo(() => { const to = new Date(); const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - (layout.months - 1), 1)); return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }; }, [layout.months]);
  const filters: PivotFilters = useMemo(() => (organizationId ? { organizationId } : {}), [organizationId]);
  const available = kpis.data ?? [];
  const chosen = available.filter((k) => layout.kpis.includes(k.key));
  const pivot = usePivot(layout.rows, chosen.map((k) => k.key), filters, period.from, period.to, chosen.length > 0);
  const memberName = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.name])), [members]);
  const table = useMemo(() => shapePivot(pivot.data ?? [], chosen, (key) => layout.rows === "month" ? monthLabel(key) : layout.rows === "employee" ? memberName[key] ?? "Team member" : key), [pivot.data, chosen, layout.rows, memberName]);
  const toggle = (key: string) => setLayout((l) => ({ ...l, kpis: l.kpis.includes(key) ? l.kpis.filter((k) => k !== key) : [...l.kpis, key] }));

  return (
    <ChartCard title="Pivot report" icon={Table2} extra={pivot.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : undefined}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rows</span><OpsSelect value={layout.rows} onValueChange={(v) => setLayout((l) => ({ ...l, rows: v as PivotDimension }))} options={DIMENSIONS} aria-label="Rows" /></label>
        <label className="block"><span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Period</span><OpsSelect value={String(layout.months)} onValueChange={(v) => setLayout((l) => ({ ...l, months: Number(v) }))} options={[{ value: "1", label: "This month" }, { value: "3", label: "Last 3 months" }, { value: "6", label: "Last 6 months" }, { value: "12", label: "Last 12 months" }]} aria-label="Period" /></label>
        <div className="flex flex-wrap gap-1.5">
          {available.map((k) => (
            <button key={k.key} type="button" onClick={() => toggle(k.key)} aria-pressed={layout.kpis.includes(k.key)}
              className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors", layout.kpis.includes(k.key) ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground")}>{k.label}</button>
          ))}
        </div>
      </div>
      {pivot.error && <p role="alert" className="mt-3 text-xs text-status-danger">Could not run the report.</p>}
      <div className="mt-3 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-3 py-2 font-bold">{DIMENSIONS.find((d) => d.value === layout.rows)?.label}</th>{table.columns.map((c) => <th key={c.key} className="px-3 py-2 text-right font-bold">{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {!pivot.isLoading && table.rows.length === 0 && <tr><td colSpan={table.columns.length + 1} className="px-3 py-6 text-center text-muted-foreground">{chosen.length === 0 ? "Pick at least one KPI." : "No records in this period."}</td></tr>}
            {table.rows.map((r) => <tr key={r.key} className="border-t border-border/60 hover:bg-muted/30"><td className="px-3 py-2 font-semibold text-foreground">{r.label}</td>{r.values.map((v, i) => <td key={i} className="px-3 py-2 text-right text-foreground">{formatKpiValue(v, table.columns[i].aggregation)}</td>)}</tr>)}
          </tbody>
          {table.rows.length > 1 && <tfoot><tr className="border-t-2 border-border bg-muted/30 font-bold"><td className="px-3 py-2 text-foreground">Total</td>{table.totals.map((t, i) => <td key={i} className="px-3 py-2 text-right text-foreground">{formatKpiValue(t, table.columns[i].aggregation)}</td>)}</tr></tfoot>}
        </table>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">Deterministic counts over the records you may see, from {period.from} to {period.to}. Distinct-client figures are not totalled across rows.</p>
    </ChartCard>
  );
}
