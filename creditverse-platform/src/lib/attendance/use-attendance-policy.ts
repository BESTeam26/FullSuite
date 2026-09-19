/**
 * The attendance policy, read from the database.
 *
 * Dee, 2026-09-18: "Do not hardcode these into frontend components if they are
 * configurable business policy." The engine takes a policy and defaults to the
 * seeded values, so this hook is what makes an EDIT take effect — without it
 * the row would exist and change nothing.
 *
 * One row, cached for five minutes: the policy changes a few times a year, and
 * every score on every screen depends on it (rule 14).
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { DEFAULT_POLICY, type AttendancePolicy } from "./attendance-score";

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function mapPolicy(r: Record<string, unknown> | null | undefined): AttendancePolicy {
  if (!r) return DEFAULT_POLICY;
  const d = DEFAULT_POLICY;
  const tiers = Array.isArray(r.streak_tiers)
    ? (r.streak_tiers as Record<string, unknown>[])
        .map((t) => ({
          days: num(t.days, 0), points: num(t.points, 0), badge: String(t.badge ?? ""),
        }))
        .filter((t) => t.days > 0 && t.points > 0 && t.badge)
        /* Ascending, because the engine walks them to find the NEXT milestone
           and a list out of order would offer 60 before 30. */
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

export async function fetchAttendancePolicy(): Promise<AttendancePolicy> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("attendance_policy").select("*").maybeSingle();
  if (error) throw error;
  return mapPolicy(data as unknown as Record<string, unknown> | null);
}

/**
 * Always returns a usable policy.
 *
 * While the row is loading, or if it cannot be read, this is the seeded
 * default — the same numbers the database was created with. A score that
 * refuses to render because a settings row is slow would be worse than one
 * computed from the values that row was seeded with.
 */
export function useAttendancePolicy(): AttendancePolicy {
  const auth = useAuth();
  const q = useQuery({
    queryKey: ["attendance", "policy"],
    queryFn: fetchAttendancePolicy,
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 300_000,
  });
  return q.data ?? DEFAULT_POLICY;
}
