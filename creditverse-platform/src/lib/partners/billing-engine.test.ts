/**
 * Dee's nine required cases, §48, written as they were given.
 *
 * Every one of them is a way a billing system quietly lies: counting a build
 * as recurring, calling an invoice a payment, keeping a cancelled service in
 * the run-rate, or booking one webhook twice.
 */
import { describe, expect, it } from "vitest";
import {
  collectedInMonth, expectedCollectionForMonth, financialPosition, invoiceStatus,
  monthOf, mrrLostToCancellation, normalizeToMonthly, occurrencesInMonth,
  revenueClass, rollUpRecurring, runningCollectible,
  type EngagementTerms, type InvoiceRecord, type PaymentRecord, type ScheduledObligation,
} from "./billing-engine";

const usd = (dollars: number) => Math.round(dollars * 100);

const terms = (over: Partial<EngagementTerms> & Pick<EngagementTerms, "serviceId">): EngagementTerms => ({
  groupId: "g1", live: true, billingModel: null, rateCents: null, quantity: null,
  invoiceDay: null, effectiveFrom: null, cancellationEffectiveOn: null,
  contractValueCents: null, ...over,
});

const SEPT = monthOf("2026-09-01");
const OCT = monthOf("2026-10-01");

describe("TEST 1 — monthly CRM at $299, cancelled effective next month", () => {
  const crm = terms({
    serviceId: "crm", billingModel: "RECURRING_MONTHLY", rateCents: usd(299),
    invoiceDay: "1", effectiveFrom: "2026-01-01",
  });

  it("contributes $299 to MRR while it is active", () => {
    expect(rollUpRecurring([crm], "2026-09-07").fixedMrrCents).toBe(usd(299));
  });

  it("stops contributing to MRR from the cancellation date", () => {
    const cancelled = { ...crm, cancellationEffectiveOn: "2026-10-01" };
    expect(rollUpRecurring([cancelled], "2026-09-07").fixedMrrCents).toBe(usd(299));
    expect(rollUpRecurring([cancelled], "2026-10-01").fixedMrrCents).toBe(0);
    expect(mrrLostToCancellation([cancelled], "2026-10-01", "2026-10-31")).toBe(usd(299));
  });

  it("leaves September's legitimate invoice alone", () => {
    const cancelled = { ...crm, cancellationEffectiveOn: "2026-10-01" };
    /* September still expects its charge; October expects nothing. */
    expect(expectedCollectionForMonth([cancelled], [], SEPT).fixedRecurringCents).toBe(usd(299));
    expect(expectedCollectionForMonth([cancelled], [], OCT).fixedRecurringCents).toBe(0);
  });
});

describe("TEST 2 — weekly support at $150/week", () => {
  const weekly = terms({
    serviceId: "wk", billingModel: "RECURRING_WEEKLY", rateCents: usd(150),
    invoiceDay: "Friday", effectiveFrom: "2026-01-02",
  });

  it("has a normalised run-rate of rate × 52 / 12, not × 4", () => {
    expect(normalizeToMonthly(usd(150), "RECURRING_WEEKLY")).toBe(usd(650));
    expect(normalizeToMonthly(usd(150), "RECURRING_WEEKLY")).not.toBe(usd(600));
    expect(rollUpRecurring([weekly], "2026-09-07").fixedMrrCents).toBe(usd(650));
  });

  it("bills the Fridays that actually fall in the month", () => {
    /* October 2026 has five Fridays; September has four. */
    expect(occurrencesInMonth("RECURRING_WEEKLY", "Friday", SEPT)).toEqual({ occurrences: 4, basis: "scheduled" });
    expect(occurrencesInMonth("RECURRING_WEEKLY", "Friday", OCT)).toEqual({ occurrences: 5, basis: "scheduled" });
    expect(expectedCollectionForMonth([weekly], [], SEPT).fixedRecurringCents).toBe(usd(600));
    expect(expectedCollectionForMonth([weekly], [], OCT).fixedRecurringCents).toBe(usd(750));
  });

  it("says so when the invoice day cannot be read", () => {
    const vague = { ...weekly, invoiceDay: "the Friday after invoicing" };
    const out = expectedCollectionForMonth([vague], [], SEPT);
    expect(out.estimatedLines).toBe(1);
    expect(out.fixedRecurringCents).toBe(usd(650));
  });
});

describe("TEST 3 — per client, 19 clients at $25", () => {
  const perClient = terms({
    serviceId: "pc", billingModel: "PER_CLIENT", rateCents: usd(25), quantity: 19,
  });

  it("expects $475 of variable recurring revenue", () => {
    const roll = rollUpRecurring([perClient], "2026-09-07");
    expect(roll.variableExpectedCents).toBe(usd(475));
  });

  it("is never counted as guaranteed fixed MRR", () => {
    expect(revenueClass("PER_CLIENT")).toBe("variable_recurring");
    expect(rollUpRecurring([perClient], "2026-09-07").fixedMrrCents).toBe(0);
  });

  it("reports an unpriced line rather than $0 when nobody supplied the count", () => {
    const roll = rollUpRecurring([{ ...perClient, quantity: null }], "2026-09-07");
    expect(roll.variableExpectedCents).toBe(0);
    expect(roll.unpricedRecurring).toBe(1);
  });
});

