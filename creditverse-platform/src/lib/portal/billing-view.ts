/**
 * How the partner's Billing page groups invoices (Dee, 2026-10-01,
 * PARTNER_PORTAL_DOCTRINE.md: "Open invoices · Paid invoices · … · Past due
 * notice"). Pure shaping over my_partner_invoices(); it decides nothing about
 * who may see an invoice.
 */

export interface InvoiceLike {
  status: string;
  balanceCents: number;
  dueDate: string;
}

/** Never shown as owed and never as paid: not a bill the partner acts on. */
const NOT_A_BILL = new Set(["void", "cancelled", "draft"]);

export function splitInvoices<T extends InvoiceLike>(invoices: readonly T[]): { open: T[]; paid: T[] } {
  const open: T[] = [];
  const paid: T[] = [];
  for (const i of invoices) {
    if (NOT_A_BILL.has(i.status)) continue;
    if (i.balanceCents > 0 && i.status !== "refunded") open.push(i);
    else paid.push(i);
  }
  /* Open: soonest due first, so the most urgent is on top. */
  open.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return { open, paid };
}

/** The past-due notice, separate from suspension: late is not yet suspended. */
export function pastDueNotice(s: { overdueCents: number; overdueInvoices: number; suspended: boolean }):
  { show: boolean; invoices: number } {
  return { show: !s.suspended && s.overdueCents > 0, invoices: s.overdueInvoices };
}
