/**
 * Custom Workspaces — hooks. Live mode only; in demo mode nothing is invented.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  archiveField,
  createBoard,
  createField,
  createItemType,
  createOrgTeam,
  createStatus,
  createWorkspace,
  createWorkspaceItem,
  deleteItemType,
  deleteStatus,
  fetchAllWorkspaceItems,
  fetchAssignableOrgMembers,
  fetchItemFieldValues,
  fetchOrgTeams,
  setItemFieldValue,
  setTeamMember,
  updateBoard,
  updateStatus,
  updateWorkspace,
  updateWorkspaceItem,
  type FieldInput,
  type StatusInput,
  type WorkspaceInput,
  type WorkspaceItemPatch,
  fetchSharedWorkspaces,
  fetchWorkspaceItems,
  fetchWorkspaces,
  updateWorkspaceItemStatus,
  type CreateWorkspaceItemInput,
} from "@/lib/data/workspaces";
import type { FieldValue } from "@/lib/workspaces/workspace-domain";

const useLive = () => {
  const auth = useAuth();
  return auth.mode === "live" && auth.status === "signed-in" && !!auth.user;
};

export const workspacesKey = (organizationId: string | null) => ["workspaces", organizationId] as const;
export const workspaceItemsKey = (workspaceId: string | null) => ["workspaces", "items", workspaceId] as const;

export function useWorkspaces(organizationId: string | null) {
  const live = useLive();
  const q = useQuery({
    queryKey: workspacesKey(organizationId),
    queryFn: () => fetchWorkspaces(organizationId as string),
    enabled: live && !!organizationId,
    staleTime: 60_000,
  });
  return {
    workspaces: q.data ?? [],
    isLoading: live && !!organizationId && q.isLoading,
    error: q.error ? (q.error as Error).message : null,
    live,
  };
}

/** BES view: every workspace reachable through a live TalentOps share. */
export function useSharedWorkspaces() {
  const live = useLive();
  const q = useQuery({
    queryKey: ["workspaces", "shared"],
    queryFn: fetchSharedWorkspaces,
    enabled: live,
    staleTime: 60_000,
  });
  return {
    workspaces: q.data ?? [],
    isLoading: live && q.isLoading,
    error: q.error ? (q.error as Error).message : null,
    live,
  };
}

/** BES overview: all reachable workspace items in one request. */
export function useAllWorkspaceItems() {
  const live = useLive();
  const q = useQuery({
    queryKey: ["workspaces", "items", "all"],
    queryFn: fetchAllWorkspaceItems,
    enabled: live,
    staleTime: 15_000,
  });
  return { items: q.data ?? [], isLoading: live && q.isLoading, error: q.error ? (q.error as Error).message : null };
}

export function useWorkspaceItems(workspaceId: string | null) {
  const live = useLive();
  const q = useQuery({
    queryKey: workspaceItemsKey(workspaceId),
    queryFn: () => fetchWorkspaceItems(workspaceId as string),
    enabled: live && !!workspaceId,
    staleTime: 15_000,
  });
  return {
    items: q.data ?? [],
    isLoading: live && !!workspaceId && q.isLoading,
    error: q.error ? (q.error as Error).message : null,
  };
}

/** After any item mutation: this workspace's items, plus My Work / Attention which share the engine. */
const useInvalidateWorkspace = () => {
  const qc = useQueryClient();
  return (workspaceId: string) => {
    void qc.invalidateQueries({ queryKey: workspaceItemsKey(workspaceId) });
    void qc.invalidateQueries({ queryKey: ["work"] });
  };
};

export function useCreateWorkspaceItem() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (input: CreateWorkspaceItemInput) => createWorkspaceItem(input),
    onSuccess: (_, input) => invalidate(input.workspaceId),
  });
}

export function useUpdateWorkspaceItemStatus(workspaceId: string) {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({ itemId, statusId }: { itemId: string; statusId: string }) =>
      updateWorkspaceItemStatus(itemId, statusId),
    onSuccess: () => invalidate(workspaceId),
  });
}

/* ------------------------------------------------------------------ */
/* Item edits                                                            */
/* ------------------------------------------------------------------ */

