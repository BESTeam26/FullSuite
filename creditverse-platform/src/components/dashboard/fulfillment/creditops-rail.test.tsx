/**
 * The collapsed rail must not become a way to see what you may not see.
 *
 * Dee, 2026-09-07 §26/§28: expanded and collapsed render from the SAME
 * authorized list. The failure mode this guards is quiet — a destination is
 * removed from the expanded tree, the collapsed rail keeps its own copy, and
 * an agent still has an icon that opens a management view. Nothing looks
 * wrong until somebody clicks it.
 *
 * Authorization itself is the database's; this asserts the two presentations
 * cannot disagree about what the caller was given.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CreditOpsTreeSidebar } from "./CreditOpsTreeSidebar";

let canAccessManagement: boolean;

vi.mock("@/lib/fulfillment/creditops-access", () => ({
  useCreditOpsAccess: () => ({ canAccessManagement }),
}));
vi.mock("@/lib/data/use-partners", () => ({
  usePartners: () => ({
    partners: [
      { id: "p1", name: "Kevin Hernandez", scopeId: "s1", group: "outsourcing" },
    ],
  }),
}));
vi.mock("@/lib/fulfillment/creditops-client-store", () => ({
  useCreditOpsStore: () => ({
    clients: [{ outsourcingGroupId: "s1", status: "In Dispute" }],
  }),
}));

beforeEach(() => {
  window.localStorage.clear();
  canAccessManagement = true;
});

const rail = () =>
  render(<CreditOpsTreeSidebar selected={{ kind: "management", view: "mgmt-dashboard" }}
    onSelect={vi.fn()} />);

describe("the collapsed rail carries the same authorization as the tree", () => {
  it("shows management destinations to somebody who has them", () => {
    rail();
    fireEvent.click(screen.getByRole("button", { name: /Collapse/ }));
    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kevin Hernandez/ })).toBeInTheDocument();
  });

  it("shows NONE of them to an agent without management access", () => {
    canAccessManagement = false;
    rail();
    fireEvent.click(screen.getByRole("button", { name: /Collapse/ }));
    expect(screen.queryByRole("button", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Main Client List" })).not.toBeInTheDocument();
    /* Their own partner workspace is still reachable — the rail is narrower,
       not emptier than their authorization. */
    expect(screen.getByRole("button", { name: /Kevin Hernandez/ })).toBeInTheDocument();
  });

  it("renders no explanatory paragraph in either state", () => {
    rail();
    expect(screen.queryByText(/Management views aggregate all Partners/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Collapse/ }));
    expect(screen.queryByText(/Management views aggregate all Partners/)).not.toBeInTheDocument();
  });
});
