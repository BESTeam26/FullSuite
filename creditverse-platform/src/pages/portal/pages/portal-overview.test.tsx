/**
 * PARTNER_PORTAL_DOCTRINE (Dee, 2026-10-01): the Overview is the partner's
 * command centre. Each doctrine item is drawn from a partner-scoped
 * function and nothing else; this pins that the page shows them.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PortalOverview } from "./PortalOverview";

const ok = <T,>(data: T) => ({ data, isLoading: false, isPending: false, isError: false, error: null, status: "success" });
vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ mode: "live", status: "signed-in", user: { id: "p1" } }) }));
vi.mock("@/lib/supabase/client", () => ({ requireSupabase: () => ({ rpc: async () => ({ data: [{ id: "a1", title: "Office closed Oct 10", pinned: true, published_at: "2026-10-01T10:00:00Z" }], error: null }) }) }));
vi.mock("@/lib/data/portal-billing", () => ({ fetchPortalBilling: async () => ({ groupId: "g", partnerName: "Test Partner", balanceCents: 20000, overdueCents: 20000, overdueInvoices: 1, nextBillingOn: "2026-10-07", nextBillingCents: 42500, paymentMethods: "card", suspended: false, suspendedAt: null, suspensionDetail: null }) }));
vi.mock("@/lib/data/use-partner-portal-actions", () => ({
  useMyPartnerActionsNeeded: () => ok([{ kind: "document_required", source: "action", sourceId: "x1", title: "Upload missing document", detail: null, clientName: "Jensen Cedacero", requestedAt: "2026-10-01", dueOn: null, href: null }]),
  useMyPartnerFeed: () => ok([{ kind: "client_status", title: "Mikia Edwards moved to Completed", detail: null, href: "/partner/clients/C-1", happenedAt: "2026-09-29T10:00:00Z" }]),
}));
vi.mock("@/lib/data/use-agency-partners", () => ({
  useMyPartnerClients: () => ok([{ publicId: "c1", name: "Aaron Hills", status: "Processing", round: "R1", openItems: 0, lastActivityAt: "2026-10-01T10:00:00Z" }]),
  useMyPartnerProjects: () => ok([{ id: "pr1", name: "BES CRM Setup", businessName: null, engines: [], progress: 50, journey: "build", targetGoLive: "2026-11-01", wentLiveAt: null, openRequirements: 2 }]),
}));
vi.mock("@/lib/data/use-portal-conversations", () => ({
  useMyPartnerServices: () => ok([{ engagementId: "e1", module: "creditops", moduleLabel: "CreditOps Fulfillment", serviceLabel: "CreditOps Fulfillment", status: "Active", startedOn: "2026-08-17", endsOn: null, milestone: null, openItems: 0, linkKind: null }]),
  useMyPartnerTeam: () => ok([{ userId: "k", name: "Kaori Gallardo", roleLabel: "Partner Success Manager", isPrimary: true }]),
}));
vi.mock("@/lib/data/use-channels", () => ({ useChannels: () => ok([{ id: "ch1", name: "Direct message", displayName: "Kaori Gallardo", unread: 1, lastMessageAuthor: "Kaori", lastMessageText: "Here's the updated progress" }]) }));

const summary = { groupId: "g", partnerName: "Test Partner", suspended: false, activeClients: 12, actionsNeeded: 3, activeServices: 3, unreadMessages: 12, balanceCents: 20000, overdueInvoices: 1, hasAgreements: false, hasAccountCredit: false, hasProcessingCredits: false, hasReferrals: false };

describe("the Partner Overview", () => {
  it("shows every doctrine item: contact, services, clients, actions, updates, billing, messages, project status", async () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><PortalOverview summary={summary} /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByText("Your BES contact")).toBeTruthy();
    expect(screen.getByText("Kaori Gallardo", { selector: "p" })).toBeTruthy();
    expect(screen.getByText(/CreditOps Fulfillment/)).toBeTruthy();
    expect(screen.getByText("BES CRM Setup")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText(/2 items BES needs from you/)).toBeTruthy();
    expect(screen.getByText(/Upload missing document/)).toBeTruthy();
    expect(screen.getByText("Aaron Hills")).toBeTruthy();
    expect(screen.getByText(/Here's the updated progress/)).toBeTruthy();
    expect(await screen.findByText("Office closed Oct 10")).toBeTruthy();
    expect(await screen.findByText("$425.00")).toBeTruthy();
    expect(screen.getByText("Next billing")).toBeTruthy();
    expect(screen.getByText("Mikia Edwards moved to Completed").closest("a")?.getAttribute("href")).toBe("/partner/clients/C-1");
  });
});
