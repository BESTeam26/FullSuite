/**
 * Exact money for record pages (submissions, offers, funded deals,
 * commissions) — the compact "$45K" of the grids is wrong where the four
 * funded amounts and their differences are the point.
 */
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
export function formatMoney(amount: number | null | undefined): string {
  return amount === null || amount === undefined || !Number.isFinite(amount) ? "—" : usd.format(amount);
}
