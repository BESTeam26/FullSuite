/**
 * Age, derived at the moment it is asked — never stored, so never stale.
 *
 * Dee, 2026-09-19: the full date of birth is kept internally "to know if our
 * agents are under age or overage". The threshold is one constant here; the
 * date lives on `member_private_records` and is read only by the person and
 * management in scope.
 */
export const AGE_OF_MAJORITY = 18;

/** Whole years between `dateOfBirth` (YYYY-MM-DD) and `on` (default today). */
export function ageOn(dateOfBirth: string, on: Date = new Date()): number {
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  let age = on.getFullYear() - y;
  const birthdayPassed = on.getMonth() + 1 > m || (on.getMonth() + 1 === m && on.getDate() >= d);
  if (!birthdayPassed) age -= 1;
  return Math.max(0, age);
}

export const isMinor = (dateOfBirth: string, on: Date = new Date()): boolean => ageOn(dateOfBirth, on) < AGE_OF_MAJORITY;

/** "24 · Adult" or "17 · Under 18" — the words management reads, from one rule. */
export function ageLabel(dateOfBirth: string, on: Date = new Date()): { age: number; minor: boolean; text: string } {
  const age = ageOn(dateOfBirth, on);
  const minor = age < AGE_OF_MAJORITY;
  return { age, minor, text: `${age} · ${minor ? `Under ${AGE_OF_MAJORITY}` : "Adult"}` };
}
