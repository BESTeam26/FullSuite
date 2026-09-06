/**
 * Birthday greetings — the deterministic part.
 *
 * Who is being greeted today, who is coming up, and what the greeting says.
 * No year is used: a greeting needs a month and a day. Pure so the wording
 * and the "how many days away" rule are tested without a database or a clock.
 */

export interface BirthdayPerson {
  id: string;
  name: string;
  birthMonth: number;
  birthDay: number;
  avatarPath?: string | null;
}

export interface UpcomingBirthday extends BirthdayPerson {
  daysAway: number;
  isToday: boolean;
}

/** 29 February is greeted on 28 February in a common year, never skipped. */
function occurrenceInYear(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(day, lastDay)));
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function daysUntilBirthday(person: Pick<BirthdayPerson, "birthMonth" | "birthDay">, today: Date): number {
  const base = startOfDayUtc(today);
  const thisYear = occurrenceInYear(base.getUTCFullYear(), person.birthMonth, person.birthDay);
  const next = thisYear >= base ? thisYear : occurrenceInYear(base.getUTCFullYear() + 1, person.birthMonth, person.birthDay);
  return Math.round((next.getTime() - base.getTime()) / 86_400_000);
}

/** Sorted by how soon, then by name; anyone further out than `withinDays` is dropped. */
export function upcomingBirthdays(people: BirthdayPerson[], today: Date, withinDays = 14): UpcomingBirthday[] {
  return people
    .map((p) => {
      const daysAway = daysUntilBirthday(p, today);
      return { ...p, daysAway, isToday: daysAway === 0 };
    })
    .filter((p) => p.daysAway <= withinDays)
    .sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name));
}

/** "today", "tomorrow", "in 5 days" — plain words, never a raw date. */
export function whenLabel(daysAway: number): string {
  if (daysAway === 0) return "today";
  if (daysAway === 1) return "tomorrow";
  return `in ${daysAway} days`;
}

/**
 * The greeting itself. Kept deliberately short and warm, with the
 * organization's name when it has one, so a customer's greeting reads as
 * theirs and never as the platform's.
 */
export function birthdayGreeting(name: string, fromName?: string | null): string {
  const first = name.trim().split(/\s+/)[0] || name.trim();
  return fromName?.trim()
    ? `Happy birthday, ${first}! Everyone at ${fromName.trim()} is wishing you a great day.`
    : `Happy birthday, ${first}! Wishing you a great day.`;
}

/** The greeting a client sees in their own portal. */
export function clientBirthdayGreeting(name: string, organizationName?: string | null): string {
  const first = name.trim().split(/\s+/)[0] || name.trim();
  return organizationName?.trim()
    ? `Happy birthday, ${first} — from all of us at ${organizationName.trim()}.`
    : `Happy birthday, ${first}!`;
}

/** Month and day of a stored date, or null when there is none. */
export function monthDayOf(date: string | null | undefined): { month: number; day: number } | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** "14 March" style label for a month/day with no year to show. */
export function birthdayLabel(month: number, day: number): string {
  const name = MONTH_NAMES[month - 1];
  return name ? `${name} ${day}` : "";
}

/** Days in a month, so a day picker cannot offer 31 February. */
export function daysInMonth(month: number): number {
  if (month === 2) return 29; // no year is stored, so the 29th must be choosable
  return [1, 3, 5, 7, 8, 10, 12].includes(month) ? 31 : 30;
}
