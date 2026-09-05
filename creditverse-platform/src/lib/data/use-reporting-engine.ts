import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchKpiDefinitions, fetchOrganizationKpiSettings, fetchRoundOutcomes, runPivot, type PivotDimension, type PivotFilters } from "@/lib/data/reporting-engine";

const useLive = () => { const a = useAuth(); return a.mode === "live" && a.status === "signed-in"; };
export const kpiDefinitionsKey = ["reporting", "kpis"] as const;
export const orgKpiSettingsKey = (orgId: string) => ["reporting", "kpi-settings", orgId] as const;
export const roundOutcomesKey = (clientId: string) => ["creditops", "round-outcomes", clientId] as const;

export function useKpiDefinitions() { const live = useLive(); return useQuery({ queryKey: kpiDefinitionsKey, queryFn: fetchKpiDefinitions, enabled: live, staleTime: 5 * 60_000 }); }
export function useOrganizationKpiSettings(orgId: string | null) { const live = useLive(); return useQuery({ queryKey: orgKpiSettingsKey(orgId ?? ""), queryFn: () => fetchOrganizationKpiSettings(orgId!), enabled: live && !!orgId, staleTime: 60_000 }); }
/** One pivot per distinct (rows, kpis, filters, period); fetched only when the builder asks. */
export function usePivot(rows: PivotDimension, kpis: string[], filters: PivotFilters, from: string, to: string, enabled: boolean) {
  const live = useLive();
  return useQuery({ queryKey: ["reporting", "pivot", rows, kpis.join(","), JSON.stringify(filters), from, to], queryFn: () => runPivot(rows, kpis, filters, from, to), enabled: live && enabled && kpis.length > 0, staleTime: 60_000 });
}
export function useRoundOutcomes(clientId: string | null) { const live = useLive(); return useQuery({ queryKey: roundOutcomesKey(clientId ?? ""), queryFn: () => fetchRoundOutcomes(clientId!), enabled: live && !!clientId, staleTime: 30_000 }); }
export function useInvalidateReporting() {
  const qc = useQueryClient();
  return (orgId?: string, clientId?: string) => {
    if (orgId) void qc.invalidateQueries({ queryKey: orgKpiSettingsKey(orgId) });
    if (clientId) void qc.invalidateQueries({ queryKey: roundOutcomesKey(clientId) });
    void qc.invalidateQueries({ queryKey: ["reporting", "pivot"] });
  };
}
