import { describe, expect, it } from "vitest";
import { pastDueNotice, splitInvoices } from "./billing-view";

const inv = (status: string, balanceCents: number, dueDate = "2026-10-10") => ({ status, balanceCents, dueDate });

describe("open and paid invoices", () => {
  it("puts anything with a balance in Open, soonest due first, and settled ones in Paid", () => {
    const { open, paid } = splitInvoices([
      inv("sent", 5000, "2026-10-20"), inv("overdue", 2000, "2026-09-30"), inv("paid", 0), inv("partially_paid", 100, "2026-10-05"),
    ]);
    expect(open.map((i) => i.dueDate)).toEqual(["2026-09-30", "2026-10-05", "2026-10-20"]);
    expect(paid.map((i) => i.status)).toEqual(["paid"]);
  });
  it("leaves void, cancelled and draft out of both lists", () => {
    const { open, paid } = splitInvoices([inv("void", 5000), inv("cancelled", 100), inv("draft", 100)]);
    expect([open.length, paid.length]).toEqual([0, 0]);
  });
  it("files a refunded invoice under Paid, never as owed", () => {
    expect(splitInvoices([inv("refunded", 500)]).paid).toHaveLength(1);
  });
});

describe("the past-due notice", () => {
  it("shows when something is past due and the account is not suspended", () => {
    expect(pastDueNotice({ overdueCents: 100, overdueInvoices: 1, suspended: false })).toEqual({ show: true, invoices: 1 });
  });
  it("gives way to the suspension banner, and stays away when nothing is late", () => {
    expect(pastDueNotice({ overdueCents: 100, overdueInvoices: 1, suspended: true }).show).toBe(false);
    expect(pastDueNotice({ overdueCents: 0, overdueInvoices: 0, suspended: false }).show).toBe(false);
  });
});
