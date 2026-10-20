/**
 * Which pay period "now" falls in, from the payroll settings' split day.
 *
 * Dee's cutoffs (payroll doctrine): the 1st to the split day, then the day
 * after the split to month end. The database's sweep (`payroll_auto_sweep`)
 * creates the cutoff for a COMPLETED period; this names the period in
 * progress so the simple payroll screen can show running hours before the
 * cutoff exists. Pure, tested; dates are ISO strings.
 */
export interface PayPeriod { start: string; end: string }

const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

export function currentPayPeriod(today: string, splitDay: number): PayPeriod {
  const [y, m, d] = today.split("-").map(Number);
  if (d <= splitDay) {
    return { start: iso(new Date(Date.UTC(y, m - 1, 1))), end: iso(new Date(Date.UTC(y, m - 1, splitDay))) };
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: iso(new Date(Date.UTC(y, m - 1, splitDay + 1))), end: iso(new Date(Date.UTC(y, m - 1, lastDay))) };
}

/** "25,000 PHP / month · 142 PHP / hr", "80 PHP / hr", or the honest absence. */
export function describeRate(basis: string | null, rateCents: number | null, currency: string | null, hourlyCents: number | null,
  money: (cents: number, currency: string) => string): string {
  if (!basis || rateCents === null || !currency) return "No rate on file";
  const per: Record<string, string> = { hourly: "hr", daily: "day", monthly: "month", per_cutoff: "cutoff" };
  const main = `${money(rateCents, currency)} / ${per[basis] ?? basis}`;
  return basis !== "hourly" && hourlyCents ? `${main} · ${money(hourlyCents, currency)} / hr` : main;
}
