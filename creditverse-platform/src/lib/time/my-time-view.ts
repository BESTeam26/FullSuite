/**
 * What the My Time screen shows, derived once and tested.
 *
 * Dee, 2026-09-18, with a mockup: the page became a workspace — a live timer
 * card, one-click restarts, today as a timeline, the week as a chart. All of
 * that is ARITHMETIC over the entries the timesheet already loads, so it lives
 * here rather than inside the component (rules 5, 9 and 13). Nothing in this
 * file fetches, and nothing in it writes.
 */
import { entryMinutes, divisionLabel } from "@/lib/time-domain";
import type { TimeEntry } from "@/lib/data/time-entries";

/** "Mon, Sep 14 – Sun, Sep 20, 2026" — the week the page is showing. */
export function weekRangeLabel(weekStartDate: string): string {
  const [y, m, d] = weekStartDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  /* Built from the parts: `new Date("2026-09-14")` is UTC midnight and reads
     as the 13th west of Greenwich. */
  const from = new Date(y, m - 1, d);
  const to = new Date(y, m - 1, d + 6);
  const short = (x: Date) =>
    x.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${short(from)} – ${short(to)}, ${to.getFullYear()}`;
}

/**
 * Work done FOR a partner, and work that belongs to no partner.
 *
 * Breaks and lunch are neither: they are the day's rest and are counted
 * nowhere here, the same rule the by-partner table already follows.
 */
export function partnerSplit(entries: readonly TimeEntry[], now: Date = new Date()) {
  let partnerMinutes = 0;
  let internalMinutes = 0;
  for (const e of entries) {
    if (e.kind !== "work") continue;
    const minutes = entryMinutes(e, now);
    if (e.partnerGroupId) partnerMinutes += minutes;
    else internalMinutes += minutes;
  }
  return { partnerMinutes, internalMinutes };
}

export interface DayBar {
  /** `YYYY-MM-DD`, so a bar can be matched back to its day. */
  date: string;
  /** "Mon". */
  label: string;
  minutes: number;
  /** A day that has not happened yet — drawn flat and unlabelled. */
  future: boolean;
}

/** Monday to Sunday, every day present even at zero, so the chart never jumps. */
export function weekBars(
  entries: readonly TimeEntry[],
  weekStartDate: string,
  today: string,
  now: Date = new Date(),
): DayBar[] {
  const [y, m, d] = weekStartDate.split("-").map(Number);
  if (!y || !m || !d) return [];

  const worked = new Map<string, number>();
  for (const e of entries) {
    if (e.kind !== "work") continue;
    worked.set(e.workDate, (worked.get(e.workDate) ?? 0) + entryMinutes(e, now));
  }

  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(y, m - 1, d + i);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    return {
      date,
      label: day.toLocaleDateString("en-US", { weekday: "short" }),
      minutes: worked.get(date) ?? 0,
      future: date > today,
    };
  });
}

export interface RecentTask {
  /** Stable across renders: the same three fields that define the work. */
  key: string;
  title: string;
  divisionId: string;
  partnerGroupId: string | null;
  taskNote: string | null;
}

/**
 * The work somebody is likely to start again, newest first.
 *
 * Keyed on division + partner + note, because restarting a timer means
 * repeating exactly that combination — two "Support Follow-up" entries for
 * different partners are different work and must not collapse into one row.
 */
export function recentWork(
  entries: readonly TimeEntry[],
  limit = 4,
): RecentTask[] {
  const seen = new Map<string, RecentTask>();
  const newestFirst = [...entries]
    .filter((e) => e.kind === "work")
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

  for (const e of newestFirst) {
    const partnerGroupId = e.partnerGroupId ?? null;
    const taskNote = e.taskNote?.trim() || null;
    const key = `${e.divisionId}|${partnerGroupId ?? ""}|${taskNote ?? ""}`;
    if (seen.has(key)) continue;
    seen.set(key, {
      key,
      title: taskNote ?? divisionLabel(e.divisionId),
      divisionId: e.divisionId,
      partnerGroupId,
      taskNote,
    });
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

export interface TimelineRow {
  entry: TimeEntry;
  /** "9:03 AM – 10:21 AM", or "2:14 PM – Running". */
  span: string;
  minutes: number;
  running: boolean;
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** Today in the order it happened, running entry last and marked as such. */
export function todayTimeline(
  entries: readonly TimeEntry[],
  today: string,
  now: Date = new Date(),
): TimelineRow[] {
  return entries
    .filter((e) => e.workDate === today)
    .slice()
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))
    .map((entry) => ({
      entry,
      span: `${clock(entry.startedAt)} – ${entry.endedAt ? clock(entry.endedAt) : "Running"}`,
      minutes: entryMinutes(entry, now),
      running: !entry.endedAt,
    }));
}
