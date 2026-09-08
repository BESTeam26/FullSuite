/**
 * The screenshot, as a test.
 *
 * Dee, 2026-09-07, with a picture of the CreditOps rail collapsed into a thin
 * strip that was still rendering a paragraph of explanation one character per
 * line, with no visible way back out:
 *
 *   "COLLAPSED MEANS COMPACT. COLLAPSED DOES NOT MEAN SQUEEZE THE FULL UI INTO
 *    A THIN COLUMN."
 *   "EVERY COLLAPSIBLE PANEL MUST ALWAYS PROVIDE AN OBVIOUS WAY TO EXPAND."
 *
 * Both are asserted here rather than trusted, because both were true of the
 * component the day before the screenshot too — right up until somebody put a
 * `<p>` outside the conditional that hid the rest.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { FileText, LayoutDashboard, Building2 } from "lucide-react";
import { ModuleRail, type ModuleRailItem } from "./ModuleRail";
import { readRailCollapsed } from "./use-module-rail";

const onSelect = vi.fn();

const items = (): ModuleRailItem[] => [
  { id: "dash", label: "Dashboard", icon: LayoutDashboard, active: true, onSelect },
  { id: "acme", label: "Acme Fulfilment", icon: Building2, badge: 3,
    badgeLabel: { one: "active client", many: "active clients" }, active: false, onSelect },
];

const EXPLANATION = "Management views aggregate all Partners.";

const rail = () => render(
  <ModuleRail module="testops" title="CreditOps Space" icon={FileText}
    badge={{ value: 3, label: "active" }} items={items()}>
    <p>{EXPLANATION}</p>
    <button type="button">Acme Fulfilment</button>
  </ModuleRail>,
);

beforeEach(() => {
  window.localStorage.clear();
  onSelect.mockClear();
});

describe("collapsing is reversible", () => {
  it("starts expanded and offers a way to collapse", () => {
    rail();
    expect(screen.getByRole("button", { name: "Collapse CreditOps Space navigation" }))
      .toHaveAttribute("aria-expanded", "true");
  });

  it("offers a way BACK once collapsed — the trap Dee hit", () => {
    rail();
    fireEvent.click(screen.getByRole("button", { name: "Collapse CreditOps Space navigation" }));
    const expand = screen.getByRole("button", { name: "Expand CreditOps Space navigation" });
    expect(expand).toBeInTheDocument();
    expect(expand).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expand);
    expect(screen.getByRole("button", { name: "Collapse CreditOps Space navigation" })).toBeInTheDocument();
  });
});

describe("collapsed is a different layout, not a narrower one", () => {
  it("renders NO explanatory prose", () => {
    rail();
    expect(screen.getByText(EXPLANATION)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Collapse/ }));
    /* Not hidden by CSS — absent. There is no width at which it can wrap. */
    expect(screen.queryByText(EXPLANATION)).not.toBeInTheDocument();
  });

  it("keeps every destination as an icon with its label on hover", () => {
    rail();
    fireEvent.click(screen.getByRole("button", { name: /Collapse/ }));
    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acme Fulfilment, 3 active clients" }))
      .toHaveAttribute("title", "Acme Fulfilment — 3 active clients");
  });

  it("says \"1 active client\", not \"1 active clients\"", () => {
    render(
      <ModuleRail module="testops" title="CreditOps Space" icon={FileText} items={[
        { id: "solo", label: "Quentin Grays", icon: Building2, badge: 1,
          badgeLabel: { one: "active client", many: "active clients" },
          active: false, onSelect },
      ]}><p>{EXPLANATION}</p></ModuleRail>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Collapse/ }));
    expect(screen.getByRole("button", { name: "Quentin Grays, 1 active client" })).toBeInTheDocument();
  });

  it("shows the count as a bare number, never as wrapping words", () => {
    rail();
    /* Scoped to the desktop rail: the phone's menu button carries the same
       count, and jsdom applies no media queries so both are in the tree. */
    const desktop = () => within(screen.getByRole("navigation", { name: /CreditOps Space/ }));
    expect(desktop().getByText("3 active")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Collapse/ }));
    expect(desktop().queryByText("3 active")).not.toBeInTheDocument();
    expect(desktop().getByLabelText("3 active")).toHaveTextContent("3");
  });

  it("keeps the current destination obvious in both states", () => {
    rail();
    fireEvent.click(screen.getByRole("button", { name: /Collapse/ }));
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /Acme Fulfilment/ })).not.toHaveAttribute("aria-current");
  });

  it("still navigates from the collapsed rail", () => {
    rail();
    fireEvent.click(screen.getByRole("button", { name: /Collapse/ }));
    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe("the remembered preference cannot trap anybody", () => {
  it("remembers collapsed across a remount", () => {
    rail();
    fireEvent.click(screen.getByRole("button", { name: /Collapse/ }));
    expect(readRailCollapsed("testops")).toBe(true);
  });

  it("is remembered per module — collapsing one says nothing about another", () => {
    rail();
    fireEvent.click(screen.getByRole("button", { name: /Collapse/ }));
    expect(readRailCollapsed("fundingops")).toBe(false);
  });

  it.each(["", "0", "30px", "true", "null", "COLLAPSED"])(
    "falls back to EXPANDED on a stored value of %o",
    (stored) => {
      window.localStorage.setItem("bes.moduleRail.testops", stored);
      expect(readRailCollapsed("testops")).toBe(false);
      rail();
      expect(screen.getByText(EXPLANATION)).toBeInTheDocument();
    },
  );

  it("survives storage being unavailable altogether", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("private window");
    });
    expect(readRailCollapsed("testops")).toBe(false);
    spy.mockRestore();
  });
});

describe("small screens get a drawer, not a permanent strip", () => {
  it("offers a menu button that opens the full navigation", () => {
    rail();
    fireEvent.click(screen.getByRole("button", { name: "Open CreditOps Space navigation" }));
    expect(screen.getByRole("dialog", { name: "CreditOps Space navigation" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
