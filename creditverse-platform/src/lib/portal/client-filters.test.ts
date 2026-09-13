import { describe, expect, it } from "vitest";
import { bucketCounts, bucketOf, filterClients, optionsIn } from "./client-filters";
import type { PartnerPortalClient } from "@/lib/data/agency-partners";

const client = (over: Partial<PartnerPortalClient>): PartnerPortalClient => ({
  publicId: "CN-1", name: "Bryan Rodriguez", email: "b@x.test", status: "Round 1",
  round: "Round 1", openItems: 2, lifecycle: "active",
  lastActivityAt: "2026-09-12T00:00:00Z", processedOn: null, createdAt: "2026-08-01T00:00:00Z",
  currentDepartment: "Dispute", currentWork: "DISPUTE PROCESSING",
  waiting: false, actionNeeded: false, actionTitle: null, ...over,
});

describe("which bucket a client sits in", () => {
  it("counts a file BES is working as active", () => {
    expect(bucketOf(client({}))).toBe("active");
  });

  it("counts a file BES is not actively working as waiting", () => {
    expect(bucketOf(client({ waiting: true }))).toBe("waiting");
  });

  it("puts an action the PARTNER owes above BES waiting on somebody else", () => {
    /* If they must do something, that is the most useful thing to tell them. */
    expect(bucketOf(client({ waiting: true, actionNeeded: true }))).toBe("action");
  });

  it("counts a closed file as closed whatever else is true of it", () => {
    expect(bucketOf(client({ lifecycle: "archived", actionNeeded: true }))).toBe("closed");
    expect(bucketOf(client({ lifecycle: "completed", waiting: true }))).toBe("closed");
  });

  it("adds up to the number of clients, with none counted twice", () => {
    /* The buckets are the summary strip. If they overlapped, the strip would
       total more than the list beneath it. */
    const rows = [
      client({ publicId: "1" }),
      client({ publicId: "2", waiting: true }),
      client({ publicId: "3", actionNeeded: true }),
      client({ publicId: "4", lifecycle: "archived" }),
    ];
    const counts = bucketCounts(rows);
    expect(counts).toEqual({ active: 1, waiting: 1, action: 1, closed: 1 });
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(rows.length);
  });
});

describe("narrowing the client list", () => {
  /* Real-shaped references, because searching one is the point of the test. */
  const rows = [
    client({ publicId: "CN-AAA111", name: "Bryan Rodriguez", round: "Round 1", currentDepartment: "Dispute" }),
    client({ publicId: "CN-BBB222", name: "Jane Smith", round: "Round 2", currentDepartment: "Support", waiting: true }),
    client({ publicId: "CN-CCC333", name: "Sam Lee", round: "Round 1", currentDepartment: "Dispute", actionNeeded: true, actionTitle: "Partner Confirmation Required" }),
  ];

  it("clicking a summary tile narrows to exactly what it counted", () => {
    expect(filterClients(rows, { bucket: "action" }).map((c) => c.publicId)).toEqual(["CN-CCC333"]);
    expect(filterClients(rows, { bucket: "waiting" }).map((c) => c.publicId)).toEqual(["CN-BBB222"]);
  });

  it("searches the name, the reference and what is being done", () => {
    expect(filterClients(rows, { search: "jane" }).map((c) => c.publicId)).toEqual(["CN-BBB222"]);
    expect(filterClients(rows, { search: "aaa111" }).map((c) => c.publicId)).toEqual(["CN-AAA111"]);
    expect(filterClients(rows, { search: "confirmation" }).map((c) => c.publicId)).toEqual(["CN-CCC333"]);
  });

  it("combines filters rather than replacing one with the next", () => {
    expect(filterClients(rows, { round: "Round 1", department: "Dispute", actionNeeded: true })
      .map((c) => c.publicId)).toEqual(["CN-CCC333"]);
  });

  it("offers only values that are actually present", () => {
    expect(optionsIn(rows, "round")).toEqual(["Round 1", "Round 2"]);
    expect(optionsIn(rows, "currentDepartment")).toEqual(["Dispute", "Support"]);
  });
});
