/**
 * Where an authenticated person actually belongs.
 *
 * A borrower-only account (external `client` membership and nothing else) is
 * routed from the staff shell to the portal; organization members and BES
 * staff are untouched (Addendum D). A partner-contact-only account goes to
 * its partner portal — the case Dee's live invitation test caught, where the
 * staff shell told a correctly activated partner they had no workspace.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

let authState: Record<string, unknown>;
vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => authState }));

const { RequireAuth } = await import("./RequireAuth");

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/*" element={<RequireAuth><p>Staff shell</p></RequireAuth>} />
        <Route path="/portal/funding" element={<p>Borrower portal</p>} />
        <Route path="/partner" element={<p>Partner portal</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe("RequireAuth — borrower routing", () => {
  beforeEach(() => {
    /* `partnerContacts` joined the context when a Partner Portal user stopped
       being told they had no workspace (2026-09-12). A borrower has none. */
    authState = { status: "signed-in", mode: "live", hasAnyAccess: true, agencyMembership: null, orgMemberships: [], externalMemberships: [{ role: "client" }], partnerContacts: [] };
  });
  it("sends a borrower-only account from /app to the portal", () => {
    renderAt("/app/home");
    expect(screen.getByText("Borrower portal")).toBeTruthy();
    expect(screen.queryByText("Staff shell")).toBeNull();
  });
  it("leaves an organization member in the shell", () => {
    authState = { ...authState, orgMemberships: [{ role: "credit_processor" }] };
    renderAt("/app/home");
    expect(screen.getByText("Staff shell")).toBeTruthy();
  });
  it("leaves BES staff in the shell even with a client membership", () => {
    authState = { ...authState, agencyMembership: { role: "agency_owner" } };
    renderAt("/app/home");
    expect(screen.getByText("Staff shell")).toBeTruthy();
  });
  it("a lender or partner external membership is not a borrower", () => {
    authState = { ...authState, externalMemberships: [{ role: "client" }, { role: "lender" }] };
    renderAt("/app/home");
    expect(screen.getByText("Staff shell")).toBeTruthy();
  });

  it("sends a partner-contact-only account from /app to their partner portal", () => {
    /* Dee's live test, 2026-09-12: a correctly invited, correctly activated
       Partner Portal user was told "this account has not been added to an
       agency or organization yet" — true, and the wrong question. Their whole
       authorization is a partner_contacts row. */
    authState = {
      ...authState,
      externalMemberships: [],
      partnerContacts: [{ id: "pc1", group_id: "g1", agency_id: "a1", is_primary: true, status: "active" }],
    };
    renderAt("/app");
    expect(screen.getByText("Partner portal")).toBeInTheDocument();
  });

  it("leaves somebody who is BOTH staff and a partner contact in the workspace", () => {
    /* One identity, several contexts. Being a partner's contact must not
       evict a BES employee from their own workspace; they reach the portal by
       its own URL. */
    authState = {
      ...authState,
      agencyMembership: { role: "agency_user" },
      externalMemberships: [],
      partnerContacts: [{ id: "pc1", group_id: "g1", agency_id: "a1", is_primary: true, status: "active" }],
    };
    renderAt("/app");
    expect(screen.getByText("Staff shell")).toBeInTheDocument();
  });
});
