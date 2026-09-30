/**
 * Only the visible rows of a client list are in the DOM.
 *
 * A 1,472-row table committed whole took 1.9–2.9 s to paint after a click
 * (FullSuite audit, 2026-09-30). This pins the fix: 1,500 clients render
 * as a bounded number of rows, and the phone card list is not built on a
 * desktop. jsdom has no layout, so the virtualizer renders its overscan —
 * the assertion is "far fewer than the clients", not an exact count.
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { OpsClientListTable } from "./OpsClientListTable";
import type { OpsClient } from "@/lib/fulfillment/ops-client-domain";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

const client = (i: number): OpsClient => ({
  id: `c${i}`, name: `Client ${i}`, email: `c${i}@example.test`, phone: null,
  status: "Ready for Round 1", round: "Pre-Round", mode: "outsourcing_only",
  assignedAgent: undefined, lastActivity: "2026-09-01", createdAt: "2026-01-01",
} as unknown as OpsClient);

describe("the client list is virtualized", () => {
  it("renders a bounded number of rows for 1,500 clients, and no phone cards on a desktop", () => {
    const clients = Array.from({ length: 1500 }, (_, i) => client(i));
    const { container } = render(
      <OpsClientListTable
        clients={clients}
        visibleCols={[{ id: "name", label: "Client", defaultWidth: 200, minWidth: 120 } as never]}
        prefs={{ colWidths: {}, sortField: "name", sortDir: "asc" } as never}
        setPrefs={() => {}}
        slaWarningHours={24}
        onOpenClient={() => {}}
        actions={{ updateStatus: async () => {}, updateAssignee: async () => {}, updateContact: async () => {} } as never}
        actor="test"
        statusOptions={[]}
        assignees={[]}
        renderStatusPill={(s) => <span>{s}</span>}
        renderExtraCell={() => null}
      />,
    );
    const rows = container.querySelectorAll("table tbody tr[data-index]").length;
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThan(100);
    expect(container.querySelectorAll("ul li").length).toBe(0);
  });
});
