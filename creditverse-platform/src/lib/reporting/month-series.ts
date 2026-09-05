/**
 * Month buckets for the Reports page — deterministic grouping of dated rows
 * into the last N calendar months (UTC), oldest first, with zero-filled gaps.
 * Nothing here estimates; a month with no rows reads 0.
 */
export interface MonthBucket { key: string; label: string; start: Date; end: Date }

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The last `count` months ending with the month of `now`. */
export function lastMonths(now: Date, count = 6): MonthBucket[] {
  const out: MonthBucket[] = [];
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(y, m - i, 1));
    const end = new Date(Date.UTC(y, m - i + 1, 1));
    out.push({ key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`, label: `${MONTH[start.getUTCMonth()]}${start.getUTCFullYear() !== y ? ` ${String(start.getUTCFullYear()).slice(2)}` : ""}`, start, end });
  }
  return out;
}

/** Count (or sum a value) per bucket for rows carrying an ISO date; rows outside the window are ignored. */
export function bucketByMonth<T>(rows: T[], buckets: MonthBucket[], dateOf: (row: T) => string | null | undefined, valueOf: (row: T) => number = () => 1): number[] {
  const totals = buckets.map(() => 0);
  for (const row of rows) {
    const d = dateOf(row); if (!d) continue;
    const t = Date.parse(d); if (!Number.isFinite(t)) continue;
    const i = buckets.findIndex((b) => t >= b.start.getTime() && t < b.end.getTime());
    if (i >= 0) totals[i] += valueOf(row);
  }
  return totals;
}

/** Percent as an integer 0–100, or null when the denominator is 0 — never 0% out of nothing. */
export const rate = (numerator: number, denominator: number): number | null => (denominator > 0 ? Math.round((numerator / denominator) * 100) : null);
