import { describe, expect, it } from "vitest";
import type { InvoiceRecord } from "@/lib/partners/billing-engine";
import {
  agingBuckets, agingTotalCents, attentionCounts, automaticCents, cashSeries,
  daysOverdue, isOpen, monthsEnding, upcomingCollections,
} from "./finance-overview";

const TODAY = "2026-09-17";

const invoice = (over: Partial<InvoiceRecord> & { id: string }): InvoiceRecord => ({
  groupId: "g1", totalCents: 25_000, amountPaidCents: 0,
  dueDate: TODAY, issueDate: "2026-09-01", status: "sent", ...over,
});

describe("what counts as still owed", () => {
  it("a draft is not a receivable, however large", () => {
    expect(isOpen(invoice({ id: "a", status: "draft", totalCents: 1_000_000 }))).toBe(false);
  });

  it("a void invoice is not a receivable", () => {
    expect(isOpen(invoice({ id: "a", status: "void" }))).toBe(false);
  });

  it("a fully paid invoice is not a receivable even while marked sent", () => {
    /* The balance decides, not the label — a status that has not caught up
       must never put money back on the books. */
    expect(isOpen(invoice({ id: "a", status: "sent", amountPaidCents: 25_000 }))).toBe(false);
  });

  it("a partly paid invoice is owed for the remainder", () => {
    expect(isOpen(invoice({ id: "a", status: "partially_paid", amountPaidCents: 10_000 }))).toBe(true);
  });
});

describe("accounts receivable by age", () => {
  it("counts an invoice due tomorrow as current, not as a collections problem", () => {
    const b = agingBuckets([invoice({ id: "a", dueDate: "2026-09-18" })], TODAY);
    expect(b.find((x) => x.key === "current")?.amountCents).toBe(25_000);
    expect(b.find((x) => x.key === "1-7")?.amountCents).toBe(0);
  });

  it("puts an invoice due today in current, because it is not late yet", () => {
    const b = agingBuckets([invoice({ id: "a", dueDate: TODAY })], TODAY);
    expect(b.find((x) => x.key === "current")?.invoices).toBe(1);
  });

  it("sorts each invoice into exactly one bucket", () => {
    const b = agingBuckets([
      invoice({ id: "a", dueDate: "2026-09-14" }),  // 3 days
      invoice({ id: "b", dueDate: "2026-09-01" }),  // 16 days
      invoice({ id: "c", dueDate: "2026-08-10" }),  // 38 days
      invoice({ id: "d", dueDate: "2026-06-01" }),  // 108 days
    ], TODAY);
    expect(b.map((x) => x.invoices)).toEqual([0, 1, 1, 1, 1]);
  });

  it("counts only the unpaid part of a partly paid invoice", () => {
    const b = agingBuckets(
      [invoice({ id: "a", dueDate: "2026-09-10", status: "partially_paid", amountPaidCents: 10_000 })],
      TODAY);
    expect(agingTotalCents(b)).toBe(15_000);
  });

  it("boundaries fall on the later side, so 7 days is 1-7 and 8 is 8-30", () => {
    const at7 = agingBuckets([invoice({ id: "a", dueDate: "2026-09-10" })], TODAY);
    const at8 = agingBuckets([invoice({ id: "a", dueDate: "2026-09-09" })], TODAY);
    expect(at7.find((x) => x.key === "1-7")?.invoices).toBe(1);
    expect(at8.find((x) => x.key === "8-30")?.invoices).toBe(1);
  });
});

