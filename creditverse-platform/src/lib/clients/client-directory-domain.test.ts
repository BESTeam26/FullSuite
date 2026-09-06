import { describe, expect, it } from "vitest";
import {
  deriveServices,
  enrolledServices,
  lifecycleToServiceState,
  matchesFilters,
  sortRows,
  assigneeOptions,
  EMPTY_FILTERS,
  type ClientDirectoryRow,
} from "./client-directory-domain";

const row = (over: Partial<ClientDirectoryRow> = {}): ClientDirectoryRow => ({
  id: "c1",
  publicId: "CN-0001",
  name: "Cleo Chan",
  email: "cleo@example.com",
  phone: "555-0100",
  status: "active",
  services: deriveServices({
    creditCase: { id: "fc1", lifecycle: "active", round: "3" },
    fundingClient: { id: "fu1", lifecycle: "active", businessCount: 1, fundingFileCount: 2 },
  }),
  businesses: [{ id: "b1", name: "Cleo Consulting LLC", fundingFileCount: 2 }],
  assigned: ["Sarah Reyes"],
  lastActivity: "2026-09-05T10:00:00Z",
  createdAt: "2026-01-04T10:00:00Z",
  needsReview: false,
  ...over,
});

describe("service relationships", () => {
  it("reports all three services, enrolled or not", () => {
    const services = deriveServices({ diy: { stage: "disputing", roundNumber: 2 } });
    expect(services.map((s) => s.service)).toEqual(["creditops", "fundingops", "diy"]);
    expect(services.filter((s) => s.state === "not-enrolled").map((s) => s.service)).toEqual([
      "creditops",
      "fundingops",
    ]);
  });

  it("keeps an archived relationship visible — it is not the same as never having one", () => {
    const archived = deriveServices({ creditCase: { id: "fc1", lifecycle: "archived", round: null } });
    expect(archived[0].state).toBe("archived");
    expect(enrolledServices({ services: archived }).map((s) => s.service)).toEqual(["creditops"]);
  });

  it("sends each service to its own engine, never to the client record", () => {
    const services = deriveServices({
      creditCase: { id: "fc1", lifecycle: "active", round: "1" },
      fundingClient: { id: "fu1", lifecycle: "active", businessCount: 0, fundingFileCount: 0 },
    });
    expect(services[0].href).toBe("/app/creditops/cases/fc1");
    expect(services[1].href).toBe("/app/funding-clients/fu1");
    /* The point of the whole change: opening a client does not open a
       credit-repair application. */
    expect(services.every((s) => s.href === null || !s.href.startsWith("/app/clients"))).toBe(true);
  });

  it("treats an absent lifecycle as no relationship, not as archived", () => {
    expect(lifecycleToServiceState(undefined)).toBe("not-enrolled");
    expect(lifecycleToServiceState(null)).toBe("not-enrolled");
    expect(lifecycleToServiceState("active")).toBe("active");
    expect(lifecycleToServiceState("paused")).toBe("paused");
    expect(lifecycleToServiceState("cancelled")).toBe("archived");
  });

  it("pluralizes the funding summary honestly", () => {
    const one = deriveServices({ fundingClient: { id: "f", lifecycle: "active", businessCount: 1, fundingFileCount: 1 } });
    expect(one[1].detail).toBe("1 business · 1 funding file");
    const many = deriveServices({ fundingClient: { id: "f", lifecycle: "active", businessCount: 2, fundingFileCount: 3 } });
    expect(many[1].detail).toBe("2 businesses · 3 funding files");
  });
});

