/**
 * BES-internal routes refuse organization accounts.
 *
 * The regression this prevents: these routes had no role gate at all — the
 * sidebar simply showed customers a different menu, and `RequireAuth` checks
 * only that somebody is signed in. Typing the URL was enough. Hiding a link is
 * presentation, not protection (rule 1).
 *
 * This is the interface half. The database enforces the same boundary
 * independently through RLS, which is why live screens returned nothing to a
 * customer even before this existed; what had nothing protecting it were the
 * placeholder surfaces, and those were the ones naming other customers.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let authState: { isAgencyStaff: boolean; mode: string };

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => authState,
}));

const { RequireAgencyStaff } = await import("./RequireAgencyStaff");

const renderGuard = () =>
  render(
    <MemoryRouter>
      <RequireAgencyStaff label="Attention Center">
        <p>BES internal content</p>
      </RequireAgencyStaff>
    </MemoryRouter>,
  );

describe("RequireAgencyStaff", () => {
  beforeEach(() => {
    authState = { isAgencyStaff: true, mode: "live" };
  });

  it("renders the screen for BES agency staff", () => {
    renderGuard();
    expect(screen.getByText("BES internal content")).toBeTruthy();
  });

  it("refuses an organization user, naming the screen", () => {
    authState = { isAgencyStaff: false, mode: "live" };
    renderGuard();
    expect(screen.queryByText("BES internal content")).toBeNull();
    expect(screen.getByText(/Attention Center is a BES team screen/)).toBeTruthy();
  });

  it("offers a way back rather than a dead end", () => {
    authState = { isAgencyStaff: false, mode: "live" };
    renderGuard();
    expect(screen.getByText("Back to Home").getAttribute("href")).toBe("/app");
  });

  it("stays explorable in demo mode, which has no real memberships", () => {
    authState = { isAgencyStaff: false, mode: "demo" };
    renderGuard();
    expect(screen.getByText("BES internal content")).toBeTruthy();
  });
});
