import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { requireSupabase } from "@/lib/supabase/client";

/**
 * Is every client being taken care of?
 *
 * Dee, 2026-09-23: "let's just ensure every client is being taken cared off and
 * they're being assigned to the team, they have SLA to follow to complete all
 * the works."
 *
 * ONE request returns the state of every actionable file, and both the totals
 * and the filtering are derived from it. A card reading "13 Overdue" filters
 * to exactly thirteen rows, because the number and the rows are the same
 * answer — not a server count beside a browser filter that can drift apart.
 */
export type CoverageState = "unassigned" | "owner_away" | "overdue" | "on_track";

export interface CoverageRow {
  client_id: string;
  department: string;
  state: CoverageState;
  due_at: string | null;
  assignee: string | null;
}

/** The four states in the order the design lists them, with their plain names. */
export const COVERAGE_STATES: { id: CoverageState; label: string; hint: string }[] = [
  { id: "unassigned", label: "Unassigned", hint: "Nobody holds these — assign, or staff the queue" },
  { id: "owner_away", label: "Owner away", hint: "Held by somebody on leave or off shift — reassign" },
  { id: "overdue", label: "Overdue", hint: "Owned, available, and past the SLA — follow up" },
  { id: "on_track", label: "On track", hint: "Owned, available, and inside the SLA" },
];

export function useCreditOpsCoverage() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in" && auth.isAgencyStaff;
  return useQuery({
    queryKey: ["creditops", "coverage"],
    queryFn: async (): Promise<CoverageRow[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("creditops_coverage_states" as never);
      if (error) throw error;
      return (data as unknown as CoverageRow[]) ?? [];
    },
    enabled: live,
    /* Short, because this is the screen somebody watches to see whether work is
       being picked up. A stale "2 unassigned" is worse than a slow one. */
    staleTime: 30_000,
  });
}

/** Totals for the strip, and per queue underneath — from the same rows. */
/**
 * The departments with nobody who could take work at all.
 *
 * Separate from the coverage states because it is a question about the
 * ROSTER, not about any file. "Every file here is unassigned" and "this queue
 * has no staff" look identical for a one-file queue and mean opposite things:
 * the first waits for the sweep, the second needs a person hired onto a team.
 */
export function useUnstaffedDepartments() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in" && auth.isAgencyStaff;
  return useQuery({
    queryKey: ["creditops", "unstaffed-departments"],
    queryFn: async (): Promise<string[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("creditops_unstaffed_departments" as never);
      if (error) throw error;
      return ((data as unknown as { department: string }[]) ?? []).map((r) => r.department);
    },
    enabled: live,
    /* A roster changes when somebody joins a team, not minute to minute. */
    staleTime: 5 * 60_000,
  });
}

export function summariseCoverage(rows: readonly CoverageRow[]) {
  const blank = () => ({ active: 0, unassigned: 0, owner_away: 0, overdue: 0, on_track: 0 });
  const total = blank();
  const byQueue = new Map<string, ReturnType<typeof blank>>();

  for (const r of rows) {
    total.active += 1;
    total[r.state] += 1;
    const q = byQueue.get(r.department) ?? blank();
    q.active += 1;
    q[r.state] += 1;
    byQueue.set(r.department, q);
  }
  return {
    total,
    /* Worst first: the queues needing attention are the ones you want at the
       top, not the ones that happen to sort first alphabetically. */
    queues: [...byQueue.entries()]
      .map(([department, counts]) => ({ department, ...counts }))
      .sort((a, b) =>
        b.unassigned + b.owner_away - (a.unassigned + a.owner_away) ||
        b.overdue - a.overdue ||
        a.department.localeCompare(b.department),
      ),
  };
}
