/**
 * Who is on right now, for the people you manage.
 *
 * One bounded call to `team_presence()`, which reads the canonical clock and
 * answers only for `managed_people()` — a lead sees their team, a division
 * manager their division, the owner the company. Refetched when the tab comes
 * back to the front and every two minutes while it is open: presence is worth
 * knowing, not worth a socket (rule 22 — no polling loops, event-shaped cost).
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

export type PresenceState = "clocked_in" | "on_break" | "on_lunch" | "clocked_out" | "not_in";

export interface Presence {
  userId: string;
  state: PresenceState;
  /** When the current state began — the open entry's start, or the last clock-out. */
  since: string | null;
  firstIn: string | null;
  workMinutes: number;
}

export const PRESENCE_LABEL: Record<PresenceState, string> = {
  clocked_in: "Working",
  on_break: "On break",
  on_lunch: "On lunch",
  clocked_out: "Clocked out",
  not_in: "Not in yet",
};

/** Dot colours, in the order a manager scans them. */
export const PRESENCE_TONE: Record<PresenceState, string> = {
  clocked_in: "bg-status-success",
  on_break: "bg-amber-500",
  on_lunch: "bg-blue-500",
  clocked_out: "bg-muted-foreground/50",
  not_in: "bg-muted-foreground/30",
};

export const PRESENCE_ORDER: PresenceState[] = ["clocked_in", "on_break", "on_lunch", "clocked_out", "not_in"];

export function useTeamPresence(options: { enabled?: boolean } = {}) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const q = useQuery({
    queryKey: ["workforce", "presence"],
    queryFn: async (): Promise<Presence[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("team_presence" as never);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        userId: r.user_id as string,
        state: r.state as PresenceState,
        since: (r.since as string) ?? null,
        firstIn: (r.first_in as string) ?? null,
        workMinutes: Number(r.work_minutes ?? 0),
      }));
    },
    enabled: live && (options.enabled ?? true),
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });
  return {
    presence: q.data ?? [],
    byUser: new Map((q.data ?? []).map((p) => [p.userId, p])),
    isLoading: live && q.isLoading,
    error: q.error ? (q.error as Error).message : null,
  };
}

/** How many people are in each state — the header line of the card. */
export function presenceCounts(rows: readonly Presence[]): Record<PresenceState, number> {
  const out = { clocked_in: 0, on_break: 0, on_lunch: 0, clocked_out: 0, not_in: 0 };
  for (const p of rows) out[p.state] += 1;
  return out;
}
