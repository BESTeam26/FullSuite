/**
 * One chronological history of a client, for people.
 *
 * Reads `client_history()`, which merges activity, completed work and partner
 * exchanges, collapses the duplicate companion events two triggers write for
 * one operational change, and strips the parser artefacts the ClickUp import
 * left behind.
 *
 * It is a PROJECTION. `activity_events` is append-only and untouched; an
 * auditor reading the raw rows and an agent reading this are looking at the
 * same truth at two levels of detail (Dee, 2026-09-12).
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { requireSupabase } from "@/lib/supabase/client";

export type HistoryKind = "note" | "import" | "assignment" | "handoff" | "change" | "work" | "partner";

export interface HistoryEntry {
  happenedAt: string;
  kind: HistoryKind;
  actor: string | null;
  title: string;
  detail: string | null;
  department: string | null;
}

export function useClientHistory(clientId: string | null) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const q = useQuery({
    queryKey: ["creditops", "history", clientId],
    enabled: live && !!clientId,
    staleTime: 15_000,
    queryFn: async (): Promise<HistoryEntry[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("client_history", { p_client: clientId as string });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        happenedAt: r.happened_at as string,
        kind: (r.kind as HistoryKind) ?? "change",
        actor: (r.actor as string) ?? null,
        title: r.title as string,
        detail: (r.detail as string) ?? null,
        department: (r.department as string) ?? null,
      }));
    },
  });
  return {
    entries: q.data ?? [],
    isLoading: live && q.isLoading,
    error: q.error ? (q.error as Error).message : null,
    live,
  };
}
