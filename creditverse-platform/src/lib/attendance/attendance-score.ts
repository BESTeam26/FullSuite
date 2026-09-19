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

/**
 * The policy, as data.
 *
 * Dee, 2026-09-18: "Do not hardcode these into frontend components if they are
 * configurable business policy." Every NUMBER here lives in
 * `attendance_policy`, one row per agency. The constants below are the
 * DEFAULT — what a fresh agency is seeded with, and what the engine falls back
 * to if the policy has not loaded — so the numbers exist in exactly one place
 * that a reader can check the database against.
 *
 * The classifications and the band identities stay in code: "half day beats
 * late" is an ordering, not a number, and a new band needs an icon and a place
 * in the ladder. Those are a deploy either way.
 */
export interface AttendancePolicy {
  baseline: number;
  maxPoints: number;
  minPoints: number;
  halfDayRatio: number;
  /** Positive magnitudes. The engine negates them, so a typo cannot pay out. */
  penalties: { late: number; half_day: number; absent: number; ncns: number };
  perfectMonthBonus: number;
  streakTiers: { days: number; points: number; badge: string }[];
  /** Where each band STARTS. */
  bands: { champion: number; excellent: number; good: number; coaching: number; improvement: number };
  latesForCoaching: number;
  lateWindowDays: number;
  ncnsForManagement: number;
}

export const DEFAULT_POLICY: AttendancePolicy = {
  baseline: 15,
  maxPoints: 20,
  minPoints: 0,
  halfDayRatio: 0.5,
  penalties: { late: 0.25, half_day: 0.5, absent: 1, ncns: 2 },
  perfectMonthBonus: 1,
  streakTiers: [
    { days: 30, points: 0.5, badge: "30-Day Reliability" },
    { days: 60, points: 0.5, badge: "60-Day Reliability" },
    { days: 90, points: 1, badge: "90-Day Reliability" },
  ],
  bands: { champion: 20, excellent: 18, good: 15, coaching: 12, improvement: 9 },
  latesForCoaching: 3,
  lateWindowDays: 30,
  ncnsForManagement: 2,
};

/** What each classification is worth under a given policy. */
export function pointsUnder(policy: AttendancePolicy): Record<Classification, number> {
  return {
    none: 0, approved_leave: 0, grace: 0, on_time: 0,
    late: -policy.penalties.late,
    half_day: -policy.penalties.half_day,
    absent: -policy.penalties.absent,
    ncns: -policy.penalties.ncns,
  };
}

/** The default policy's values, kept for callers that only need to LABEL. */
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

export const QUARTER_START_POINTS = DEFAULT_POLICY.baseline;
export const QUARTER_MAX_POINTS = DEFAULT_POLICY.maxPoints;
export const QUARTER_MIN_POINTS = DEFAULT_POLICY.minPoints;
export const PERFECT_MONTH_BONUS = DEFAULT_POLICY.perfectMonthBonus;

/**
 * Reliability streaks, and why the perfect-quarter bonus went away.
 *
 * Dee, 2026-09-18: "I would NOT give +2 for a perfect quarter on top of three
 * +1 perfect months if that makes 20/20 attainable only through perfect
 * attendance. You wanted a system where employees can make mistakes, get
 * coached, and EARN THEIR WAY BACK."
 *
 * With 3 × +1 and a +2 quarterly bonus, the only route to 20 was a flawless
 * quarter — one late in July and the top was mathematically out of reach in
 * week two, which is when somebody stops trying. Streaks replace it: they are
 * earned by what you do NEXT, so a bad start can still be recovered.
 *
 *   15 start + 3 perfect months + 0.5 + 0.5 + 1 = 20, and there is more than
 *   one way to get there.
 */
export const STREAK_BONUSES = DEFAULT_POLICY.streakTiers;

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
export const HALF_DAY_RATIO = DEFAULT_POLICY.halfDayRatio;

