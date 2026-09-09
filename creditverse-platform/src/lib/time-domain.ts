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
  general: "General",
};

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
