/**
 * Your attendance, and how it got that way.
 *
 * Dee, 2026-09-18, with a mockup: "I want to make it look like this, VISUALLY
 * Improved." The arithmetic did not change — it is the same engine, with the
 * same tests. What changed is that the page now reads as a goal rather than a
 * charge sheet: the score with the gap to the next rung, the prize, the streak,
 * what happened, the month's shape, the rules, and the badges kept.
 *
 * Dee's earlier rule still holds: "Do not make Team Lead attendance management
 * appear on the employee page." There is nothing here anybody can act on — no
 * marking, no overriding, no approving. It is a person's own record.
 */
import { Flame, Trophy } from "lucide-react";
import { AttendanceHero } from "@/components/attendance/AttendanceHero";
import { AttendanceBreakdown } from "@/components/attendance/AttendanceBreakdown";
import { AttendanceActivity } from "@/components/attendance/AttendanceActivity";
import { AttendanceRewardTiers } from "@/components/attendance/AttendanceRewardTiers";
import { AttendanceMonth } from "@/components/attendance/AttendanceMonth";
import { AttendanceScoreCard } from "@/components/attendance/AttendanceScoreCard";
import { useMyAttendanceScore } from "@/lib/attendance/use-attendance-score";
import { businessToday } from "@/lib/calendar/us-federal-holidays";
import {
  BADGE_META, LATES_FOR_COACHING, LATE_WINDOW_DAYS, NCNS_FOR_MANAGEMENT,
  POINTS, PERFECT_MONTH_BONUS, STREAK_BONUSES, type BadgeKey,
} from "@/lib/attendance/attendance-score";
import { cn } from "@/lib/utils";

/* The policy in Dee's own words, so somebody can check the arithmetic against
   the rule rather than trusting the number. */
const RULES: { label: string; points: string; note: string; good?: boolean }[] = [
  { label: "Grace period", points: "No deduction", note: "Arriving inside the allowed grace.", good: true },
  { label: "Late", points: POINTS.late.toFixed(2), note: "Past grace, more than half the shift worked." },
  { label: "Half day", points: POINTS.half_day.toFixed(2), note: "Half the scheduled shift or less." },
  { label: "Absent", points: POINTS.absent.toFixed(2), note: "Whole shift missed, with proper notice." },
  { label: "NCNS", points: POINTS.ncns.toFixed(2), note: "Whole shift missed, without notice." },
  { label: "Approved leave", points: "No deduction", note: "Vacation, approved sick leave, emergency leave.", good: true },
  { label: "Perfect month", points: `+${PERFECT_MONTH_BONUS.toFixed(2)}`, note: "No violations in the month.", good: true },
  ...STREAK_BONUSES.map((t) => ({
    label: t.badge, points: `+${t.points.toFixed(2)}`,
    note: `${t.days} scheduled days in a row without a violation.`, good: true,
  })),
];

/* Every badge, so the ones not yet earned read as something to chase rather
   than being invisible. */
const ALL_BADGES: BadgeKey[] = [
  "perfect_month", "reliability_30", "reliability_60", "reliability_90",
  "perfect_attendance", "champion",
];

export function AttendancePage() {
  const { score, isLoading } = useMyAttendanceScore();

  if (isLoading || !score) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Working out your score…</p>;
  }

  const today = businessToday();
  const month = today.slice(0, 7);
  const monthLabel = new Date(`${month}-15T12:00:00Z`)
    .toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const quarterLabel = score.quarter.replace("-Q", " · Quarter ");
  const earned = new Set(score.badges.map((b) => b.key));

  return (
    <div className="space-y-3">
      <AttendanceHero score={score} quarterLabel={quarterLabel} />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <AttendanceBreakdown score={score} />

            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
              <Flame className="mx-auto h-6 w-6 text-amber-600" aria-hidden />
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Current streak
              </p>
              <p className="text-2xl font-extrabold tabular-nums text-foreground">
                {score.streakDays}
                <span className="ml-1 text-sm font-bold text-muted-foreground">
                  scheduled {score.streakDays === 1 ? "day" : "days"}
                </span>
              </p>
              {score.streakDays > 0 && (
                <span className="mt-2 inline-block rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-bold text-emerald-800">
                  Keep it up!
                </span>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Approved leave does not break your streak.
              </p>
            </div>
          </div>

          <AttendanceActivity rows={score.activity} />

          <div className="grid gap-3 sm:grid-cols-2">
            <AttendanceMonth rows={score.activity} month={month} label={monthLabel} />

            <div className="rounded-2xl border border-border bg-card p-4">
              <h2 className="text-sm font-bold text-foreground">Attendance policy</h2>
              <ul className="mt-3 divide-y divide-border/60">
                {RULES.map((r) => (
                  <li key={r.label} className="flex items-start justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-foreground">{r.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{r.note}</span>
                    </span>
                    <span className={cn("shrink-0 text-xs font-bold tabular-nums",
                      r.good ? "text-status-success" : "text-foreground")}>
                      {r.points}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
                <strong className="text-foreground">One incident, one deduction.</strong> The highest
                applicable only. Repeating something never deepens it:
                {" "}{LATES_FOR_COACHING} lates in {LATE_WINDOW_DAYS} days, or
                {" "}{NCNS_FOR_MANAGEMENT} no-shows in a quarter, raise a conversation rather than a
                bigger penalty.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <AttendanceRewardTiers current={score.standing} />

          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Trophy className="h-4 w-4 text-amber-600" aria-hidden /> Achievements
            </h2>
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {ALL_BADGES.map((key) => {
                const meta = BADGE_META[key];
                const got = earned.has(key);
                return (
                  <li key={key} title={meta.detail}
                    className={cn("rounded-xl border px-2 py-3 text-center",
                      got ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-muted/30 opacity-60")}>
                    <span aria-hidden className={cn("block text-2xl", !got && "grayscale")}>{meta.icon}</span>
                    <span className="mt-1 block text-[11px] font-bold leading-tight text-foreground">
                      {meta.label}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {got ? "Earned" : "In progress"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Badges are kept. The score starts again each quarter; what you earned does not.
            </p>
          </div>

          <AttendanceScoreCard score={score} />
        </div>
      </div>
    </div>
  );
}
