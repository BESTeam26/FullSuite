/**
 * People & Teams → Performance: time, attendance and utilization across the
 * people in scope. Moved here from the People Hub's "Workforce summary"; the
 * numbers are derived from the workforce batch and `attendance_for`, never
 * stored, and scoped to the caller's management scope.
 */
import { Briefcase, CheckCircle2, Clock, Users } from "lucide-react";
import { ContentCard, StatCard } from "@/components/dashboard/DivisionLayout";
import { AttendanceCard } from "@/components/agency/people/AttendanceAndLeave";
import { useWorkforce } from "@/lib/data/use-workforce";
import { useManagedTeam } from "@/lib/people/use-managed-team";
import { orgDivisionLabel } from "@/lib/agency/division-label";
import { formatDuration } from "@/lib/time-domain";

export function TeamPerformance() {
  const wf = useWorkforce();
  const { people, today } = useManagedTeam();
  const ids = new Set(people.map((p) => p.userId));
  const time = (wf.data?.time ?? []).filter((t) => ids.has(t.employeeId));
  const clockedIn = time.filter((t) => t.running).length;
  const logged = time.reduce((s, t) => s + t.minutes, 0);
  const capacity = people.length * 40 * 60;
  const utilization = capacity > 0 ? Math.round((logged / capacity) * 100) : null;

  const byDivision = new Map<string, { agents: Set<string>; minutes: number }>();
  for (const t of wf.data?.teams ?? []) {
    if (t.archived) continue;
    const key = t.division ? orgDivisionLabel(t.division) : "Unassigned";
    const row = byDivision.get(key) ?? { agents: new Set<string>(), minutes: 0 };
    for (const m of t.members) {
      if (!ids.has(m.userId) || row.agents.has(m.userId)) continue;
      row.agents.add(m.userId);
      row.minutes += time.find((x) => x.employeeId === m.userId)?.minutes ?? 0;
    }
    if (row.agents.size > 0) byDivision.set(key, row);
  }
  const names = new Map(people.map((p) => [p.userId, p.name]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="People in scope" value={people.length} icon={Users} />
        <StatCard label="Clocked in now" value={clockedIn} icon={CheckCircle2} />
        <StatCard label="Logged this week" value={formatDuration(logged)} icon={Clock} />
        <StatCard label="Utilization (of 40h)" value={utilization === null ? "—" : `${utilization}%`} icon={Briefcase} />
      </div>
      <ContentCard title="Time by division (this week)">
        {byDivision.size === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nobody in your scope is on a team yet.</p>
        ) : (
          <div className="space-y-3">
            {[...byDivision.entries()].map(([div, row]) => (
              <div key={div} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span className="font-medium text-foreground">{div}</span>
                <span className="text-muted-foreground">{row.agents.size} staff · {formatDuration(row.minutes)}</span>
              </div>
            ))}
          </div>
        )}
      </ContentCard>
      <AttendanceCard date={today} names={names} />
    </div>
  );
}
