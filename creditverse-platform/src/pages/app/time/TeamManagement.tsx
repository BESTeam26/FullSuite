/**
 * Team Management — one manager workspace, tabs added as each is proven.
 *
 * Dee, 2026-09-18: "Team Management is a single manager workspace with tabs:
 * Team Time, Leave Requests, Attendance, Availability. Do not create four
 * extra global sidebar entries."
 *
 * Every tab reads a canonical source and owns none of them: attendance comes
 * from `attendance_for`, leave from `leave_requests`, time from the workforce
 * batch. Nothing here can edit a score by hand — Dee's rule — and nothing
 * shows a colleague a private reason.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarOff, CircleDot, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeaveQueue } from "@/components/agency/people/AttendanceAndLeave";
import { AttendanceSummary } from "@/components/attendance/AttendanceSummary";
import { useWorkforce } from "@/lib/data/use-workforce";
import { useManagedPeople } from "@/lib/data/use-managed-people";
import { useAttendanceRange, useSchedules, useTeamUpcomingLeave } from "@/lib/data/use-people";
import { useAuth } from "@/lib/auth/auth-context";
import { factsFrom } from "@/lib/attendance/attendance-facts";
import { quarterOf, scoreQuarter } from "@/lib/attendance/attendance-score";
import { quarterRange } from "@/lib/attendance/use-attendance-score";
import {
  latestPerDay, useAttendanceCorrections, useRecordCorrection,
} from "@/lib/attendance/use-attendance-corrections";
import { useAttendancePolicy } from "@/lib/attendance/use-attendance-policy";
import { AttendanceReviewDrawer } from "@/components/attendance/AttendanceReviewDrawer";
import { EXCEPTION_TITLE, useRewardExceptions } from "@/lib/leave/use-reward-exceptions";
import { STANDING_BADGE, STANDING_LABEL } from "@/lib/attendance/attendance-score";
import { businessToday } from "@/lib/calendar/us-federal-holidays";
import { formatDuration } from "@/lib/time-domain";
import { formatDate } from "@/lib/format-date";
import { TEAM_TABS, type TeamTab } from "@/lib/time/time-sections";
import { TeamsAndMembers, statusOf } from "@/components/time/TeamsAndMembers";
import { TeamSchedule } from "@/components/time/TeamSchedule";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { cn } from "@/lib/utils";

export function TeamManagement() {
  const [tab, setTab] = useState<TeamTab>("overview");
  const [reviewing, setReviewing] = useState<{ userId: string; name: string } | null>(null);
  const record = useRecordCorrection();
  const exceptions = useRewardExceptions();
  const workforce = useWorkforce();
  const auth = useAuth();
  const today = businessToday();
  const { from, to } = quarterRange(today);
  const attendance = useAttendanceRange(from, to);
  const schedules = useSchedules();
  const corrections = useAttendanceCorrections(from, to);
  const policy = useAttendancePolicy();
  const perms = useAgencyPermissions();
  /* The same test the database applies in set_work_schedule: management
     capability. Scope is already applied by `people`. A lead reads. */
  const canSetSchedules = auth.agencyRole === "agency_admin" || perms.can("ops.manage");
  const teamLeave = useTeamUpcomingLeave();

  /*
   * Who this person may manage — the DATABASE's answer.
   *
   * This used to be decided here: "if I lead teams, their members; otherwise
   * everyone." That fallback is the leak §20b names — a division manager who
   * leads no team saw the whole company. `managed_people()` is the same
   * predicate that guards every workforce row, so the list and the rows agree
   * by construction. An agent gets an empty set, and this page is not offered
   * to them at all.
   */
  const managed = useManagedPeople();
  const people = useMemo(() => {
    const all = workforce.data?.people ?? [];
    if (!managed.data) return [];
    return all.filter((p) => managed.data!.has(p.userId));
  }, [workforce.data, managed.data]);

  const weekTime = new Map((workforce.data?.time ?? []).map((t) => [t.employeeId, t]));
  /* Who is on the clock, and of those, who is resting. The workforce batch
     already knows a timer is open; `attendance_for` says whether the day is
     leave. Break is the one thing neither carries, so it is read from the
     open entry's kind where the batch exposes it — and shown as Working
     rather than invented when it does not. */
  const running = new Set((workforce.data?.time ?? []).filter((t) => t.running).map((t) => t.employeeId));
  const onBreak = new Set<string>();
  const attendanceByUser = useMemo(() => {
    const out = new Map<string, ReturnType<typeof scoreQuarter>>();
    if (!attendance.data) return out;
    for (const p of people) {
      const theirs = attendance.data.filter((d) => d.userId === p.userId);
      const schedule = (schedules.data ?? []).find((s) => s.userId === p.userId);
      out.set(p.userId, scoreQuarter(factsFrom(theirs, schedule, { today }), {
        quarter: quarterOf(today), today, policy,
        corrections: latestPerDay(corrections.data ?? [], p.userId),
      }));
    }
    return out;
  /* `policy` is a dependency, not decoration: without it a policy edit left
     this table showing scores computed under the OLD numbers until something
     else happened to re-render it. */
  }, [attendance.data, schedules.data, corrections.data, people, today, policy]);

  const todayRows = (attendance.data ?? []).filter((d) => d.day === today);
  const dayFor = (userId: string) => todayRows.find((d) => d.userId === userId);



  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TeamTab)}>
      <TabsList className="h-8 flex-wrap bg-muted/60">
        {TEAM_TABS.map((t) => (
          <TabsTrigger key={t.key} value={t.key} className="text-[11px]">{t.label}</TabsTrigger>
        ))}
      </TabsList>

      {/* ── Overview ──────────────────────────────────────────────────── */}
      <TabsContent value="overview" className="mt-3">
        <TeamOverview people={people} todayRows={todayRows} today={today}
          running={running} attendanceByUser={attendanceByUser} />
      </TabsContent>

      {/* ── Members ───────────────────────────────────────────────────── */}
      <TabsContent value="members" className="mt-3">
        <TeamsAndMembers
          teams={(workforce.data?.teams ?? [])}
          people={people}
          attendanceToday={todayRows}
          schedules={schedules.data ?? []}
          running={running}
          onBreak={onBreak}
        />
      </TabsContent>

      {/* ── Schedule ──────────────────────────────────────────────────── */}
      <TabsContent value="schedule" className="mt-3">
        <TeamSchedule
          people={people}
          teams={workforce.data?.teams ?? []}
          schedules={schedules.data ?? []}
          leave={teamLeave.data ?? []}
          today={today}
          canEdit={canSetSchedules}
        />
      </TabsContent>

      {/* ── Time Off ──────────────────────────────────────────────────── */}
      <TabsContent value="time-off" className="mt-3 space-y-3">
        <LeaveQueue />
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-[11px] text-muted-foreground">
          A request is decided by a lead of the requester&apos;s team, or by management — never
          by the person who made it. The decision is sent back to them with your name on it.
        </p>
      </TabsContent>

      {/* ── Attendance ────────────────────────────────────────────────── */}
      <TabsContent value="attendance" className="mt-3">
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2">Standing</th>
                <th className="px-3 py-2 text-right">Lates</th>
                <th className="px-3 py-2 text-right">Half</th>
                <th className="px-3 py-2 text-right">Absent</th>
                <th className="px-3 py-2 text-right">NCNS</th>
                <th className="px-3 py-2 text-right">Leave</th>
                <th className="px-3 py-2 text-right">Streak</th>
                <th className="px-3 py-2">Alerts</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {people.map((p) => {
                const sc = attendanceByUser.get(p.userId);
                return (
                  <tr key={p.userId}>
                    <td className="px-3 py-2">
                      <Link to={`/app/people/${p.userId}`}
                        className="font-medium text-foreground underline-offset-2 hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-foreground">
                      {sc ? sc.score.toFixed(2).replace(/\.00$/, "") : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {sc ? `${STANDING_BADGE[sc.standing]} ${STANDING_LABEL[sc.standing]}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{sc?.counts.late ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{sc?.counts.half_day ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{sc?.counts.absent ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{sc?.counts.ncns ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {sc?.counts.approved_leave ?? 0}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{sc?.streakDays ?? 0}</td>
                    <td className="px-3 py-2">
                      {(sc?.alerts.length ?? 0) === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="inline-flex flex-wrap gap-1">
                          {sc!.alerts.map((a) => (
                            <span key={a.kind} title={a.detail}
                              className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-bold",
                                a.kind === "management"
                                  ? "border-destructive/30 bg-status-danger-tint text-status-danger"
                                  : "border-amber-500/40 bg-amber-500/10 text-amber-900")}>
                              {a.title}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-1.5">
                        {/* No "issue reward" here. This table shows the RUNNING
                            quarter, and Dee's rule is that a reward is earned
                            at quarter CLOSE — the database refuses an open one,
                            so a button here could only ever fail. What it shows
                            instead is whether the score is at the top. */}
                        {sc?.standing === "champion" && (
                          <span className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-900"
                            title="A Reward Day is issued once the quarter closes">
                            🏆 On track
                          </span>
                        )}
                        <button type="button" disabled={!sc}
                          onClick={() => setReviewing({ userId: p.userId, name: p.name })}
                          className="rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                          Review attendance
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
              {people.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                  Nobody is in your scope yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {(exceptions.data ?? []).length > 0 && (
          <div className="mt-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
            <h3 className="text-sm font-bold text-foreground">Needs your attention</h3>
            <ul className="mt-2 space-y-1.5">
              {(exceptions.data ?? []).map((x, i) => (
                <li key={`${x.kind}-${x.userId}-${i}`}
                  className={cn("rounded-xl border px-3 py-2 text-[11px]",
                    x.severity === "danger"
                      ? "border-destructive/30 bg-status-danger-tint text-status-danger"
                      : x.severity === "warning"
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-900"
                        : "border-border bg-card text-muted-foreground")}>
                  <strong>{EXCEPTION_TITLE[x.kind]} · {x.person}</strong>
                  <span className="block">{x.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-3 rounded-xl border border-border bg-card px-4 py-3 text-[11px] text-muted-foreground">
          Scores are derived and cannot be typed. Correcting a day records a reversal beside
          the original — nothing is deleted, and the person is told. A Reward Day is earned at
          quarter close, never during it, and a correction to a closed quarter raises a review
          rather than removing a reward somebody may already have used.
        </p>

        {reviewing && attendanceByUser.get(reviewing.userId) && (
          <AttendanceReviewDrawer
            name={reviewing.name}
            score={attendanceByUser.get(reviewing.userId)!}
            busy={record.isPending}
            error={(record.error as Error | null)?.message ?? null}
            onClose={() => { setReviewing(null); record.reset(); }}
            onCorrect={(v) => record.mutate({ userId: reviewing.userId, ...v })}
          />
        )}
      </TabsContent>

    </Tabs>
  );
}

/**
 * Overview — the shape of the team right now, and what needs a lead's hand.
 *
 * Dee, 2026-09-19: build Overview first. Everything here is derived from the
 * same rows the other tabs read; it adds no query of its own except the team's
 * upcoming leave, which is the one thing a lead planning coverage cannot get
 * from today's attendance.
 *
 * Four views, same component: `people` is already the caller's management
 * scope, so a Team Lead sees their team's shape, a Division Manager their
 * division's, an Executive the company's. Nothing here widens it.
 */
function TeamOverview({ people, todayRows, today, running, attendanceByUser }: {
  people: { userId: string; name: string }[];
  todayRows: { userId: string; onLeave: boolean; leaveLabel: string | null; workMinutes: number }[];
  today: string;
  running: Set<string>;
  attendanceByUser: Map<string, ReturnType<typeof scoreQuarter>>;
}) {
  const teamLeave = useTeamUpcomingLeave();
  const exceptions = useRewardExceptions();
  const ids = new Set(people.map((p) => p.userId));
  const nameOf = (id: string) => people.find((p) => p.userId === id)?.name ?? "Someone";

  const out = people.filter((p) => todayRows.find((d) => d.userId === p.userId)?.onLeave);
  const working = people.filter((p) => running.has(p.userId));
  const offline = people.filter((p) => !out.includes(p) && !working.includes(p));
  const upcoming = (teamLeave.data ?? [])
    .filter((r) => ids.has(r.userId) && r.status === "approved" && r.startsOn > today)
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1)).slice(0, 6);
  const alerts = people
    .map((p) => ({ p, sc: attendanceByUser.get(p.userId) }))
    .filter((x) => (x.sc?.alerts.length ?? 0) > 0);
  const scopedExceptions = (exceptions.data ?? []).filter((x) => ids.has(x.userId));

  const tile = (label: string, value: number, note: string) => (
    <div key={label} className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xl font-extrabold tabular-nums text-foreground">{value}</p>
      <p className="truncate text-[11px] text-muted-foreground">{note}</p>
    </div>
  );

  if (people.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Nobody is in your management scope yet. A team lead sees the members of the teams
        they lead; management sees its division or the company.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tile("People", people.length, "In your scope")}
        {tile("Working now", working.length, "A timer is running")}
        {tile("On leave today", out.length, "Approved and away")}
        {tile("Offline", offline.length, "No timer running")}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden /> Availability today
          </h3>
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
                {/* The KIND of leave, never the reason — "Do not expose private
                    reasons to coworkers." */}
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
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <CalendarOff className="h-4 w-4 text-muted-foreground" aria-hidden /> Upcoming leave
          </h3>
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
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <CircleDot className="h-4 w-4 text-muted-foreground" aria-hidden /> Needs your attention
          </h3>
          <ul className="mt-2 space-y-1.5 text-xs">
            {alerts.length === 0 && scopedExceptions.length === 0 && (
              <li className="text-muted-foreground">Nothing outstanding.</li>
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
        </div>
      </div>
    </div>
  );
}
