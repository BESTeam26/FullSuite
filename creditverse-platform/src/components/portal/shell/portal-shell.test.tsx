/**
 * The portal header's search box (2026-10-02). It used to be a box with no
 * handler. It now searches the partner's clients, and a suspended partner —
 * who has no Clients page — is not offered it.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { PortalShell } from "./PortalShell";

vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ displayName: "Kaori", signOut: vi.fn() }) }));
vi.mock("@/lib/use-seo", () => ({ useSeo: () => undefined }));

const summary = { groupId: "g", partnerName: "Acme", suspended: false, activeClients: 3, actionsNeeded: 0, activeServices: 1, unreadMessages: 0, balanceCents: 0, overdueInvoices: 0, hasAgreements: false, hasAccountCredit: false, hasProcessingCredits: false, hasReferrals: false };

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

const renderShell = (s = summary) => render(
  <MemoryRouter initialEntries={["/partner"]}>
    <Routes><Route path="*" element={<PortalShell summary={s} title="Overview"><Where /></PortalShell>} /></Routes>
  </MemoryRouter>);

describe("the portal header search", () => {
  it("takes the partner to their clients, filtered by what they typed", () => {
    renderShell();
    const box = screen.getByRole("searchbox", { name: "Search clients" });
    fireEvent.change(box, { target: { value: "Jordan Reyes" } });
    fireEvent.submit(box.closest("form")!);
    expect(screen.getByTestId("where").textContent).toBe("/partner/clients?q=Jordan%20Reyes");
  });

  it("is not offered to a suspended partner, who has no Clients page", () => {
    renderShell({ ...summary, suspended: true });
    expect(screen.queryByRole("searchbox", { name: "Search clients" })).toBeNull();
  });
});
