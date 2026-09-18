/**
 * The BES Quarterly Attendance Score.
 *
 * Dee's policy, 2026-09-18, in full:
 *
 *   10-minute grace. Late ¼. Half day ½. Absent 1. NCNS 2. Approved leave 0.
 *   Perfect month +1. Perfect quarter +2. Start at 15. Max 20.
 *
 * Deterministic code, never a judgement (rule 9). Everything here is a pure
 * function over facts the rest of the product already derives: nothing fetches,
 * nothing writes, and no manager can hand-award a bonus — a perfect month is
 * either true of the month or it is not.
 *
 * ── THE FIVE RULES DEE LOCKED ──────────────────────────────────────────────
 *
 * 1. Approved leave is NOT a violation. It scores zero AND it does not spoil a
 *    perfect month — somebody on approved holiday has not missed anything.
 * 2. Inside the grace period is not a violation and does not appear as one.
 * 3. ONE INCIDENT, ONE CLASSIFICATION. The highest applicable, only.
 * 4. Half Day beats Late. Arriving late enough to lose half the shift is
 *    −0.50, never −0.25 and −0.50.
 * 5. Absent vs NCNS turns on NOTICE, not on hours: no shift worked with proper
 *    notice is −1; without it, −2.
 *
 * ── AND THE ONE THAT IS EASIEST TO GET WRONG ───────────────────────────────
 *
 * Repetition never deepens a deduction. Three lates are three × −0.25 and a
 * COACHING ALERT — not −0.25, −0.50, −0.75. Points measure attendance;
 * patterns trigger coaching. Keeping those apart is what makes the score
 * something an employee can predict.
 */

/** One incident is exactly one of these. */
export type Classification =
  | "none"            // not a scheduled day
  | "approved_leave"  // covered by approved leave
  | "grace"           // late, but inside the grace period
  | "on_time"
  | "late"
  | "half_day"
  | "absent"
  | "ncns";

export const POINTS: Record<Classification, number> = {
  none: 0,
  approved_leave: 0,
  grace: 0,
  on_time: 0,
  late: -0.25,
  half_day: -0.5,
  absent: -1,
  ncns: -2,
};

export const LABELS: Record<Classification, string> = {
  none: "Not scheduled",
  approved_leave: "Approved leave",
  grace: "Within grace",
  on_time: "On time",
  late: "Late",
  half_day: "Half day",
  absent: "Absent",
  ncns: "No call, no show",
};

/** Only these reduce the score, and only these spoil a perfect month. */
const VIOLATIONS: Classification[] = ["late", "half_day", "absent", "ncns"];
export const isViolation = (c: Classification) => VIOLATIONS.includes(c);

export const QUARTER_START_POINTS = 15;
export const QUARTER_MAX_POINTS = 20;
export const QUARTER_MIN_POINTS = 0;
export const PERFECT_MONTH_BONUS = 1;
export const PERFECT_QUARTER_BONUS = 2;

/**
 * A day, as the rest of the product already derives it.
 *
 * `lateMinutes` is minutes late BEYOND the grace period — which is what
 * `attendance_for` already returns, having subtracted the schedule's own
 * `grace_minutes`. The grace period therefore has ONE definition, on the
 * schedule, rather than a second copy in this policy that could disagree
 * with the warning the agent already saw on My Time.
 */
export interface AttendanceFact {
  /** `YYYY-MM-DD`. */
  day: string;
  /** A working day on their schedule. A day off is not an attendance event. */
  scheduled: boolean;
  approvedLeave: boolean;
  lateMinutes: number;
  workedMinutes: number;
  scheduledMinutes: number;
  /**
   * Proper notice was given for a missed shift.
   *
   * Defaults to TRUE at the call site on purpose: the system cannot know
   * whether somebody phoned in, and inventing an NCNS (−2) from silence would
   * punish twice as hard as the evidence supports. NCNS is something a lead
   * marks, not something absence implies.
   */
  notified: boolean;
}

/** Half a shift or less worked is a Half Day, whatever the reason. */
export const HALF_DAY_RATIO = 0.5;

