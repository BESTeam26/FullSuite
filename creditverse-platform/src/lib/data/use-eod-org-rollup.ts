/**
 * The organisation's day, grouped by team — for management.
 *
 * Dee: *"Agency Admin/Owner can have an organization-level EOD dashboard
 * without becoming fake members of every team."* The read is gated on
 * `ops.manage` inside `eod_org_rollup`, so nobody is added to a team to see it
 * and the org chart keeps meaning what it says.
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";

export interface OrgRollupRow {
  teamId: string | null;
  teamName: string;
  department: string | null;
  leadName: string | null;
  members: number;
  submitted: number;
  missing: number;
  needsReview: number;
  withBlockers: number;
  /* Null means nobody reported a figure — not zero. */
  production: number | null;
  completed: number | null;
  minutesLogged: number | null;
}

export function useEodOrgRollup(date: string, enabled: boolean) {
  return useQuery({
    queryKey: ["eod", "org-rollup", date],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<OrgRollupRow[]> => {
      const { data, error } = await requireSupabase().rpc("eod_org_rollup", { p_date: date });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        teamId: (r.team_id as string) ?? null,
        teamName: r.team_name as string,
        department: (r.department as string) ?? null,
        leadName: (r.lead_name as string) ?? null,
        members: Number(r.members ?? 0),
        submitted: Number(r.submitted ?? 0),
        missing: Number(r.missing ?? 0),
        needsReview: Number(r.needs_review ?? 0),
        withBlockers: Number(r.with_blockers ?? 0),
        production: r.production === null ? null : Number(r.production),
        completed: r.completed === null ? null : Number(r.completed),
        minutesLogged: r.minutes_logged === null ? null : Number(r.minutes_logged),
      }));
    },
  });
}
