/**
 * A policy ROW into the engine's policy.
 *
 * Pure and alias-free on purpose: the quarter-close sweep (a Deno Edge
 * Function) imports this same mapper, so the browser and the sweep cannot
 * read one row into two different policies.
 */
import { DEFAULT_POLICY, type AttendancePolicy } from "./attendance-score.ts";

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function mapPolicy(r: Record<string, unknown> | null | undefined): AttendancePolicy {
  if (!r) return DEFAULT_POLICY;
  const d = DEFAULT_POLICY;
  const tiers = Array.isArray(r.streak_tiers)
    ? (r.streak_tiers as Record<string, unknown>[])
        .map((t) => ({ days: num(t.days, 0), points: num(t.points, 0), badge: String(t.badge ?? "") }))
        .filter((t) => t.days > 0 && t.points > 0 && t.badge)
        /* Ascending: the engine walks these to find the NEXT milestone. */
        .sort((a, b) => a.days - b.days)
    : d.streakTiers;

  return {
    baseline: num(r.baseline, d.baseline),
    maxPoints: num(r.max_points, d.maxPoints),
    minPoints: num(r.min_points, d.minPoints),
    halfDayRatio: num(r.half_day_ratio, d.halfDayRatio),
    penalties: {
      late: num(r.late_penalty, d.penalties.late),
      half_day: num(r.half_day_penalty, d.penalties.half_day),
      absent: num(r.absent_penalty, d.penalties.absent),
      ncns: num(r.ncns_penalty, d.penalties.ncns),
    },
    perfectMonthBonus: num(r.perfect_month_bonus, d.perfectMonthBonus),
    streakTiers: tiers.length > 0 ? tiers : d.streakTiers,
    bands: {
      champion: num(r.band_champion, d.bands.champion),
      excellent: num(r.band_excellent, d.bands.excellent),
      good: num(r.band_good, d.bands.good),
      coaching: num(r.band_coaching, d.bands.coaching),
      improvement: num(r.band_improvement, d.bands.improvement),
    },
    latesForCoaching: num(r.lates_for_coaching, d.latesForCoaching),
    lateWindowDays: num(r.late_window_days, d.lateWindowDays),
    ncnsForManagement: num(r.ncns_for_management, d.ncnsForManagement),
  };
}
