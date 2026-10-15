/**
 * The caller's agency teams, for choosing where a record belongs.
 *
 * One bounded read, cached under one key. RLS (`teams_select`) already limits
 * rows to the caller's agency, and archived teams are excluded here because a
 * retired team is not a valid destination for new work (rule 11: archive is a
 * state, not a deletion — but it is also not "open").
 *
 * The frontend uses this to OFFER teams; the database decides whether the
 * caller may create inside the chosen one (`in_scope` with a null assignee —
 * migration 0023). A team-scoped user picking a team outside their scope is
 * refused server-side, which is why the picker pre-selects from
 * `auth.teamIds` rather than trusting the list alone.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { requireSupabase } from "@/lib/supabase/client";

export interface TeamOption {
  id: string;
  name: string;
  departmentId: string | null;
}

async function fetchAgencyTeams(agencyId: string): Promise<TeamOption[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("teams")
    .select("id,name,department_id")
    .eq("agency_id", agencyId)
    .is("archived_at", null)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((t) => ({ id: t.id, name: t.name, departmentId: t.department_id }));
}

export function useTeams() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in" && !!auth.agencyId;
  const q = useQuery({
    queryKey: ["teams", auth.agencyId],
    queryFn: () => fetchAgencyTeams(auth.agencyId!),
    enabled: live,
    // Team structure changes rarely; keep it off the wire during a session.
    staleTime: 5 * 60_000,
  });
  const wideReach = auth.isAgencyAdmin || auth.agencyScope === "agency" || auth.agencyScope === "division";
  return {
    teams: q.data ?? [],
    isLoading: live ? q.isLoading : false,
    /** Whether this user's ceiling requires a team to be chosen at creation.
        `in_scope()` with no team and no assignee passes only an agency admin
        or somebody with management reach; an agent (scope "assigned") can
        create only inside a team of theirs. 2026-10-15: defaulting agents to
        "No team" made every Add Client fail for Kaori with a row-security
        error. */
    mustChooseTeam: !wideReach,
    /** An admin or division manager creates with no team, like 1,451 of the
        1,454 live files (a CreditOps file is scoped by partner and department).
        Everybody else starts on the first team they lead, else the first they
        sit on — the only place the database lets them create. */
    defaultTeamId: wideReach ? null : (auth.ledTeamIds[0] ?? auth.teamIds[0] ?? null),
  };
}
