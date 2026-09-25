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
let departments: string[];

vi.mock("@/lib/fulfillment/creditops-access", () => ({
  /* The context gained `myDepartments` when the pane became department-aware
     (Dee's consolidation, 2026-09-11). Management resolves to every
     department, which is what these cases exercise. */
  useCreditOpsAccess: () => ({
    canAccessManagement,
    myDepartments: canAccessManagement
      ? ["Onboarding", "Dispute", "Support", "Complaints", "Bureau Calling"]
      : departments,
  }),
}));
vi.mock("@/lib/data/use-partners", () => ({
  usePartners: () => ({
    partners: [
      { id: "p1", name: "Kevin Hernandez", scopeId: "s1", group: "outsourcing" },
    ],
  }),
}));
/* The queue badges are somebody else's test. Mocked with real-looking counts
   so this one keeps asserting the single thing it is for — that the collapsed
   rail and the expanded tree cannot disagree about what the caller may reach
   — and does not start needing an AuthProvider to do it. */
vi.mock("@/lib/data/use-queue-counts", () => ({
  useQueueCounts: () => ({
    data: {
      Dispute: { department: "Dispute", actionable: 14, waiting: 20 },
      Support: { department: "Support", actionable: 27, waiting: 1 },
    },
  }),
}));
vi.mock("@/lib/fulfillment/creditops-client-store", () => ({
  useCreditOpsStore: () => ({
    clients: [{ outsourcingGroupId: "s1", status: "In Dispute" }],
  }),
}));
/* Categories and moving are a different concern with a different test. Mocked
   so this one keeps asserting the single thing it is for — that the collapsed
   rail and the expanded tree cannot disagree about what the caller may reach —
   without dragging in auth, permissions and a query client to do it. */
vi.mock("./use-category-move", () => ({
  useCategoryMove: () => ({
    categories: [
      { id: "c1", module: "creditops", key: "outsourcing", label: "Outsourcing", sort: 20, isFallback: false, commitmentModel: "per_client_round", isAutomatic: false },
    ],
    canMove: false,
    categoryIdOf: () => "c1",
    draggingId: null,
    setDraggingId: vi.fn(),
    move: vi.fn(),
    followAuto: vi.fn(),
    isMoving: false,
  }),
}));

beforeEach(() => {
  window.localStorage.clear();
  canAccessManagement = true;
  departments = [];
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

  it("keeps the shared workspace for an agent, and withholds management tooling", () => {
    /* SUPERSEDED EXPECTATION, kept deliberately visible: this case used to
       assert that an agent saw NO cross-partner views at all. Dee reversed
       that on 2026-09-11 — "ALL authorized CreditOps members must be able to
       see ALL CreditOps clients in the Main Client List… This is our SHARED
       CREDITOPS CLIENT DIRECTORY" — and narrowed it again on 2026-09-19: the
       directory is partner-scoped and the Dashboard is a manager's surface,
       so an agent's rail is the Main Client List and their own queue; the
       Dashboard, Escalation Queue and CRM Signal Log are management tooling.

       The invariant the file exists for is unchanged: whatever the rule is,
       the collapsed rail and the expanded tree apply the same one. */
    canAccessManagement = false;
    rail();
    fireEvent.click(screen.getByRole("button", { name: /Collapse/ }));
    expect(screen.queryByRole("button", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Main Client List" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Main Client List" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Escalation Queue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "CRM Signal Log" })).not.toBeInTheDocument();
    /* And no queue for a department they are not in. */
    expect(screen.queryByRole("button", { name: "Dispute Queue" })).not.toBeInTheDocument();
    /* Their own partner workspace is still reachable. */
    expect(screen.getByRole("button", { name: /Kevin Hernandez/ })).toBeInTheDocument();
  });

  it("gives an agent the queue for the department they are actually in", () => {
    canAccessManagement = false;
    departments = ["Complaints"];
    rail();
    fireEvent.click(screen.getByRole("button", { name: /Collapse/ }));
    expect(screen.getByRole("button", { name: "Complaints & Mailing" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dispute Queue" })).not.toBeInTheDocument();
  });

  it("renders no explanatory paragraph in either state", () => {
    rail();
    expect(screen.queryByText(/Management views aggregate all Partners/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Collapse/ }));
    expect(screen.queryByText(/Management views aggregate all Partners/)).not.toBeInTheDocument();
  });
});

describe("the queue badges", () => {
  it("puts the actionable count beside the queue it belongs to", () => {
    /* Dee, 2026-09-25: "I don't see the numbers on here." The number is the
       reason somebody picks one queue over another. */
    rail();
    const dispute = screen.getAllByRole("button", { name: /Dispute Queue/ })[0];
    expect(dispute.textContent).toContain("14");
  });

  it("counts what can be WORKED, never what is waiting on somebody else", () => {
    /* Dispute has 14 actionable and 20 waiting on the bureaus. A badge reading
       34 would send an agent to start on files nobody can touch, which is the
       collapse Dee's queue doctrine (§23) exists to forbid. */
    rail();
    const dispute = screen.getAllByRole("button", { name: /Dispute Queue/ })[0];
    expect(dispute.textContent).not.toContain("34");
    expect(dispute.textContent).not.toContain("20");
  });

  it("says nothing where nothing counts it, rather than guessing a zero", () => {
    /* Escalation Queue is not a department, so no count exists for it. A
       badge there would be an invented number. */
    rail();
    const escalation = screen.getAllByRole("button", { name: /Escalation Queue/ })[0];
    expect(escalation.textContent?.replace(/\D/g, "")).toBe("");
  });
});
