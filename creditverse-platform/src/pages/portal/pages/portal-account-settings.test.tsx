/**
 * PARTNER_PORTAL_DOCTRINE (Dee, 2026-10-01), Account Settings: business info,
 * contacts, notification preferences, password/security, portal users. This
 * pins that each is on the page, that portal access is shown per contact but
 * granted only by asking BES, and that notifications describe only what is
 * really sent — no switch that controls nothing.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PortalAccountSettings } from "./PortalAccountSettings";

const ok = <T,>(data: T) => ({ data, isLoading: false, isPending: false, isError: false, error: null, status: "success" });
vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ mode: "live", status: "signed-in", user: { id: "u-kaori", email: "kaori@acme.example" } }) }));
vi.mock("@/lib/data/portal-billing", () => ({ fetchPortalBillingContact: async () => ({ name: "Acme Billing", email: "billing@acme.example" }) }));
vi.mock("@/lib/data/use-agency-partners", () => ({
  useMyPartner: () => ok({ id: "g1", name: "Acme Credit", legalBusinessName: "Acme Credit LLC", dbaName: "Acme", contactEmail: "hello@acme.example" }),
  usePartnerContacts: () => ok([
    { id: "c1", groupId: "g1", fullName: "Kaori Tan", email: "kaori@acme.example", phone: null, title: "Owner", isPrimary: true, userId: "u-kaori", status: "active", invitedAt: "2026-09-01", activatedAt: "2026-09-02" },
    { id: "c2", groupId: "g1", fullName: "Sam Lee", email: "sam@acme.example", phone: "555-0100", title: "Ops", isPrimary: false, userId: null, status: "active", invitedAt: "2026-09-20", activatedAt: null },
    { id: "c3", groupId: "g1", fullName: "Old Contact", email: "old@acme.example", phone: null, title: null, isPrimary: false, userId: null, status: "archived", invitedAt: null, activatedAt: null },
  ]),
}));
vi.mock("@/lib/data/use-partner-credentials", () => ({
  useCredentialPlatforms: () => ok([]),
  useMyPartnerCredentials: () => ok([]),
  useArchiveCredential: () => ({ mutate: vi.fn(), isPending: false }),
}));

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient()}><MemoryRouter><PortalAccountSettings /></MemoryRouter></QueryClientProvider>);

describe("the Partner Account Settings", () => {
  it("has every doctrine section, in order, with connected systems last", () => {
    renderPage();
    const headings = screen.getAllByRole("heading").map((h) => h.textContent ?? "");
    const at = (t: RegExp) => headings.findIndex((h) => t.test(h));
    expect(at(/Business information/)).toBeGreaterThanOrEqual(0);
    expect(at(/Your details/)).toBeGreaterThan(at(/Business information/));
    expect(at(/Contacts and portal users/)).toBeGreaterThan(at(/Your details/));
    expect(at(/Notifications/)).toBeGreaterThan(at(/Contacts and portal users/));
    expect(at(/^Password$/)).toBeGreaterThan(at(/Notifications/));
    expect(at(/Connected systems/)).toBeGreaterThan(at(/^Password$/));
  });

  it("shows each contact's portal access, hides archived contacts, and sends changes to BES", () => {
    renderPage();
    expect(screen.getByText("Sam Lee")).toBeTruthy();
    expect(screen.getByText("Portal active")).toBeTruthy();
    expect(screen.getByText(/Invited — not activated yet/)).toBeTruthy();
    expect(screen.queryByText("Old Contact")).toBeNull();
    expect(screen.getByText("(you)")).toBeTruthy();
    expect(screen.getByText(/Ask BES to add or remove someone/).closest("a")?.getAttribute("href"))
      .toBe("/partner/messages?topic=support");
  });

  it("says where billing email goes, and offers no switch that controls nothing", async () => {
    renderPage();
    expect(await screen.findByText(/Acme Billing · billing@acme\.example/)).toBeTruthy();
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(screen.getByText(/Email alerts for these are not available yet/)).toBeTruthy();
  });

  it("lets the person change their password or sign out other devices", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /Change password/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sign out other devices/ })).toBeTruthy();
  });
});
