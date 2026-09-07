import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  approveLetter, attestLetter, createDraftLetter, createLetterTemplate, deactivateLetterTemplate, fetchClientRounds, fetchLetterTemplates,
  markLetterMailed, openDisputeRound, updateLetterBody, type DisputeStrategy,
} from "@/lib/data/letters";

export const letterTemplatesKey = ["letters", "templates"] as const;
export const clientRoundsKey = (clientId: string | null) => ["letters", "rounds", clientId] as const;

export function useLetterTemplates() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const qc = useQueryClient();
  const q = useQuery({ queryKey: letterTemplatesKey, queryFn: fetchLetterTemplates, enabled: live, staleTime: 60_000 });
  const refresh = () => void qc.invalidateQueries({ queryKey: letterTemplatesKey });
  return {
    live,
    templates: q.data ?? [],
    isLoading: live && q.isLoading,
    error: (q.error as Error | null)?.message ?? null,
    create: useMutation({ mutationFn: createLetterTemplate, onSuccess: refresh }),
    deactivate: useMutation({ mutationFn: deactivateLetterTemplate, onSuccess: refresh }),
  };
}

/** A client's rounds and letters with one refresh for every transition; the activity timeline is invalidated too. */
export function useClientLetters(clientId: string | null) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const qc = useQueryClient();
  const q = useQuery({ queryKey: clientRoundsKey(clientId), queryFn: () => fetchClientRounds(clientId!), enabled: live && !!clientId, staleTime: 15_000 });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: clientRoundsKey(clientId) });
    void qc.invalidateQueries({ queryKey: ["activity"] });
    void qc.invalidateQueries({ queryKey: ["creditops"] });
  };
  return {
    live,
    /* Shared by every letter action, and by posting — a posted letter changes
       its status and its timers, which are on the same cached query. */
    refresh,
    rounds: q.data?.rounds ?? [],
    letters: q.data?.letters ?? [],
    openRound: q.data?.rounds.find((r) => r.closedAt === null) ?? null,
    isLoading: live && !!clientId && q.isLoading,
    error: (q.error as Error | null)?.message ?? null,
    openRoundMutation: useMutation({ mutationFn: (v: { strategy: DisputeStrategy; resetCycle: boolean }) => openDisputeRound(clientId!, v.strategy, v.resetCycle), onSuccess: refresh }),
    createDraft: useMutation({ mutationFn: createDraftLetter, onSuccess: refresh }),
    attest: useMutation({ mutationFn: (v: Parameters<typeof attestLetter>) => attestLetter(...v), onSuccess: refresh }),
    updateBody: useMutation({ mutationFn: (v: { letterId: string; body: string }) => updateLetterBody(v.letterId, v.body), onSuccess: refresh }),
    approve: useMutation({ mutationFn: approveLetter, onSuccess: refresh }),
    markMailed: useMutation({ mutationFn: (letterId: string) => markLetterMailed(letterId), onSuccess: refresh }),
  };
}
