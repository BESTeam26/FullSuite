/** "••••4895" — an account number as anyone but payroll sees it. Nothing to mask reads as nothing. */
export function maskAccountNumber(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\s+/g, "");
  if (!digits) return null;
  return digits.length <= 4 ? "••••" : `••••${digits.slice(-4)}`;
}
