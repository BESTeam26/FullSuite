/**
 * The quarter-close reward evaluation, as a pure decision.
 *
 * Dee, 2026-09-19: "At quarter close: attendance facts + corrections + policy
 * → canonical attendance score → if final score qualifies → issue Attendance
 * Reward exactly once. No second scoring implementation."
 *
 * This module decides; it never fetches and never writes. The Edge Function
 * around it is I/O glue — load rows, call `evaluateQuarter`, act on each
 * outcome — and the SAME file runs under vitest, which is where the acceptance
 * rules live. Every import here is a relative `.ts` path, because Deno
 * resolves neither `@/` nor extensionless specifiers, and both runtimes must
 * load this one file.
 */
import {
  scoreQuarter, type AttendancePolicy, type AttendanceFact, type Correction,
} from "./attendance-score.ts";

/** "2026-Q3" for the quarter that most recently ENDED before `today`. */
export function closedQuarterFor(today: string): string {
  const [y, m] = today.split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + 1;           // running quarter
  return q === 1 ? `${y - 1}-Q4` : `${y}-Q${q - 1}`;
}

/** First and last calendar day of a quarter, and the day after it ends. */
export function quarterBounds(quarter: string): { from: string; to: string; closesOn: string } {
  const [ys, qs] = quarter.split("-Q");
  const y = Number(ys), q = Number(qs);
  const firstMonth = (q - 1) * 3 + 1;
  const lastMonth = firstMonth + 2;
  const pad = (n: number) => String(n).padStart(2, "0");
  /* `Date.UTC` months are 0-based; `lastMonth` is 1-based. Day 0 of the NEXT
     0-based month is the last day of this one, and day (lastDay + 1) of THIS
     0-based month rolls into the next — that is the close. The first draft
     passed the 1-based month straight in and closed Q3 on 31 October. */
  const lastDay = new Date(Date.UTC(y, lastMonth, 0)).getUTCDate();
  const closes = new Date(Date.UTC(y, lastMonth - 1, lastDay + 1));
  return {
    from: `${y}-${pad(firstMonth)}-01`,
    to: `${y}-${pad(lastMonth)}-${pad(lastDay)}`,
    closesOn: closes.toISOString().slice(0, 10),
  };
}

/** A quarter is closed once the day after its last day has arrived. */
export const isClosed = (quarter: string, today: string) =>
  today >= quarterBounds(quarter).closesOn;

export interface SweepPerson {
  userId: string;
  agencyId: string;
  active: boolean;
  /** Already holds this quarter's reward — nothing to decide. */
  alreadyRewarded: boolean;
  /**
   * Whether this person can earn the bonus at all.
   *
   * Two different people are not eligible, for two different reasons (Dee,
   * 2026-09-20): the founders do not clock in, so there is nothing to score;
   * and management clocks in like everybody else and simply does not compete
   * for it. Both arrive here as false, because the sweep's question is only
   * "can this person win", and the distinction is kept where it belongs — on
   * the membership.
   */
  eligible: boolean;
}

export type SweepOutcome =
  | { userId: string; decision: "grant"; finalScore: number }
  | { userId: string; decision: "skip"; finalScore: number; reason: "below_max" }
  | { userId: string; decision: "skip"; reason: "inactive" | "already_rewarded" | "not_eligible" }
  | { userId: string; decision: "exception"; kind: "score_failed" | "missing_schedule"; detail: string };

/**
 * Decide every person in one closed quarter.
 *
 * One person's bad data becomes an `exception` outcome and the loop goes on —
 * Dee: "One person's bad data must not abort the whole quarter." Replay is safe
 * by construction: the same facts, corrections and policy give the same
 * decisions, and `alreadyRewarded` short-circuits anyone already paid.
 */
export function evaluateQuarter(input: {
  quarter: string;
  today: string;
  policy: AttendancePolicy;
  people: readonly SweepPerson[];
  factsFor: (userId: string) => readonly AttendanceFact[];
  hasSchedule: (userId: string) => boolean;
  correctionsFor: (userId: string) => readonly Correction[];
}): SweepOutcome[] {
  const { quarter, today, policy } = input;
  if (!isClosed(quarter, today)) {
    /* Dee: "Do not issue before quarter closes." Not an error — the sweep runs
       daily and most days there is simply nothing to close. */
    return [];
  }

  return input.people.map((p): SweepOutcome => {
    if (!p.active) return { userId: p.userId, decision: "skip", reason: "inactive" };
    if (p.alreadyRewarded) return { userId: p.userId, decision: "skip", reason: "already_rewarded" };
    /* Before the schedule check, deliberately: somebody who does not clock in
       has no schedule BY DESIGN, and reporting that as a missing-schedule
       exception would put the founders on an operator's problem list every
       quarter, for ever. */
    if (!p.eligible) return { userId: p.userId, decision: "skip", reason: "not_eligible" };
    if (!input.hasSchedule(p.userId)) {
      /* Without a shift length the engine cannot tell a half day from a late,
         so a score would be a guess. Surfaced, not guessed. */
      return { userId: p.userId, decision: "exception", kind: "missing_schedule",
        detail: "No work schedule on file, so attendance cannot be scored." };
    }
    try {
      const score = scoreQuarter(input.factsFor(p.userId), {
        quarter, today, policy, corrections: input.correctionsFor(p.userId),
      });
      /* The ONE rule: the top of the ladder, whatever the policy says that is. */
      if (score.standing === "champion") {
        return { userId: p.userId, decision: "grant", finalScore: score.score };
      }
      return { userId: p.userId, decision: "skip", reason: "below_max", finalScore: score.score };
    } catch (e) {
      return { userId: p.userId, decision: "exception", kind: "score_failed",
        detail: e instanceof Error ? e.message : String(e) };
    }
  });
}
