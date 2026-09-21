/**
 * Time-tracking domain rules.
 *
 * Deterministic, UI-free, and unit-tested. The My Time screen renders what this
 * returns and computes nothing of its own (rules 5 and 9), so the same totals
 * hold whether they are shown on a card, exported, or rolled into Workforce
 * reporting later.
 */

import type { TimeEntry } from "@/lib/data/time-entries";

/** "6h 22m", "45m", "—". Minutes only below an hour; no bare "0h". */
export function formatDuration(minutes: number | undefined): string {
  if (minutes === undefined || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Minutes elapsed on an entry, counting a running clock up to `now`.
 *
 * A running entry has no `durationMinutes` — the database only fills it on
 * clock-out — so the live figure is computed here rather than leaving the
 * current shift out of today's total, which would read as lost work.
 */
export function entryMinutes(entry: TimeEntry, now: Date = new Date()): number {
  if (entry.durationMinutes !== undefined) return entry.durationMinutes;
  const started = new Date(entry.startedAt).getTime();
  return Math.max(0, Math.round((now.getTime() - started) / 60_000));
}

/**
 * Seconds for one entry: stored minutes for a closed one (the database keeps
 * whole minutes, so a closed entry's seconds are :00 honestly), live seconds
 * for a running one. Feeds the ticking counters (Dee, 2026-09-09: "I want my
 * timer to have a counter … include the hours, minutes and seconds").
 */
export function entrySeconds(entry: TimeEntry, now: Date = new Date()): number {
  if (entry.durationMinutes !== undefined) return entry.durationMinutes * 60;
  const started = new Date(entry.startedAt).getTime();
  return Math.max(0, Math.floor((now.getTime() - started) / 1000));
}

/** "1h 04m 32s" / "12m 05s" — the ticking form. Never drops the seconds. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}h ${mm}m ${ss}s` : `${m}m ${ss}s`;
}

/**
 * A live stopwatch: "01:24:18".
 *
 * Deliberately not `formatClock`, which reads "1h 24m 18s" and is right for a
 * TOTAL — you skim it. A running clock is watched, and a fixed-width
 * HH:MM:SS does not reflow as the digits change (Dee's mockup, 2026-09-18).
 */
export function stopwatch(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/**
 * The day's ticking totals: work and rest as SECONDS, the open entry's live
 * span included on whichever side it belongs to.
 */
export function liveDaySeconds(
  entries: TimeEntry[],
  today: string,
  now: Date = new Date(),
): { workSeconds: number; restSeconds: number; breakSeconds: number; lunchSeconds: number } {
  let workSeconds = 0;
  let breakSeconds = 0;
  let lunchSeconds = 0;
  for (const e of entries) {
    if (e.workDate !== today) continue;
    const secs = entrySeconds(e, now);
    if (e.kind === "work") workSeconds += secs;
    else if (e.kind === "lunch") lunchSeconds += secs;
    else breakSeconds += secs;
  }
  return { workSeconds, restSeconds: breakSeconds + lunchSeconds, breakSeconds, lunchSeconds };
}

/** "HH:MM:SS" wall-clock of an instant in a named timezone. */
function wallTime(at: Date, timezone: string): string {
  return at.toLocaleTimeString("en-GB", { hour12: false, timeZone: timezone });
}

/**
 * The same span, spelled out: "6 hours 27 minutes".
 *
 * Dee, 2026-09-18: *"387m late … i want it converted easy to human to
 * understand, state how many hours, mins, sec late instead of just minutes
 * that needs to be converted by human mind."*
 *
 * `formatClock` ("6h 27m 12s") and `formatDuration` ("6h 27m") are for figures
 * you SKIM — a tile, a table cell, a total. This is for a sentence somebody
 * reads once and has to act on, where "387m" makes them do the division.
 *
 * Zero parts are dropped, so it never reads "0 hours 5 minutes". Seconds are
 * dropped once there are hours: nobody needs them at that scale, and printing
 * them implies a precision the schedule does not have.
 */
export function humanDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 1) return "0 seconds";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const part = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const parts: string[] = [];
  if (h > 0) parts.push(part(h, "hour"));
  if (m > 0) parts.push(part(m, "minute"));
  if (sec > 0 && h === 0) parts.push(part(sec, "second"));
  return parts.join(" ");
}

/**
 * How late the first work clock-in is against the schedule, in SECONDS.
 *
 * The seconds were always computed and then thrown away by rounding up to a
 * minute. Keeping them means "48 seconds late" can be said as 48 seconds
 * rather than as "1m".
 */
export function lateSecondsToday(
  entries: TimeEntry[],
  schedule: { workDays: number[]; shiftStart: string; graceMinutes: number; timezone: string },
  today: string,
  now: Date = new Date(),
): number {
  const isoDow = ((new Date(`${today}T12:00:00`).getDay() + 6) % 7) + 1;
  if (!schedule.workDays.includes(isoDow)) return 0;
  const firstIn = entries
    .filter((e) => e.workDate === today && e.kind === "work")
    .map((e) => new Date(e.startedAt))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (!firstIn) return 0;
  const inWall = wallTime(firstIn, schedule.timezone);
  const [h, m] = schedule.shiftStart.split(":").map(Number);
  const graceEndSec = (h * 60 + m + schedule.graceMinutes) * 60;
  const [ih, im, is] = inWall.split(":").map(Number);
  void now;
  return Math.max(0, Math.round(ih * 3600 + im * 60 + is - graceEndSec));
}

/**
 * How late the first work clock-in is against the schedule, in minutes.
 * 0 when on time, not a scheduled day, or nothing recorded yet. Wall-clock
 * comparison in the SCHEDULE's own timezone — the same arithmetic
 * `attendance_for` runs in SQL, so the agent's warning and the manager's
 * mark can never disagree.
 */
export function lateMinutesToday(
  entries: TimeEntry[],
  schedule: { workDays: number[]; shiftStart: string; graceMinutes: number; timezone: string },
  today: string,
  now: Date = new Date(),
): number {
  /* Derived, not computed a second time: two copies of this arithmetic is how
     the agent's warning and the manager's mark come to disagree. */
  return Math.ceil(lateSecondsToday(entries, schedule, today, now) / 60);
}

/** Monday-based week start for a given date, as YYYY-MM-DD. */
export function weekStart(date: Date = new Date()): string {
  const d = new Date(date);
  // getDay(): 0 = Sunday. Shift so Monday is the first day.
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface TimeSummary {
  todayMinutes: number;
  /** Today's break + lunch minutes — rest, shown separately, never summed in. */
  todayRestMinutes: number;
  weekMinutes: number;
  /** Minutes per division across the week, highest first. */
  byDivision: { divisionId: string; minutes: number }[];
  openEntry?: TimeEntry;
}

/**
 * Roll a week of entries into the figures the screen shows.
 *
 * Takes the full set once and slices in memory rather than issuing a query per
 * card (rule 14: do not fetch a tenant dataset per metric).
 */
export function summariseTime(
  entries: TimeEntry[],
  today: string,
  now: Date = new Date(),
): TimeSummary {
  let todayMinutes = 0;
  let weekMinutes = 0;
  const perDivision = new Map<string, number>();

  let todayRestMinutes = 0;
  for (const e of entries) {
    const mins = entryMinutes(e, now);
    /* Breaks and lunch are the day's rest — never production time (0250). */
    if (e.kind !== "work") {
      if (e.workDate === today) todayRestMinutes += mins;
      continue;
    }
    weekMinutes += mins;
    if (e.workDate === today) todayMinutes += mins;
    perDivision.set(e.divisionId, (perDivision.get(e.divisionId) ?? 0) + mins);
  }

  return {
    todayMinutes,
    todayRestMinutes,
    weekMinutes,
    byDivision: [...perDivision.entries()]
      .map(([divisionId, minutes]) => ({ divisionId, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
    openEntry: entries.find((e) => !e.endedAt),
  };
}

/** Human label for a division id, for screens that show the raw value. */
export const DIVISION_LABELS: Record<string, string> = {
  creditops: "CreditOps",
  fundingops: "FundingOps",
  bes_crm: "BES CRM",
  talentops: "TalentOps",
  /* "Admin" is what the team calls the hours that are not a module's — the
     old "General" said nothing about the work. `meeting` is its own bucket
     because a meeting is answerable ("how much of the week went to calls?")
     in a way that "admin" is not. */
  admin: "Admin",
  meeting: "Meeting",
  /* Retired 2026-09-09; kept so an old row still reads as something. */
  general: "Admin",
};

/** The buckets a person may start a timer in, in the order they are offered. */
/* Spelled as the ORG STRUCTURE spells them. `bes-crm` with a hyphen was
   corrected to `bes_crm` on 2026-09-20: the two spellings split BES CRM into
   two rows on every report, production under one and hours under the other. */
export const TIMER_DIVISIONS = ["creditops", "fundingops", "bes_crm", "talentops", "admin", "meeting"] as const;

export const divisionLabel = (id: string) => DIVISION_LABELS[id] ?? id;

/**
 * A timer left running overnight.
 *
 * Nobody works ten hours in one sitting without stopping, and a forgotten
 * timer quietly corrupts the day's production and the End of Day figure. The
 * cap is a judgement, not a law: it decides when to *warn*, never what to
 * record. Stopping is always the person's own act.
 *
 * Ten hours confirmed by Dee, C8, 2026-09-06.
 */
export const STALE_TIMER_HOURS = 10;

export function runningHours(entry: TimeEntry, now: Date = new Date()): number {
  return entryMinutes(entry, now) / 60;
}

export function isStaleTimer(entry: TimeEntry | null | undefined, now: Date = new Date()): boolean {
  if (!entry) return false;
  return runningHours(entry, now) >= STALE_TIMER_HOURS;
}

/** "16 hours" / "1 hour 30 minutes" — for telling someone what they left on. */
export function describeRunningFor(entry: TimeEntry, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round(entryMinutes(entry, now)));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = hours > 0 ? `${hours} hour${hours === 1 ? "" : "s"}` : "";
  const minutePart = rest > 0 ? `${rest} minute${rest === 1 ? "" : "s"}` : "";
  return [hourPart, minutePart].filter(Boolean).join(" ") || "less than a minute";
}

/* ------------------------------------------------------------------ */
/* The day's rest, against the day's allowance                          */
/* ------------------------------------------------------------------ */

/**
 * Break and lunch are DAILY budgets, not per-sitting ones.
 *
 * Dee, 2026-09-21: "I don't think the break and lunch is being tracked
 * accumulated for the day… the timer should not always start at 0. It must
 * resume within the day." A second break showing 00:00:05 tells somebody they
 * have all their break left, when they may have spent it. The number that
 * matters is what the day has used against what the day allows — the same
 * figure `payable_minutes` pays on (break up to the allowance; lunch never).
 */
export interface RestBudget {
  /** Everything of that kind today, including the sitting in progress. */
  usedSeconds: number;
  /** What the schedule allows. Null when the person has no schedule yet. */
  allowanceSeconds: number | null;
  /** Never negative: over-run is reported on its own, not as a minus. */
  remainingSeconds: number | null;
  overSeconds: number;
}

export function restBudget(
  kind: "break" | "lunch",
  day: { breakSeconds: number; lunchSeconds: number },
  schedule?: { breakMinutes: number; lunchMinutes: number } | null,
): RestBudget {
  const usedSeconds = kind === "break" ? day.breakSeconds : day.lunchSeconds;
  const allowanceMinutes = schedule ? (kind === "break" ? schedule.breakMinutes : schedule.lunchMinutes) : null;
  if (allowanceMinutes === null) {
    return { usedSeconds, allowanceSeconds: null, remainingSeconds: null, overSeconds: 0 };
  }
  const allowanceSeconds = allowanceMinutes * 60;
  return {
    usedSeconds,
    allowanceSeconds,
    remainingSeconds: Math.max(0, allowanceSeconds - usedSeconds),
    overSeconds: Math.max(0, usedSeconds - allowanceSeconds),
  };
}

/**
 * What the big number on a timer should read: the day's total for whatever
 * the person is doing, not this sitting's.
 */
export function dayTotalForState(
  kind: "work" | "break" | "lunch",
  day: { workSeconds: number; breakSeconds: number; lunchSeconds: number },
): number {
  return kind === "work" ? day.workSeconds : kind === "break" ? day.breakSeconds : day.lunchSeconds;
}
