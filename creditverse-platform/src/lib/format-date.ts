/**
 * User-facing dates. A raw timestamp such as `2026-09-01T01:20:24.550162+00:00`
 * belongs in the audit log only (Dee, 2026-09-05); every screen shows a plain
 * date, and a time only where the time is the point. Unparseable input (seed
 * text like "5 hours ago", a report's own "01/2023") is returned untouched
 * rather than turned into "Invalid Date".
 */
const parse = (value: string | Date | null | undefined): Date | null => {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  // Date-only values are calendar dates, not instants: keep them in the local calendar.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  if (!/\d{4}-\d{2}-\d{2}T|\d{4}-\d{2}-\d{2} \d/.test(s)) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const DATE: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
const DATE_TIME: Intl.DateTimeFormatOptions = { ...DATE, hour: "numeric", minute: "2-digit" };

/** "Sep 1, 2026". Untouched when not a machine timestamp; "—" when empty. */
export function formatDate(value: string | Date | null | undefined, empty = "—"): string {
  if (value === null || value === undefined || value === "") return empty;
  const d = parse(value);
  return d ? d.toLocaleDateString(undefined, DATE) : String(value);
}

/** "Sep 1, 2026, 1:20 AM" — only where the time matters to the reader. */
export function formatDateTime(value: string | Date | null | undefined, empty = "—"): string {
  if (value === null || value === undefined || value === "") return empty;
  const d = parse(value);
  return d ? d.toLocaleString(undefined, DATE_TIME) : String(value);
}
