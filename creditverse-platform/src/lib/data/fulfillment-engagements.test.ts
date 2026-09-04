/**
 * The three BES relationship models (rule 16).
 *
 * These cover the in-memory resolver the interface uses. The database is the
 * enforcement layer — `bes_may_fulfil()` inside RLS is what actually stops a
 * read — and it is verified against the live project separately. What is pinned
 * here is that the two answer the same question the same way, so a screen never
 * shows a panel the database will then refuse to fill.
 *
 * The regression they exist to prevent: a single boolean, which could not say
 * WHICH service BES was hired for, WHEN the engagement is live, or represent a
 * partner with no BES SaaS tenant at all.
 */
import { describe, expect, it } from "vitest";
import {
  besMayFulfil,
  isEngagementLive,
  servicesFor,
  type FulfillmentEngagement,
} from "@/lib/data/fulfillment-engagements";

const APEX = "org-apex";
const VANTAGE = "org-vantage";
const ABC = "grp-abc";
const TODAY = "2026-09-03";

const engagement = (
  over: Partial<FulfillmentEngagement> = {},
): FulfillmentEngagement => ({
  id: "e1",
  scopeId: APEX,
  organizationId: APEX,
  service: "creditops",
  status: "active",
  effectiveFrom: "2026-01-01",
  ...over,
});

/* Apex: SaaS for CreditOps AND FundingOps, but BES fulfils CreditOps only.
   ABC Credit Repair: BES fulfils CreditOps, no BES SaaS tenant.
   Vantage: SaaS only — no engagement at all. */
const WORLD: FulfillmentEngagement[] = [
  engagement({ id: "e-apex-credit", scopeId: APEX, service: "creditops" }),
  engagement({
    id: "e-abc-credit",
    scopeId: ABC,
    organizationId: undefined,
    outsourcingGroupId: ABC,
    service: "creditops",
  }),
];

describe("model 1 — SaaS only", () => {
  it("grants BES nothing: a subscription is not a fulfillment authorization", () => {
    expect(besMayFulfil(WORLD, VANTAGE, "creditops", TODAY)).toBe(false);
    expect(besMayFulfil(WORLD, VANTAGE, "fundingops", TODAY)).toBe(false);
  });

  it("reports no services for a SaaS-only organization", () => {
    expect(servicesFor(WORLD, VANTAGE, TODAY)).toEqual([]);
  });
});

describe("model 2 — SaaS + BES fulfillment", () => {
  it("authorizes the service BES was hired for", () => {
    expect(besMayFulfil(WORLD, APEX, "creditops", TODAY)).toBe(true);
  });

  it("does NOT spill into a service BES was not hired for", () => {
    // The whole point of the table: Apex has FundingOps as software, and BES
    // does not fulfil it. One boolean could not express this.
    expect(besMayFulfil(WORLD, APEX, "fundingops", TODAY)).toBe(false);
  });

  it("lists only the engaged services", () => {
    expect(servicesFor(WORLD, APEX, TODAY)).toEqual(["creditops"]);
  });
});

describe("model 3 — BES fulfillment without SaaS", () => {
  it("works for a partner that has no organization at all", () => {
    expect(besMayFulfil(WORLD, ABC, "creditops", TODAY)).toBe(true);
  });

  it("is still scoped to the engaged service", () => {
    expect(besMayFulfil(WORLD, ABC, "fundingops", TODAY)).toBe(false);
  });
});

describe("default deny", () => {
  it("denies an unknown partner", () => {
    expect(besMayFulfil(WORLD, "org-nobody", "creditops", TODAY)).toBe(false);
  });

  it("denies when no partner is supplied at all", () => {
    expect(besMayFulfil(WORLD, undefined, "creditops", TODAY)).toBe(false);
  });

  it("denies against an empty world", () => {
    expect(besMayFulfil([], APEX, "creditops", TODAY)).toBe(false);
  });
});

describe("the engagement window", () => {
  it("is not live before it starts", () => {
    const e = engagement({ effectiveFrom: "2026-12-01" });
    expect(isEngagementLive(e, TODAY)).toBe(false);
    expect(besMayFulfil([e], APEX, "creditops", TODAY)).toBe(false);
  });

  it("is not live after it ends — an expired contract is not access", () => {
    const e = engagement({ effectiveTo: "2026-08-31" });
    expect(isEngagementLive(e, TODAY)).toBe(false);
    expect(besMayFulfil([e], APEX, "creditops", TODAY)).toBe(false);
  });

  it("is live on its final day, not the day after", () => {
    expect(isEngagementLive(engagement({ effectiveTo: TODAY }), TODAY)).toBe(true);
    expect(
      isEngagementLive(engagement({ effectiveTo: "2026-09-02" }), TODAY),
    ).toBe(false);
  });

  it("is open-ended when there is no end date", () => {
    expect(isEngagementLive(engagement({ effectiveTo: undefined }), TODAY)).toBe(
      true,
    );
  });

  it.each(["pending", "paused", "ended"] as const)(
    "denies while the engagement is %s",
    (status) => {
      const e = engagement({ status });
      expect(isEngagementLive(e, TODAY)).toBe(false);
      expect(besMayFulfil([e], APEX, "creditops", TODAY)).toBe(false);
    },
  );
});
