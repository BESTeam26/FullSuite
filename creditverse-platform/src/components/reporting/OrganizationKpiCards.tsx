/**
 * KPI cards from the organization's own settings: each enabled KPI's total
 * over the period, beside its target when one is set. One report_pivot() call
 * (rows = service) supplies every value; the sum across services is the total.
 */
import { useMemo } from "react";
import { Target } from "lucide-react";
import { KpiTile } from "@/components/dashboard/ops/KpiTile";
import { useKpiDefinitions, useOrganizationKpiSettings, usePivot } from "@/lib/data/use-reporting-engine";
import { formatKpiValue } from "@/lib/reporting/pivot-shape";

export function OrganizationKpiCards({ organizationId, from, to }: { organizationId: string; from: string; to: string }) {
  const kpis = useKpiDefinitions();
  const settings = useOrganizationKpiSettings(organizationId);
  const enabled = useMemo(() => (settings.data ?? []).filter((s) => s.enabled).sort((a, b) => a.sort - b.sort), [settings.data]);
  const defs = useMemo(() => enabled.map((s) => (kpis.data ?? []).find((k) => k.key === s.kpiKey)).filter((k): k is NonNullable<typeof k> => !!k), [enabled, kpis.data]);
  const pivot = usePivot("service", defs.map((k) => k.key), { organizationId }, from, to, defs.length > 0);
  if (defs.length === 0) return null;
  const total = (key: string) => (pivot.data ?? []).reduce((s, r) => s + (Number(r[key]) || 0), 0);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {defs.map((k) => {
        const s = enabled.find((x) => x.kpiKey === k.key);
        const v = pivot.data ? total(k.key) : null;
        const hint = s?.target !== null && s?.target !== undefined ? `Target ${formatKpiValue(s.target, k.aggregation)}${v !== null ? v >= s.target ? " · reached" : ` · ${formatKpiValue(s.target - v, k.aggregation)} to go` : ""}` : "No target set";
        return <KpiTile key={k.key} label={k.label} value={pivot.data ? formatKpiValue(v, k.aggregation) : "…"} icon={Target} tone={s?.target !== null && s?.target !== undefined && v !== null && v >= s.target ? "green" : "blue"} hint={hint} />;
      })}
    </div>
  );
}
