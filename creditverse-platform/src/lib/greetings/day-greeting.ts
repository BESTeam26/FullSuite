/**
 * "Good morning, Dee" — the personal line at the top of Home.
 *
 * Pure, so the boundaries are tested rather than guessed. The name used is
 * what the person asked to be called, falling back to their first name.
 */

export type DayPart = "morning" | "afternoon" | "evening";

/** Local hours: before 12 morning, before 17 afternoon, then evening. */
export function dayPart(date: Date): DayPart {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** The name to greet: preferred name, else the first word of the full name. */
export function greetingName(preferredName: string | null | undefined, fullName: string | null | undefined): string {
  const preferred = preferredName?.trim();
  if (preferred) return preferred;
  const first = fullName?.trim().replace(/^\[TEST\]\s*/, "").split(/\s+/)[0];
  return first || "there";
}

export function dayGreeting(date: Date, preferredName?: string | null, fullName?: string | null): string {
  return `Good ${dayPart(date)}, ${greetingName(preferredName, fullName)}`;
}
