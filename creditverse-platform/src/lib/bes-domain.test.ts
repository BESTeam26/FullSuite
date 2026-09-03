import { describe, it, expect } from "vitest";
import {
  isProductEnabled,
  orgPlanLabel,
  isAgencyWork,
  isOrgWork,
  canAgencySeeWork,
  canOrgSeeWork,
  PRODUCT_LABELS,
  type Organization,
  type ProductEntitlement,
  type ProductKey,
  type WorkItem,
} from "./bes-domain";

const ent = (key: ProductKey, enabled = true): ProductEntitlement => ({
  key,
  label: PRODUCT_LABELS[key],
  enabled,
});

const org = (entitlements: ProductEntitlement[]): Organization => ({
  id: "org-1",
  name: "Apex Credit Co.",
  code: "APEX",
  principal: { name: "Owner", email: "owner@apex.test" },
  status: "Active",
  joinedDate: "2026-01-01",
  entitlements,
  isFulfillmentSubscriber: false,
  businesses: [],
  orgUsers: [],
  externalUsers: [],
});

const work = (o: Partial<WorkItem>): WorkItem => ({
  id: "w-1",
  scope: "AGENCY",
  relatedType: "credit_case",
  relatedId: "cc-1",
  title: "Round 1 letters",
  stage: "Queued",
  createdAt: "2026-09-01T00:00:00Z",
  ...o,
});

describe("isProductEnabled", () => {
  it("is true only when the entitlement exists AND is enabled", () => {
    const o = org([ent("creditOps", true), ent("fundingOps", false)]);
    expect(isProductEnabled(o, "creditOps")).toBe(true);
    expect(isProductEnabled(o, "fundingOps")).toBe(false);
    expect(isProductEnabled(o, "diyCredit")).toBe(false);
  });
});

describe("orgPlanLabel", () => {
  it("returns 'No Products' with zero enabled entitlements", () => {
    expect(orgPlanLabel(org([]))).toBe("No Products");
    expect(orgPlanLabel(org([ent("creditOps", false)]))).toBe("No Products");
  });

  it("returns the single product label with exactly one enabled", () => {
    expect(orgPlanLabel(org([ent("fundingOps")]))).toBe("FundingOps");
    // disabled entitlements do not count toward the plan
    expect(
      orgPlanLabel(
        org([ent("fundingOps"), ent("creditOps", false), ent("oi", false)]),
      ),
    ).toBe("FundingOps");
  });

  it("joins two enabled labels with ' + ' in entitlement order", () => {
    expect(orgPlanLabel(org([ent("creditOps"), ent("fundingOps")]))).toBe(
      "CreditOps + FundingOps",
    );
  });

  it("returns 'Full Suite' at three or more enabled", () => {
    expect(
      orgPlanLabel(org([ent("creditOps"), ent("fundingOps"), ent("oi")])),
    ).toBe("Full Suite");
    expect(
      orgPlanLabel(
        org([
          ent("creditOps"),
          ent("fundingOps"),
          ent("oi"),
          ent("crm"),
          ent("diyCredit"),
        ]),
      ),
    ).toBe("Full Suite");
  });
});

describe("work scope boundary", () => {
  const agency = work({ scope: "AGENCY" });
  const orgA = work({ scope: "ORGANIZATION", organizationId: "org-A" });

  it("isAgencyWork / canAgencySeeWork are true only for AGENCY scope", () => {
    expect(isAgencyWork(agency)).toBe(true);
    expect(canAgencySeeWork(agency)).toBe(true);
    expect(isAgencyWork(orgA)).toBe(false);
    expect(canAgencySeeWork(orgA)).toBe(false);
  });

  it("isOrgWork / canOrgSeeWork require ORGANIZATION scope and a matching org id", () => {
    expect(isOrgWork(orgA, "org-A")).toBe(true);
    expect(canOrgSeeWork(orgA, "org-A")).toBe(true);
    expect(isOrgWork(orgA, "org-B")).toBe(false);
    expect(canOrgSeeWork(orgA, "org-B")).toBe(false);
  });

  it("agency work tagged with an organizationId is still not visible to that org", () => {
    const leaked = work({ scope: "AGENCY", organizationId: "org-A" });
    expect(canOrgSeeWork(leaked, "org-A")).toBe(false);
    expect(isOrgWork(leaked, "org-A")).toBe(false);
  });
});
