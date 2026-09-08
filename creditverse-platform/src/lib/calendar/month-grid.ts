/**
 * The dates a month view has to draw.
 *
 * Pure, and separate from the component, because calendar arithmetic is where
 * off-by-one bugs live: a month that starts on Sunday, a February in a leap
 * year, a 31-day month that needs a sixth row. None of that is testable
 * through a rendered grid without a lot of DOM, and all of it is testable
 * here.
 *
 * WHY LOCAL DATES AND NOT UTC. A deadline is "the 30th" to the person reading
 * it. Building the grid from UTC would put an evening deadline on the wrong
 * day for anybody west of Greenwich — which is everybody at BES. So the keys
 * are local `YYYY-MM-DD`, produced by `dayKey`, and every comparison uses
 * them rather than timestamps.
 */

/** Local calendar day of a Date or an ISO string, as `YYYY-MM-DD`. */
export function dayKey(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export interface GridDay {
  key: string;
  date: Date;
  dayOfMonth: number;
  /** False for the leading and trailing days borrowed from the months either side. */
  inMonth: boolean;
}

/** Sunday first, matching the US convention BES works in. */
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Every cell of the month grid, in order, starting on the Sunday on or before
 * the first of the month and ending on the Saturday on or after the last.
 *
 * The number of rows is whatever the month needs — five for a short February,
 * six for a 31-day month that starts late. A fixed six rows would leave an
 * empty row most months, and a fixed five would clip.
 */
export function monthGrid(year: number, month: number): GridDay[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const lastOfMonth = new Date(year, month + 1, 0);
  const end = new Date(year, month + 1, 0 + (6 - lastOfMonth.getDay()));
  const out: GridDay[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = new Date(d);
    out.push({
      key: dayKey(date),
      date,
      dayOfMonth: date.getDate(),
      inMonth: date.getMonth() === month,
    });
  }
  return out;
}

/** Move by whole months without the 31st turning into the 1st. */
export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** The last local day the grid shows, so a caller can widen its data horizon to match. */
export function monthGridEnd(year: number, month: number): Date {
  const grid = monthGrid(year, month);
  const last = grid[grid.length - 1].date;
  return new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999);
}
