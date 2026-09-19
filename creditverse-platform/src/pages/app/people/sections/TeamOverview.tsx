/**
 * People & Teams → Overview: the shape of your people right now.
 *
 * Dee's mockup, 2026-09-19: four tiles — Team Members, Teams, Positions, On
 * Leave Today — then what needs a lead's hand. Everything is derived from the
 * rows the other sections read; the one extra query is the team's upcoming
 * leave, which a lead planning coverage cannot get from today's attendance.
 *
 * Four views, one component: `people` is already the caller's management
 * scope. Positions are shown only when the caller may read them (admins); a
 * tile that would always read 0 for a lead is not drawn.
 */
import { Link } from "react-router-dom";
import { Briefcase, CalendarOff, CircleDot, Network, Users } from "lucide-react";
import { useManagedTeam } from "@/lib/people/use-managed-team";
import { usePendingLeave, useTeamUpcomingLeave } from "@/lib/data/use-people";
import { usePositions } from "@/lib/data/use-positions";
import { useAgencyMembers } from "@/lib/data/use-agency-teams";
import { EXCEPTION_TITLE, useRewardExceptions } from "@/lib/leave/use-reward-exceptions";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

export function TeamOverview({ canSeePositions }: { canSeePositions: boolean }) {
  const team = useManagedTeam();
  const members = useAgencyMembers();
  const teamLeave = useTeamUpcomingLeave();
  const pending = usePendingLeave();
  const positions = usePositions();
  const exceptions = useRewardExceptions();
  const { people, todayRows, today, running, attendanceByUser } = team;

  const ids = new Set(people.map((p) => p.userId));
  const nameOf = (id: string) => people.find((p) => p.userId === id)?.name ?? "Someone";
  const inactive = (members.data ?? []).filter((m) => m.status === "inactive").length;

  const out = people.filter((p) => todayRows.find((d) => d.userId === p.userId)?.onLeave);
  const working = people.filter((p) => running.has(p.userId));
  const offline = people.filter((p) => !out.includes(p) && !working.includes(p));
  const scopedTeams = team.teams.filter((t) => !t.archived && t.members.some((m) => ids.has(m.userId)));
  const divisions = new Set(scopedTeams.map((t) => t.division).filter(Boolean));
  const livePositions = (positions.data ?? []).filter((p) => !p.archivedAt && p.status !== "closed");
  const filled = livePositions.filter((p) => p.state !== "vacant").length;
  const pendingCount = (pending.data ?? []).filter((r) => ids.has(r.userId)).length;
  const upcoming = (teamLeave.data ?? [])
    .filter((r) => ids.has(r.userId) && r.status === "approved" && r.startsOn > today)
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1)).slice(0, 6);
  const alerts = people
    .map((p) => ({ p, sc: attendanceByUser.get(p.userId) }))
    .filter((x) => (x.sc?.alerts.length ?? 0) > 0);
  const scopedExceptions = (exceptions.data ?? []).filter((x) => ids.has(x.userId));

  if (!team.loading && people.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Nobody is in your management scope yet. A team lead sees the members of the teams
        they lead; management sees its division or the company.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className={cn("grid grid-cols-2 gap-3", canSeePositions ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        <Tile icon={Users} value={people.length + (canSeePositions ? inactive : 0)} label="Team Members"
          note={`${people.length} active${canSeePositions ? ` · ${inactive} inactive` : ""} · ${out.length} on leave`}
          to="/app/people/members" />
        <Tile icon={Network} value={scopedTeams.length} label="Teams"
          note={`Across ${divisions.size} ${divisions.size === 1 ? "division" : "divisions"}`}
          to={canSeePositions ? "/app/people/structure" : undefined} />
        {canSeePositions && (
          <Tile icon={Briefcase} value={livePositions.length} label="Positions"
            note={`${filled} filled · ${livePositions.length - filled} open`} to="/app/people/positions" />
        )}
        <Tile icon={CalendarOff} value={out.length} label="On Leave Today"
          note={`${pendingCount} pending approval`} to="/app/people/time-off" />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel icon={Users} title="Availability today">
          <ul className="mt-2 space-y-1 text-xs">
            {working.map((p) => (
              <li key={p.userId} className="flex items-center justify-between gap-2">
                <span className="truncate text-foreground">{p.name}</span>
                <span className="shrink-0 text-[11px] font-semibold text-status-success">Working</span>
              </li>
            ))}
            {out.map((p) => (
              <li key={p.userId} className="flex items-center justify-between gap-2">
                <span className="truncate text-foreground">{p.name}</span>
                {/* The KIND of leave, never the reason. */}
                <span className="shrink-0 text-[11px] font-semibold text-blue-700">
                  {todayRows.find((d) => d.userId === p.userId)?.leaveLabel ?? "On leave"}
                </span>
              </li>
            ))}
            {offline.map((p) => (
              <li key={p.userId} className="flex items-center justify-between gap-2">
                <span className="truncate text-muted-foreground">{p.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">Offline</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel icon={CalendarOff} title="Upcoming leave">
          <ul className="mt-2 space-y-1.5 text-xs">
            {upcoming.length === 0 && <li className="text-muted-foreground">Nothing booked ahead.</li>}
            {upcoming.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-foreground">{nameOf(r.userId)}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{r.typeLabel}</span>
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {formatDate(r.startsOn)}{r.endsOn !== r.startsOn ? ` – ${formatDate(r.endsOn)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel icon={CircleDot} title="Needs your attention">
          <ul className="mt-2 space-y-1.5 text-xs">
            {alerts.length === 0 && scopedExceptions.length === 0 && pendingCount === 0 && (
              <li className="text-muted-foreground">Nothing outstanding.</li>
            )}
            {pendingCount > 0 && (
              <li className="rounded-lg border border-border bg-muted/40 px-2.5 py-1.5">
                <Link to="/app/people/time-off" className="font-semibold text-foreground underline-offset-2 hover:underline">
                  {pendingCount} leave {pendingCount === 1 ? "request" : "requests"} waiting on a decision
                </Link>
              </li>
            )}
            {alerts.map(({ p, sc }) => sc!.alerts.map((a) => (
              <li key={`${p.userId}-${a.kind}`}
                className={cn("rounded-lg border px-2.5 py-1.5",
                  a.kind === "management"
                    ? "border-destructive/30 bg-status-danger-tint text-status-danger"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-900")}>
                <strong>{p.name}</strong> · {a.title}
              </li>
            )))}
            {scopedExceptions.map((x, i) => (
              <li key={`${x.kind}-${x.userId}-${i}`}
                className="rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-muted-foreground">
                <strong className="text-foreground">{x.person}</strong> · {EXCEPTION_TITLE[x.kind]}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Tile({ icon: Icon, value, label, note, to }: {
  icon: React.ElementType; value: number; label: string; note: string; to?: string;
}) {
  const body = (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-extrabold leading-none tabular-nums text-foreground">{value}</span>
        <span className="mt-1 block text-xs font-semibold text-foreground">{label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{note}</span>
      </span>
    </div>
  );
  return to ? <Link to={to} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body;
}

function Panel({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden /> {title}
      </h3>
      {children}
    </div>
  );
}
