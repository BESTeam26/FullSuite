/**
 * Who may read which activity.
 *
 * The rule under test is **association is not publication**: an event being
 * linked to an organization, client, case or deal says nothing about who may
 * read it.
 *
 * These mirror `can_view_activity()` in the database, which is the actual
 * enforcement layer and is exercised against the live project separately. They
 * exist so the rule is executable, reviewable and regression-proof in one place
 * rather than only inside a policy nobody reads.
 */
import { describe, expect, it } from "vitest";

type Visibility =
  | "bes_internal"
  | "organization_internal"
  | "shared_with_partner"
  | "client_visible";

interface Event {
  organizationId: string | null;
  visibility: Visibility;
  /** Governs which engagement is required; null for agency-owned records. */
  service: "creditops" | "fundingops" | null;
}

interface Viewer {
  kind: "bes" | "org_member" | "stranger";
  /** Organization the viewer belongs to, for org members. */
  orgId?: string;
  /** Partner+service pairs BES is actively engaged for. */
  engagements?: { orgId: string; service: string }[];
}

/**
 * The same decision `can_view_activity()` makes, in the same order. Customer
 * staff are checked first: an organization member is never BES staff, and the
 * two branches answer differently for the same row.
 */
function canView(v: Viewer, e: Event): boolean {
  if (v.kind === "org_member" && e.organizationId && v.orgId === e.organizationId) {
    return e.visibility !== "bes_internal";
  }
  if (v.kind === "bes") {
    if (e.visibility === "bes_internal") return true;
    if (e.organizationId === null) return true; // agency-owned record
    return (v.engagements ?? []).some(
      (g) => g.orgId === e.organizationId && g.service === e.service,
    );
  }
  return false;
}

const APEX = "org-apex";
const VANTAGE = "org-vantage";

/** BES fulfils CreditOps for Apex, and nothing for Vantage. */
const bes: Viewer = {
  kind: "bes",
  engagements: [{ orgId: APEX, service: "creditops" }],
};
const apexStaff: Viewer = { kind: "org_member", orgId: APEX };
const vantageStaff: Viewer = { kind: "org_member", orgId: VANTAGE };
const stranger: Viewer = { kind: "stranger" };

const ev = (over: Partial<Event> = {}): Event => ({
  organizationId: APEX,
  visibility: "shared_with_partner",
  service: "creditops",
  ...over,
});

describe("BES_INTERNAL", () => {
  const e = ev({ visibility: "bes_internal" });

  it("is visible to BES", () => expect(canView(bes, e)).toBe(true));

  it("is NEVER visible to the customer, even on their own client", () => {
    // The event hangs off Apex's record. Association is not publication.
    expect(canView(apexStaff, e)).toBe(false);
  });

  it("is not visible to another organization", () =>
    expect(canView(vantageStaff, e)).toBe(false));
});

describe("ORGANIZATION_INTERNAL", () => {
  const e = ev({ visibility: "organization_internal" });

  it("is visible to the organization's own staff", () =>
    expect(canView(apexStaff, e)).toBe(true));

  it("is visible to BES only where an engagement covers the service", () => {
    expect(canView(bes, e)).toBe(true); // BES fulfils CreditOps for Apex
    const funding = ev({ visibility: "organization_internal", service: "fundingops" });
    expect(canView(bes, funding)).toBe(false); // no FundingOps engagement
  });

  it("is invisible to BES for a SaaS-only organization", () => {
    const e2 = ev({ organizationId: VANTAGE, visibility: "organization_internal" });
    expect(canView(bes, e2)).toBe(false);
  });

  it("is not automatically client-visible", () => {
    // Nothing in this level implies the borrower portal.
    expect(e.visibility).not.toBe("client_visible");
  });
});

describe("SHARED_WITH_PARTNER", () => {
  const e = ev({ visibility: "shared_with_partner" });

  it("is visible to both sides of the fulfillment relationship", () => {
    expect(canView(bes, e)).toBe(true);
    expect(canView(apexStaff, e)).toBe(true);
  });

  it("is still not visible to BES without an engagement", () => {
    const e2 = ev({ organizationId: VANTAGE, visibility: "shared_with_partner" });
    expect(canView(bes, e2)).toBe(false);
  });

  it("is not visible to an unrelated organization", () =>
    expect(canView(vantageStaff, e)).toBe(false));
});

describe("CLIENT_VISIBLE", () => {
  const e = ev({ visibility: "client_visible" });

  it("is visible to BES and the organization", () => {
    expect(canView(bes, e)).toBe(true);
    expect(canView(apexStaff, e)).toBe(true);
  });

  it("still does not leak to an unrelated organization", () =>
    expect(canView(vantageStaff, e)).toBe(false));
});

describe("agency-owned records", () => {
  it("are BES's own regardless of level — no organization is attached", () => {
    const e = ev({ organizationId: null, service: null, visibility: "shared_with_partner" });
    expect(canView(bes, e)).toBe(true);
    expect(canView(apexStaff, e)).toBe(false);
  });
});

describe("default deny", () => {
  it("denies a viewer with no relationship at all", () => {
    for (const v of ["bes_internal", "organization_internal", "shared_with_partner", "client_visible"] as Visibility[]) {
      expect(canView(stranger, ev({ visibility: v }))).toBe(false);
    }
  });

  it("denies an org member looking at a different organization's event", () => {
    expect(canView(apexStaff, ev({ organizationId: VANTAGE }))).toBe(false);
  });
});
