/**
 * Which division's operating list a partner belongs in.
 *
 * The rule, decided by Dee on 2026-09-11 and locked:
 *
 *   ACTIVE engagement for that service        → in that division's active list
 *   PAUSED · COMPLETED · ENDED · dated-out    → out of it, kept in history
 *   ARCHIVED partner                          → out of it, kept in history
 *   no engagement for that service            → never in it
 *
 * These are her acceptance tests, written against `buildPartners` because that
 * is the one function every CreditOps and FundingOps tree, queue, dashboard and
 * count reads. The bug they lock out is the original behaviour: organizations
 * were filtered by entitlement and then EVERY partner was appended to BOTH
 * divisions regardless of what BES had been hired to do.
 */
import { describe, expect, it } from "vitest";
import { buildPartners, type GroupRow } from "@/lib/data/partners";
import type {
  EngagementStatus,
  FulfillmentEngagement,
  FulfillmentService,
} from "@/lib/data/fulfillment-engagements";

const group = (id: string, name: string, over: Partial<GroupRow> = {}): GroupRow => ({
  id,
  name,
  partner_name: name,
  contact_email: `${id}@example.test`,
  contract_ref: null,
  status: "Active",
  archived_at: null,
  ...over,
});

const engagement = (
  groupId: string,
  service: FulfillmentService,
  over: Partial<FulfillmentEngagement> = {},
): FulfillmentEngagement => ({
  id: `eng-${groupId}-${service}`,
  outsourcingGroupId: groupId,
  scopeId: groupId,
  service,
  status: "active" as EngagementStatus,
  effectiveFrom: "2020-01-01",
  ...over,
});

/** The partners a division's tree would show, by name. */
const listed = (
  product: "creditOps" | "fundingOps",
  groups: GroupRow[],
  engagements: FulfillmentEngagement[],
) => buildPartners(product, [], groups, engagements).map((p) => p.name).sort();

describe("a partner appears only in the divisions BES is actually engaged for", () => {
  const xavier = group("g-x", "Xavier");
  const funding = group("g-f", "Fundare Capital");
  const staffing = group("g-t", "Credit by Nainoa");
  const credit = group("g-c", "ZackCredit");
  const both = group("g-b", "CreditCure");

  const all = [xavier, funding, staffing, credit, both];
  const engagements = [
    engagement("g-x", "bes_crm"),
    engagement("g-f", "fundingops"),
    engagement("g-t", "talentops"),
    engagement("g-c", "creditops"),
    engagement("g-b", "creditops"),
    engagement("g-b", "bes_crm"),
  ];

  it("1 — a BES CRM-only partner is not in CreditOps", () => {
    expect(listed("creditOps", all, engagements)).not.toContain("Xavier");
  });

  it("2 — a FundingOps-only partner is not in CreditOps", () => {
    expect(listed("creditOps", all, engagements)).not.toContain("Fundare Capital");
    expect(listed("fundingOps", all, engagements)).toContain("Fundare Capital");
  });

  it("3 — a TalentOps-only partner is in neither CreditOps nor FundingOps", () => {
    expect(listed("creditOps", all, engagements)).not.toContain("Credit by Nainoa");
    expect(listed("fundingOps", all, engagements)).not.toContain("Credit by Nainoa");
  });

  it("4 — a CreditOps partner is in CreditOps", () => {
    expect(listed("creditOps", all, engagements)).toContain("ZackCredit");
  });

  it("5 — CreditOps + BES CRM shows in CreditOps, and never leaks into FundingOps", () => {
    expect(listed("creditOps", all, engagements)).toContain("CreditCure");
    expect(listed("fundingOps", all, engagements)).not.toContain("CreditCure");
  });

  it("a partner with no engagement at all appears nowhere", () => {
    const orphan = group("g-o", "Never Signed");
    expect(listed("creditOps", [...all, orphan], engagements)).not.toContain("Never Signed");
    expect(listed("fundingOps", [...all, orphan], engagements)).not.toContain("Never Signed");
  });
});

