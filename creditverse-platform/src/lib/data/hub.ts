/**
 * Organization Hub: the module registry with this organization's answers
 * (entitled / enabled / active) in one call, and the tools the company keeps.
 * The database decides all three layers; this layer only shapes rows.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { HubModuleRow, HubPackage } from "@/lib/hub/hub-modules";

export async function fetchOrganizationHub(organizationId: string): Promise<HubModuleRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("organization_hub", { p_org: organizationId });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    key: r.key as string,
    package: r.package as HubPackage,
    label: r.label as string,
    description: r.description as string,
    alwaysOn: r.always_on as boolean,
    status: r.status as "available" | "planned",
    backedBy: r.backed_by as string,
    sort: Number(r.sort),
    entitled: r.entitled as boolean,
    enabled: r.enabled as boolean,
    active: r.active as boolean,
  }));
}

export async function setHubModule(organizationId: string, moduleKey: string, enabled: boolean): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_hub_module", { p_org: organizationId, p_module: moduleKey, p_enabled: enabled });
  if (error) throw error;
}

export interface HubTool {
  id: string;
  label: string;
  url: string;
  note: string | null;
  sort: number;
}

export async function fetchHubTools(organizationId: string): Promise<HubTool[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("organization_hub_tools")
    .select("id, label, url, note, sort")
    .eq("organization_id", organizationId)
    .order("sort")
    .order("label");
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, label: r.label, url: r.url, note: r.note, sort: r.sort }));
}

export interface SaveHubToolInput {
  id: string | null;
  organizationId: string;
  label: string;
  url: string;
  note: string | null;
  sort: number;
}

export async function saveHubTool(input: SaveHubToolInput): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("save_hub_tool", {
    p_id: input.id ?? undefined,
    p_org: input.organizationId,
    p_label: input.label.trim(),
    p_url: input.url.trim(),
    p_note: input.note?.trim() ?? "",
    p_sort: input.sort,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteHubTool(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("delete_hub_tool", { p_id: id });
  if (error) throw error;
}