describe("filters", () => {
  it("defaults to active clients only", () => {
    expect(matchesFilters(row(), EMPTY_FILTERS)).toBe(true);
    expect(matchesFilters(row({ status: "archived" }), EMPTY_FILTERS)).toBe(false);
    expect(matchesFilters(row({ status: "archived" }), { ...EMPTY_FILTERS, status: "all" })).toBe(true);
    expect(matchesFilters(row(), { ...EMPTY_FILTERS, status: "inactive" })).toBe(false);
  });

  it("matches any of the selected services, not all of them", () => {
    const diyOnly = row({ services: deriveServices({ diy: { stage: "importing", roundNumber: null } }) });
    expect(matchesFilters(diyOnly, { ...EMPTY_FILTERS, services: ["diy"] })).toBe(true);
    expect(matchesFilters(diyOnly, { ...EMPTY_FILTERS, services: ["creditops"] })).toBe(false);
    expect(matchesFilters(diyOnly, { ...EMPTY_FILTERS, services: ["creditops", "diy"] })).toBe(true);
  });

  it("does not count a not-enrolled service as a service", () => {
    const creditOnly = row({ services: deriveServices({ creditCase: { id: "x", lifecycle: "active", round: "1" } }) });
    expect(matchesFilters(creditOnly, { ...EMPTY_FILTERS, services: ["fundingops"] })).toBe(false);
  });

  it("searches identity, including the business name and the CN- code", () => {
    expect(matchesFilters(row(), { ...EMPTY_FILTERS, q: "consulting" })).toBe(true);
    expect(matchesFilters(row(), { ...EMPTY_FILTERS, q: "CN-0001" })).toBe(true);
    expect(matchesFilters(row(), { ...EMPTY_FILTERS, q: "charge-off" })).toBe(false);
  });

  it("filters on business presence and on assignment by exact name", () => {
    expect(matchesFilters(row(), { ...EMPTY_FILTERS, business: "with" })).toBe(true);
    expect(matchesFilters(row({ businesses: [] }), { ...EMPTY_FILTERS, business: "with" })).toBe(false);
    expect(matchesFilters(row({ businesses: [] }), { ...EMPTY_FILTERS, business: "without" })).toBe(true);
    expect(matchesFilters(row(), { ...EMPTY_FILTERS, assigned: "Sarah Reyes" })).toBe(true);
    expect(matchesFilters(row(), { ...EMPTY_FILTERS, assigned: "Sarah" })).toBe(false);
  });

  it("can narrow to the clients a backfill could not resolve", () => {
    expect(matchesFilters(row(), { ...EMPTY_FILTERS, needsReviewOnly: true })).toBe(false);
    expect(matchesFilters(row({ needsReview: true }), { ...EMPTY_FILTERS, needsReviewOnly: true })).toBe(true);
  });
});

describe("sorting", () => {
  it("sorts by name and by date", () => {
    const rows = [row({ id: "b", name: "Zoe" }), row({ id: "a", name: "Ann" })];
    expect(sortRows(rows, "name", "asc").map((r) => r.name)).toEqual(["Ann", "Zoe"]);
    expect(sortRows(rows, "name", "desc").map((r) => r.name)).toEqual(["Zoe", "Ann"]);
  });

  it("puts clients with no activity last in both directions", () => {
    const rows = [
      row({ id: "none", lastActivity: null }),
      row({ id: "old", lastActivity: "2026-01-01T00:00:00Z" }),
      row({ id: "new", lastActivity: "2026-09-01T00:00:00Z" }),
    ];
    expect(sortRows(rows, "lastActivity", "desc").map((r) => r.id)).toEqual(["new", "old", "none"]);
    expect(sortRows(rows, "lastActivity", "asc").map((r) => r.id)).toEqual(["old", "new", "none"]);
  });

  it("does not mutate the array it was given", () => {
    const rows = [row({ name: "Zoe" }), row({ name: "Ann" })];
    sortRows(rows, "name", "asc");
    expect(rows[0].name).toBe("Zoe");
  });
});

describe("assignee options", () => {
  it("de-duplicates across services and sorts", () => {
    const rows = [row({ assigned: ["Mike", "Sarah Reyes"] }), row({ assigned: ["Sarah Reyes"] }), row({ assigned: [] })];
    expect(assigneeOptions(rows)).toEqual(["Mike", "Sarah Reyes"]);
  });
});
