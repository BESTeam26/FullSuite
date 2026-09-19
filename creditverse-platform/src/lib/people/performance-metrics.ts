/**
 * The Performance page, as pure functions.
 *
 * Dee's mockup and weighting, 2026-09-19. Four components, each a rate in
 * whole percent derived from canonical records — never a stored number, never
 * a typed rating:
 *
 *   attendance   on-time days ÷ scheduled working days           (attendance facts)
 *   quality      QA passed ÷ QA reviewed, completed work          (work_items.qa_result)
 *   compliance   EOD reports filed by the person ÷ scheduled days (eod_submissions)
 *   output       work delivered against the position's target     (work items completed)
 *
 * Overall = Σ weight × component over the components that HAVE a value, with
 * the weights renormalised to those (a person with no QA review is not scored
 * 0 on quality; quality is simply not in their overall yet). Dee's company
 * weights are policy data (`performance_policy`): Quality 35, Output 35,
 * Compliance 20, Attendance 10 — "70% of performance on the actual work
 * produced". Below the Quality or Compliance minimum, the overall is capped in
 * the Needs Support band however high the rest is.
 *
 * Output is "was enough work delivered", NOT hours worked — Dee: "we are not
 * measuring whether someone merely looks busy." A rate needs a target, and
 * per-position targets are not data yet (D-019); until they are, output is
 * the count delivered, shown as such, and out of the overall.
 *
 * Bands: Outstanding 90–100, Strong 75–89, On Track 60–74, Needs Support <60.
 */
import type { AttendanceFact, AttendancePolicy, Correction } from "@/lib/attendance/attendance-score";
import type { SubmissionKind } from "@/lib/data/eod-day";
import {
  attendanceMix, eodMix, onTimeRate, qualityScore, submissionRate, type DateRange,
} from "./overview-metrics";
import { DEFAULT_PERFORMANCE_POLICY, type PerformancePolicy } from "./performance-policy";

export interface PersonScore {
  attendance: number | null;
  quality: number | null;
  compliance: number | null;
  /** A rate only once the position has a target (D-019); null until then. */
  output: number | null;
  /** Work items delivered in the period — the fact behind `output`. */
  delivered: number;
  overall: number | null;
  /** True when Quality or Compliance sits below the policy minimum. */
  belowMinimum: boolean;
}

export const SCORE_KEYS = ["attendance", "quality", "compliance", "output"] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];
export const SCORE_LABEL: Record<ScoreKey, string> = {
  attendance: "Attendance & Reliability",
  quality: "Quality",
  compliance: "Compliance",
  output: "Productivity & Output",
};

const inRange = (day: string, r: DateRange) => day >= r.from && day <= r.to;

/** Work items completed by the person in the range — what was delivered. */
export function deliveredCount(
  items: readonly { assignedTo?: string; completedAt?: string }[], userId: string, range: DateRange,
): number {
  return items.filter((w) => w.assignedTo === userId && !!w.completedAt && inRange(w.completedAt.slice(0, 10), range)).length;
}

/**
 * Output as a rate: delivered ÷ target, capped at 100. There is no target
 * until per-position targets exist (D-019), so this returns null — never a
 * rate against an invented number.
 */
export function outputRate(delivered: number, target: number | null): number | null {
  return target === null || target <= 0 ? null : Math.min(100, Math.round((delivered / target) * 100));
}

export interface PersonInputs {
  userId: string;
  facts: readonly AttendanceFact[];
  corrections: readonly Correction[];
  policy: AttendancePolicy;
  eodMarks: readonly { employeeId: string; workDate: string; kind: SubmissionKind }[];
  items: readonly { assignedTo?: string; completedAt?: string; qaResult?: "pending" | "passed" | "needs_fix" }[];
  /** Work items expected in the period for this position; null until D-019. */
  outputTarget?: number | null;
}

export function personScore(input: PersonInputs, range: DateRange, policy: PerformancePolicy = DEFAULT_PERFORMANCE_POLICY): PersonScore {
  const scheduledDays = input.facts
    .filter((f) => f.scheduled && !f.approvedLeave && inRange(f.day, range))
    .map((f) => ({ employeeId: input.userId, day: f.day }));
  const attendance = onTimeRate(attendanceMix(input.facts, range, input.policy, input.corrections));
  const quality = qualityScore(input.items, input.userId, range).score;
  const compliance = submissionRate(eodMix(input.eodMarks, scheduledDays, range));
  const delivered = deliveredCount(input.items, input.userId, range);
  const output = outputRate(delivered, input.outputTarget ?? null);
  const parts = { attendance, quality, compliance, output };
  return { ...parts, delivered, overall: overallOf(parts, policy), belowMinimum: isBelowMinimum(parts, policy) };
}

