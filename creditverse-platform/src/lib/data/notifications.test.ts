import { describe, expect, it } from "vitest";
import { hrefForEntity, mapNotification } from "./notifications";

describe("hrefForEntity", () => {
  it("addresses the three canonical record types", () => {
    expect(hrefForEntity("work_item", "abc")).toBe("/app/my-work?item=abc");
    expect(hrefForEntity("fulfillment_client", "abc")).toBe(
      "/app/creditops?client=abc",
    );
    expect(hrefForEntity("funding_client", "abc")).toBe(
      "/app/fundingops?client=abc",
    );
  });

  it("opens a conversation and an announcement (0218)", () => {
    expect(hrefForEntity("channel", "c1")).toBe("/app/channels?channel=c1");
    expect(hrefForEntity("announcement", "a1")).toBe(
      "/app/announcements?announcement=a1",
    );
  });

  it("returns null for entities no surface can open by URL", () => {
    expect(hrefForEntity("eod_submission", "x")).toBeNull();
    expect(hrefForEntity("funding_file", "x")).toBeNull();
  });

  it("URL-encodes the id", () => {
    expect(hrefForEntity("work_item", "a b")).toBe("/app/my-work?item=a%20b");
  });
});

describe("mapNotification", () => {
  it("maps the row without inventing fields", () => {
    const n = mapNotification({
      id: 7,
      recipient_id: "r",
      actor_id: null,
      agency_id: "a",
      organization_id: null,
      kind: "assigned",
      entity_type: "work_item",
      entity_id: "w1",
      entity_label: "Pull report",
      activity_id: 3,
      visibility: "bes_internal",
      title: "Assigned to you",
      detail: null,
      created_at: "2026-09-04T00:00:00Z",
      read_at: null,
    });
    expect(n).toEqual({
      id: 7,
      kind: "assigned",
      title: "Assigned to you",
      detail: null,
      entityType: "work_item",
      entityId: "w1",
      entityLabel: "Pull report",
      actorId: null,
      createdAt: "2026-09-04T00:00:00Z",
      readAt: null,
    });
  });
});
