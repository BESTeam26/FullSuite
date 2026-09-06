/**
 * Settings › KPIs — the organization picks which KPIs its Reports show, in
 * what order, with what target. The catalogue is BES's (data, 0069);
 * BES-internal KPIs never appear here because the database does not return
 * them to an organization caller. BES HQ sees the whole catalogue read-only.
 */
import { useMemo, useState } from "react";
import { BarChart3, Loader2, ShieldAlert } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/settings/shared";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import { removeOrganizationKpiSetting, saveOrganizationKpiSetting, type KpiDefinition } from "@/lib/data/reporting-engine";
import { useInvalidateReporting, useKpiDefinitions, useOrganizationKpiSettings } from "@/lib/data/use-reporting-engine";
import { cn } from "@/lib/utils";

const SERVICE_LABEL: Record<string, string> = { creditops: "CreditOps", fundingops: "FundingOps", operations: "Operations", shared: "Shared" };

export function KpiSettingsSection({ organizationId, canEdit }: { organizationId: string | null; canEdit: boolean }) {
  const auth = useAuth();
  const kpis = useKpiDefinitions();
  const settings = useOrganizationKpiSettings(organizationId);
  const invalidate = useInvalidateReporting();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byService = useMemo(() => {
    const m = new Map<string, KpiDefinition[]>();
    for (const k of kpis.data ?? []) m.set(k.service, [...(m.get(k.service) ?? []), k]);
    return [...m.entries()];
  }, [kpis.data]);
  const setting = (key: string) => (settings.data ?? []).find((s) => s.kpiKey === key);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await fn(); if (organizationId) invalidate(organizationId); } catch (e) { setError(errorMessage(e, "Could not save the KPI setting.")); } finally { setBusy(null); }
  };

  return (
    <SectionCard icon={BarChart3} title="KPIs" description={organizationId ? "Choose which figures your Reports lead with and the target each should reach. Every figure is a deterministic count over your own records." : "The KPI catalogue every organization chooses from. Definitions are data; BES-internal figures are marked and never shown to customers."}>
      {(kpis.isLoading || settings.isLoading) && <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
      <div className="space-y-4">
        {byService.map(([service, list]) => (
          <div key={service} className="rounded-xl border border-border bg-background">
            <p className="border-b border-border/60 px-3 py-2 text-xs font-bold text-foreground">{SERVICE_LABEL[service] ?? service}</p>
            <ul className="divide-y divide-border/60">
              {/* BES-internal figures never reach an organization's settings (rule 16). */}
              {list.filter((k) => !organizationId || !k.besInternal).map((k) => {
                const s = setting(k.key);
                const enabled = !!s?.enabled;
                return (
                  <li key={k.key} className="flex flex-wrap items-center gap-3 px-3 py-2 text-xs">
                    {organizationId && (
                      <Switch checked={enabled} disabled={!canEdit || busy !== null} aria-label={k.label}
                        onCheckedChange={(v) => void run(k.key, () => (v ? saveOrganizationKpiSetting(organizationId, { kpiKey: k.key, enabled: true, target: s?.target ?? null, sort: s?.sort ?? 100 }, auth.user!.id) : removeOrganizationKpiSetting(organizationId, k.key)))} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 font-semibold text-foreground">{k.label}{k.besInternal && <ShieldAlert className="h-3.5 w-3.5 text-status-warning" aria-label="BES-internal" />}</p>
                      <p className="text-[10px] text-muted-foreground">{k.description ?? k.key}{k.besInternal && " · BES-internal — never shown to organizations"}</p>
                    </div>
                    {organizationId && enabled && (
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">Target
                        <input type="number" inputMode="decimal" defaultValue={s?.target ?? ""} disabled={!canEdit} onBlur={(e) => { const v = e.target.value.trim(); void run(k.key, () => saveOrganizationKpiSetting(organizationId, { kpiKey: k.key, enabled: true, target: v === "" ? null : Number(v), sort: s?.sort ?? 100 }, auth.user!.id)); }}
                          className={cn("w-24 rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary")} />
                      </label>
                    )}
                    {busy === k.key && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-status-danger">{error}</p>}
    </SectionCard>
  );
}
