/**
 * Time & Attendance — the module's home.
 *
 * Dee's mockup, 2026-09-18: "Your workday, attendance and leave — all in one
 * place." Where you stand, what you owe today, and the one thing you are
 * working towards.
 *
 * Every panel is a READ of something that already exists, with a link into the
 * section that owns it. This page owns no state and duplicates no rule: the
 * clock comes from `useTimesheet`, the score from the attendance engine, leave
 * from `leave_requests`, tasks from canonical work. Nothing here can write
 * except starting and stopping your own timer.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight, BarChart3, CalendarDays, CheckSquare, Clock, FileText, History,
  Megaphone, Play, Square, Trophy,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useTimesheet, useEod } from "@/lib/data/use-time";
import { useMyLeave, useLeaveTypes } from "@/lib/data/use-people";
import { useMyWork } from "@/lib/data/use-work";
import { useMyAttendanceScore } from "@/lib/attendance/use-attendance-score";
import {
  QUARTER_MAX_POINTS, STANDING_LABEL, isViolation,
} from "@/lib/attendance/attendance-score";
import { businessDaysBetween, businessToday } from "@/lib/calendar/us-federal-holidays";
import { weekBars } from "@/lib/time/my-time-view";
import {
  divisionLabel, entrySeconds, formatClock, formatDuration, stopwatch, weekStart,
} from "@/lib/time-domain";
import { dayGreeting } from "@/lib/greetings/day-greeting";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const pretty = (n: number) => n.toFixed(2).replace(/\.00$/, "").replace(/0$/, "");

/** A card that links somewhere, with the link said out loud at the bottom. */
const Panel = ({ title, icon: Icon, to, linkLabel, aside, children }: {
  title: string; icon: typeof Clock; to?: string; linkLabel?: string;
  aside?: React.ReactNode; children: React.ReactNode;
}) => (
  <div className="flex flex-col rounded-2xl border border-border bg-card p-4">
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="flex min-w-0 items-center gap-2 text-sm font-bold text-foreground">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{title}</span>
      </h2>
      {aside}
      {to && (
        <Link to={to}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-status-success underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {linkLabel ?? "View all"} <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      )}
    </div>
    <div className="min-h-0 flex-1">{children}</div>
  </div>
);

/**
 * One of the four status tiles.
 *
 * Its link sits UNDER the value rather than beside the heading. Four of these
 * in a row leaves no width for a title and a link on one line — "View
 * attendance" truncated to "View att…" at 1440px, which is the clipped label
 * rule 8 forbids.
 */
const Tile = ({ title, icon: Icon, to, linkLabel, children }: {
  title: string; icon: typeof Clock; to: string; linkLabel: string; children: React.ReactNode;
}) => (
  <div className="flex flex-col rounded-2xl border border-border bg-card p-4">
    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{title}</span>
    </p>
    <div className="mt-1.5 min-h-0 flex-1">{children}</div>
    <Link to={to}
      className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-status-success underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {linkLabel} <ArrowRight className="h-3 w-3" aria-hidden />
    </Link>
  </div>
);

