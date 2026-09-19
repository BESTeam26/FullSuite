/**
 * The company-level performance weighting — Dee, 2026-09-19:
 *
 *   35% Quality + 35% Productivity & Output + 20% Compliance + 10% Attendance
 *
 * "This puts 70% of performance on the actual work produced: was enough work
 * delivered, and was it done correctly." Plus minimum thresholds for Quality
 * and Compliance, so nobody offsets dangerously poor quality with volume.
 *
 * The numbers live in `performance_policy` (one row per agency) and are read
 * by `usePerformancePolicy`; these defaults are the values that row was
 * seeded with, used only while it loads. Thresholds default to NONE: a
 * threshold nobody chose must not cap anyone.
 */
export interface PerformancePolicy {
  weights: { attendance: number; quality: number; compliance: number; output: number };
  /** Whole percent; null = no threshold set. */
  minQuality: number | null;
  minCompliance: number | null;
}

export const DEFAULT_PERFORMANCE_POLICY: PerformancePolicy = {
  weights: { attendance: 10, quality: 35, compliance: 20, output: 35 },
  minQuality: null,
  minCompliance: null,
};

export function mapPerformancePolicy(row: Record<string, unknown> | null): PerformancePolicy {
  if (!row) return DEFAULT_PERFORMANCE_POLICY;
  const n = (v: unknown, d: number) => (v === null || v === undefined ? d : Number(v));
  const opt = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    weights: {
      attendance: n(row.weight_attendance, 10),
      quality: n(row.weight_quality, 35),
      compliance: n(row.weight_compliance, 20),
      output: n(row.weight_output, 35),
    },
    minQuality: opt(row.min_quality),
    minCompliance: opt(row.min_compliance),
  };
}
