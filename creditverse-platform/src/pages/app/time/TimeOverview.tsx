/**
 * Time & Attendance — the module's home.
 *
 * Dee, 2026-09-18: "Create a compact Time & Attendance home… Do not turn this
 * into another giant dashboard."
 *
 * So exactly the five things Dee listed and nothing else: today's time, the
 * attendance score, the next leave, whether EOD is in, the running timer if
 * there is one — then four quick actions. Each tile is a link into the section
 * that owns the subject; this page owns none of them and duplicates no logic.
 */
import { Link, useNavigate } from "react-router-dom";
import {
  BarChart3, CalendarDays, Clock, FileText, Play, Square,
} from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { useTimesheet } from "@/lib/data/use-time";
import { useEod } from "@/lib/data/use-time";
import { useMyLeave } from "@/lib/data/use-people";
import { useMyAttendanceScore } from "@/lib/attendance/use-attendance-score";
import { STANDING_LABEL } from "@/lib/attendance/attendance-score";
import { businessDaysBetween, businessToday } from "@/lib/calendar/us-federal-holidays";
import { entrySeconds, formatClock, divisionLabel, stopwatch } from "@/lib/time-domain";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const Tile = ({ to, icon: Icon, label, children, tone }: {
  to: string; icon: typeof Clock; label: string; children: React.ReactNode; tone: string;
}) => (
  <Link to={to}
    className="group rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <span className="flex items-start gap-3">
      <span aria-hidden className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone)}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        {children}
      </span>
    </span>
  </Link>
);

export function TimeOverview() {
  const t = useTimesheet();
  const eod = useEod();
  const leave = useMyLeave();
  const { score } = useMyAttendanceScore();
  const navigate = useNavigate();

  /* One heartbeat, and only while something is running. */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!t.openEntry) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [t.openEntry]);

  const today = businessToday();
  /* The next leave still ahead of them, approved or waiting. Not their whole
     history — the tile answers "am I off soon". */
  const next = [...(leave.data ?? [])]
    .filter((r) => (r.status === "approved" || r.status === "pending") && r.endsOn >= today)
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1))[0];

  const submitted = Boolean(eod.context?.submittedAt);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile to="/app/time/my-time" icon={Clock} label="Today's time" tone="bg-emerald-500/10 text-emerald-700">
          <span className="mt-0.5 block text-xl font-extrabold tabular-nums text-foreground">
            {t.todayMinutes > 0 ? formatClock(t.todayMinutes * 60) : "—"}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            {t.openEntry ? "Timer running" : "No timer running"}
          </span>
        </Tile>

        <Tile to="/app/time/attendance" icon={BarChart3} label="Attendance score" tone="bg-blue-500/10 text-blue-700">
          <span className="mt-0.5 block text-xl font-extrabold tabular-nums text-foreground">
            {score ? `${score.score.toFixed(2).replace(/\.00$/, "")} / 20` : "—"}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            {score ? STANDING_LABEL[score.standing] : "Working it out…"}
          </span>
        </Tile>

        <Tile to="/app/time/time-off" icon={CalendarDays} label="Current / next leave" tone="bg-purple-500/10 text-purple-700">
          <span className="mt-0.5 block truncate text-sm font-extrabold text-foreground">
            {next
              ? `${formatDate(next.startsOn)}${next.endsOn !== next.startsOn ? ` – ${formatDate(next.endsOn)}` : ""}`
              : "Nothing booked"}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {next
              ? `${next.typeLabel} · ${businessDaysBetween(next.startsOn, next.endsOn)} working days · ${next.status}`
              : "Request time off when you need it"}
          </span>
        </Tile>

        <Tile to="/app/eod" icon={FileText} label="End of day" tone="bg-amber-500/10 text-amber-700">
          <span className={cn("mt-0.5 block text-sm font-extrabold",
            submitted ? "text-status-success" : "text-status-warning")}>
            {submitted ? "Submitted" : "Not submitted"}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            {submitted ? "Nothing more to do today." : "Please submit your EOD report for today."}
          </span>
        </Tile>
      </div>

      {/* Dee's four. Each one is the shortest path to the thing people
          actually open this page to do. */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Quick actions</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <button type="button" onClick={() => navigate("/app/time/my-time")}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Play className="h-4 w-4" aria-hidden /> {t.openEntry ? "Go to timer" : "Start timer"}
          </button>
          <Link to="/app/time/time-off"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <CalendarDays className="h-4 w-4" aria-hidden /> Request time off
          </Link>
          <Link to="/app/time/attendance"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <BarChart3 className="h-4 w-4" aria-hidden /> View attendance
          </Link>
          <Link to="/app/eod"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <FileText className="h-4 w-4" aria-hidden /> Submit EOD
          </Link>
        </div>
      </div>

      {t.openEntry && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-5">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-emerald-600" /> Tracking
            </span>
            <p className="mt-2 truncate text-lg font-extrabold text-foreground">
              {t.openEntry.taskNote?.trim() || divisionLabel(t.openEntry.divisionId)}
            </p>
            <p className="text-xs text-muted-foreground">{divisionLabel(t.openEntry.divisionId)}</p>
          </div>
          <div className="flex items-center gap-4">
            <p className="font-mono text-3xl font-extrabold tabular-nums text-foreground">
              {stopwatch(entrySeconds(t.openEntry, now))}
            </p>
            <button type="button" onClick={t.clockOut} disabled={t.isMutating}
              className="inline-flex items-center gap-2 rounded-xl bg-status-danger px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-status-danger-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
              <Square className="h-4 w-4 fill-current" aria-hidden /> Stop
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** The module shell reuses this so the heading is written once. */
export const timeShellProps = { icon: Clock } as const;
export { HqPageShell };
