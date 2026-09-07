/**
 * The U.S. federal holiday calendar, from the rules rather than a list.
 *
 * A hard-coded list of 2026 dates is wrong on 1 January 2027, and quietly:
 * the banner simply stops appearing and nobody notices until somebody books
 * client work on Memorial Day. So the holidays are computed from the statutory
 * rules and any year can be generated, forwards or backwards.
 *
 * ── THE TIMEZONE POINT, WHICH IS THE EASY ONE TO GET WRONG ─────────────────
 *
 * BES works U.S. business hours, and much of the team is in Manila — thirteen
 * hours ahead. On the morning of 5 July in Manila it is still 4 July in New
 * York, and a calculation that used the local device date would take the
 * holiday banner down while the U.S. holiday is still running. Every "is it
 * today" question here resolves against the agency's business timezone.
 *
 * ── OBSERVED DATES ─────────────────────────────────────────────────────────
 *
 * 5 U.S.C. § 6103(b): a fixed-date holiday falling on a Saturday is observed
 * the Friday before, and one falling on a Sunday the Monday after. Holidays
 * defined as "the nth Monday in…" always land on a weekday and never move.
 *
 * The two dates are kept separately because they answer different questions.
 * Juneteenth IS 19 June whatever day that is; the office is CLOSED on the
 * observed date. A calendar that shows only one of them is wrong for somebody.
 */

export const US_FEDERAL_RULE_VERSION = "5-usc-6103-2021";

/** The agency's business calendar. Holidays are U.S. holidays. */
export const BUSINESS_TIMEZONE = "America/New_York";

export type HolidayStatus = "upcoming" | "today" | "passed";

export interface FederalHoliday {
  key: string;
  name: string;
  /** The statutory date, e.g. Juneteenth is always 19 June. `YYYY-MM-DD`. */
  date: string;
  /** The date the office is closed. Differs when the date falls at a weekend. */
  observed: string;
  year: number;
  holidayType: "US Federal Holiday";
  /** BES does not work on the observed date. */
  nonWorkingDay: boolean;
  ruleVersion: string;
}

type Rule =
  | { kind: "fixed"; month: number; day: number }
  | { kind: "nth"; month: number; weekday: number; nth: number }
  | { kind: "last"; month: number; weekday: number };

interface Definition {
  key: string;
  name: string;
  rule: Rule;
  /** First year the holiday existed. Juneteenth is 2021; MLK Day is 1986. */
  since: number;
}

/* Weekday numbers are JavaScript's: Sunday 0 … Saturday 6. */
const MON = 1, THU = 4;

const DEFINITIONS: Definition[] = [
  { key: "new_years_day", name: "New Year's Day", rule: { kind: "fixed", month: 1, day: 1 }, since: 1870 },
  { key: "mlk_day", name: "Martin Luther King Jr. Day", rule: { kind: "nth", month: 1, weekday: MON, nth: 3 }, since: 1986 },
  { key: "presidents_day", name: "Washington's Birthday", rule: { kind: "nth", month: 2, weekday: MON, nth: 3 }, since: 1879 },
  { key: "memorial_day", name: "Memorial Day", rule: { kind: "last", month: 5, weekday: MON }, since: 1971 },
  { key: "juneteenth", name: "Juneteenth National Independence Day", rule: { kind: "fixed", month: 6, day: 19 }, since: 2021 },
  { key: "independence_day", name: "Independence Day", rule: { kind: "fixed", month: 7, day: 4 }, since: 1870 },
  { key: "labor_day", name: "Labor Day", rule: { kind: "nth", month: 9, weekday: MON, nth: 1 }, since: 1894 },
  /* The federal statute names this Columbus Day. What BES CALLS it on screen
     is a display choice the agency can make; the DATE is fixed by statute and
     is what the calendar has to be right about. */
  { key: "columbus_day", name: "Columbus Day", rule: { kind: "nth", month: 10, weekday: MON, nth: 2 }, since: 1971 },
  { key: "veterans_day", name: "Veterans Day", rule: { kind: "fixed", month: 11, day: 11 }, since: 1938 },
  { key: "thanksgiving", name: "Thanksgiving Day", rule: { kind: "nth", month: 11, weekday: THU, nth: 4 }, since: 1941 },
  { key: "christmas_day", name: "Christmas Day", rule: { kind: "fixed", month: 12, day: 25 }, since: 1870 },
];

/**
 * The agency's preferred name for a holiday, where it differs from the
 * statutory one. A display choice, deliberately separate from the date.
 */
export const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  presidents_day: "Presidents Day",
};

export const displayName = (h: { key: string; name: string }) =>
  DISPLAY_NAME_OVERRIDES[h.key] ?? h.name;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/**
 * The weekday of a calendar date, with no timezone involved.
 *
 * `new Date("2026-07-04")` is parsed as UTC midnight and then read back in
 * the local zone, which in Manila is already the 4th at 8am but west of
 * Greenwich is the 3rd at 7pm — so `.getDay()` returns the wrong weekday for
 * half the world. Sakamoto's algorithm takes the calendar date at face value,
 * which is what a calendar date is.
 */
export function weekdayOf(year: number, month: number, day: number): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = month < 3 ? year - 1 : year;
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[month - 1] + day) % 7;
}

