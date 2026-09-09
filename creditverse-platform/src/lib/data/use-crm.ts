import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  addCrmEngine,
  completeWorkUnit,
  createCrmProject,
  failQa,
  fetchCrmBoard,
  fetchCrmEngineOptions,
  fetchEngineProgress,
  fetchProjectUnits,
  passQa,
  setWaiting,
} from "@/lib/data/crm-projects";
import type { WaitingReason } from "@/lib/crm/crm-domain";

const live = (a: ReturnType<typeof useAuth>) =>
  a.mode === "live" && a.status === "signed-in";

export const crmBoardKey = ["crm", "board"] as const;
export const crmEnginesKey = (p: string) => ["crm", "engines", p] as const;
export const crmUnitsKey = (p: string) => ["crm", "units", p] as const;

/**
 * Every project, with its derived state. One request for the whole board.
 *
 * A short stale time rather than none: the board is what a lead watches while
 * a team works, and a stale progress bar is misleading in a way a stale
 * settings page is not.
 */
export function useCrmBoard() {
  const auth = useAuth();
  return useQuery({
    queryKey: crmBoardKey,
    queryFn: fetchCrmBoard,
    enabled: live(auth),
    staleTime: 15_000,
  });
}

export function useCrmEngines(projectId: string | null) {
  const auth = useAuth();
  return useQuery({
    queryKey: crmEnginesKey(projectId ?? ""),
    queryFn: () => fetchEngineProgress(projectId!),
    enabled: live(auth) && !!projectId,
    staleTime: 15_000,
  });
}

export function useCrmUnits(projectId: string | null) {
  const auth = useAuth();
  return useQuery({
    queryKey: crmUnitsKey(projectId ?? ""),
    queryFn: () => fetchProjectUnits(projectId!),
    enabled: live(auth) && !!projectId,
    staleTime: 15_000,
  });
}

/**
 * Anything that changes a unit changes the engine bars and the board with it,
 * because all three are the same facts counted differently. Refreshing one
 * and not the others is how a screen ends up showing a completed task inside
 * an engine still reading 0%.
 */
const refreshProject = (
  qc: ReturnType<typeof useQueryClient>,
  projectId: string | null,
) => {
  if (projectId) {
    void qc.invalidateQueries({ queryKey: crmUnitsKey(projectId) });
    void qc.invalidateQueries({ queryKey: crmEnginesKey(projectId) });
  }
  void qc.invalidateQueries({ queryKey: crmBoardKey });
  /* A completion writes production and may create a handoff, so the queues
     that show them are stale too. */
  void qc.invalidateQueries({ queryKey: ["work"] });
};

export function useCreateCrmProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCrmProject,
    onSuccess: () => refreshProject(qc, null),
  });
}

export function useAddCrmEngine(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (engineKey: string) => addCrmEngine(projectId, engineKey),
    onSuccess: () => refreshProject(qc, projectId),
  });
}

export function useCompleteWorkUnit(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      unitId: string;
      note?: string | null;
      handoffTeamId?: string | null;
      handoffToUserId?: string | null;
    }) => completeWorkUnit(input),
    onSuccess: () => refreshProject(qc, projectId),
  });
}

export function usePassQa(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ unitId, note }: { unitId: string; note?: string | null }) =>
      passQa(unitId, note),
    onSuccess: () => refreshProject(qc, projectId),
  });
}

export function useFailQa(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ unitId, feedback }: { unitId: string; feedback: string }) =>
      failQa(unitId, feedback),
    onSuccess: () => refreshProject(qc, projectId),
  });
}

export function useSetWaiting(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      unitId,
      reason,
      note,
    }: {
      unitId: string;
      reason: WaitingReason;
      note?: string | null;
    }) => setWaiting(unitId, reason, note),
    onSuccess: () => refreshProject(qc, projectId),
  });
}

export function useCrmEngineOptions() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["crm", "engine-options"] as const,
    queryFn: fetchCrmEngineOptions,
    enabled: live(auth),
    /* The catalogue changes when a template is published — rarely. */
    staleTime: 5 * 60_000,
  });
}
