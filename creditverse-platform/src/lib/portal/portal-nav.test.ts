import { describe, expect, it } from "vitest";
import { PORTAL_NAV, activePage, badgeFor, navFor, type PortalSummary } from "./portal-nav";

const summary = (over: Partial<PortalSummary> = {}): PortalSummary => ({
  groupId: "g1", partnerName: "Apex", suspended: false,
  activeClients: 18, actionsNeeded: 2, activeServices: 3, unreadMessages: 4,
  balanceCents: 42500, overdueInvoices: 2,
  hasAgreements: true, hasAccountCredit: true, hasProcessingCredits: true, hasReferrals: false,
  ...over,
});

describe("the Partner Portal's navigation", () => {
  it("puts Clients before Billing", () => {
    /* Dee, 2026-09-13: "the Partner relationship is operational first,
       financial second." A portal that opens on a balance reads as a debt
       collector. */
    const ids = navFor(summary()).map((i) => i.id);
    expect(ids.indexOf("clients")).toBeLessThan(ids.indexOf("billing"));
  });

  it("follows Dee's order exactly", () => {
    expect(PORTAL_NAV.map((i) => i.id)).toEqual([
      "overview", "clients", "services", "actions", "messages",
      "billing", "agreements", "files", "referrals", "updates", "settings",
    ]);
  });

  it("never promotes Account Credit or Processing Credits to the main menu", () => {
    /* They belong inside Billing. Two money concepts in the top-level menu is
       exactly the hierarchy Dee asked me to undo. */
    const labels = PORTAL_NAV.map((i) => i.label.toLowerCase());
    expect(labels.some((l) => l.includes("credit"))).toBe(false);
    expect(labels.some((l) => l.includes("invoice"))).toBe(false);
    expect(labels.some((l) => l.includes("payment"))).toBe(false);
  });

  it("hides Referrals when there is no referral relationship", () => {
    expect(navFor(summary({ hasReferrals: false })).map((i) => i.id)).not.toContain("referrals");
    expect(navFor(summary({ hasReferrals: true })).map((i) => i.id)).toContain("referrals");
  });

  it("hides Agreements only when there has genuinely never been one", () => {
    expect(navFor(summary({ hasAgreements: false })).map((i) => i.id)).not.toContain("agreements");
    expect(navFor(summary({ hasAgreements: true })).map((i) => i.id)).toContain("agreements");
  });

  it("keeps a suspended partner's Billing, Agreements, Messages and Settings", () => {
    /* The rule that stops a suspension becoming permanent: they must be able
       to reach the screen where they can pay. */
    const ids = navFor(summary({ suspended: true })).map((i) => i.id);
    for (const kept of ["overview", "billing", "agreements", "messages", "settings", "actions", "updates"]) {
      expect(ids).toContain(kept);
    }
  });

  it("takes the service pages away while suspended, rather than greying them", () => {
    const ids = navFor(summary({ suspended: true })).map((i) => i.id);
    for (const gone of ["clients", "services", "files"]) {
      expect(ids).not.toContain(gone);
    }
  });

  it("shows a badge only when there is something to say", () => {
    const nav = navFor(summary({ actionsNeeded: 0, unreadMessages: 4, overdueInvoices: 0 }));
    const by = (id: string) => nav.find((i) => i.id === id)!;
    expect(badgeFor(by("actions"), summary({ actionsNeeded: 0 }))).toBeNull();
    expect(badgeFor(by("messages"), summary({ unreadMessages: 4 }))).toBe(4);
    expect(badgeFor(by("billing"), summary({ overdueInvoices: 0 }))).toBeNull();
    expect(badgeFor(by("billing"), summary({ overdueInvoices: 2 }))).toBe(2);
  });

  it("matches the longest path, so /partner does not claim every page", () => {
    expect(activePage("/partner")).toBe("overview");
    expect(activePage("/partner/clients")).toBe("clients");
    expect(activePage("/partner/clients/abc-123")).toBe("clients");
    expect(activePage("/partner/billing")).toBe("billing");
    expect(activePage("/partner/nowhere")).toBe("overview");
  });

  it("returns nothing at all before the partner is known", () => {
    /* Drawing a menu from an assumed partner is how a suspended account sees
       links it is about to lose. */
    expect(navFor(null)).toEqual([]);
  });
});
