import { requireSupabase } from "@/lib/supabase/client";
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

/**
 * The division and department filter lists for the pivot builder, from the
 * SAME facts the pivot reads (so they can never disagree with it) — but as
 * one light statement of distinct names, not two KPI pivots. Two of the
 * Reporting page's three ~1 s requests became this one (2026-09-30).
 */
export function useScopeOptions(from: string, to: string, organizationId: string | null) {
  const live = useLive();
  return useQuery({
    queryKey: ["reporting", "scope-options", from, to, organizationId ?? ""],
    queryFn: async (): Promise<{ divisions: string[]; departments: string[] }> => {
      const { data, error } = await requireSupabase().rpc("report_scope_options" as never, {
        p_from: from, p_to: to, p_organization: organizationId,
      } as never);
      if (error) throw error;
      const rows = (data ?? []) as unknown as { division: string | null; department: string | null }[];
      const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((v): v is string => !!v && v !== "—"))];
      return { divisions: uniq(rows.map((r) => r.division)), departments: uniq(rows.map((r) => r.department)) };
    },
    enabled: live,
    staleTime: 60_000,
  });
}