const daysInMonth = (year: number, month: number) =>
  [31, (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

function dateForRule(year: number, rule: Rule): { month: number; day: number } {
  if (rule.kind === "fixed") return { month: rule.month, day: rule.day };
  if (rule.kind === "nth") {
    const firstWeekday = weekdayOf(year, rule.month, 1);
    const offset = (rule.weekday - firstWeekday + 7) % 7;
    return { month: rule.month, day: 1 + offset + (rule.nth - 1) * 7 };
  }
  const last = daysInMonth(year, rule.month);
  const lastWeekday = weekdayOf(year, rule.month, last);
  return { month: rule.month, day: last - ((lastWeekday - rule.weekday + 7) % 7) };
}

/** 5 U.S.C. § 6103(b). Only a fixed-date holiday can land at a weekend. */
function observedFor(year: number, month: number, day: number): string {
  const wd = weekdayOf(year, month, day);
  if (wd === 6) {
    /* Saturday → the Friday before, which may be the previous month, or the
       previous YEAR when New Year's Day falls on a Saturday. */
    if (day === 1) {
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      return iso(prevYear, prevMonth, daysInMonth(prevYear, prevMonth));
    }
    return iso(year, month, day - 1);
  }
  if (wd === 0) {
    /* Sunday → the Monday after, which may roll into the next month. */
    if (day === daysInMonth(year, month)) {
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      return iso(nextYear, nextMonth, 1);
    }
    return iso(year, month, day + 1);
  }
  return iso(year, month, day);
}

/** Every federal holiday in one year, in date order. */
export function holidaysForYear(year: number): FederalHoliday[] {
  return DEFINITIONS
    .filter((d) => year >= d.since)
    .map((d) => {
      const { month, day } = dateForRule(year, d.rule);
      return {
        key: d.key,
        name: d.name,
        date: iso(year, month, day),
        observed: observedFor(year, month, day),
        year,
        holidayType: "US Federal Holiday" as const,
        nonWorkingDay: true,
        ruleVersion: US_FEDERAL_RULE_VERSION,
      };
    })
    .sort((a, b) => a.observed.localeCompare(b.observed));
}

/** A span of years, for generating ahead. */
export function holidaysForYears(from: number, to: number): FederalHoliday[] {
  const out: FederalHoliday[] = [];
  for (let y = from; y <= to; y++) out.push(...holidaysForYear(y));
  return out;
}

/**
 * Today's calendar date in the agency's business timezone.
 *
 * This is the function that keeps a Manila morning from ending a U.S. holiday
 * thirteen hours early.
 */
export function businessToday(now: Date = new Date(), timeZone = BUSINESS_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Whole days from `today` to `date`, both calendar dates. Negative is past. */
export function daysBetween(today: string, date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function statusOf(h: FederalHoliday, today: string): HolidayStatus {
  const delta = daysBetween(today, h.observed);
  if (delta === 0) return "today";
  return delta > 0 ? "upcoming" : "passed";
}

export interface UpcomingHoliday extends FederalHoliday {
  status: HolidayStatus;
  /** Days until the observed date. 0 means today. */
  daysAway: number;
}

/**
 * The next holidays from today, including today's if there is one.
 *
 * Spans the year boundary on purpose: in December the next holidays are in
 * January, and a view that only generated the current year would show none.
 */
export function upcomingHolidays(today: string, count = 3): UpcomingHoliday[] {
  const year = Number(today.slice(0, 4));
  return holidaysForYears(year, year + 1)
    .map((h) => ({ ...h, status: statusOf(h, today), daysAway: daysBetween(today, h.observed) }))
    .filter((h) => h.daysAway >= 0)
    .slice(0, count);
}

/** The holiday being observed today, if any. */
export function holidayToday(today: string): FederalHoliday | null {
  return holidaysForYear(Number(today.slice(0, 4))).find((h) => h.observed === today) ?? null;
}

/**
 * Is this a working day for BES? Weekends and observed holidays are not.
 * Used to warn about a deadline, never to move one.
 */
export function isBusinessDay(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  const wd = weekdayOf(y, m, d);
  if (wd === 0 || wd === 6) return false;
  return !holidaysForYear(y).some((h) => h.observed === date);
}

/** The next working day on or after `date`. */
export function nextBusinessDay(date: string): string {
  let cursor = date;
  for (let i = 0; i < 14; i++) {
    cursor = addDays(cursor, 1);
    if (isBusinessDay(cursor)) return cursor;
  }
  return cursor;
}

export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * What to warn about a due date — awareness only.
 *
 * Deliberately returns a MESSAGE, never a new date. Moving a deadline because
 * a holiday exists is an agency SOP decision, and quietly rescheduling client
 * work would be the software making it (Dee, §25).
 */
export function deadlineWarning(dueDate: string): string | null {
  const [y, m, d] = dueDate.split("-").map(Number);
  const wd = weekdayOf(y, m, d);
  const onHoliday = holidaysForYear(y).find((h) => h.observed === dueDate);
  if (onHoliday) return `This is due on ${displayName(onHoliday)}, a U.S. holiday BES observes.`;
  if (wd === 0 || wd === 6) return "This is due at the weekend.";
  const dayBefore = addDays(dueDate, -1);
  const previous = holidaysForYear(Number(dayBefore.slice(0, 4))).find((h) => h.observed === dayBefore);
  if (previous) return `This is due the business day after ${displayName(previous)}.`;
  return null;
}
