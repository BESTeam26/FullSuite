import { describe, expect, it } from "vitest";
import { feedKindLabel, isExternalHref, toFeedItem } from "./partner-feed";

describe("partner feed shaping", () => {
  it("labels every kind the database writes, and anything unknown plainly", () => {
    expect(feedKindLabel("client_status")).toBe("Client update");
    expect(feedKindLabel("deliverable")).toBe("Deliverable");
    expect(feedKindLabel("something_new")).toBe("Update");
  });

  it("treats only http(s) links as leaving the portal", () => {
    expect(isExternalHref("https://drive.example.com/x")).toBe(true);
    expect(isExternalHref("/partner/billing")).toBe(false);
    expect(isExternalHref("javascript:alert(1)")).toBe(false);
    expect(isExternalHref(null)).toBe(false);
  });

  it("maps a database row", () => {
    expect(toFeedItem({ kind: "billing", happened_at: "2026-10-01T10:00:00Z", title: "Payment received", detail: null, href: "/partner/billing" }))
      .toEqual({ kind: "billing", happenedAt: "2026-10-01T10:00:00Z", title: "Payment received", detail: null, href: "/partner/billing" });
  });
});
