/**
 * The journey, not the penalty.
 *
 * Dee, 2026-09-18: "The biggest improvement isn't actually increasing the
 * prize. It's letting employees see themselves getting closer to it."
 *
 * So: the bar, how far to the next achievement, the streak, the single
 * clearest next thing, and what the top of the ladder actually pays.
 */
import { Flame, Target, Trophy } from "lucide-react";
import {
  QUARTER_MAX_POINTS, STANDING_ACTION, STANDING_BADGE, STANDING_LABEL,
  type QuarterScore,
} from "@/lib/attendance/attendance-score";

const pretty = (n: number) => n.toFixed(2).replace(/\.00$/, "").replace(/0$/, "");

export function AttendanceProgress({ score }: { score: QuarterScore }) {
  const pct = Math.max(0, Math.min(100, (score.score / QUARTER_MAX_POINTS) * 100));

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-foreground">Quarterly attendance</p>
        <p className="text-2xl font-extrabold tabular-nums text-foreground">
          {pretty(score.score)}
          <span className="ml-1 text-sm font-bold text-muted-foreground">/ {QUARTER_MAX_POINTS}</span>
          <span className="ml-2">{STANDING_BADGE[score.standing]}</span>
        </p>
      </div>

      {/* A bar rather than a number alone: 17.75 says less than seeing the
          gap. `aria-*` carries the same fact for anyone not seeing it. */}
      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar" aria-valuenow={score.score} aria-valuemin={0}
        aria-valuemax={QUARTER_MAX_POINTS}
        aria-label={`${pretty(score.score)} of ${QUARTER_MAX_POINTS} points`}>
        <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${pct}%` }} />
      </div>

      <p className="mt-2 text-xs text-foreground">
        {score.toNextStanding
          ? <>
              <strong className="tabular-nums">{pretty(score.toNextStanding.points)} points</strong>
              {" "}to {STANDING_LABEL[score.toNextStanding.standing]}
            </>
          : <><strong>{STANDING_LABEL[score.standing]}</strong> — the top of the ladder.</>}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <Flame className="h-3.5 w-3.5 text-amber-600" aria-hidden /> Current streak
          </p>
          <p className="text-lg font-extrabold tabular-nums text-foreground">
            {score.streakDays} scheduled {score.streakDays === 1 ? "day" : "days"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Approved leave does not break it.
          </p>
        </div>

        <div className="rounded-xl border border-border px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <Target className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Next achievement
          </p>
          {score.nextAchievement ? (
            <>
              <p className="text-sm font-bold text-foreground">{score.nextAchievement.label}</p>
              <p className="text-[11px] text-muted-foreground">
                {score.nextAchievement.detail}
                {score.nextAchievement.points ? ` · +${pretty(score.nextAchievement.points)}` : ""}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Nothing further this quarter — it starts again next quarter.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
        <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
        <p className="text-[11px] text-amber-900">
          <strong>Quarter reward · {QUARTER_MAX_POINTS} / {QUARTER_MAX_POINTS}</strong>
          <span className="block">{STANDING_ACTION.champion}</span>
        </p>
      </div>

      {score.badges.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Earned this quarter
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {score.badges.map((b) => (
              <li key={b.key} title={b.detail}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground">
                <span aria-hidden>{b.icon}</span> {b.label}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Badges are kept. The score starts again each quarter; what you earned does not.
          </p>
        </div>
      )}
    </div>
  );
}
