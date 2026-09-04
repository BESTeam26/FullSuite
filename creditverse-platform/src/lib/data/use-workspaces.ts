/**
 * Custom Workspaces — hooks. Live mode only; in demo mode nothing is invented.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  createWorkspaceItem,
  fetchAllWorkspaceItems,
  fetchSharedWorkspaces,
  fetchWorkspaceItems,
  fetchWorkspaces,
  updateWorkspaceItemStatus,
  type CreateWorkspaceItemInput,
} from "@/lib/data/workspaces";

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
