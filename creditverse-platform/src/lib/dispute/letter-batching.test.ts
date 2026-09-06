import { describe, expect, it } from "vitest";
import { BATCH_STRATEGIES, buildBatches, type BatchableItem } from "./letter-batching";

const item = (id: string, bureaus: ("EQ" | "EX" | "TU")[], itemType: string, disputeType = "Inaccurate data"): BatchableItem =>
  ({ id, bureaus, itemType, disputeType });

const set: BatchableItem[] = [
  ...Array.from({ length: 7 }, (_, n) => item(`a${n}`, ["EQ", "EX", "TU"], "Account")),
  ...Array.from({ length: 3 }, (_, n) => item(`c${n}`, ["EQ"], "Collection", "Unverified collection")),
  ...Array.from({ length: 6 }, (_, n) => item(`i${n}`, ["EX"], "Inquiry", "No permissible purpose")),
  ...Array.from({ length: 2 }, (_, n) => item(`p${n}`, ["EQ", "EX", "TU"], "Personal", "Wrong identifier")),
];
const bureaus = ["EQ", "EX", "TU"] as const;

describe("an item only goes to a bureau that reports it", () => {
  it("never copies an account into a letter for a bureau that has no such record", () => {
    /* The rule most often broken, and the one that costs a round: a bureau
       asked about something it does not report answers that it has no record. */
    const out = buildBatches(set, [...bureaus], { strategy: "single_per_bureau" });
    const tu = out.find((b) => b.bureau === "TU")!;
    expect(tu.items.every((i) => i.bureaus.includes("TU"))).toBe(true);
    expect(tu.items.map((i) => i.id)).not.toContain("i0");
    expect(tu.items.map((i) => i.id)).not.toContain("c0");
  });
});

describe("strategies", () => {
  it("one letter per bureau produces exactly one each", () => {
    const out = buildBatches(set, [...bureaus], { strategy: "single_per_bureau" });
    expect(out).toHaveLength(3);
    expect(out.find((b) => b.bureau === "EQ")!.items).toHaveLength(12);
  });

  it("one letter per item produces one per item per bureau that reports it", () => {
    const out = buildBatches(set, [...bureaus], { strategy: "one_per_item" });
    /* 7 accounts x3 + 3 collections x1 + 6 inquiries x1 + 2 personals x3 */
    expect(out).toHaveLength(21 + 3 + 6 + 6);
    expect(out.every((b) => b.items.length === 1)).toBe(true);
  });

  it("splits into capped batches and pairs accounts with inquiries", () => {
    const out = buildBatches(set, ["EX"], { strategy: "capped_batches", maxAccountsPerLetter: 5, maxInquiriesPerLetter: 5 });
    /* EX has 7 accounts, 6 inquiries, 2 personals -> two batches. */
    expect(out).toHaveLength(2);
    expect(out[0].items).toHaveLength(5 + 5 + 2);
    expect(out[1].items).toHaveLength(2 + 1);
    expect(out[0].label).toContain("Batch 1 of 2");
  });

  it("groups by dispute type so each letter makes one argument", () => {
    const out = buildBatches(set, ["EQ"], { strategy: "per_dispute_type" });
    expect(out.map((b) => b.label).sort()).toEqual(["Inaccurate data", "Unverified collection", "Wrong identifier"]);
  });

  it("isolates a single kind when that is what the round is for", () => {
    expect(buildBatches(set, [...bureaus], { strategy: "inquiries_only" }).map((b) => b.bureau)).toEqual(["EX"]);
    expect(buildBatches(set, [...bureaus], { strategy: "collections_only" }).map((b) => b.bureau)).toEqual(["EQ"]);
    const accounts = buildBatches(set, ["EQ"], { strategy: "accounts_only" })[0];
    expect(accounts.items.every((i) => i.itemType === "Account")).toBe(true);
  });

  it("produces nothing rather than an empty letter", () => {
    expect(buildBatches([], [...bureaus], { strategy: "single_per_bureau" })).toEqual([]);
    expect(buildBatches(set.filter((i) => i.itemType === "Account"), [...bureaus], { strategy: "inquiries_only" })).toEqual([]);
  });
});

describe("the strategy list a person chooses from", () => {
  it("states the cost of every option, because each one has one", () => {
    for (const s of BATCH_STRATEGIES) {
      expect(s.tradeOff.length).toBeGreaterThan(10);
      expect(s.name).not.toMatch(/attack|strike|shock|conquer/i);
    }
  });
});