export function useUpdateWorkspaceItem(workspaceId: string) {
  const invalidate = useInvalidateWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, patch }: { itemId: string; patch: WorkspaceItemPatch }) => updateWorkspaceItem(itemId, patch),
    onSuccess: (_, { itemId }) => {
      invalidate(workspaceId);
      // The loggers write activity for status/assignee/priority changes; refresh the item's timeline too.
      void qc.invalidateQueries({ queryKey: ["activity", "work_item", itemId] });
    },
  });
}

export const itemFieldValuesKey = (itemId: string | null) => ["workspaces", "field-values", itemId] as const;

export function useItemFieldValues(itemId: string | null) {
  const live = useLive();
  const q = useQuery({ queryKey: itemFieldValuesKey(itemId), queryFn: () => fetchItemFieldValues(itemId as string), enabled: live && !!itemId, staleTime: 15_000 });
  return { values: q.data ?? {}, isLoading: live && !!itemId && q.isLoading };
}

export function useSetItemFieldValue(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldId, value }: { fieldId: string; value: FieldValue }) => setItemFieldValue(itemId, fieldId, value),
    onSuccess: () => void qc.invalidateQueries({ queryKey: itemFieldValuesKey(itemId) }),
  });
}

/* ------------------------------------------------------------------ */
/* Configuration — one invalidation: the workspace list carries config   */
/* ------------------------------------------------------------------ */

const useInvalidateConfig = () => {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ["workspaces"] });
};

/** One configuration mutation; every one invalidates the workspace list, which carries the config. */
function useConfigMutation<A>(fn: (a: A) => Promise<unknown>) {
  const invalidate = useInvalidateConfig();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

export function useWorkspaceAdmin(organizationId: string) {
  const m = useConfigMutation;
  return {
    createWorkspace: m((input: WorkspaceInput) => createWorkspace(organizationId, input)),
    updateWorkspace: m(({ id, patch }: { id: string; patch: Partial<WorkspaceInput> & { archivedAt?: string | null } }) => updateWorkspace(id, patch)),
    createBoard: m(({ workspaceId, name, position }: { workspaceId: string; name: string; position: number }) => createBoard(workspaceId, name, position)),
    updateBoard: m(({ id, patch }: { id: string; patch: { name?: string; position?: number; archivedAt?: string | null } }) => updateBoard(id, patch)),
    createStatus: m(({ workspaceId, status }: { workspaceId: string; status: StatusInput }) => createStatus(workspaceId, status)),
    updateStatus: m(({ id, patch }: { id: string; patch: Partial<Omit<StatusInput, "key">> }) => updateStatus(id, patch)),
    deleteStatus: m((id: string) => deleteStatus(id)),
    createItemType: m(({ workspaceId, key, label, position }: { workspaceId: string; key: string; label: string; position: number }) => createItemType(workspaceId, key, label, position)),
    deleteItemType: m((id: string) => deleteItemType(id)),
    createField: m(({ workspaceId, field }: { workspaceId: string; field: FieldInput }) => createField(workspaceId, field)),
    archiveField: m(({ id, archived }: { id: string; archived: boolean }) => archiveField(id, archived)),
  };
}

/* ------------------------------------------------------------------ */
/* People and teams                                                      */
/* ------------------------------------------------------------------ */

export function useOrgMembers(organizationId: string | null) {
  const live = useLive();
  const q = useQuery({ queryKey: ["org-members", organizationId], queryFn: () => fetchAssignableOrgMembers(organizationId as string), enabled: live && !!organizationId, staleTime: 60_000 });
  return { members: q.data ?? [], isLoading: live && !!organizationId && q.isLoading };
}

export function useOrgTeams(organizationId: string | null) {
  const live = useLive();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["org-teams", organizationId], queryFn: () => fetchOrgTeams(organizationId as string), enabled: live && !!organizationId, staleTime: 60_000 });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["org-teams", organizationId] });
  const create = useMutation({ mutationFn: (name: string) => createOrgTeam(organizationId as string, name), onSuccess: invalidate });
  const setMember = useMutation({ mutationFn: ({ teamId, userId, member }: { teamId: string; userId: string; member: boolean }) => setTeamMember(teamId, userId, member), onSuccess: invalidate });
  return { teams: q.data ?? [], isLoading: live && !!organizationId && q.isLoading, create, setMember };
}
