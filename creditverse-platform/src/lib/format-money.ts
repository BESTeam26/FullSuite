/**
 * Exact money for record pages (submissions, offers, funded deals,
 * commissions) — the compact "$45K" of the grids is wrong where the four
 * funded amounts and their differences are the point.
 */
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
export function formatMoney(amount: number | null | undefined): string {
  return amount === null || amount === undefined || !Number.isFinite(amount) ? "—" : usd.format(amount);
}

/**
 * Money in the currency it is actually in.
 *
 * `formatMoney` is US dollars by name and by symbol. Payroll is not: a Manila
 * salary is in pesos, and rendering it with a dollar sign states a number that
 * is wrong by a factor of about sixty (Dee, 2026-09-09: "PHP then you have
 * $"). So the currency comes from the record, and Intl supplies the symbol —
 * never a literal "$" in a template.
 *
 * An unknown or malformed code falls back to "1,234.56 XYZ" rather than
 * guessing a symbol.
 */
const formatters = new Map<string, Intl.NumberFormat>();
export function formatMoneyIn(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
  const code = (currency ?? "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency ?? ""}`.trim();
  }
  let formatter = formatters.get(code);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: code, maximumFractionDigits: 2 });
    } catch {
      return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`;
    }
    formatters.set(code, formatter);
  }
  return formatter.format(amount);
}

/** The same, from integer cents — the shape every money column stores. */
export const formatCentsIn = (cents: number | null | undefined, currency: string | null | undefined): string =>
  cents === null || cents === undefined ? "—" : formatMoneyIn(cents / 100, currency);
