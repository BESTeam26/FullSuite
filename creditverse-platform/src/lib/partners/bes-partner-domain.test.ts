import { describe, expect, it } from "vitest";
import {
  buildBesPartners,
  filterPartners,
  serviceTotals,
  type OrganizationInput,
  type OutsourcingGroupInput,
} from "./bes-partner-domain";
import type { FulfillmentEngagement } from "@/lib/data/fulfillment-engagements";

const TODAY = "2026-09-06";

const org = (id: string, name: string): OrganizationInput => ({
  id,
  publicId: `ORG-${id}`,
  name,
  status: "Active",
  principal: { name: `${name} Owner`, email: `owner@${id}.test` },
});

const group = (id: string, name: string): OutsourcingGroupInput => ({
  id,
  name,
  partner_name: `${name} Contact`,
  contact_email: `hi@${id}.test`,
  contract_ref: "C-1",
  status: "Active",
});

const eng = (
  scopeId: string,
  service: FulfillmentEngagement["service"],
  over: Partial<FulfillmentEngagement> = {},
): FulfillmentEngagement => ({
  id: `${scopeId}-${service}`,
  scopeId,
  organizationId: scopeId.startsWith("org") ? scopeId : undefined,
  outsourcingGroupId: scopeId.startsWith("grp") ? scopeId : undefined,
  service,
  status: "active",
  effectiveFrom: "2026-01-01",
  ...over,
});

describe("who is a BES Partner", () => {
  it("excludes a SaaS organization with no engagement — a subscription is not a partnership", () => {
    const partners = buildBesPartners([org("org1", "Lakeside")], [], [], TODAY);
    expect(partners).toEqual([]);
  });

  it("includes an organization the moment BES is engaged to do work for it", () => {
    const partners = buildBesPartners([org("org1", "Lakeside")], [], [eng("org1", "creditops")], TODAY);
    expect(partners).toHaveLength(1);
    expect(partners[0].relationship).toBe("saas_and_fulfillment");
    expect(partners[0].organizationPublicId).toBe("ORG-org1");
    expect(partners[0].liveServices).toEqual(["creditops"]);
  });

  it("includes an outsourcing group that has no SaaS tenant at all (model 3)", () => {
    const partners = buildBesPartners([], [group("grp1", "Apex Outsourcing")], [eng("grp1", "fundingops")], TODAY);
    expect(partners[0].relationship).toBe("outsourcing_only");
    expect(partners[0].organizationId).toBeUndefined();
    expect(partners[0].contractRef).toBe("C-1");
  });

  it("shows an outsourcing group with no engagement recorded, so the gap is visible", () => {
    const partners = buildBesPartners([], [group("grp1", "Apex")], [], TODAY);
    expect(partners).toHaveLength(1);
    expect(partners[0].services).toEqual([]);
    expect(partners[0].liveServices).toEqual([]);
  });

  it("keeps an ended engagement listed but not live — history is part of the relationship", () => {
    const partners = buildBesPartners(
      [org("org1", "Lakeside")],
      [],
      [eng("org1", "creditops", { effectiveTo: "2026-06-30" })],
      TODAY,
    );
    expect(partners[0].services).toHaveLength(1);
    expect(partners[0].services[0].live).toBe(false);
    expect(partners[0].liveServices).toEqual([]);
  });

  it("does not treat a paused or future engagement as live", () => {
    const paused = buildBesPartners([org("o", "O")], [], [eng("o", "creditops", { status: "paused" })], TODAY);
    expect(paused[0].liveServices).toEqual([]);
    const future = buildBesPartners([org("o", "O")], [], [eng("o", "creditops", { effectiveFrom: "2027-01-01" })], TODAY);
    expect(future[0].liveServices).toEqual([]);
  });

  it("lists every service for one partner without duplicating the partner", () => {
    const partners = buildBesPartners(
      [org("org1", "Lakeside")],
      [],
      [eng("org1", "creditops"), eng("org1", "fundingops"), eng("org1", "talentops")],
      TODAY,
    );
    expect(partners).toHaveLength(1);
    expect(partners[0].liveServices.sort()).toEqual(["creditops", "fundingops", "talentops"]);
  });

  it("carries the authorized team, because that is what narrows BES staff", () => {
    const partners = buildBesPartners([org("o", "O")], [], [eng("o", "creditops", { authorizedTeam: "team-a" })], TODAY);
    expect(partners[0].services[0].authorizedTeam).toBe("team-a");
  });

  it("sorts by name across both partner shapes", () => {
    const partners = buildBesPartners(
      [org("org1", "Zenith")],
      [group("grp1", "Apex")],
      [eng("org1", "creditops"), eng("grp1", "creditops")],
      TODAY,
    );
    expect(partners.map((p) => p.name)).toEqual(["Apex", "Zenith"]);
  });
});

describe("filters and totals", () => {
  const partners = buildBesPartners(
    [org("org1", "Lakeside"), org("org2", "Cedar")],
    [group("grp1", "Apex")],
    [eng("org1", "creditops"), eng("org2", "creditops", { effectiveTo: "2026-01-31" }), eng("grp1", "fundingops")],
    TODAY,
  );

  it("separates live partners from dormant ones", () => {
    expect(filterPartners(partners, "live", "").map((p) => p.name).sort()).toEqual(["Apex", "Lakeside"]);
    expect(filterPartners(partners, "dormant", "").map((p) => p.name)).toEqual(["Cedar"]);
    expect(filterPartners(partners, "all", "")).toHaveLength(3);
  });

  it("searches name, contact and contract reference", () => {
    expect(filterPartners(partners, "all", "apex").map((p) => p.name)).toEqual(["Apex"]);
    expect(filterPartners(partners, "all", "owner@org1").map((p) => p.name)).toEqual(["Lakeside"]);
    expect(filterPartners(partners, "all", "C-1").map((p) => p.name)).toEqual(["Apex"]);
  });

  it("counts live engagements per service, never dormant ones", () => {
    expect(serviceTotals(partners)).toEqual({ creditops: 1, fundingops: 1, bes_crm: 0, talentops: 0, corporate: 0 });
  });
});
