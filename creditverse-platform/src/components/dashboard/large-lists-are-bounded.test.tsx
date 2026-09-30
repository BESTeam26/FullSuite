/**
 * Dee's rule (2026-09-30): any FullSuite list expected to exceed a few
 * hundred rows renders only what is visible plus a small buffer, and never
 * a hidden desktop/mobile duplicate at the same time.
 *
 * jsdom has no layout, so a virtualized list renders its first screen plus
 * overscan; the assertion is "far fewer than the rows", never an exact
 * count. Every list converted under the rule gets a case here so it cannot
 * quietly go back to committing 1,000+ DOM rows.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { DivisionTable } from "./DivisionLayout";
import { OpsClientListGrid, GRID_REVEAL_STEP } from "./fulfillment/OpsClientListGrid";
import type { OpsClient } from "@/lib/fulfillment/ops-client-domain";

const mobile = vi.hoisted(() => ({ value: false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mobile.value }));

const ROWS = 1500;
const rows = Array.from({ length: ROWS }, (_, i) => [`Row ${i}`, "Dispute", "Open", "Today"]);

describe("DivisionTable (queues, My Work, dashboards)", () => {
  beforeEach(() => { mobile.value = false; });

  it("renders a bounded number of table rows on a desktop, and no cards", () => {
    const { container } = render(<DivisionTable columns={["Task", "Division", "Status", "Due"]} rows={rows} />);
    const trs = container.querySelectorAll("tbody tr[data-index]").length;
    expect(trs).toBeGreaterThan(0);
    expect(trs).toBeLessThan(100);
    expect(container.querySelectorAll("ul li").length).toBe(0);
  });

  it("renders a bounded number of cards on a phone, and no table", () => {
    mobile.value = true;
    const { container } = render(<DivisionTable columns={["Task", "Division", "Status", "Due"]} rows={rows} />);
    const cards = container.querySelectorAll("li[data-index]").length;
    expect(cards).toBeGreaterThan(0);
    expect(cards).toBeLessThan(100);
    expect(container.querySelectorAll("table").length).toBe(0);
  });

  it("keeps the deep-link highlight on the row's real index", () => {
    const { container } = render(<DivisionTable columns={["Task", "Division"]} rows={rows} activeRow={3} />);
    expect(container.querySelector('tr[data-index="3"]')?.getAttribute("aria-current")).toBe("true");
  });
});

const client = (i: number): OpsClient => ({
  id: `c${i}`, name: `Client ${i}`, email: `c${i}@example.test`, phone: null,
  status: "Ready for Round 1", round: "Pre-Round", mode: "outsourcing_only",
} as unknown as OpsClient);

describe("OpsClientListGrid (the card view of the Main Client List)", () => {
  it("shows one reveal step of cards, then more on request, never all 1,500 at once", () => {
    const clients = Array.from({ length: ROWS }, (_, i) => client(i));
    const { container, getByRole } = render(
      <OpsClientListGrid clients={clients} onOpenClient={() => {}} renderStatus={() => null} renderSecondary={() => null} renderOpenCount={() => null} />,
    );
    const cards = () => container.querySelectorAll(".grid > div").length;
    expect(cards()).toBe(GRID_REVEAL_STEP);
    fireEvent.click(getByRole("button", { name: /show more/i }));
    expect(cards()).toBe(GRID_REVEAL_STEP * 2);
  });

  it("has no Show more once every client is shown", () => {
    const { queryByRole } = render(
      <OpsClientListGrid clients={[client(1), client(2)]} onOpenClient={() => {}} renderStatus={() => null} renderSecondary={() => null} renderOpenCount={() => null} />,
    );
    expect(queryByRole("button", { name: /show more/i })).toBeNull();
  });
});
