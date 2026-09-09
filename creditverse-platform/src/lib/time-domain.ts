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
  const isoDow = ((new Date(`${today}T12:00:00`).getDay() + 6) % 7) + 1;
  if (!schedule.workDays.includes(isoDow)) return 0;
  const firstIn = entries
    .filter((e) => e.workDate === today && e.kind === "work")
    .map((e) => new Date(e.startedAt))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (!firstIn) return 0;
  const inWall = wallTime(firstIn, schedule.timezone);
  const [h, m] = schedule.shiftStart.split(":").map(Number);
  const graceEnd = h * 60 + m + schedule.graceMinutes;
  const [ih, im, is] = inWall.split(":").map(Number);
  const inMinutes = ih * 60 + im + is / 60;
  void now;
  return Math.max(0, Math.ceil(inMinutes - graceEnd));
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
  "bes-crm": "BES CRM",
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
export const TIMER_DIVISIONS = ["creditops", "fundingops", "bes-crm", "talentops", "admin", "meeting"] as const;

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