describe("the months a chart covers", () => {
  it("ends on the month given and runs back, oldest first", () => {
    expect(monthsEnding("2026-09", 3)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("crosses a year boundary without inventing month 0 or 13", () => {
    expect(monthsEnding("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("cash in against cash out", () => {
  const months = monthsEnding("2026-09", 3);

  it("counts money in the month it moved", () => {
    const s = cashSeries(
      [{ on: "2026-08-30", amountCents: 50_000 }, { on: "2026-09-02", amountCents: 20_000 }],
      [{ on: "2026-09-05", amountCents: 8_000 }],
      months);
    expect(s.map((p) => p.collectedCents)).toEqual([0, 50_000, 20_000]);
    expect(s.map((p) => p.expensesCents)).toEqual([0, 0, 8_000]);
    expect(s.map((p) => p.netCents)).toEqual([0, 50_000, 12_000]);
  });

  it("ignores money outside the window rather than folding it into an edge month", () => {
    const s = cashSeries([{ on: "2025-01-01", amountCents: 999_999 }], [], months);
    expect(s.every((p) => p.collectedCents === 0)).toBe(true);
  });

  it("gives every month in the window a point, so a quiet month is visible as zero", () => {
    expect(cashSeries([], [], months)).toHaveLength(3);
  });

  it("net goes negative when a month spends more than it collects", () => {
    const s = cashSeries([{ on: "2026-09-01", amountCents: 1_000 }],
                         [{ on: "2026-09-02", amountCents: 4_000 }], months);
    expect(s[2].netCents).toBe(-3_000);
  });
});

describe("the attention tiles", () => {
  const known = [
    { kind: "past_due", label: "Past Due" },
    { kind: "suspended_nonpayment", label: "Suspended" },
  ];

  it("keeps a zero rather than hiding the category — 0 suspended is worth saying", () => {
    const rows = attentionCounts([{ kind: "past_due", severity: "medium", count: 3, amountCents: 42_500 }], known);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.kind === "suspended_nonpayment")).toMatchObject({ count: 0 });
  });

  it("does not recount anything — it reports what the view counted", () => {
    /* The point of the rewrite: a tile shows the queue's number, so the
       dashboard and the queue cannot disagree. */
    const rows = attentionCounts([{ kind: "past_due", severity: "high", count: 7, amountCents: 1_000 }], known);
    expect(rows.find((r) => r.kind === "past_due")).toMatchObject({ count: 7, amountCents: 1_000, tone: "bad" });
  });

  it("ignores a kind this build does not know how to label", () => {
    /* A view that learns a new exception must not crash a dashboard that has
       not been taught the word for it. */
    const rows = attentionCounts([{ kind: "something_new", severity: "high", count: 2, amountCents: 0 }], known);
    expect(rows.map((r) => r.kind)).toEqual(["past_due", "suspended_nonpayment"]);
  });

  it("maps severity to a tone, so critical and high both read as a problem", () => {
    const rows = attentionCounts([
      { kind: "past_due", severity: "critical", count: 1, amountCents: 0 },
      { kind: "suspended_nonpayment", severity: "medium", count: 1, amountCents: 0 },
    ], known);
    expect(rows.map((r) => r.tone)).toEqual(["bad", "warn"]);
  });
});

describe("what should arrive soon", () => {
  const named = { g1: "Business Made Fair", g2: "Alpha Creative" };
  const card = () => ({ method: "card" as const, autopay: true });

  const withNumber = (i: InvoiceRecord, n: string) => ({ ...i, invoiceNumber: n });

  it("looks forward only: an overdue invoice belongs to Attention, not here", () => {
    const rows = upcomingCollections(
      [withNumber(invoice({ id: "a", dueDate: "2026-09-10" }), "INV-1")],
      named, card, TODAY);
    expect(rows).toHaveLength(0);
  });

  it("stops at the window rather than listing next year's bills", () => {
    const rows = upcomingCollections([
      withNumber(invoice({ id: "a", dueDate: "2026-09-20" }), "INV-1"),
      withNumber(invoice({ id: "b", dueDate: "2026-12-01" }), "INV-2"),
    ], named, card, TODAY);
    expect(rows.map((r) => r.invoiceNumber)).toEqual(["INV-1"]);
  });

  it("orders by when the money is due", () => {
    const rows = upcomingCollections([
      withNumber(invoice({ id: "a", dueDate: "2026-09-25" }), "INV-2"),
      withNumber(invoice({ id: "b", dueDate: "2026-09-18" }), "INV-1"),
    ], named, card, TODAY);
    expect(rows.map((r) => r.invoiceNumber)).toEqual(["INV-1", "INV-2"]);
  });

  it("separates what collects itself from what somebody has to chase", () => {
    const rows = upcomingCollections([
      withNumber(invoice({ id: "a", dueDate: "2026-09-18", groupId: "g1" }), "INV-1"),
      withNumber(invoice({ id: "b", dueDate: "2026-09-19", groupId: "g2" }), "INV-2"),
    ], named,
      (g) => g === "g1" ? { method: "card", autopay: true } : { method: "wise", autopay: false },
      TODAY);
    expect(automaticCents(rows)).toBe(25_000);
    expect(rows.find((r) => r.groupId === "g2")?.method).toBe("wise");
  });

  it("names a partner it does not know rather than showing a bare id", () => {
    const rows = upcomingCollections(
      [withNumber(invoice({ id: "a", dueDate: "2026-09-18", groupId: "ghost" }), "INV-1")],
      named, card, TODAY);
    expect(rows[0].partnerName).toBe("Unknown partner");
  });
});

describe("days overdue", () => {
  it("is negative before the due date and positive after", () => {
    expect(daysOverdue("2026-09-20", TODAY)).toBe(-3);
    expect(daysOverdue("2026-09-14", TODAY)).toBe(3);
    expect(daysOverdue(TODAY, TODAY)).toBe(0);
  });

  it("does not drift across a daylight-saving boundary", () => {
    /* Parsed as UTC on both sides. A local-time subtraction here would be 23
       or 25 hours across a clock change and round to the wrong day. */
    expect(daysOverdue("2026-03-01", "2026-04-01")).toBe(31);
  });
});
