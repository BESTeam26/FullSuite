/**
 * How a pay rate reads — one vocabulary for the People profile, the rate
 * editor and the payroll panel. The derivation itself (daily and hourly from
 * a monthly package) lives in the database, `pay_rate_breakdown`; the browser
 * displays it and never recomputes it (rule 9: one deterministic source).
 */
export type PayRateType = "hourly" | "per_cutoff" | "monthly";

export const PAY_RATE_TYPES: { value: PayRateType; label: string }[] = [
  { value: "hourly", label: "Per hour" },
  { value: "per_cutoff", label: "Fixed per cutoff" },
  { value: "monthly", label: "Monthly package" },
];

/** "/ hour", "/ cutoff", "/ month" — after a formatted amount. */
export const rateSuffix = (type: string): string =>
  type === "hourly" ? "/ hour" : type === "monthly" ? "/ month" : "/ cutoff";

export interface RateBasisLike {
  daysPerYear: number | null;
  paidMinutesPerDay: number | null;
  dailyCents: number | null;
  hourlyCents: number | null;
}

/**
 * One line under a rate: what a day and an hour are worth, and where the
 * factor came from — or why there is none yet.
 */
export function describeRateBasis(
  type: string,
  basis: RateBasisLike | null | undefined,
  money: (cents: number) => string,
): string | null {
  if (type === "per_cutoff") return null;
  if (!basis || basis.dailyCents === null || basis.hourlyCents === null) {
    return type === "monthly"
      ? "Set a work schedule to derive the daily and hourly rate."
      : null;
  }
  const hours = basis.paidMinutesPerDay !== null ? basis.paidMinutesPerDay / 60 : null;
  const factor = basis.daysPerYear !== null && hours !== null
    ? ` (${basis.daysPerYear} paid days a year × ${hours % 1 === 0 ? hours : hours.toFixed(1)}h from the schedule)`
    : "";
  return type === "monthly"
    ? `≈ ${money(basis.dailyCents)} a day · ${money(basis.hourlyCents)} an hour${factor}`
    : `≈ ${money(basis.dailyCents)} a day${factor}`;
}
