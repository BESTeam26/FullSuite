/**
 * PARTNER_PORTAL_DOCTRINE (Dee, 2026-10-01): Updates is the clean external
 * feed — client status, project and milestone, deliverable, billing and
 * account updates — each line linking to where it lives. A filter asks the
 * database for one group; it never filters a truncated list in the browser.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PortalUpdates } from "./PortalUpdates";

const ok = <T,>(data: T) => ({ data, isLoading: false, isPending: false, isError: false, error: null, status: "success" });
const feedCalls: (string | null)[] = [];
vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ mode: "live", status: "signed-in", user: { id: "p1" } }) }));
vi.mock("@/lib/supabase/client", () => ({ requireSupabase: () => ({ rpc: async () => ({ data: [], error: null }) }) }));
vi.mock("@/lib/data/use-partner-portal-actions", () => ({
  useMyPartnerFeed: (group: string | null) => {
    feedCalls.push(group);
    return ok([
      { kind: "client_status", title: "Esbon Gumbs moved to Round 1 Sent", detail: null, href: "/partner/clients/C-9", happenedAt: "2026-09-29T11:00:00Z" },
      { kind: "deliverable", title: "Delivered: Website mockup", detail: "8F Solutions build", href: "https://drive.example.com/mockup", happenedAt: "2026-09-28T11:00:00Z" },
      { kind: "billing", title: "Invoice INV-1001 issued", detail: "425.00 USD · due Oct 7, 2026", href: "/partner/billing", happenedAt: "2026-09-27T11:00:00Z" },
    ]);
  },
}));

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient()}><MemoryRouter><PortalUpdates /></MemoryRouter></QueryClientProvider>);

describe("the Partner Updates page", () => {
  beforeEach(() => { feedCalls.length = 0; });

  it("says each thing once, with what kind it is and where it lives", () => {
    renderPage();
    expect(screen.getByText("Esbon Gumbs moved to Round 1 Sent").closest("a")?.getAttribute("href")).toBe("/partner/clients/C-9");
    expect(screen.getByText(/Invoice INV-1001 issued/).closest("a")?.getAttribute("href")).toBe("/partner/billing");
    expect(screen.getByText(/Client update/)).toBeTruthy();
    expect(screen.getByText(/425\.00 USD · due Oct 7, 2026/)).toBeTruthy();
  });

  it("opens a deliverable link in a new tab, safely", () => {
    renderPage();
    const link = screen.getByText("Delivered: Website mockup").closest("a")!;
    expect(link.getAttribute("href")).toBe("https://drive.example.com/mockup");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("asks the database for one group when a filter is chosen", () => {
    renderPage();
    expect(feedCalls.at(-1)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Billing" }));
    expect(feedCalls.at(-1)).toBe("billing");
    expect(screen.getByRole("button", { name: "Billing" }).getAttribute("aria-pressed")).toBe("true");
  });
});
