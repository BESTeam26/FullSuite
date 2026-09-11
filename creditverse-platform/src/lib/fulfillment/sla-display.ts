/**
 * How long is left, in words an agent can act on.
 *
 * Dee, 2026-09-11, looking at a row reading `901.2h`: "if the hours is more
 * than 24 hours, convert the counter to days. Instead of we make agent think
 * how many days still remaining. That's commonsense."
 *
 * She is right, and the failure is worse than ugly: `901.2h` and `949.2h` sit
 * next to each other on screen and nobody can tell at a glance that they are
 * five weeks and six weeks. A queue is read by scanning, and a number nobody
 * can scan is not doing the job.
 *
 * Raw hours stay in the data for sorting and reporting. This is the reading.
 */
import { formatDate } from "@/lib/format-date";

export type SlaTone = "overdue" | "today" | "soon" | "ontrack" | "none";

export interface SlaReading {
  label: string;
  tone: SlaTone;
}

const HOUR = 1;
const DAY = 24 * HOUR;

/** Whole days and the leftover hours, for the short-range readings. */
function split(hours: number): { d: number; h: number } {
  const d = Math.floor(hours / DAY);
  return { d, h: Math.round(hours - d * DAY) };
}

/**
 * @param hoursRemaining negative when the due moment has passed.
 * @param waitingUntil   an ISO date, when the client is parked rather than
 *                       late — a 30-day dispute wait is not an SLA breach and
 *                       must not be coloured like one.
 */
export function readSla(
  hoursRemaining: number | null | undefined,
  waitingUntil?: string | null,
): SlaReading {
  if (waitingUntil) {
    /* The canonical formatter, which keeps a date-only value in the local
       calendar — a "waiting until" is a calendar day, and rolling it back to
       the 9th because the row was stored as midnight UTC is exactly the kind
       of off-by-a-day nobody notices until a deadline is missed. */
    const shown = formatDate(waitingUntil, "");
    if (shown) {
      /* Drop this year, keep it when it is not: "Waiting until Oct 10" reads,
         "Waiting until Oct 10, 2026" does not, in a narrow column. */
      const thisYear = `, ${new Date().getFullYear()}`;
      return {
        label: `Waiting until ${shown.endsWith(thisYear) ? shown.slice(0, -thisYear.length) : shown}`,
        tone: "ontrack",
      };
    }
  }
  if (hoursRemaining === null || hoursRemaining === undefined || Number.isNaN(hoursRemaining)) {
    return { label: "—", tone: "none" };
  }

  if (hoursRemaining < 0) {
    const over = Math.abs(hoursRemaining);
    if (over >= DAY) {
      const { d, h } = split(over);
      /* Past a week the hours are noise — "Overdue 38d" is the fact. */
      return { label: d >= 7 ? `Overdue ${d}d` : `Overdue ${d}d ${h}h`, tone: "overdue" };
    }
    return { label: `Overdue ${Math.max(1, Math.round(over))}h`, tone: "overdue" };
  }

  if (hoursRemaining < 1) return { label: "Due now", tone: "overdue" };
  if (hoursRemaining < 12) return { label: `${Math.round(hoursRemaining)}h remaining`, tone: "soon" };
  if (hoursRemaining < DAY) return { label: "Due today", tone: "today" };

  const { d, h } = split(hoursRemaining);
  if (d >= 7) return { label: `${d}d remaining`, tone: "ontrack" };
  return { label: h > 0 ? `${d}d ${h}h remaining` : `${d}d remaining`, tone: d <= 1 ? "soon" : "ontrack" };
}

/** Contrast-safe in both directions; never colour text the same as its ground. */
export const SLA_TONE_CLASS: Record<SlaTone, string> = {
  overdue: "text-status-danger font-semibold",
  today: "text-status-warning font-semibold",
  soon: "text-status-warning",
  ontrack: "text-foreground",
  none: "text-muted-foreground",
};