/** The single highest applicable classification for one day. */
export function classifyDay(
  fact: AttendanceFact,
  policy: AttendancePolicy = DEFAULT_POLICY,
): Classification {
  if (!fact.scheduled) return "none";
  if (fact.approvedLeave) return "approved_leave";

  /* Nothing worked at all. Notice decides which of the two it is. */
  if (fact.workedMinutes <= 0) return fact.notified ? "absent" : "ncns";

  /* Half Day beats Late, so it is asked first (Dee's rule 4). A shift with no
     recorded length cannot be halved, so it falls through to the late test
     rather than classifying everybody as a half day. */
  if (fact.scheduledMinutes > 0 && fact.workedMinutes <= fact.scheduledMinutes * policy.halfDayRatio) {
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
  kind: "opening" | "incident" | "reversal" | "perfect_month" | "streak";
  detail?: string;
}

/* Quarter-point steps throughout, so 15 − 0.25 × 3 is 14.25 and not 14.249….
   A declaration, not a const: `STANDING_BANDS` is evaluated at module load and
   calls this, which a `const` arrow further down the file cannot answer. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type Standing =
  | "champion" | "excellent" | "good" | "coaching" | "improvement" | "review";

/**
 * Dee's achievement ladder, 2026-09-18.
 *
 * "I would make the reward feel like an achievement employees unlock, not just
 * 'you got +2 points.' The points determine the achievement, and the
 * achievement determines the reward."
 *
 * The REWARD is recorded here beside the band because it is the thing that
 * changes behaviour — a band with no stated prize is a label. Paying it is a
 * human act; this only says what was earned.
 */
export const STANDING_LABEL: Record<Standing, string> = {
  champion: "Perfect Attendance Champion",
  excellent: "Attendance Excellence",
  good: "Good standing",
  coaching: "Coaching",
  improvement: "Improvement required",
  review: "Management review",
};

export const STANDING_BADGE: Record<Standing, string> = {
  champion: "🏆", excellent: "⭐", good: "✅", coaching: "🟠",
  improvement: "🔺", review: "🔴",
};

export const STANDING_ACTION: Record<Standing, string> = {
  champion: "₱2,000 bonus + 1 paid Reward Day + permanent quarterly badge",
  excellent: "₱1,000 bonus + priority schedule and leave preference",
  good: "Recognition, and eligibility maintained",
  coaching: "Manager discussion. No quarterly attendance reward.",
  improvement: "Attendance improvement plan",
  review: "Management review required",
};

/** The bands, top-down. The first that fits wins. */
export function standingFor(score: number, policy: AttendancePolicy = DEFAULT_POLICY): Standing {
  const b = policy.bands;
  if (score >= b.champion) return "champion";
  if (score >= b.excellent) return "excellent";
  if (score >= b.good) return "good";
  if (score >= b.coaching) return "coaching";
  if (score >= b.improvement) return "improvement";
  return "review";
}

/**
 * Every band, in order, for the ladder on screen.
 *
 * Each band ENDS a quarter-point below the next one starts, so the ladder has
 * no gap and no overlap however Dee moves the thresholds — writing the upper
 * bounds out by hand is how 17.75 and 18 end up both belonging to nobody.
 */
export function standingBands(
  policy: AttendancePolicy = DEFAULT_POLICY,
): { standing: Standing; from: number; to: number }[] {
  const b = policy.bands;
  const starts: { standing: Standing; from: number }[] = [
    { standing: "champion", from: b.champion },
    { standing: "excellent", from: b.excellent },
    { standing: "good", from: b.good },
    { standing: "coaching", from: b.coaching },
    { standing: "improvement", from: b.improvement },
    { standing: "review", from: policy.minPoints },
  ];
  return starts.map((s, i) => ({
    ...s,
    to: i === 0 ? policy.maxPoints : round2(starts[i - 1].from - 0.25),
  }));
}

/** The default ladder, for callers with no policy in hand. */
export const STANDING_BANDS = standingBands();

/** Patterns trigger coaching. They never change the points. */
export interface PatternAlert {
  kind: "coaching" | "management";
  title: string;
  detail: string;
}

export const LATES_FOR_COACHING = DEFAULT_POLICY.latesForCoaching;
export const LATE_WINDOW_DAYS = DEFAULT_POLICY.lateWindowDays;
export const NCNS_FOR_MANAGEMENT = DEFAULT_POLICY.ncnsForManagement;

export interface MonthBreakdown {
  /** `YYYY-MM`. */
  month: string;
  label: string;
  counts: Record<Classification, number>;
  /** Earned, or still earnable, or lost. */
  bonus: "earned" | "pending" | "lost" | "none";
}

/**
 * A badge is CUMULATIVE — it survives the quarterly reset.
 *
 * Dee: "That makes the system cumulative even though the score resets every
 * quarter." So a badge is a fact about what somebody achieved, kept on the
 * profile, not a number that gets wiped in January.
 *
 * `perfect_attendance` is deliberately separate from `champion`: one is zero
 * violations, the other is reaching 20 — Dee, "those are slightly different
 * accomplishments." Somebody can reach 20 after an early late by building
 * streaks, and that is the point of the redesign.
 */
export type BadgeKey =
  | "reliability_30" | "reliability_60" | "reliability_90"
  | "perfect_month" | "perfect_attendance" | "champion";

export interface Badge {
  key: BadgeKey;
  icon: string;
  label: string;
  detail: string;
}

export const BADGE_META: Record<BadgeKey, { icon: string; label: string; detail: string }> = {
  reliability_30: { icon: "🥉", label: "30-Day Reliability", detail: "30 scheduled workdays without a violation" },
  reliability_60: { icon: "🥈", label: "60-Day Reliability", detail: "60 scheduled workdays without a violation" },
  reliability_90: { icon: "🥇", label: "90-Day Reliability", detail: "90 scheduled workdays without a violation" },
  perfect_month: { icon: "🔥", label: "Perfect Month", detail: "A full month with no attendance violation" },
  perfect_attendance: { icon: "✨", label: "Perfect Attendance", detail: "A whole quarter with no violation at all" },
  champion: { icon: "🏆", label: "Attendance Champion", detail: "A perfect 20 / 20 for the quarter" },
};

export interface ActivityRow {
  day: string;
  classification: Classification;
  /** "12 minutes after shift start", "No violations". */
  detail: string;
  points: number;
  /**
   * Where the classification came from. Dee, 2026-09-18: "Every attendance
   * event should clearly indicate its source… Do not hide where the decision
   * came from."
   *
   *   automatic  derived from the schedule and the timesheet
   *   corrected  a manager changed what the records said
   */
  source: "automatic" | "corrected";
  /** What it was before a manager changed it. */
  originalClassification?: Classification;
  correction?: { reason: string; by: string; at: string };
}

export interface NextAchievement {
  label: string;
  detail: string;
  /** Points it is worth, when it is worth points. */
  points?: number;
}

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
  /** Month by month, for the breakdown on the Attendance page. */
  months: MonthBreakdown[];
  /** Earned this quarter. Badges are kept permanently on the profile. */
  badges: Badge[];
  /** Points still needed to reach the next band, or null at the top. */
  toNextStanding: { standing: Standing; points: number } | null;
  /** The single clearest thing they can still do, for the progress panel. */
  nextAchievement: NextAchievement | null;
  /** What happened, newest first — the activity table. */
  activity: ActivityRow[];
  /**
   * Consecutive scheduled days, most recent first, with no violation.
   *
   * Approved leave and days off do not break it — somebody on booked holiday
   * has not broken a streak of turning up. Only a violation does.
   */
  streakDays: number;
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
  options: {
    quarter: string; today: string;
    corrections?: readonly Correction[];
    /** Defaults to the seeded values, so a caller without the row still works. */
    policy?: AttendancePolicy;
  },
): QuarterScore {
  const { quarter, today } = options;
  const corrections = options.corrections ?? [];
  const policy = options.policy ?? DEFAULT_POLICY;
  const POINTS_OF = pointsUnder(policy);
  const inQuarter = facts.filter((f) => quarterOf(f.day) === quarter)
    .slice().sort((a, b) => (a.day < b.day ? -1 : 1));

  const correctionFor = new Map(corrections.map((c) => [c.day, c]));
  const counts = Object.fromEntries(
    Object.keys(POINTS).map((k) => [k, 0]),
  ) as Record<Classification, number>;

  const ledger: LedgerLine[] = [
    { day: "", label: "Started the quarter", points: policy.baseline, kind: "opening" },
  ];

  /* Which classification each day ENDED UP as, after any correction — the one
     the perfect-month test must read. The original still appears in the
     ledger; it is just no longer the day's standing. */
  const effective = new Map<string, Classification>();

  for (const fact of inQuarter) {
    const original = classifyDay(fact, policy);
    const correction = correctionFor.get(fact.day);
    const final = correction ? correction.to : original;
    effective.set(fact.day, final);
    counts[final] += 1;

    if (isViolation(original)) {
      ledger.push({
        day: fact.day, label: LABELS[original], points: POINTS_OF[original], kind: "incident",
      });
    }
    if (correction && correction.to !== original) {
      ledger.push({
        day: fact.day,
        label: `Reversed — ${LABELS[correction.to].toLowerCase()}`,
        points: round2(POINTS_OF[correction.to] - POINTS_OF[original]),
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
      points: policy.perfectMonthBonus,
      kind: "perfect_month",
    });
  }

  /* ── The streak, computed before the total because it now EARNS points.
        Consecutive scheduled days, newest first, with no violation. Approved
        leave does not break it: Dee, 2026-09-18 — "approved leave should not
        break the streak or disqualify the achievement. If the employee
        followed the leave policy, the reward system shouldn't encourage them
        to avoid legitimate approved leave just to preserve a badge." */
  let streakDays = 0;
  for (let i = inQuarter.length - 1; i >= 0; i -= 1) {
    const f = inQuarter[i];
    if (!f.scheduled) continue;
    const c = effective.get(f.day) ?? "none";
    if (isViolation(c)) break;
    if (c === "approved_leave") continue;
    streakDays += 1;
  }

  /* Each reliability milestone the streak has passed. Cumulative within the
     quarter: reaching 60 days means 30 was passed on the way. */
  for (const tier of policy.streakTiers) {
    if (streakDays >= tier.days) {
      ledger.push({
        day: "", label: `${tier.badge} · ${tier.days} scheduled days without a violation`,
        points: tier.points, kind: "streak",
      });
    }
  }

  const raw = round2(ledger.reduce((sum, l) => sum + l.points, 0));
  const score = round2(Math.min(policy.maxPoints, Math.max(policy.minPoints, raw)));

  /* ── Patterns. Alerts only — never a deeper deduction. */
  const alerts: PatternAlert[] = [];
  const lateDays = inQuarter
    .filter((f) => (effective.get(f.day) ?? "none") === "late")
    .map((f) => f.day);
  const windowStart = shiftDays(today, -policy.lateWindowDays);
  const latesInWindow = lateDays.filter((d) => d > windowStart && d <= today).length;
  if (latesInWindow >= policy.latesForCoaching) {
    alerts.push({
      kind: "coaching",
      title: "Coaching alert",
      detail: `${latesInWindow} lates in the last ${policy.lateWindowDays} days. Each stays ${POINTS_OF.late.toFixed(2)}; the pattern is what needs a conversation.`,
    });
  }
  if (counts.ncns >= policy.ncnsForManagement) {
    alerts.push({
      kind: "management",
      title: "Management alert",
      detail: `${counts.ncns} no-call-no-shows this quarter. Each stays ${POINTS_OF.ncns.toFixed(2)}.`,
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

  /* ── Month by month, for the breakdown on the Attendance page. */
  const monthRows: MonthBreakdown[] = months.map((month) => {
    const days = inQuarter.filter((f) => monthOf(f.day) === month);
    const scheduled = days.filter((f) => f.scheduled);
    const mCounts = Object.fromEntries(
      Object.keys(POINTS).map((k) => [k, 0]),
    ) as Record<Classification, number>;
    for (const f of days) mCounts[effective.get(f.day) ?? "none"] += 1;
    const clean = scheduled.length > 0
      && scheduled.every((f) => !isViolation(effective.get(f.day) ?? "none"));
    return {
      month,
      label: monthName(month),
      counts: mCounts,
      bonus: scheduled.length === 0 ? "none"
        : !clean ? "lost"
        : monthEnded(month) ? "earned" : "pending",
    };
  });

  /* ── Badges. Earned facts, kept beyond the quarter. */
  const standing = standingFor(score, policy);
  const perfectQuarter = inQuarter.some((f) => f.scheduled)
    && inQuarter.filter((f) => f.scheduled)
      .every((f) => !isViolation(effective.get(f.day) ?? "none"));
  const badges: Badge[] = [];
  for (const tier of policy.streakTiers) {
    if (streakDays >= tier.days) {
      const key = `reliability_${tier.days}` as BadgeKey;
      badges.push({ key, ...BADGE_META[key] });
    }
  }
  if (perfectMonths.length > 0) badges.push({ key: "perfect_month", ...BADGE_META.perfect_month });
  if (perfectQuarter) badges.push({ key: "perfect_attendance", ...BADGE_META.perfect_attendance });
  if (standing === "champion") badges.push({ key: "champion", ...BADGE_META.champion });

  /* ── How far to the next band, so the score reads as a goal. */
  const higher = standingBands(policy).filter((b) => b.from > score).sort((a, b) => a.from - b.from)[0];
  const toNextStanding = higher
    ? { standing: higher.standing, points: round2(higher.from - score) }
    : null;

  /* ── And the clearest single thing still available. A month that is still
        running beats a streak milestone: it is nearer and it is certain. */
  const nextAchievement: NextAchievement | null = (() => {
    if (quarterOf(today) !== quarter) return null;
    if (currentClean) {
      return {
        label: `Perfect ${monthName(currentMonth)}`,
        detail: "Finish the month without an attendance violation",
        points: policy.perfectMonthBonus,
      };
    }
    const tier = policy.streakTiers.find((t) => streakDays < t.days);
    if (tier) {
      return {
        label: tier.badge,
        detail: `${tier.days - streakDays} more scheduled days without a violation`,
        points: tier.points,
      };
    }
    return null;
  })();

  /* ── What happened, newest first. Every scheduled day, not only the bad
        ones: a run of clean days is the evidence a streak is real. */
  const activity: ActivityRow[] = inQuarter
    .filter((f) => f.scheduled)
    .slice().reverse()
    .map((f) => {
      const c = effective.get(f.day) ?? "none";
      const fix = correctionFor.get(f.day);
      const original = classifyDay(f, policy);
      const detail =
        c === "late" ? `${f.lateMinutes} minute${f.lateMinutes === 1 ? "" : "s"} after the grace period`
        : c === "half_day" ? `${Math.round(f.workedMinutes / 60)}h of a ${Math.round(f.scheduledMinutes / 60)}h shift`
        : c === "absent" ? "Whole shift missed, with notice"
        : c === "ncns" ? "Whole shift missed, no notice"
        : c === "approved_leave" ? "Approved leave — no deduction"
        : "No violations";
      return {
        day: f.day, classification: c, detail, points: POINTS[c],
        source: fix ? "corrected" as const : "automatic" as const,
        ...(fix ? {
          originalClassification: original,
          correction: { reason: fix.reason, by: fix.by, at: fix.at },
        } : {}),
      };
    });

  return {
    quarter, score, standing, ledger, counts, alerts, activity,
    latesInWindow, nextOpportunity, clamped: raw !== score,
    months: monthRows, streakDays, badges, toNextStanding, nextAchievement,
  };
}

/** Calendar-date arithmetic with no timezone involved. */
function shiftDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + delta));
  return at.toISOString().slice(0, 10);
}