/** The single highest applicable classification for one day. */
export function classifyDay(fact: AttendanceFact): Classification {
  if (!fact.scheduled) return "none";
  if (fact.approvedLeave) return "approved_leave";

  /* Nothing worked at all. Notice decides which of the two it is. */
  if (fact.workedMinutes <= 0) return fact.notified ? "absent" : "ncns";

  /* Half Day beats Late, so it is asked first (Dee's rule 4). A shift with no
     recorded length cannot be halved, so it falls through to the late test
     rather than classifying everybody as a half day. */
  if (fact.scheduledMinutes > 0 && fact.workedMinutes <= fact.scheduledMinutes * HALF_DAY_RATIO) {
    return "half_day";
  }

  if (fact.lateMinutes > 0) return "late";
  return "on_time";
}

/**
 * A lead's later decision about a day — "that absence was an emergency".
 *
 * A correction never deletes the original (Dee's rule 6, and rule 11). It is
 * applied as a second, opposite line so the history reads as what happened:
 * the −1 stands, and a +1 reversal sits under it with who did it and why.
 */
export interface Correction {
  day: string;
  to: Classification;
  reason: string;
  by: string;
  at: string;
}

export interface LedgerLine {
  day: string;
  label: string;
  points: number;
  kind: "opening" | "incident" | "reversal" | "perfect_month" | "perfect_quarter";
  detail?: string;
}

export type Standing =
  | "excellent" | "good" | "coaching" | "improvement_required" | "management_review";

export const STANDING_LABEL: Record<Standing, string> = {
  excellent: "Excellent",
  good: "Good standing",
  coaching: "Coaching",
  improvement_required: "Improvement required",
  management_review: "Management review",
};

export const STANDING_ACTION: Record<Standing, string> = {
  excellent: "Reward / recognition eligible",
  good: "No action needed",
  coaching: "Team lead coaching",
  improvement_required: "Attendance improvement plan",
  management_review: "Management review required",
};

/** Dee's bands. Read top-down; the first that fits wins. */
export function standingFor(score: number): Standing {
  if (score >= 18) return "excellent";
  if (score >= 15) return "good";
  if (score >= 12) return "coaching";
  if (score >= 9) return "improvement_required";
  return "management_review";
}

/** Patterns trigger coaching. They never change the points. */
export interface PatternAlert {
  kind: "coaching" | "management";
  title: string;
  detail: string;
}

export const LATES_FOR_COACHING = 3;
export const LATE_WINDOW_DAYS = 30;
export const NCNS_FOR_MANAGEMENT = 2;

export interface QuarterScore {
  /** e.g. "2026-Q3". */
  quarter: string;
  score: number;
  standing: Standing;
  ledger: LedgerLine[];
  counts: Record<Classification, number>;
  alerts: PatternAlert[];
  /** How close the lates are to a coaching alert, for "2 of 3" on screen. */
  latesInWindow: number;
  /** The next +1 somebody can still earn, or null once the quarter is spent. */
  nextOpportunity: string | null;
  /** True when the arithmetic was clipped by the 0 or 20 bound. */
  clamped: boolean;
}

export const quarterOf = (day: string): string => {
  const [y, m] = day.split("-").map(Number);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
};

const monthOf = (day: string) => day.slice(0, 7);
const monthName = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
};
/* Quarter-point steps throughout, so 15 − 0.25 × 3 is 14.25 and not 14.249…. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Score one quarter.
 *
 * `today` decides which months are finished: a perfect-month bonus is earned by
 * a month that has ENDED, so September cannot be awarded on 18 September and
 * then taken back on the 20th when somebody is late. The quarterly bonus works
 * the same way.
 */
