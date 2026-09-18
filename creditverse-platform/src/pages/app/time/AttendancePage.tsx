/**
 * Your attendance, and how it got that way.
 *
 * Dee, 2026-09-18: "Score, Standing, Activity, Monthly breakdown, Current
 * streak, Policy summary. Do not make Team Lead attendance management appear
 * on the employee page."
 *
 * So there is nothing on this page a lead can act on — no marking, no
 * overriding, no approving. It is a person's own record and the rules that
 * produced it.
 */
import { Trophy } from "lucide-react";
import { AttendanceScoreCard } from "@/components/attendance/AttendanceScoreCard";
import { useMyAttendanceScore } from "@/lib/attendance/use-attendance-score";
import {
  LATES_FOR_COACHING, LATE_WINDOW_DAYS, NCNS_FOR_MANAGEMENT, POINTS,
  PERFECT_MONTH_BONUS, PERFECT_QUARTER_BONUS, QUARTER_MAX_POINTS,
  QUARTER_START_POINTS, STANDING_LABEL, standingFor,
} from "@/lib/attendance/attendance-score";
import { cn } from "@/lib/utils";

const BONUS_TONE: Record<string, string> = {
  earned: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800",
  pending: "border-border bg-muted text-muted-foreground",
  lost: "border-amber-500/40 bg-amber-500/10 text-amber-900",
  none: "border-border bg-muted text-muted-foreground",
};
const BONUS_LABEL: Record<string, string> = {
  earned: "+1 earned", pending: "still winnable", lost: "no bonus", none: "no scheduled days",
};

/* The policy, said in the same words Dee wrote it in, so an employee can
   check the arithmetic against the rule rather than trusting the number. */
const RULES: { label: string; points: string; note: string }[] = [
  { label: "Within the grace period", points: "0", note: "Not a violation, and never shown as one." },
  { label: "Approved leave", points: "0", note: "Does not reduce your score or spoil a perfect month." },
  { label: "Late", points: POINTS.late.toFixed(2), note: "Past grace, but more than half the shift worked." },
  { label: "Half day", points: POINTS.half_day.toFixed(2), note: "Half the scheduled shift or less." },
  { label: "Absent", points: POINTS.absent.toFixed(2), note: "Whole shift missed, with proper notice." },
  { label: "No call, no show", points: POINTS.ncns.toFixed(2), note: "Whole shift missed, without notice." },
  { label: "Perfect month", points: `+${PERFECT_MONTH_BONUS.toFixed(2)}`, note: "No violations in the month." },
  { label: "Perfect quarter", points: `+${PERFECT_QUARTER_BONUS.toFixed(2)}`, note: "No violations all quarter." },
];

export function AttendancePage() {
  const { score, isLoading } = useMyAttendanceScore();

  if (isLoading || !score) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Working out your score…</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <AttendanceScoreCard score={score} />

        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-foreground">Month by month</h2>
          <ul className="mt-3 space-y-2">
            {score.months.length === 0 && (
              <li className="text-xs text-muted-foreground">No attendance recorded this quarter yet.</li>
            )}
            {score.months.map((m) => (
              <li key={m.month} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{m.label}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {m.counts.late} late · {m.counts.half_day} half · {m.counts.absent} absent
                    {" · "}{m.counts.ncns} NCNS · {m.counts.approved_leave} leave
                  </span>
                </span>
                <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold", BONUS_TONE[m.bonus])}>
                  {BONUS_LABEL[m.bonus]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <span className="flex items-center gap-3">
            <Trophy className="h-6 w-6 shrink-0 text-emerald-700" aria-hidden />
            <span>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Current streak
              </span>
              <span className="block text-2xl font-extrabold tabular-nums text-foreground">
                {score.streakDays} {score.streakDays === 1 ? "day" : "days"}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {score.streakDays > 0
                  ? "Scheduled days in a row with no violation. Approved leave does not break it."
                  : "Starts again at your next clean scheduled day."}
              </span>
            </span>
          </span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-foreground">How the score works</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Everyone starts each quarter on {QUARTER_START_POINTS}. The most it can reach is
            {" "}{QUARTER_MAX_POINTS}, and nothing carries into the next quarter.
          </p>
          <ul className="mt-3 divide-y divide-border/60">
            {RULES.map((r) => (
              <li key={r.label} className="flex items-start justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-foreground">{r.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{r.note}</span>
                </span>
                <span className="shrink-0 text-xs font-bold tabular-nums text-foreground">{r.points}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
            <strong className="text-foreground">One incident, one deduction.</strong> The highest
            applicable only — arriving late enough to lose half a shift is −0.50, not −0.25 as
            well. Repeating something never deepens it: {LATES_FOR_COACHING} lates in
            {" "}{LATE_WINDOW_DAYS} days, or {NCNS_FOR_MANAGEMENT} no-shows in a quarter, raise a
            conversation rather than a bigger penalty.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-foreground">Standing</h2>
          <ul className="mt-2 space-y-1">
            {[[18, 20], [15, 17.75], [12, 14.75], [9, 11.75], [0, 8.75]].map(([lo, hi]) => {
              const band = standingFor(lo);
              const mine = score.standing === band;
              return (
                <li key={band}
                  className={cn("flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-xs",
                    mine ? "bg-primary/10 font-bold text-foreground" : "text-muted-foreground")}>
                  <span>{STANDING_LABEL[band]}</span>
                  <span className="tabular-nums">{lo} – {hi}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
