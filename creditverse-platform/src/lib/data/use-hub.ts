/**
 * The organization's hub, read once per organization and shared by the
 * navigation, Home and settings under one query key (rule 14).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { usePermissions } from "@/lib/auth/use-permission";
import { visibleHubModules, type HubModuleRow } from "@/lib/hub/hub-modules";
import {
  deleteHubTool,
  fetchHubTools,
  fetchOrganizationHub,
  saveHubTool,
  setHubModule,
  type SaveHubToolInput,
} from "@/lib/data/hub";

export const hubKey = (orgId: string | null) => ["hub", "modules", orgId] as const;
export const hubToolsKey = (orgId: string | null) => ["hub", "tools", orgId] as const;

export function useOrganizationHub(organizationId: string | null) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: hubKey(organizationId),
    queryFn: () => fetchOrganizationHub(organizationId!),
    enabled: live && !!organizationId,
    staleTime: 5 * 60_000,
  });
  const rows: HubModuleRow[] = q.data ?? [];
  return {
    live,
    rows,
    isLoading: live && !!organizationId && q.isLoading,
    error: (q.error as Error | null)?.message ?? null,
    isActive: (key: string) => rows.some((r) => r.key === key && r.active),
    set: useMutation({
      mutationFn: (v: { key: string; enabled: boolean }) => setHubModule(organizationId!, v.key, v.enabled),
      onSuccess: () => void qc.invalidateQueries({ queryKey: hubKey(organizationId) }),
    }),
  };
}

/**
 * The hub entries the signed-in person should see in the navigation. Empty in
 * the agency view: BES HQ's own chrome is not composed from a customer's hub.
 */
export function useHubNavigation() {
  const { viewMode, activeOrganization } = useAgency();
  const organizationId = viewMode === "subaccount" ? activeOrganization?.id ?? null : null;
  const hub = useOrganizationHub(organizationId);
  const permissions = usePermissions();
  return {
    modules: organizationId ? visibleHubModules(hub.rows, permissions.can) : [],
    isLoading: hub.isLoading || permissions.loading,
  };
}

export function useHubTools(organizationId: string | null, enabled: boolean) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: hubToolsKey(organizationId),
    queryFn: () => fetchHubTools(organizationId!),
    enabled: live && !!organizationId && enabled,
    staleTime: 5 * 60_000,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: hubToolsKey(organizationId) });
  return {
    tools: q.data ?? [],
    isLoading: live && !!organizationId && enabled && q.isLoading,
    error: (q.error as Error | null)?.message ?? null,
    save: useMutation({ mutationFn: (input: SaveHubToolInput) => saveHubTool(input), onSuccess: refresh }),
    remove: useMutation({ mutationFn: deleteHubTool, onSuccess: refresh }),
  };
}
