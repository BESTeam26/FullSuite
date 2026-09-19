/**
 * The numbers on People & Teams → Overview, as pure functions.
 *
 * Every figure on that page is DERIVED from canonical records — attendance
 * facts, EOD submissions, time entries — by the rules here, never typed in
 * and never stored. "Performance" on this page means one thing, stated on
 * the card: the on-time rate — days on time (grace included) ÷ scheduled
 * working days not on approved leave. It is the same classification the
 * quarterly score uses, corrections included, so the Overview can never
 * disagree with the Attendance section about a day.
 */
import {
  classifyDay, type AttendanceFact, type AttendancePolicy, type Classification, type Correction,
} from "@/lib/attendance/attendance-score";
import type { SubmissionKind } from "@/lib/data/eod-day";
import { addDays } from "@/lib/calendar/us-federal-holidays";
import { weekStart } from "@/lib/time-domain";

export interface DateRange { from: string; to: string }

/** Monday of the week `today` is in, through today. */
export const weekToDate = (today: string): DateRange =>
  ({ from: weekStart(new Date(`${today}T12:00:00`)), to: today });

/** The first of the month through today. */
export const monthToDate = (today: string): DateRange => ({ from: `${today.slice(0, 7)}-01`, to: today });

/** The whole previous calendar month. */
export const previousMonth = (today: string): DateRange => {
  const firstOfThis = `${today.slice(0, 7)}-01`;
  const lastOfPrev = addDays(firstOfThis, -1);
  return { from: `${lastOfPrev.slice(0, 7)}-01`, to: lastOfPrev };
};

const inRange = (day: string, r: DateRange) => day >= r.from && day <= r.to;

/** What a day ended up as, after the latest correction for it — the score's rule. */
export function finalClassification(
  fact: AttendanceFact, policy: AttendancePolicy, corrections: readonly Correction[],
): Classification {
  const c = corrections.find((x) => x.day === fact.day);
  return c ? c.to : classifyDay(fact, policy);
}

export interface AttendanceMix { onTime: number; late: number; absent: number; onLeave: number }

/** Days in the range, bucketed the way the Overview donut draws them. */
export function attendanceMix(
  facts: readonly AttendanceFact[], range: DateRange,
  policy: AttendancePolicy, corrections: readonly Correction[] = [],
): AttendanceMix {
  const mix: AttendanceMix = { onTime: 0, late: 0, absent: 0, onLeave: 0 };
  for (const f of facts) {
    if (!inRange(f.day, range)) continue;
    switch (finalClassification(f, policy, corrections)) {
      case "on_time": case "grace": mix.onTime += 1; break;
      case "late": case "half_day": mix.late += 1; break;
      case "absent": case "ncns": mix.absent += 1; break;
      case "approved_leave": mix.onLeave += 1; break;
      case "none": break;
    }
  }
  return mix;
}

export const addMix = (a: AttendanceMix, b: AttendanceMix): AttendanceMix =>
  ({ onTime: a.onTime + b.onTime, late: a.late + b.late, absent: a.absent + b.absent, onLeave: a.onLeave + b.onLeave });

/**
 * On-time rate in whole percent, or null when nothing was scheduled — a
 * person with no working days has no rate, not a perfect one.
 */
export function onTimeRate(mix: AttendanceMix): number | null {
  const scheduled = mix.onTime + mix.late + mix.absent;
  return scheduled === 0 ? null : Math.round((mix.onTime / scheduled) * 100);
}

/** Percentage-point change, or null when either side has no rate. */
export const rateChange = (current: number | null, previous: number | null): number | null =>
  current === null || previous === null ? null : current - previous;

export interface EodMix { submitted: number; late: number; missing: number }

/**
 * EOD compliance over scheduled days: filed by the person, filed by the cutoff
 * (late), or not filed at all. A day off is not a missing report.
 */
export function eodMix(
  marks: readonly { employeeId: string; workDate: string; kind: SubmissionKind }[],
  scheduledDays: readonly { employeeId: string; day: string }[],
  range: DateRange,
): EodMix {
  const mix: EodMix = { submitted: 0, late: 0, missing: 0 };
  const byKey = new Map(marks.map((m) => [`${m.employeeId}|${m.workDate}`, m.kind]));
  for (const d of scheduledDays) {
    if (!inRange(d.day, range)) continue;
    const kind = byKey.get(`${d.employeeId}|${d.day}`);
    if (kind === "submitted_by_person") mix.submitted += 1;
    else if (kind === "auto_submitted") mix.late += 1;
    else mix.missing += 1;
  }
  return mix;
}

export function submissionRate(mix: EodMix): number | null {
  const total = mix.submitted + mix.late + mix.missing;
  return total === 0 ? null : Math.round((mix.submitted / total) * 100);
}

/** "Today", "Yesterday", "3 days ago" — or the honest dash when nothing this week. */
export function lastActiveLabel(iso: string | null, today: string): string {
  if (!iso) return "—";
  const day = iso.slice(0, 10);
  if (day >= today) return "Today";
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

/**
 * Quality Score: QA verdicts on a person's completed work in the range —
 * passed ÷ (passed + needs fix), whole percent. Pending reviews are not
 * counted either way; no reviewed work means no score, not a perfect one.
 * The verdicts are `work_items.qa_result`, written by the QA gate.
 */
export function qualityScore(
  items: readonly { assignedTo?: string; completedAt?: string; qaResult?: "pending" | "passed" | "needs_fix" }[],
  userId: string, range: DateRange,
): { score: number | null; reviewed: number } {
  let passed = 0, failed = 0;
  for (const w of items) {
    if (w.assignedTo !== userId || !w.completedAt || !inRange(w.completedAt.slice(0, 10), range)) continue;
    if (w.qaResult === "passed") passed += 1;
    else if (w.qaResult === "needs_fix") failed += 1;
  }
  const reviewed = passed + failed;
  return { score: reviewed === 0 ? null : Math.round((passed / reviewed) * 100), reviewed };
}