/** Quality or Compliance under the policy floor — where a floor is set. */
export function isBelowMinimum(parts: Pick<PersonScore, "quality" | "compliance">, policy: PerformancePolicy): boolean {
  return (policy.minQuality !== null && parts.quality !== null && parts.quality < policy.minQuality)
    || (policy.minCompliance !== null && parts.compliance !== null && parts.compliance < policy.minCompliance);
}

/** The top of the Needs Support band — where a below-minimum overall is capped. */
export const NEEDS_SUPPORT_CAP = 59;

/**
 * Weighted overall over the components that exist, weights renormalised to
 * them; null when none do. Capped at the Needs Support band when a minimum
 * threshold is breached.
 */
export function overallOf(
  parts: Pick<PersonScore, ScoreKey>, policy: PerformancePolicy = DEFAULT_PERFORMANCE_POLICY,
): number | null {
  let sum = 0, weight = 0;
  for (const k of SCORE_KEYS) {
    const v = parts[k];
    if (v === null || policy.weights[k] === 0) continue;
    sum += v * policy.weights[k];
    weight += policy.weights[k];
  }
  if (weight === 0) return null;
  const raw = Math.round(sum / weight);
  return isBelowMinimum(parts, policy) ? Math.min(raw, NEEDS_SUPPORT_CAP) : raw;
}

/** The team figure for one component: the mean over people who have it. */
export function averageOf(scores: readonly PersonScore[], key: keyof PersonScore): number | null {
  const present = scores.map((s) => s[key]).filter((v): v is number => v !== null);
  return present.length === 0 ? null : Math.round(present.reduce((s, v) => s + v, 0) / present.length);
}

export type Band = "outstanding" | "strong" | "on_track" | "needs_support";
export const BANDS: { key: Band; label: string; min: number; max: number }[] = [
  { key: "outstanding", label: "Outstanding (90–100)", min: 90, max: 100 },
  { key: "strong", label: "Strong (75–89)", min: 75, max: 89 },
  { key: "on_track", label: "On Track (60–74)", min: 60, max: 74 },
  { key: "needs_support", label: "Needs Support (below 60)", min: 0, max: 59 },
];

export const bandOf = (overall: number): Band =>
  overall >= 90 ? "outstanding" : overall >= 75 ? "strong" : overall >= 60 ? "on_track" : "needs_support";

/** How many people fall in each band; people without a score are not placed. */
export function distribution(scores: readonly PersonScore[]): Record<Band, number> {
  const out: Record<Band, number> = { outstanding: 0, strong: 0, on_track: 0, needs_support: 0 };
  for (const s of scores) if (s.overall !== null) out[bandOf(s.overall)] += 1;
  return out;
}

/** The last `n` calendar months ending with the month `today` is in, oldest first. */
export function lastMonths(today: string, n: number): DateRange[] {
  const [y, m] = today.split("-").map(Number);
  const out: DateRange[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    const iso = (x: Date) => x.toISOString().slice(0, 10);
    out.push({ from: iso(d), to: iso(last) < today ? iso(last) : today });
  }
  return out;
}

export const monthLabel = (range: DateRange): string =>
  new Date(`${range.from}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

/** Percentage-point trend, or null when either month has no score. */
export const trendOf = (current: number | null, previous: number | null): number | null =>
  current === null || previous === null ? null : current - previous;

/** A CSV of the individuals table, for Export Report. Quotes every cell. */
export function performanceCsv(rows: readonly { name: string; position: string; team: string; score: PersonScore }[]): string {
  const cell = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["Name", "Position", "Team", "Attendance & Reliability %", "Quality %", "Compliance %", "Productivity & Output %", "Delivered (items)", "Overall %"];
  const lines = rows.map((r) => [r.name, r.position, r.team, r.score.attendance, r.score.quality, r.score.compliance, r.score.output, r.score.delivered, r.score.overall].map(cell).join(","));
  return [header.map(cell).join(","), ...lines].join("\n");
}
