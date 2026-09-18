/**
 * The top of the Attendance page: the score, the next milestone, the prize.
 *
 * Dee, 2026-09-18, with a mockup: "VISUALLY Improved." The numbers were
 * already right; what was missing was that they read as a GOAL. Three panels,
 * left to right — where you are, what is next, and what the top pays.
 */
import { Gift, Target, Trophy } from "lucide-react";
import {
  QUARTER_MAX_POINTS, QUARTER_START_POINTS, STANDING_LABEL, type QuarterScore, type Standing,
} from "@/lib/attendance/attendance-score";
import { cn } from "@/lib/utils";

const PILL: Record<Standing, string> = {
  champion: "bg-amber-500/15 text-amber-900",
  excellent: "bg-emerald-500/15 text-emerald-800",
  good: "bg-emerald-500/10 text-emerald-800",
  coaching: "bg-amber-500/15 text-amber-900",
  improvement: "bg-amber-500/20 text-amber-900",
  review: "bg-status-danger-tint text-status-danger",
};

const pretty = (n: number) => n.toFixed(2).replace(/\.00$/, "").replace(/0$/, "");

/** What a 20/20 quarter actually pays, in the order Dee listed it. */
const CHAMPION_REWARDS = [
  { icon: "🎁", label: "₱2,000 bonus" },
  { icon: "📅", label: "1 paid Reward Day" },
  { icon: "🏅", label: "Champion badge" },
  { icon: "⭐", label: "Recognition in the company hub" },
];

export function AttendanceHero({ score, quarterLabel }: {
  score: QuarterScore; quarterLabel: string;
}) {
  const pct = Math.max(0, Math.min(100, (score.score / QUARTER_MAX_POINTS) * 100));
  const isChampion = score.standing === "champion";

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,0.75fr)]">
      {/* ── Where you are ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-bold text-foreground">Your attendance score</p>
        <p className="text-[11px] text-muted-foreground">{quarterLabel}</p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-4xl font-extrabold tabular-nums tracking-tight text-foreground">
            {pretty(score.score)}
            <span className="ml-1 text-lg font-bold text-muted-foreground">/ {QUARTER_MAX_POINTS}</span>
          </p>
          <span className={cn("rounded-full px-3 py-1 text-xs font-bold", PILL[score.standing])}>
            {STANDING_LABEL[score.standing]}
          </span>
        </div>

        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar" aria-valuenow={score.score} aria-valuemin={0}
          aria-valuemax={QUARTER_MAX_POINTS}
          aria-label={`${pretty(score.score)} of ${QUARTER_MAX_POINTS} points`}>
          <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${pct}%` }} />
        </div>

        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
          <span>Started at {QUARTER_START_POINTS} points</span>
          <span>
            {score.toNextStanding
              ? `${pretty(score.toNextStanding.points)} points to ${STANDING_LABEL[score.toNextStanding.standing]}`
              : "Top of the ladder"}
          </span>
        </div>
      </div>

      {/* ── What is next ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Target className="h-4 w-4 text-blue-600" aria-hidden /> Next milestone
          </p>
          {score.nextAchievement ? (
            <>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                {score.nextAchievement.detail} to earn
              </p>
              <p className="text-base font-extrabold text-status-success">
                +{pretty(score.nextAchievement.points ?? 0)} point
                {score.nextAchievement.points === 1 ? "" : "s"}
              </p>
            </>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Nothing further this quarter.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-muted/40 p-4">
          <p className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Trophy className="h-4 w-4 text-amber-600" aria-hidden /> Quarter goal
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Reach {QUARTER_MAX_POINTS}/{QUARTER_MAX_POINTS} to become a
            {" "}<strong className="text-foreground">Perfect Attendance Champion</strong>.
          </p>
        </div>
      </div>

      {/* ── What the top pays ─────────────────────────────────────────── */}
      <div className={cn("rounded-2xl border p-5 text-center",
        isChampion
          ? "border-amber-500/50 bg-amber-500/10"
          : "border-border bg-gradient-to-b from-amber-500/5 to-card")}>
        <p className="text-4xl" aria-hidden>🏆</p>
        <p className="mt-1 text-sm font-extrabold text-foreground">Perfect Attendance Champion</p>
        <p className="text-xs font-bold tabular-nums text-muted-foreground">
          {QUARTER_MAX_POINTS}/{QUARTER_MAX_POINTS}
        </p>
        <ul className="mt-3 space-y-1.5 text-left">
          {CHAMPION_REWARDS.map((r) => (
            <li key={r.label} className="flex items-start gap-2 text-[11px] text-foreground">
              <span aria-hidden className="shrink-0">{r.icon}</span> {r.label}
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-border pt-2 text-[11px] italic text-muted-foreground">
          “Show up. Stand out.”
          <span className="mt-0.5 block not-italic font-bold">BES</span>
        </p>
        {isChampion && (
          <p className="mt-2 flex items-center justify-center gap-1 text-[11px] font-bold text-amber-900">
            <Gift className="h-3.5 w-3.5" aria-hidden /> Earned this quarter
          </p>
        )}
      </div>
    </div>
  );
}
