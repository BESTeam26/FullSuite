/**
 * Reporting engine (0069): the KPI catalogue, an organization's KPI settings,
 * manual round outcomes, and report_pivot(). Every figure is the database's;
 * this module calls the function and shapes rows. Policies decide reads and
 * writes; BES-internal KPIs never reach an organization caller.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import type { KpiColumn, PivotRowJson } from "@/lib/reporting/pivot-shape";

export interface KpiDefinition extends KpiColumn { description: string | null; service: string; source: string; besInternal: boolean; sort: number }
export interface OrganizationKpiSetting { kpiKey: string; enabled: boolean; target: number | null; sort: number }
export interface RoundOutcome { id: string; clientId: string; roundNumber: number; bureau: string; itemsDisputed: number; deleted: number; updated: number; verified: number; outcomeDate: string; source: string; note: string | null; recordedBy: string | null; createdAt: string }
export type PivotDimension = "employee" | "department" | "organization" | "client" | "month" | "service";
export interface PivotFilters { organizationId?: string; service?: string; department?: string; employeeId?: string }

export async function fetchKpiDefinitions(): Promise<KpiDefinition[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("kpi_definitions").select("*").order("sort");
  if (error) throw error;
  return (data ?? []).map((k) => ({ key: k.key, label: k.label, aggregation: k.aggregation as KpiColumn["aggregation"], description: k.description, service: k.service, source: k.source, besInternal: k.bes_internal, sort: k.sort }));
}
export async function fetchOrganizationKpiSettings(organizationId: string): Promise<OrganizationKpiSetting[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("organization_kpi_settings").select("kpi_key, enabled, target, sort").eq("organization_id", organizationId).order("sort");
  if (error) throw error;
  return (data ?? []).map((s) => ({ kpiKey: s.kpi_key, enabled: s.enabled, target: s.target === null ? null : Number(s.target), sort: s.sort }));
}
export async function saveOrganizationKpiSetting(organizationId: string, setting: OrganizationKpiSetting, actorId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("organization_kpi_settings").upsert({ organization_id: organizationId, kpi_key: setting.kpiKey, enabled: setting.enabled, target: setting.target, sort: setting.sort, updated_by: actorId, updated_at: new Date().toISOString() }, { onConflict: "organization_id,kpi_key" });
  if (error) throw error;
}
export async function removeOrganizationKpiSetting(organizationId: string, kpiKey: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("organization_kpi_settings").delete().eq("organization_id", organizationId).eq("kpi_key", kpiKey);
  if (error) throw error;
}

/** rows × KPIs over a period; the database omits BES-internal KPIs for non-staff callers. */
export async function runPivot(rows: PivotDimension, kpis: string[], filters: PivotFilters, from: string, to: string): Promise<PivotRowJson[]> {
  const sb = requireSupabase();
  const f: Record<string, string> = {};
  if (filters.organizationId) f.organization_id = filters.organizationId;
  if (filters.service) f.service = filters.service;
  if (filters.department) f.department = filters.department;
  if (filters.employeeId) f.employee_id = filters.employeeId;
  const { data, error } = await sb.rpc("report_pivot", { p_rows: rows, p_kpis: kpis, p_filters: f as Json, p_from: from, p_to: to });
  if (error) throw error;
  return ((data ?? []) as unknown[]).filter((r): r is PivotRowJson => !!r && typeof r === "object");
}

export async function fetchRoundOutcomes(clientId: string): Promise<RoundOutcome[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("client_round_outcomes").select("*").eq("client_id", clientId).order("round_number", { ascending: false }).order("outcome_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((o) => ({ id: o.id, clientId: o.client_id, roundNumber: o.round_number, bureau: o.bureau, itemsDisputed: o.items_disputed, deleted: o.deleted, updated: o.updated, verified: o.verified, outcomeDate: o.outcome_date, source: o.source, note: o.note, recordedBy: o.recorded_by, createdAt: o.created_at }));
}
export async function recordRoundOutcome(input: { clientId: string; roundNumber: number; bureau: string; itemsDisputed: number; deleted: number; updated: number; verified: number; outcomeDate: string; note: string | null; actorId: string }): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("client_round_outcomes").insert({ client_id: input.clientId, round_number: input.roundNumber, bureau: input.bureau, items_disputed: input.itemsDisputed, deleted: input.deleted, updated: input.updated, verified: input.verified, outcome_date: input.outcomeDate, note: input.note, recorded_by: input.actorId });
  if (error) throw error;
}