describe("TEST 4 — a $3,000 GHL build", () => {
  const build = terms({
    serviceId: "b", billingModel: "FIXED_PROJECT", rateCents: usd(3000),
    contractValueCents: usd(3000),
  });

  it("adds nothing to MRR", () => {
    expect(rollUpRecurring([build], "2026-09-07").fixedMrrCents).toBe(0);
    expect(rollUpRecurring([build], "2026-09-07").variableExpectedCents).toBe(0);
  });

  it("is $3,000 of project collectible", () => {
    const pos = financialPosition([build], [], [], [], SEPT, "2026-09-07");
    expect(pos.projectValueCents).toBe(usd(3000));
    expect(pos.recurring.fixedMrrCents).toBe(0);
  });
});

describe("TEST 5 — a $6,000 build in three instalments", () => {
  const build = terms({
    serviceId: "b6", billingModel: "FIXED_PROJECT", rateCents: usd(6000),
    contractValueCents: usd(6000),
  });
  const plan: ScheduledObligation[] = [
    { id: "1", groupId: "g1", serviceId: "b6", kind: "instalment", dueOn: "2026-09-15", amountCents: usd(2000), status: "scheduled" },
    { id: "2", groupId: "g1", serviceId: "b6", kind: "instalment", dueOn: "2026-10-15", amountCents: usd(2000), status: "scheduled" },
    { id: "3", groupId: "g1", serviceId: "b6", kind: "instalment", dueOn: "2026-11-15", amountCents: usd(2000), status: "scheduled" },
  ];

  it("keeps MRR at zero", () => {
    expect(rollUpRecurring([build], "2026-09-07").fixedMrrCents).toBe(0);
  });

  it("expects only the instalment due this month", () => {
    expect(expectedCollectionForMonth([build], plan, SEPT).instalmentCents).toBe(usd(2000));
    expect(expectedCollectionForMonth([build], plan, OCT).instalmentCents).toBe(usd(2000));
  });

  it("keeps the contract value at $6,000 and never multiplies it into revenue", () => {
    const pos = financialPosition([build], plan, [], [], SEPT, "2026-09-07");
    expect(pos.projectValueCents).toBe(usd(6000));
    expect(pos.expected.totalCents).toBe(usd(2000));
  });
});

describe("TEST 6 — a $500 invoice paid $300", () => {
  const invoice: InvoiceRecord = {
    id: "i1", groupId: "g1", totalCents: usd(500), amountPaidCents: usd(300),
    dueDate: "2026-09-30", issueDate: "2026-09-01", status: "partially_paid",
  };
  const payment: PaymentRecord = {
    id: "p1", groupId: "g1", amountCents: usd(300), refundAmountCents: 0,
    paidOn: "2026-09-10", status: "succeeded",
  };

  it("collects $300 and leaves $200 outstanding", () => {
    expect(collectedInMonth([payment], SEPT)).toBe(usd(300));
    expect(runningCollectible([invoice], [], "2026-09-11").invoicedUnpaidCents).toBe(usd(200));
  });

  it("is PARTIALLY_PAID", () => {
    expect(invoiceStatus(usd(500), usd(300), "2026-09-30", "2026-09-11", "sent")).toBe("partially_paid");
  });
});

describe("TEST 7 — a recurring partner cancels", () => {
  it("removes future MRR and changes no history", () => {
    const service = terms({
      serviceId: "s", billingModel: "RECURRING_MONTHLY", rateCents: usd(1000),
      invoiceDay: "1", cancellationEffectiveOn: "2026-09-20",
    });
    const paidInAugust: PaymentRecord = {
      id: "p", groupId: "g1", amountCents: usd(1000), refundAmountCents: 0,
      paidOn: "2026-08-05", status: "succeeded",
    };
    expect(rollUpRecurring([service], "2026-09-21").fixedMrrCents).toBe(0);
    /* August's collection is untouched by a September cancellation. */
    expect(collectedInMonth([paidInAugust], monthOf("2026-08-01"))).toBe(usd(1000));
  });
});

describe("TEST 8 — a manually recorded PayPal Personal payment", () => {
  it("counts as collected only once an authorised person records it", () => {
    const none: PaymentRecord[] = [];
    expect(collectedInMonth(none, SEPT)).toBe(0);
    const recorded: PaymentRecord = {
      id: "m1", groupId: "g1", amountCents: usd(325), refundAmountCents: 0,
      paidOn: "2026-09-07", status: "succeeded",
    };
    expect(collectedInMonth([recorded], SEPT)).toBe(usd(325));
  });

  it("does not count a payment that failed", () => {
    const failed: PaymentRecord = {
      id: "f", groupId: "g1", amountCents: usd(325), refundAmountCents: 0,
      paidOn: "2026-09-07", status: "failed",
    };
    expect(collectedInMonth([failed], SEPT)).toBe(0);
  });
});

