/**
 * Part 2 of a Team Lead's own EOD: their team's day.
 *
 * Dee, 2026-09-16: *"Do NOT replace the Team Lead's individual report with the
 * department report. A Team Lead EOD consists of PART 1: MY INDIVIDUAL EOD …
 * PART 2: TEAM / DEPARTMENT EOD."*
 *
 * The figures come from each report's FROZEN SNAPSHOT, decided in
 * `eod_team_rollup` rather than here, so a rollup of a past day does not move
 * when today's tasks do.
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

export interface RollupRow {
  employeeId: string;
  employeeName: string;
  teamName: string | null;
  submitted: boolean;
  autoSubmitted: boolean;
  state: string;
  /* Null, not zero. A report with no snapshot has not been measured, and zero
     is a claim that it was (Dee: "show Not available rather than 0"). */
  production: number | null;
  completed: number | null;
  inProgress: number | null;
  blocked: number | null;
  minutesLogged: number | null;
  blockers: string | null;
  helpNeeded: string | null;
}

export const rollupKey = (leadId: string, date: string) =>
  ["eod", "rollup", leadId, date] as const;

export function useEodTeamRollup(date: string) {
  const { user } = useAuth();
  const leadId = user?.id ?? "";
  return useQuery({
    queryKey: rollupKey(leadId, date),
    enabled: !!leadId,
    staleTime: 30_000,
    queryFn: async (): Promise<RollupRow[]> => {
      const { data, error } = await requireSupabase()
        .rpc("eod_team_rollup", { p_lead: leadId, p_date: date });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        employeeId: r.employee_id as string,
        employeeName: r.employee_name as string,
        teamName: (r.team_name as string) ?? null,
        submitted: r.submitted === true,
        autoSubmitted: r.auto_submitted === true,
        state: (r.state as string) ?? "not_started",
        production: r.production === null ? null : Number(r.production),
        completed: r.completed === null ? null : Number(r.completed),
        inProgress: r.in_progress === null ? null : Number(r.in_progress),
        blocked: r.blocked === null ? null : Number(r.blocked),
        minutesLogged: r.minutes_logged === null ? null : Number(r.minutes_logged),
        blockers: (r.blockers as string) ?? null,
        helpNeeded: (r.help_needed as string) ?? null,
      }));
    },
  });
}

/**
 * Totals across the team.
 *
 * A figure is summed only from the people who actually reported one. If
 * everybody's snapshot is missing the total is `null`, not 0 — the difference
 * between "the team produced nothing" and "nobody has told us yet" is the
 * whole point of the rule.
 */
export interface RollupTotals {
  members: number;
  submitted: number;
  missing: number;
  production: number | null;
  completed: number | null;
  inProgress: number | null;
  blocked: number | null;
  minutesLogged: number | null;
}

export function rollupTotals(rows: readonly RollupRow[]): RollupTotals {
  const sum = (pick: (r: RollupRow) => number | null): number | null => {
    const known = rows.map(pick).filter((n): n is number => n !== null);
    return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
  };
  return {
    members: rows.length,
    submitted: rows.filter((r) => r.submitted).length,
    missing: rows.filter((r) => !r.submitted).length,
    production: sum((r) => r.production),
    completed: sum((r) => r.completed),
    inProgress: sum((r) => r.inProgress),
    blocked: sum((r) => r.blocked),
    minutesLogged: sum((r) => r.minutesLogged),
  };
}