export function TimeOverview() {
  const auth = useAuth();
  const t = useTimesheet();
  const eod = useEod();
  const leave = useMyLeave();
  const leaveTypes = useLeaveTypes();
  const work = useMyWork();
  const { score } = useMyAttendanceScore();
  const navigate = useNavigate();

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!t.openEntry) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [t.openEntry]);

  const today = businessToday();
  const submitted = Boolean(eod.context?.submittedAt);

  const next = useMemo(() => [...(leave.data ?? [])]
    .filter((r) => (r.status === "approved" || r.status === "pending") && r.endsOn >= today)
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1)), [leave.data, today]);

  const bars = weekBars(t.entries ?? [], weekStart(), t.today, now);
  const mine = (work.items ?? []).filter((w) => w.stage !== "Completed").slice(0, 4);

  /* The notice rule, from the leave TYPES rather than a number typed here —
     Dee: "Do not hardcode these into frontend components if they are
     configurable business policy." */
  const notice = Math.max(0, ...(leaveTypes.data ?? []).map((x) => x.minNoticeDays));

  /* Recent activity, from the records: the clock, and leave you filed. */
  const activity = useMemo(() => {
    const rows: { at: string; label: string; detail: string; icon: typeof Clock }[] = [];
    for (const e of (t.entries ?? []).filter((x) => x.kind === "work")) {
      if (e.endedAt) {
        rows.push({
          at: e.endedAt, icon: Clock, label: "Clocked out",
          detail: `${formatDate(e.workDate)} · ${formatDuration(e.durationMinutes)}`,
        });
      }
      rows.push({ at: e.startedAt, icon: Clock, label: "Clocked in", detail: formatDate(e.workDate) });
    }
    for (const r of leave.data ?? []) {
      rows.push({
        at: r.createdAt, icon: CalendarDays, label: "Leave request submitted",
        detail: `${r.typeLabel} · ${formatDate(r.startsOn)}`,
      });
    }
    return rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 5);
  }, [t.entries, leave.data]);

  const clock = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-4">
      {/* The date and the line Dee wanted at the top of the module. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <p className="border-l-2 border-border pl-3 text-xs italic text-muted-foreground">
          “Discipline today creates freedom tomorrow.”
          <span className="mt-0.5 block not-italic font-bold">— BES</span>
        </p>
        <p className="text-xs font-semibold text-muted-foreground">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long", month: "long", day: "numeric", year: "numeric",
          })}
        </p>
      </div>

      {/* ── The clock, then where you stand ───────────────────────────── */}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)]">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <p className="text-base font-extrabold text-foreground">
            {dayGreeting(new Date(), auth.profile?.preferred_name, auth.profile?.full_name ?? auth.displayName)} 👋
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t.openEntry ? "You are on the clock." : "Ready to make it a productive day?"}
          </p>

          <div className="mt-3 rounded-xl border border-border bg-card p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <span aria-hidden className={cn("h-2 w-2 rounded-full",
                t.openEntry ? "animate-pulse bg-emerald-600" : "bg-muted-foreground/40")} />
              {t.openEntry
                ? (t.openEntry.taskNote?.trim() || divisionLabel(t.openEntry.divisionId))
                : "Not clocked in"}
            </p>
            <p className="mt-1 font-mono text-3xl font-extrabold tabular-nums text-foreground">
              {stopwatch(t.openEntry ? entrySeconds(t.openEntry, now) : 0)}
            </p>
            <div className="mt-3">
              {t.openEntry ? (
                <button type="button" onClick={t.clockOut} disabled={t.isMutating}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-status-danger px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-status-danger-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                  <Square className="h-4 w-4 fill-current" aria-hidden /> Stop timer
                </button>
              ) : (
                /* Picking WHAT to work on lives on My Time, which already has
                   the partner and division rules. A second picker here would
                   be a second place for them to drift. */
                <button type="button" onClick={() => navigate("/app/time/my-time")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Play className="h-4 w-4" aria-hidden /> Clock in
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile title="Today's time" icon={Clock} to="/app/time/my-time" linkLabel="View My Time">
            <p className="text-xl font-extrabold tabular-nums text-foreground">
              {t.todayMinutes > 0 ? formatClock(t.todayMinutes * 60) : "0h 00m"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {t.todayMinutes > 0 ? "Tracked so far" : "No time tracked yet"}
            </p>
          </Tile>

          <Tile title="Attendance" icon={BarChart3} to="/app/time/attendance" linkLabel="View attendance">
            <p className="text-xl font-extrabold tabular-nums text-foreground">
              {score ? `${pretty(score.score)} / ${QUARTER_MAX_POINTS}` : "—"}
            </p>
            {score && (
              <span className="mt-0.5 inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                {STANDING_LABEL[score.standing]}
              </span>
            )}
          </Tile>

          <Tile title="Next time off" icon={CalendarDays} to="/app/time/time-off" linkLabel="View time off">
            <p className="truncate text-sm font-extrabold text-foreground">
              {next[0]
                ? `${formatDate(next[0].startsOn)}${next[0].endsOn !== next[0].startsOn ? ` – ${formatDate(next[0].endsOn)}` : ""}`
                : "Nothing booked"}
            </p>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {next[0]
                ? `${next[0].typeLabel} · ${businessDaysBetween(next[0].startsOn, next[0].endsOn)} days · ${next[0].status}`
                : "Request it when you need it"}
            </p>
          </Tile>

          <Tile title="End of day" icon={FileText} to="/app/eod" linkLabel="Submit EOD">
            <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-bold",
              submitted ? "bg-emerald-500/10 text-emerald-800" : "bg-amber-500/15 text-amber-900")}>
              {submitted ? "Submitted" : "Not submitted"}
            </span>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {submitted ? "Nothing more to do today." : "Submit your EOD report for today."}
            </p>
          </Tile>
        </div>
      </div>

      {/* ── The one thing you are working towards ─────────────────────── */}
      {score && score.toNextStanding && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4">
          <Trophy className="h-6 w-6 shrink-0 text-amber-700" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">
              You&apos;re {pretty(score.toNextStanding.points)} points away from
              {" "}{STANDING_LABEL[score.toNextStanding.standing]}.
            </p>
            <p className="text-[11px] text-muted-foreground">Keep it up — finish the quarter strong.</p>
          </div>
          <div className="flex min-w-[180px] flex-1 items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-card">
              <div className="h-full rounded-full bg-emerald-600"
                style={{ width: `${Math.min(100, (score.score / QUARTER_MAX_POINTS) * 100)}%` }} />
            </div>
            <span className="shrink-0 text-xs font-bold tabular-nums text-foreground">
              {pretty(score.score)} / {QUARTER_MAX_POINTS}
            </span>
          </div>
          <Link to="/app/time/attendance"
            className="shrink-0 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            View rewards
          </Link>
        </div>
      )}

      {/* ── Today, this week, this month ──────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Today's tasks" icon={CheckSquare} to="/app/my-work" linkLabel="View My Work">
          {mine.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Nothing assigned to you.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {mine.map((w) => (
                <li key={w.id} className="flex items-start justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-foreground">{w.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{w.stage}</span>
                  </span>
                  {w.priority && (
                    <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {w.priority}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="This week's time" icon={BarChart3} to="/app/time/my-time" linkLabel="View detailed time"
          aside={<span className="text-xs font-bold tabular-nums text-foreground">{formatDuration(t.weekMinutes)}</span>}>
          <div className="flex items-end justify-between gap-1.5 pt-2">
            {bars.map((b) => {
              const peak = Math.max(...bars.map((x) => x.minutes), 480);
              return (
                <div key={b.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="text-[9px] tabular-nums text-muted-foreground">
                    {b.minutes > 0 ? formatDuration(b.minutes) : ""}
                  </span>
                  <div className="flex h-16 w-full items-end">
                    <div className={cn("w-full rounded-t",
                      b.minutes === 0 ? "bg-muted"
                        : b.date === t.today ? "bg-emerald-600" : "bg-emerald-500/70")}
                      style={{ height: `${Math.max((b.minutes / peak) * 100, b.minutes > 0 ? 8 : 4)}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{b.label}</span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Attendance this month" icon={CalendarDays} to="/app/time/attendance" linkLabel="View full calendar">
          <div className="flex flex-wrap gap-1 pt-1">
            {(score?.activity ?? []).slice(0, 12).reverse().map((a) => (
              <span key={a.day} title={`${formatDate(a.day)} · ${a.detail}`}
                className={cn("h-5 w-5 rounded-full",
                  a.classification === "approved_leave" ? "bg-blue-500/30"
                    : isViolation(a.classification) ? "bg-status-danger/70"
                    : "bg-emerald-600/70")} />
            ))}
            {(score?.activity.length ?? 0) === 0 && (
              <span className="text-[11px] text-muted-foreground">Nothing recorded yet.</span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 border-t border-border pt-2">
            {([["Lates", score?.counts.late], ["Half days", score?.counts.half_day],
               ["Absences", score?.counts.absent], ["NCNS", score?.counts.ncns]] as const).map(([label, n]) => (
              <div key={label}>
                <p className="text-base font-extrabold tabular-nums text-foreground">{n ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ── Leave, what just happened, and what BES is saying ─────────── */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Upcoming time off" icon={CalendarDays} to="/app/time/time-off">
          {next.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Nothing booked.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {next.slice(0, 3).map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-foreground">{r.typeLabel}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {formatDate(r.startsOn)}{r.endsOn !== r.startsOn ? ` – ${formatDate(r.endsOn)}` : ""}
                      {" · "}{businessDaysBetween(r.startsOn, r.endsOn)} working days
                    </span>
                  </span>
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    r.status === "approved"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-800")}>
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent activity" icon={History} to="/app/time/my-time" linkLabel="View all">
          {activity.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Nothing yet this week.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {activity.map((a, i) => (
                <li key={`${a.at}-${i}`} className="flex items-start justify-between gap-2 py-2">
                  <span className="flex min-w-0 items-start gap-2">
                    <a.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-foreground">{a.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{a.detail}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{clock(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Worth knowing" icon={Megaphone} to="/app/time/attendance" linkLabel="View rewards">
          <ul className="space-y-2">
            <li className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <Trophy className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                {score?.quarter.replace("-Q", " Quarter ")} attendance challenge
              </p>
              <p className="text-[11px] text-muted-foreground">
                Hit {QUARTER_MAX_POINTS}/{QUARTER_MAX_POINTS} and earn ₱2,000 + 1 paid Reward Day.
              </p>
            </li>
            {notice > 0 && (
              <li className="rounded-xl border border-border bg-muted/40 px-3 py-2">
                <p className="text-xs font-bold text-foreground">Time off reminder</p>
                <p className="text-[11px] text-muted-foreground">
                  {/* The real configured rule, not a number typed here. */}
                  File a leave request at least {notice} days before it starts. Sickness,
                  emergencies and bereavement can be filed the same day.
                </p>
              </li>
            )}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