export function scoreQuarter(
  facts: readonly AttendanceFact[],
  options: { quarter: string; today: string; corrections?: readonly Correction[] } ,
): QuarterScore {
  const { quarter, today } = options;
  const corrections = options.corrections ?? [];
  const inQuarter = facts.filter((f) => quarterOf(f.day) === quarter)
    .slice().sort((a, b) => (a.day < b.day ? -1 : 1));

  const correctionFor = new Map(corrections.map((c) => [c.day, c]));
  const counts = Object.fromEntries(
    Object.keys(POINTS).map((k) => [k, 0]),
  ) as Record<Classification, number>;

  const ledger: LedgerLine[] = [
    { day: "", label: "Started the quarter", points: QUARTER_START_POINTS, kind: "opening" },
  ];

  /* Which classification each day ENDED UP as, after any correction — the one
     the perfect-month test must read. The original still appears in the
     ledger; it is just no longer the day's standing. */
  const effective = new Map<string, Classification>();

  for (const fact of inQuarter) {
    const original = classifyDay(fact);
    const correction = correctionFor.get(fact.day);
    const final = correction ? correction.to : original;
    effective.set(fact.day, final);
    counts[final] += 1;

    if (isViolation(original)) {
      ledger.push({
        day: fact.day, label: LABELS[original], points: POINTS[original], kind: "incident",
      });
    }
    if (correction && correction.to !== original) {
      ledger.push({
        day: fact.day,
        label: `Reversed — ${LABELS[correction.to].toLowerCase()}`,
        points: round2(POINTS[correction.to] - POINTS[original]),
        kind: "reversal",
        detail: `${correction.reason} · ${correction.by}`,
      });
    }
  }

  /* ── Perfect months. Earned by a finished month with at least one scheduled
        day and no violation in it. Approved leave does not spoil it. */
  const months = [...new Set(inQuarter.map((f) => monthOf(f.day)))].sort();
  const monthEnded = (month: string) => month < monthOf(today);
  const perfectMonths: string[] = [];
  for (const month of months) {
    const days = inQuarter.filter((f) => monthOf(f.day) === month);
    const scheduled = days.filter((f) => f.scheduled);
    if (scheduled.length === 0) continue;
    const clean = scheduled.every((f) => !isViolation(effective.get(f.day) ?? "none"));
    if (!clean) continue;
    perfectMonths.push(month);
    if (!monthEnded(month)) continue;
    ledger.push({
      day: `${month}-01`,
      label: `Perfect attendance · ${monthName(month)}`,
      points: PERFECT_MONTH_BONUS,
      kind: "perfect_month",
    });
  }

  /* ── The quarterly bonus, once the quarter itself is over. */
  const quarterEnded = quarterOf(today) !== quarter && today > (inQuarter[inQuarter.length - 1]?.day ?? "");
  const anyScheduled = inQuarter.some((f) => f.scheduled);
  const quarterClean = anyScheduled
    && inQuarter.filter((f) => f.scheduled).every((f) => !isViolation(effective.get(f.day) ?? "none"));
  if (quarterClean && quarterEnded) {
    ledger.push({
      day: "", label: "Perfect quarter", points: PERFECT_QUARTER_BONUS, kind: "perfect_quarter",
    });
  }

  const raw = round2(ledger.reduce((sum, l) => sum + l.points, 0));
  const score = round2(Math.min(QUARTER_MAX_POINTS, Math.max(QUARTER_MIN_POINTS, raw)));

  /* ── Patterns. Alerts only — never a deeper deduction. */
  const alerts: PatternAlert[] = [];
  const lateDays = inQuarter
    .filter((f) => (effective.get(f.day) ?? "none") === "late")
    .map((f) => f.day);
  const windowStart = shiftDays(today, -LATE_WINDOW_DAYS);
  const latesInWindow = lateDays.filter((d) => d > windowStart && d <= today).length;
  if (latesInWindow >= LATES_FOR_COACHING) {
    alerts.push({
      kind: "coaching",
      title: "Coaching alert",
      detail: `${latesInWindow} lates in the last ${LATE_WINDOW_DAYS} days. Each stays −0.25; the pattern is what needs a conversation.`,
    });
  }
  if (counts.ncns >= NCNS_FOR_MANAGEMENT) {
    alerts.push({
      kind: "management",
      title: "Management alert",
      detail: `${counts.ncns} no-call-no-shows this quarter. Each stays −2.00.`,
    });
  }

  /* ── What is still winnable, so the score is something to act on. */
  const currentMonth = monthOf(today);
  const currentClean = inQuarter
    .filter((f) => monthOf(f.day) === currentMonth && f.scheduled)
    .every((f) => !isViolation(effective.get(f.day) ?? "none"));
  const nextOpportunity = quarterOf(today) !== quarter
    ? null
    : currentClean
      ? `Finish ${monthName(currentMonth)} with perfect attendance → +1`
      : `${monthName(currentMonth)}'s bonus is gone. A clean month next month → +1`;

  return {
    quarter, score, standing: standingFor(score), ledger, counts, alerts,
    latesInWindow, nextOpportunity, clamped: raw !== score,
  };
}

/** Calendar-date arithmetic with no timezone involved. */
function shiftDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + delta));
  return at.toISOString().slice(0, 10);
}