describe("TEST 9 — the same webhook delivered twice", () => {
  it("is one payment and one collection", () => {
    /* The database refuses the second insert on (provider,
       provider_transaction_id). The engine's guarantee is the other half: two
       rows carrying the same reference would still be one payment here. */
    const seen = new Map<string, PaymentRecord>();
    const arriving: PaymentRecord & { ref: string } = {
      id: "x", groupId: "g1", amountCents: usd(299), refundAmountCents: 0,
      paidOn: "2026-09-07", status: "succeeded", ref: "authnet:60123456789",
    };
    for (const delivery of [arriving, { ...arriving, id: "y" }]) seen.set(delivery.ref, delivery);
    expect(seen.size).toBe(1);
    expect(collectedInMonth([...seen.values()], SEPT)).toBe(usd(299));
  });
});

describe("the numbers that must never merge", () => {
  it("reports a mixed partner as three separate figures", () => {
    /* Dee's §33: CreditOps $250/week, a $3,000 build, a $99/month retainer. */
    const mixed: EngagementTerms[] = [
      terms({ serviceId: "a", billingModel: "RECURRING_WEEKLY", rateCents: usd(250), invoiceDay: "Friday", effectiveFrom: "2026-01-02" }),
      terms({ serviceId: "b", billingModel: "FIXED_PROJECT", rateCents: usd(3000), contractValueCents: usd(3000) }),
      terms({ serviceId: "c", billingModel: "RETAINER", rateCents: usd(99), invoiceDay: "1" }),
    ];
    const pos = financialPosition(mixed, [], [], [], SEPT, "2026-09-07");
    /* 250 × 52 / 12 = 1083.33, rounded to whole cents, plus the 99 retainer.
       MRR is money, so it is an integer number of cents and not a float. */
    expect(pos.recurring.fixedMrrCents).toBe(Math.round(usd(250) * 52 / 12) + usd(99));
    expect(Number.isInteger(pos.recurring.fixedMrrCents)).toBe(true);
    expect(pos.projectValueCents).toBe(usd(3000));
    /* The build is NOT in recurring revenue, at any point. */
    expect(pos.recurring.fixedMrrCents).toBeLessThan(usd(3000));
  });

  it("does not treat an invoice as collected", () => {
    const invoice: InvoiceRecord = {
      id: "i", groupId: "g1", totalCents: usd(2500), amountPaidCents: 0,
      dueDate: "2026-09-30", issueDate: "2026-09-01", status: "sent",
    };
    const pos = financialPosition([], [], [invoice], [], SEPT, "2026-09-15");
    expect(pos.invoicedCents).toBe(usd(2500));
    expect(pos.collectedCents).toBe(0);
    expect(pos.outstandingCents).toBe(usd(2500));
  });

  it("counts an invoice past its due date as overdue", () => {
    const invoice: InvoiceRecord = {
      id: "i", groupId: "g1", totalCents: usd(1800), amountPaidCents: 0,
      dueDate: "2026-09-05", issueDate: "2026-08-25", status: "sent",
    };
    expect(runningCollectible([invoice], [], "2026-09-15").overdueCents).toBe(usd(1800));
  });

  it("excludes void invoices and cancelled schedule rows from collectible", () => {
    const voided: InvoiceRecord = {
      id: "v", groupId: "g1", totalCents: usd(900), amountPaidCents: 0,
      dueDate: "2026-09-01", issueDate: "2026-08-01", status: "void",
    };
    const dropped: ScheduledObligation = {
      id: "s", groupId: "g1", serviceId: null, kind: "instalment",
      dueOn: "2026-09-15", amountCents: usd(700), status: "cancelled",
    };
    expect(runningCollectible([voided], [dropped], "2026-09-15").totalCents).toBe(0);
  });

  it("does not count an obligation twice once it has been invoiced", () => {
    const invoiced: ScheduledObligation = {
      id: "s", groupId: "g1", serviceId: null, kind: "instalment",
      dueOn: "2026-09-15", amountCents: usd(2000), status: "invoiced",
    };
    const invoice: InvoiceRecord = {
      id: "i", groupId: "g1", totalCents: usd(2000), amountPaidCents: 0,
      dueDate: "2026-09-15", issueDate: "2026-09-01", status: "sent",
    };
    const out = runningCollectible([invoice], [invoiced], "2026-09-10");
    expect(out.totalCents).toBe(usd(2000));
    expect(out.notYetInvoicedCents).toBe(0);
  });

  it("nets a refund out of what was collected", () => {
    const refunded: PaymentRecord = {
      id: "r", groupId: "g1", amountCents: usd(500), refundAmountCents: usd(200),
      paidOn: "2026-09-08", status: "succeeded",
    };
    expect(collectedInMonth([refunded], SEPT)).toBe(usd(300));
  });
});
