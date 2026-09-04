/**
 * Entitlement is enforced at the route, not just in the sidebar.
 *
 * The sidebar already hides modules an organization has not bought, and the
 * database refuses their records. This covers the middle case rule 3 names:
 * a customer typing the URL directly. BES Agency HQ is deliberately exempt —
 * its CreditOps and FundingOps screens are BES's own fulfillment workspace
 * across every customer it serves, gated by the fulfillment relationship in
 * the database rather than by an entitlement on BES itself (rule 16).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RequireEntitlement } from "@/components/auth/RequireEntitlement";
import type { ProductKey } from "@/lib/bes-domain";

let agencyState: {
  viewMode: "agency" | "subaccount";
  enabled: ProductKey[];
};

vi.mock("@/lib/agency-context", () => ({
  useAgency: () => ({
    viewMode: agencyState.viewMode,
    isProductOn: (k: ProductKey) => agencyState.enabled.includes(k),
  }),
}));

const renderGuard = (product: ProductKey) =>
  render(
    <MemoryRouter>
      <RequireEntitlement product={product} label="FundingOps">
        <div>module body</div>
      </RequireEntitlement>
    </MemoryRouter>,
  );

describe("RequireEntitlement", () => {
  it("renders the module for an entitled organization", () => {
    agencyState = { viewMode: "subaccount", enabled: ["creditOps", "fundingOps"] };
    renderGuard("fundingOps");
    expect(screen.getByText("module body")).toBeInTheDocument();
  });

  it("refuses a module the organization has not bought", () => {
    agencyState = { viewMode: "subaccount", enabled: ["creditOps"] };
    renderGuard("fundingOps");
    expect(screen.queryByText("module body")).not.toBeInTheDocument();
    expect(
      screen.getByText(/FundingOps is not enabled for this organization/i),
    ).toBeInTheDocument();
  });

  it("refuses when the organization has no entitlements at all — default deny", () => {
    agencyState = { viewMode: "subaccount", enabled: [] };
    renderGuard("creditOps");
    expect(screen.queryByText("module body")).not.toBeInTheDocument();
  });

  it("does not gate BES Agency HQ, whose access is the fulfillment relationship", () => {
    agencyState = { viewMode: "agency", enabled: [] };
    renderGuard("fundingOps");
    expect(screen.getByText("module body")).toBeInTheDocument();
  });

  it("offers a way back rather than a dead end", () => {
    agencyState = { viewMode: "subaccount", enabled: [] };
    renderGuard("fundingOps");
    expect(screen.getByText(/Back to Home/i)).toBeInTheDocument();
  });
});
