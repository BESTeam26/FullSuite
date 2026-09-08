/**
 * BES workforce reads — the agency roster (memberships + profiles), BES teams
 * with their members and department, and this week's time per employee. Rows
 * are staff-scoped by policy; organization users receive none. Every figure on
 * People, Teams and Workforce is a count or sum over these rows.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";

export interface AgencyPerson { userId: string; name: string; email: string; role: Enums<"agency_role">; since: string }
export interface AgencyTeam { id: string; name: string; department: string | null; division: string | null; members: { userId: string; isLead: boolean }[]; archived: boolean }
export interface WeekTime { employeeId: string; minutes: number; running: boolean }
export interface Workforce { people: AgencyPerson[]; teams: AgencyTeam[]; time: WeekTime[]; weekStart: string }

const startOfWeekUtc = (now: Date) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d; };

export async function fetchWorkforce(now: Date = new Date()): Promise<Workforce> {
  const sb = requireSupabase();
  const weekStart = startOfWeekUtc(now);
  const [members, teams, time] = await Promise.all([
    /* `profiles!inner` so the fixture filter can apply to the joined row:
       the matrix's @bes.test accounts are real memberships, and a beta tester
       should not find them in the roster or be able to assign work to them. */
    sb.from("agency_memberships").select("user_id, role, created_at, profiles!user_id!inner(full_name, email, is_fixture)").eq("profiles.is_fixture", false).order("created_at").limit(500),
    sb.from("teams").select("id, name, archived_at, organization_id, departments(name, division), team_memberships(user_id, is_lead)").is("organization_id", null).limit(200),
    sb.from("time_entries").select("employee_id, duration_minutes, ended_at").gte("work_date", weekStart.toISOString().slice(0, 10)).limit(5000),
  ]);
  for (const r of [members, teams, time]) if (r.error) throw r.error;
  const byEmp = new Map<string, WeekTime>();
  for (const t of time.data ?? []) { const cur = byEmp.get(t.employee_id) ?? { employeeId: t.employee_id, minutes: 0, running: false }; cur.minutes += t.duration_minutes ?? 0; if (t.ended_at === null) cur.running = true; byEmp.set(t.employee_id, cur); }
  return {
    weekStart: weekStart.toISOString(),
    people: (members.data ?? []).map((m) => { const p = m.profiles as { full_name: string | null; email: string } | null; return { userId: m.user_id, name: p?.full_name?.trim() || p?.email || "Team member", email: p?.email ?? "", role: m.role, since: m.created_at }; }),
    teams: (teams.data ?? []).map((t) => { const d = t.departments as { name: string; division: string } | null; return { id: t.id, name: t.name, department: d?.name ?? null, division: d?.division ?? null, archived: t.archived_at !== null, members: ((t.team_memberships ?? []) as { user_id: string; is_lead: boolean }[]).map((x) => ({ userId: x.user_id, isLead: x.is_lead })) }; }),
    time: [...byEmp.values()],
  };
}
