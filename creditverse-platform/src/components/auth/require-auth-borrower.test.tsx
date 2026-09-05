/**
 * A borrower-only account (external `client` membership and nothing else) is
 * routed from the staff shell to the portal; organization members and BES
 * staff are untouched (Addendum D).
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
      </Routes>
    </MemoryRouter>,
  );

describe("RequireAuth — borrower routing", () => {
  beforeEach(() => {
    authState = { status: "signed-in", mode: "live", hasAnyAccess: true, agencyMembership: null, orgMemberships: [], externalMemberships: [{ role: "client" }] };
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
});
