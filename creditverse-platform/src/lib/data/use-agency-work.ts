/**
 * Hooks for the BES team's own workspace.
 *
 * One query key per concern, so a screen showing My Work and the manager's
 * board does not fetch the same rows twice (rule 14).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  addBlocker, addChecklistItem, createAgencyWorkspace, fetchAgencyMembers,
  fetchAgencyTeams, fetchAgencyWorkspaces, fetchBlockers, fetchChecklist,
  removeChecklistItem, renameChecklistItem, resolveBlocker, setChecklistDone,
} from "@/lib/data/agency-workspace";
import type { WorkspaceInput } from "@/lib/data/workspaces";

export const agencyWorkspacesKey = (agencyId: string) => ["agency", "workspaces", agencyId] as const;
export const checklistKey = (itemId: string) => ["work", "checklist", itemId] as const;
export const blockersKey = (itemId: string) => ["work", "blockers", itemId] as const;

function useLive() {
  const auth = useAuth();
  return {
    live: auth.mode === "live" && auth.status === "signed-in",
    agencyId: auth.agencyId ?? null,
    userId: auth.user?.id ?? null,
  };
}

export function useAgencyWorkspaces() {
  const { live, agencyId } = useLive();
  return useQuery({
    queryKey: agencyWorkspacesKey(agencyId ?? ""),
    queryFn: () => fetchAgencyWorkspaces(agencyId!),
    enabled: live && !!agencyId,
    staleTime: 60_000,
  });
}

export function useCreateAgencyWorkspace() {
  const qc = useQueryClient();
  const { agencyId } = useLive();
  return useMutation({
    mutationFn: (input: WorkspaceInput) => createAgencyWorkspace(agencyId!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: agencyWorkspacesKey(agencyId ?? "") }),
  });
}

/** A task's checklist. Only fetched when a task is actually open. */
export function useChecklist(workItemId: string | null) {
  const { live } = useLive();
  return useQuery({
    queryKey: checklistKey(workItemId ?? ""),
    queryFn: () => fetchChecklist(workItemId!),
    enabled: live && !!workItemId,
    staleTime: 15_000,
  });
}

export function useChecklistActions(workItemId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: checklistKey(workItemId) });
  return {
    add: useMutation({ mutationFn: (v: { label: string; position: number }) => addChecklistItem(workItemId, v.label, v.position), onSuccess: refresh }),
    toggle: useMutation({ mutationFn: (v: { id: string; done: boolean }) => setChecklistDone(v.id, v.done), onSuccess: refresh }),
    rename: useMutation({ mutationFn: (v: { id: string; label: string }) => renameChecklistItem(v.id, v.label), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => removeChecklistItem(id), onSuccess: refresh }),
  };
}

export function useBlockers(workItemId: string | null) {
  const { live } = useLive();
  return useQuery({
    queryKey: blockersKey(workItemId ?? ""),
    queryFn: () => fetchBlockers(workItemId!),
    enabled: live && !!workItemId,
    staleTime: 15_000,
  });
}

export function useBlockerActions(workItemId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: blockersKey(workItemId) });
  return {
    add: useMutation({ mutationFn: (v: { blockedById?: string | null; note?: string | null }) => addBlocker({ workItemId, ...v }), onSuccess: refresh }),
    resolve: useMutation({ mutationFn: (id: string) => resolveBlocker(id), onSuccess: refresh }),
  };
}

/** BES staff who can be assigned work. Scoped by `assignable_profiles`. */
export function useAgencyMembers() {
  const { live } = useLive();
  return useQuery({
    queryKey: ["agency", "members"],
    queryFn: fetchAgencyMembers,
    enabled: live,
    staleTime: 300_000,
  });
}

/** BES's own teams. */
export function useAgencyTeams() {
  const { live, agencyId } = useLive();
  return useQuery({
    queryKey: ["agency", "teams", agencyId ?? ""],
    queryFn: () => fetchAgencyTeams(agencyId!),
    enabled: live && !!agencyId,
    staleTime: 300_000,
  });
}
