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

export type PresenceState = "clocked_in" | "on_break" | "on_lunch" | "clocked_out" | "not_in" | "on_leave";

export interface Presence {
  userId: string;
  state: PresenceState;
  /** When the current state began — the open entry's start, or the last clock-out. */
  since: string | null;
  firstIn: string | null;
  workMinutes: number;
  /** What the open entry says they are on, when they wrote one. */
  activity: string | null;
  teamName: string | null;
  positionTitle: string | null;
  leaveLabel: string | null;
}

export const PRESENCE_LABEL: Record<PresenceState, string> = {
  clocked_in: "Working",
  on_break: "On break",
  on_lunch: "On lunch",
  clocked_out: "Clocked out",
  not_in: "Not in yet",
  on_leave: "On leave",
};

/** Dot colours, in the order a manager scans them. */
export const PRESENCE_TONE: Record<PresenceState, string> = {
  clocked_in: "bg-status-success",
  on_break: "bg-amber-500",
  on_lunch: "bg-blue-500",
  clocked_out: "bg-muted-foreground/50",
  not_in: "bg-muted-foreground/30",
  on_leave: "bg-status-danger",
};

export const PRESENCE_ORDER: PresenceState[] = ["clocked_in", "on_break", "on_lunch", "clocked_out", "not_in", "on_leave"];

/** The pill's own colours — readable at rest, on hover and on a selected row (rule 15). */
export const PRESENCE_PILL: Record<PresenceState, string> = {
  clocked_in: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800",
  on_break: "border-amber-500/40 bg-amber-500/10 text-amber-900",
  on_lunch: "border-blue-500/30 bg-blue-500/10 text-blue-800",
  clocked_out: "border-border bg-muted text-muted-foreground",
  not_in: "border-border bg-muted text-muted-foreground",
  on_leave: "border-destructive/30 bg-status-danger-tint text-status-danger",
};

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
        activity: (r.activity as string) ?? null,
        teamName: (r.team_name as string) ?? null,
        positionTitle: (r.position_title as string) ?? null,
        leaveLabel: (r.leave_label as string) ?? null,
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
  const out = { clocked_in: 0, on_break: 0, on_lunch: 0, clocked_out: 0, not_in: 0, on_leave: 0 };
  for (const p of rows) out[p.state] += 1;
  return out;
}
