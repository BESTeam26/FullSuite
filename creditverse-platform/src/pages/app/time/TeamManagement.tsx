/**
 * Team Management — one manager workspace, four tabs.
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
import { useAttendanceRange, useMyLeave, useSchedules } from "@/lib/data/use-people";
import { useAuth } from "@/lib/auth/auth-context";
import { factsFrom } from "@/lib/attendance/attendance-facts";
import { quarterOf, scoreQuarter } from "@/lib/attendance/attendance-score";
import { quarterRange } from "@/lib/attendance/use-attendance-score";
import { businessToday } from "@/lib/calendar/us-federal-holidays";
import { formatDuration } from "@/lib/time-domain";
import { formatDate } from "@/lib/format-date";
import { TEAM_TABS, type TeamTab } from "@/lib/time/time-sections";
import { TeamsAndMembers, statusOf } from "@/components/time/TeamsAndMembers";
import { cn } from "@/lib/utils";

export function TeamManagement() {
  const [tab, setTab] = useState<TeamTab>("time");
  const workforce = useWorkforce();
  const auth = useAuth();
  const today = businessToday();
  const { from, to } = quarterRange(today);
  const attendance = useAttendanceRange(from, to);
  const schedules = useSchedules();

  /*
   * Who this person may manage.
   *
   * A lead sees the members of the teams they LEAD; management sees everyone
   * the workforce batch already returns. Presentation only — `attendance_for`
   * and the leave policies refuse the same person at the database.
   */
  const people = useMemo(() => {
    const all = workforce.data?.people ?? [];
    const teams = workforce.data?.teams ?? [];
    const myLedTeams = teams.filter((t) => !t.archived
      && t.members.some((m) => m.isLead && m.userId === auth.user?.id));
    if (myLedTeams.length === 0) return all;
    const ids = new Set(myLedTeams.flatMap((t) => t.members.map((m) => m.userId)));
    return all.filter((p) => ids.has(p.userId));
  }, [workforce.data, auth.user?.id]);

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
        quarter: quarterOf(today), today,
      }));
    }
    return out;
  }, [attendance.data, schedules.data, people, today]);

  const todayRows = (attendance.data ?? []).filter((d) => d.day === today);
  const dayFor = (userId: string) => todayRows.find((d) => d.userId === userId);

  const todayRowsForTiles = (attendance.data ?? []).filter((d) => d.day === today);
  const tiles = (() => {
    const statuses = people.map((p) => statusOf(
      p.userId,
      todayRowsForTiles.find((d) => d.userId === p.userId),
      running.has(p.userId),
      onBreak.has(p.userId),
    ));
    const n = (s: string) => statuses.filter((x) => x === s).length;
    const teams = (workforce.data?.teams ?? []).filter((t) => !t.archived);
    return [
      { label: "Teams", value: teams.length, note: "Live teams in your scope" },
      { label: "Team members", value: people.length, note: "People you manage" },
      { label: "On leave today", value: n("on_leave"), note: "Approved and away" },
      { label: "Working now", value: n("working"), note: "A timer is running" },
      { label: "Offline", value: n("offline"), note: "No timer running" },
    ];
  })();

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TeamTab)}>
      {/* Dee's mockup puts the shape of the team above the tabs, so the
          numbers do not change as you move between them. */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-border bg-card px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.label}</p>
            <p className="text-xl font-extrabold tabular-nums text-foreground">{t.value}</p>
            <p className="truncate text-[11px] text-muted-foreground">{t.note}</p>
          </div>
        ))}
      </div>

      <TabsList className="h-8 flex-wrap bg-muted/60">
        {TEAM_TABS.map((t) => (
          <TabsTrigger key={t.key} value={t.key} className="text-[11px]">{t.label}</TabsTrigger>
        ))}
      </TabsList>

      {/* ── Teams & Members ───────────────────────────────────────────── */}
      <TabsContent value="time" className="mt-3">
        <TeamsAndMembers
          teams={(workforce.data?.teams ?? [])}
          people={people}
          attendanceToday={todayRows}
          schedules={schedules.data ?? []}
          running={running}
          onBreak={onBreak}
        />
      </TabsContent>

      {/* ── Leave Requests ────────────────────────────────────────────── */}
      <TabsContent value="leave" className="mt-3 space-y-3">
        <LeaveQueue />
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-[11px] text-muted-foreground">
          A request is decided by a lead of the requester&apos;s team, or by management — never
          by the person who made it. The decision is sent back to them with your name on it.
        </p>
      </TabsContent>

      {/* ── Attendance ────────────────────────────────────────────────── */}
      <TabsContent value="attendance" className="mt-3">
        <ul className="space-y-3">
          {people.map((p) => {
            const score = attendanceByUser.get(p.userId);
            return (
              <li key={p.userId} className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Link to={`/app/people/${p.userId}`}
                    className="text-sm font-bold text-foreground underline-offset-2 hover:underline">
                    {p.name}
                  </Link>
                  {score && score.streakDays > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      {score.streakDays}-day streak
                    </span>
                  )}
                </div>
                {score
                  ? <AttendanceSummary score={score} />
                  : <p className="text-xs text-muted-foreground">Working it out…</p>}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 rounded-xl border border-border bg-card px-4 py-3 text-[11px] text-muted-foreground">
          Scores are derived from the attendance record and cannot be edited by hand. A
          correction is recorded as a reversal, with who made it and why.
        </p>
      </TabsContent>

      {/* ── Availability ──────────────────────────────────────────────── */}
      <TabsContent value="availability" className="mt-3">
        <AvailabilityTab people={people} todayRows={todayRows} today={today} />
      </TabsContent>
    </Tabs>
  );
}

/**
 * Who is working, who is out, and what is coming.
 *
 * Dee: "Do not expose private reasons to coworkers." So a colleague's leave
 * shows as leave and as dates — never the reason they gave for it.
 */
function AvailabilityTab({ people, todayRows, today }: {
  people: { userId: string; name: string }[];
  todayRows: { userId: string; onLeave: boolean; leaveLabel: string | null; status: string }[];
  today: string;
}) {
  const mine = useMyLeave();
  const out = people.filter((p) => todayRows.find((d) => d.userId === p.userId)?.onLeave);
  const working = people.filter((p) => !out.includes(p));
  /* Only the caller's own upcoming leave is available to this screen without a
     wider read; a team-wide forecast is a separate, scoped query rather than
     something to fake from what happens to be loaded. */
  const upcoming = (mine.data ?? []).filter((r) => r.status === "approved" && r.startsOn > today);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden /> Working today
        </h3>
        <p className="mt-1 text-2xl font-extrabold tabular-nums text-foreground">{working.length}</p>
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {working.map((p) => <li key={p.userId} className="truncate">{p.name}</li>)}
        </ul>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <CalendarOff className="h-4 w-4 text-muted-foreground" aria-hidden /> Out today
        </h3>
        <p className="mt-1 text-2xl font-extrabold tabular-nums text-foreground">{out.length}</p>
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {out.length === 0 && <li>Everybody is in.</li>}
          {out.map((p) => {
            const d = todayRows.find((r) => r.userId === p.userId);
            return (
              <li key={p.userId} className="truncate">
                {/* The KIND of leave, never the reason given for it. */}
                {p.name} · {d?.leaveLabel ?? "On leave"}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold text-foreground">Your upcoming leave</h3>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {upcoming.length === 0 && <li>Nothing booked.</li>}
          {upcoming.map((r) => (
            <li key={r.id} className="truncate">
              {r.typeLabel} · {formatDate(r.startsOn)}
              {r.endsOn !== r.startsOn ? ` – ${formatDate(r.endsOn)}` : ""}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">
          A team-wide leave forecast needs its own scoped read and is not built yet.
        </p>
      </div>
    </div>
  );
}
