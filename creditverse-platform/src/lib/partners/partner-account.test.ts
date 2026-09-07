import { describe, expect, it } from "vitest";
import {
  clientVolume, daysActive, formatDaysActive, healthNeedsAttention,
  relationshipIsOpen, rollUpFinancials, rollUpServices, serviceIsLive,
  suggestedLifecycle, type BillingLine, type ServiceLine,
} from "./partner-account";

const line = (over: Partial<ServiceLine> & Pick<ServiceLine, "id" | "status">): ServiceLine => ({
  name: "Service", serviceType: null, ...over,
});

describe("a partner is the account, the services are underneath it", () => {
  it("stays open when one service is cancelled and another is running", () => {
    const roll = rollUpServices([
      line({ id: "a", status: "active", serviceType: "CREDITOPS_FULFILLMENT" }),
      line({ id: "b", status: "cancelled", serviceType: "BES_CRM" }),
    ]);
    expect(roll.live).toBe(1);
    expect(roll.historical).toBe(1);
    /* The relationship is a separate fact. Nothing here archives the partner. */
    expect(relationshipIsOpen("active")).toBe(true);
    expect(suggestedLifecycle("active", roll)).toBeNull();
  });

  it("counts a completed build as history, not as a reason to archive", () => {
    const roll = rollUpServices([
      line({ id: "a", status: "active", serviceType: "MONTHLY_RETAINER" }),
      line({ id: "b", status: "completed", serviceType: "GHL_BUILD" }),
    ]);
    expect(roll.live).toBe(1);
    expect(roll.liveTypes).toEqual(["MONTHLY_RETAINER"]);
    expect(suggestedLifecycle("active", roll)).toBeNull();
  });

  it("is a partner with no CreditOps, no clients and one finished build", () => {
    const roll = rollUpServices([line({ id: "a", status: "completed", serviceType: "GHL_BUILD" })]);
    expect(roll.live).toBe(0);
    expect(roll.historical).toBe(1);
    /* Suggested, never applied: only a person decides a relationship is over. */
    expect(suggestedLifecycle("active", roll)?.lifecycle).toBe("on_hold");
    expect(suggestedLifecycle("archived", roll)).toBeNull();
  });

  it("suggests activating a partner whose first service went live", () => {
    const roll = rollUpServices([line({ id: "a", status: "active" })]);
    expect(suggestedLifecycle("onboarding", roll)?.lifecycle).toBe("active");
  });

  it("does not treat a pending line as running", () => {
    expect(serviceIsLive("pending")).toBe(false);
    expect(rollUpServices([line({ id: "a", status: "pending" })])).toMatchObject({ live: 0, pending: 1 });
  });
});

describe("health is recorded, not inferred", () => {
  it("raises attention for concerned and at risk only", () => {
    expect(healthNeedsAttention("concerned")).toBe(true);
    expect(healthNeedsAttention("at_risk")).toBe(true);
    expect(healthNeedsAttention("happy")).toBe(false);
    expect(healthNeedsAttention("neutral")).toBe(false);
    expect(healthNeedsAttention(null)).toBe(false);
  });
});

describe("days active", () => {
  it("counts whole days from the start date", () => {
    expect(daysActive("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysActive("2026-09-07", "2026-09-07")).toBe(0);
  });
  it("is null when nobody recorded a start date", () => {
    expect(daysActive(null, "2026-09-07")).toBeNull();
    expect(formatDaysActive(null)).toBe("Start date not recorded");
  });
  it("does not shift by a day across a timezone", () => {
    expect(daysActive("2026-03-01", "2026-03-02T23:59:59.999Z")).toBe(1);
    expect(daysActive("2026-03-01", "2026-03-02T00:00:00.000Z")).toBe(1);
  });
  it("reads long relationships in months and years", () => {
    expect(formatDaysActive(14)).toBe("14 days");
    expect(formatDaysActive(200)).toBe("6 months");
    expect(formatDaysActive(900)).toBe("2 years");
  });
});

describe("client volume keeps the spreadsheet figure honest", () => {
  it("prefers real client records once there are any", () => {
    expect(clientVolume(536, "300-400", null)).toEqual({ kind: "canonical", count: 536, legacy: "300-400" });
  });
  it("falls back to the legacy text, labelled as legacy", () => {
    expect(clientVolume(0, "60 Average", null)).toEqual({ kind: "legacy_only", text: "60 Average" });
  });
  it("reports a genuine zero for a partner who has no end clients", () => {
    /* A build client has none. That is an answer, not a missing value. */
    expect(clientVolume(0, null, null)).toEqual({ kind: "canonical", count: 0, legacy: null });
  });
  it("says unknown when nothing at all is recorded", () => {
    expect(clientVolume(null, null, null)).toEqual({ kind: "unknown" });
  });
});

describe("partner money is derived from live service lines", () => {
  const bill = (over: Partial<BillingLine> & Pick<BillingLine, "serviceId">): BillingLine => ({
    billingModel: null, rateCents: null, expectedMonthlyCents: null,
    mrrCents: null, billingStatus: null, ...over,
  });

  it("adds up only the recurring lines that are running", () => {
    const services = [
      line({ id: "a", status: "active" }),
      line({ id: "b", status: "active" }),
      line({ id: "c", status: "cancelled" }),
    ];
    const billing = {
      a: bill({ serviceId: "a", billingModel: "RECURRING_MONTHLY", expectedMonthlyCents: 150_000 }),
      b: bill({ serviceId: "b", billingModel: "PER_AGENT", mrrCents: 90_000 }),
      c: bill({ serviceId: "c", billingModel: "RETAINER", expectedMonthlyCents: 500_000 }),
    };
    const roll = rollUpFinancials(services, billing);
    expect(roll.monthlyRecurringCents).toBe(240_000);
    /* The cancelled retainer is history. It is not this month's expectation. */
    expect(roll.oneTimeCents).toBe(0);
  });

  it("keeps a fixed-price build out of recurring revenue", () => {
    const roll = rollUpFinancials(
      [line({ id: "a", status: "active" })],
      { a: bill({ serviceId: "a", billingModel: "FIXED_PROJECT", rateCents: 300_000 }) },
    );
    expect(roll.monthlyRecurringCents).toBe(0);
    expect(roll.oneTimeCents).toBe(300_000);
  });

  it("counts a live service with no terms as unpriced rather than as zero", () => {
    const roll = rollUpFinancials([line({ id: "a", status: "active" })], {});
    expect(roll.unpriced).toBe(1);
    expect(roll.monthlyRecurringCents).toBe(0);
  });

  it("surfaces overdue and pending invoices from the lines", () => {
    const roll = rollUpFinancials(
      [line({ id: "a", status: "active" }), line({ id: "b", status: "active" })],
      {
        a: bill({ serviceId: "a", billingStatus: "overdue", billingModel: "RECURRING_MONTHLY", expectedMonthlyCents: 1 }),
        b: bill({ serviceId: "b", billingStatus: "invoice_pending", billingModel: "RECURRING_MONTHLY", expectedMonthlyCents: 1 }),
      },
    );
    expect(roll.overdue).toBe(1);
    expect(roll.invoicePending).toBe(1);
  });
});
