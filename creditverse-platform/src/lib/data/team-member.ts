/**
 * The per-person reads behind the Team Member profile — bounded, and only the
 * tab that is open asks (rule 14). Everything here reads CANONICAL records:
 * activity_events, eod_submissions, partner_assignments. No table anywhere
 * holds "the profile"; the profile is these records about one person.
 *
 * RLS decides every row. A manager without payroll access asking for rate
 * history receives nothing from the database — the tab hides AND the query
 * returns empty, in that order of importance (§40: hiding after fetching the
 * salary would still have fetched the salary).
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";

export interface MemberActivityRow {
  id: number;
  action: string;
  field: string | null;
  previousValue: string | null;
  newValue: string | null;
  actorName: string | null;
  at: string;
}

/**
 * One person's membership history: invitations, role and profile changes,
 * schedule and rate changes — the event types that are keyed by the person's
 * own user id. Newest first, bounded.
 */
export async function fetchMemberActivity(userId: string): Promise<MemberActivityRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("activity_events")
    .select("id, action, field, previous_value, new_value, actor_name, created_at")
    .in("entity_type", ["agency_member", "work_schedule", "pay_rate"])
    .eq("entity_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as number,
    action: r.action as string,
    field: (r.field as string) ?? null,
    previousValue: (r.previous_value as string) ?? null,
    newValue: (r.new_value as string) ?? null,
    actorName: (r.actor_name as string) ?? null,
    at: r.created_at as string,
  }));
}

export interface MemberEodRow {
  id: string;
  workDate: string;
  state: string;
  submittedAt: string | null;
  autoSubmitted: boolean;
  blockers: string | null;
  nextPriority: string | null;
}

/** The person's recent End of Day record — read, never re-derived here. */
export async function fetchMemberEod(userId: string): Promise<MemberEodRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("eod_submissions")
    .select("id, work_date, state, submitted_at, auto_submitted, blockers, next_workday_priority")
    .eq("employee_id", userId)
    .order("work_date", { ascending: false })
    .limit(14);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    workDate: r.work_date as string,
    state: r.state as string,
    submittedAt: (r.submitted_at as string) ?? null,
    autoSubmitted: Boolean(r.auto_submitted),
    blockers: (r.blockers as string) ?? null,
    nextPriority: (r.next_workday_priority as string) ?? null,
  }));
}

export interface MemberPartnerAssignment {
  id: string;
  partnerName: string;
  groupId: string;
  service: string | null;
  via: "direct" | "team";
  teamName: string | null;
  startedOn: string | null;
}

/**
 * The partners this person can work: their direct assignments plus the
 * assignments of teams they are on — the same two paths `can_see_partner`
 * resolves, shown rather than re-decided (the database still decides).
 */
export async function fetchMemberPartnerAssignments(
  userId: string,
  teamIds: string[],
): Promise<MemberPartnerAssignment[]> {
  const sb = requireSupabase();
  let q = sb
    .from("partner_assignments")
    .select("id, group_id, user_id, team_id, assignment_role, started_on, outsourcing_groups(name), teams(name)")
    .is("ended_on", null);
  q = teamIds.length > 0
    ? q.or(`user_id.eq.${userId},team_id.in.(${teamIds.join(",")})`)
    : q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const group = r.outsourcing_groups as { name?: string } | null;
    const team = r.teams as { name?: string } | null;
    return {
      id: r.id as string,
      groupId: r.group_id as string,
      partnerName: group?.name ?? "Unknown partner",
      service: (r.assignment_role as string) ?? null,
      via: r.user_id === userId ? "direct" as const : "team" as const,
      teamName: team?.name ?? null,
      startedOn: (r.started_on as string) ?? null,
    };
  });
}

export function useMemberActivity(userId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["agency", "member-activity", userId ?? ""],
    queryFn: () => fetchMemberActivity(userId!),
    enabled: !!userId && enabled,
    staleTime: 30_000,
  });
}

export function useMemberEod(userId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["agency", "member-eod", userId ?? ""],
    queryFn: () => fetchMemberEod(userId!),
    enabled: !!userId && enabled,
    staleTime: 60_000,
  });
}

export function useMemberPartnerAssignments(userId: string | null, teamIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ["agency", "member-partners", userId ?? "", teamIds.join(",")],
    queryFn: () => fetchMemberPartnerAssignments(userId!, teamIds),
    enabled: !!userId && enabled,
    staleTime: 30_000,
  });
}