describe("leaving the operating list is not being deleted", () => {
  const kevin = group("g-k", "Kevin");
  const live = [engagement("g-k", "creditops"), engagement("g-k", "bes_crm")];

  it("6 — pausing CreditOps takes the partner out of the CreditOps list", () => {
    const paused = [engagement("g-k", "creditops", { status: "paused" }), live[1]];
    expect(listed("creditOps", [kevin], paused)).not.toContain("Kevin");
  });

  it("6 — and their other live division is untouched", () => {
    /* BES CRM is a different engagement on the SAME canonical partner, so
       pausing CreditOps must not disturb it. Proved here through FundingOps
       staying empty and CreditOps emptying while the bes_crm row is intact. */
    const paused = [engagement("g-k", "creditops", { status: "paused" }), live[1]];
    expect(paused.filter((e) => e.service === "bes_crm" && e.status === "active")).toHaveLength(1);
    expect(listed("fundingOps", [kevin], paused)).toHaveLength(0);
  });

  it("8 — a completed engagement, spelled as an end date in the past, also drops out", () => {
    const ended = [engagement("g-k", "creditops", { effectiveTo: "2020-06-30" })];
    expect(listed("creditOps", [kevin], ended)).not.toContain("Kevin");
  });

  it("an engagement that has not started yet is not in the list either", () => {
    const future = [engagement("g-k", "creditops", { effectiveFrom: "2099-01-01" })];
    expect(listed("creditOps", [kevin], future)).not.toContain("Kevin");
  });

  it("an archived partner leaves every operating list", () => {
    const archived = group("g-k", "Kevin", { archived_at: "2026-09-01T00:00:00Z" });
    expect(listed("creditOps", [archived], live)).toHaveLength(0);
  });

  it("11 — reactivating restores the partner, and 12 — it is the same record", () => {
    const paused = [engagement("g-k", "creditops", { status: "paused" })];
    expect(listed("creditOps", [kevin], paused)).toHaveLength(0);

    /* The same engagement row, flipped back to active — no new partner, no new
       engagement id. That is the whole point: Kevin returning six months later
       must not become a second Kevin. */
    const back = [engagement("g-k", "creditops", { status: "active" })];
    const restored = buildPartners("creditOps", [], [kevin], back);
    expect(restored).toHaveLength(1);
    expect(restored[0].name).toBe("Kevin");
    expect(restored[0].scopeId).toBe("g-k");
    expect(back[0].id).toBe(paused[0].id);
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 * Operational categories (0301-0304).
 *
 * The category is how an ACTIVE engagement is filed inside its module. It is
 * derived from the service relationship, overridable by hand, and completely
 * separate from SaaS tenancy — which is the invariant most of these lock.
 * ────────────────────────────────────────────────────────────────────────── */
const MANAGED = "cat-managed-ops";
const OUTSOURCED = "cat-outsourcing";

describe("an account carries the engagement it is filed under", () => {
  const kevin = group("g-k", "Kevin Hernandez");

  it("carries the live engagement's id and category, so a move has something to move", () => {
    const live = [engagement("g-k", "creditops", { operationalCategoryId: MANAGED })];
    const [p] = buildPartners("creditOps", [], [kevin], live);
    expect(p.engagementId).toBe("eng-g-k-creditops");
    expect(p.operationalCategoryId).toBe(MANAGED);
    expect(p.categorySource).toBeUndefined();
  });

  it("reports a manual placement as manual, so the interface can say so", () => {
    const held = [
      engagement("g-k", "creditops", { operationalCategoryId: OUTSOURCED, categorySource: "manual" }),
    ];
    const [p] = buildPartners("creditOps", [], [kevin], held);
    expect(p.operationalCategoryId).toBe(OUTSOURCED);
    expect(p.categorySource).toBe("manual");
  });

  it("15 — the same partner is filed independently in each module", () => {
    /* One canonical partner, two engagements, two categories. Filing the
       CreditOps one says nothing about the BES CRM one. */
    const both = [
      engagement("g-k", "creditops", { operationalCategoryId: MANAGED }),
      engagement("g-k", "bes_crm", { operationalCategoryId: "cat-active-builds" }),
    ];
    const [credit] = buildPartners("creditOps", [], [kevin], both);
    expect(credit.operationalCategoryId).toBe(MANAGED);
    expect(both.filter((e) => e.service === "bes_crm")[0].operationalCategoryId).toBe("cat-active-builds");
    expect(buildPartners("creditOps", [], [kevin], both)).toHaveLength(1);
  });

  it("16 — pausing removes it from the active workspace and keeps the category", () => {
    const paused = [
      engagement("g-k", "creditops", { status: "paused", operationalCategoryId: OUTSOURCED }),
    ];
    expect(buildPartners("creditOps", [], [kevin], paused)).toHaveLength(0);
    /* The row is untouched: nothing about pausing edits where it is filed. */
    expect(paused[0].operationalCategoryId).toBe(OUTSOURCED);
  });

  it("17 — reactivating restores it to the category it kept", () => {
    const back = [
      engagement("g-k", "creditops", { status: "active", operationalCategoryId: OUTSOURCED }),
    ];
    const [p] = buildPartners("creditOps", [], [kevin], back);
    expect(p.operationalCategoryId).toBe(OUTSOURCED);
    expect(p.scopeId).toBe("g-k");
  });
});

describe("CreditOps Users is the SaaS side, and tenancy is untouched by the folders", () => {
  const entitled = {
    id: "org-1",
    name: "Ironwood Self-Serve",
    status: "Active",
    entitlements: [{ key: "creditOps", enabled: true }],
    principal: { name: "A Person", email: "a@example.test" },
  } as unknown as Parameters<typeof buildPartners>[1][number];

  it("a CreditOps subscriber with no engagement is listed under CreditOps Users", () => {
    /* Dee, 2026-09-11: the folder is for "future users on the CreditOps CRM I
       am building that will autofeed clients info in the workspace". Listing
       the tenant is not access to it — with no live engagement the database
       refuses BES every client row they own. */
    const [p] = buildPartners("creditOps", [entitled], [], []);
    expect(p.name).toBe("Ironwood Self-Serve");
    expect(p.group).toBe("creditops_users");
    expect(p.engagementId).toBeUndefined();
  });

  it("and is not in the FundingOps tree, which has no self-serve CRM", () => {
    expect(buildPartners("fundingOps", [entitled], [], [])).toHaveLength(0);
  });

  it("an organization entitled to nothing is in no tree at all", () => {
    const none = { ...(entitled as object), id: "org-2", entitlements: [] } as typeof entitled;
    expect(buildPartners("creditOps", [none], [], [])).toHaveLength(0);
  });

  it("the same organization moves into the operating folders once BES is engaged", () => {
    const live = [engagement("org-1", "creditops", { operationalCategoryId: MANAGED })];
    const [p] = buildPartners("creditOps", [entitled], [], live);
    expect(p.group).toBe("managed");
    expect(p.mode).toBe("saas_pulled");
    expect(p.operationalCategoryId).toBe(MANAGED);
  });

  it("filing a tenant under Outsourcing does not stop it being a tenant", () => {
    /* Dee's regression: the folder is the COMMERCIAL TERM — weekly commitment
       versus per client per round. `mode` is provenance and is what says "this
       came from a SaaS tenant"; it must not move when the folder does. */
    const moved = [
      engagement("org-1", "creditops", { operationalCategoryId: OUTSOURCED, categorySource: "manual" }),
    ];
    const [p] = buildPartners("creditOps", [entitled], [], moved);
    expect(p.operationalCategoryId).toBe(OUTSOURCED);
    expect(p.mode).toBe("saas_pulled");
    expect(p.scopeId).toBe("org-1");
  });

  it("and the inverse: filing an outsourced partner under Managed Ops creates no tenant", () => {
    const partner = group("g-n", "Credit by Nainoa");
    const moved = [
      engagement("g-n", "creditops", { operationalCategoryId: MANAGED, categorySource: "manual" }),
    ];
    const [p] = buildPartners("creditOps", [], [partner], moved);
    expect(p.operationalCategoryId).toBe(MANAGED);
    /* Still an outsourcing-only record. No organization was invented. */
    expect(p.mode).toBe("outsourcing_only");
    expect(p.id).toBe("grp-g-n");
  });
});
