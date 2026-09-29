/**
 * The report view draws the document and computes nothing.
 *
 * Dee, 2026-09-29: "the numbers must come from the database… AI must NOT
 * calculate or invent production totals… The production columns should be
 * dynamic based on the department/team, not hardcoded."
 *
 * Two things this pins that a screenshot cannot:
 *
 *   · The category columns are whatever the document says. The fixture uses
 *     invented names — "Widgets Done", "Gizmos Audited" — so if a real
 *     department name were hardcoded anywhere in the view, this fails.
 *   · The totals shown are the DOCUMENT's totals. The fixture's rows sum to
 *     a different number on purpose; the view must show the document's
 *     figure, proving it never adds anything up itself. If a figure is wrong
 *     on screen, it is wrong in the database, which is where to look.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { EodReportView } from "./EodReportCard";
import type { EodReportDoc } from "@/lib/data/use-eod-report";

const team = (over: Partial<EodReportDoc> = {}): EodReportDoc => ({
  level: "team",
  work_date: "2026-09-29",
  timezone: "America/New_York",
  scope: { id: "t1", name: "Widget Processing Team", service: "creditops" },
  lead: { id: "l1", name: "Dana Lead" },
  categories: [
    { key: "widgets", label: "Widgets Done", position: 1 },
    { key: "gizmos",  label: "Gizmos Audited", position: 2 },
  ],
  rows: [
    { id: "a", name: "Ada Agent", role: "Processor", submitted: true,
      categories: { widgets: 9, gizmos: 0 }, total: 9, notes: "9 - FTC (identity theft)", blockers: null },
    { id: "b", name: "Ben Agent", role: "Junior Processor", submitted: false,
      categories: { widgets: 3, gizmos: 2 }, total: 5, notes: null, blockers: "Waiting on monitoring login" },
  ],
  groups: [
    { key: "widgets", label: "Widgets Done", position: 1,
      lines: [{ name: "Ada Agent", units: 9 }, { name: "Ben Agent", units: 3 }], total: 12 },
    { key: "gizmos", label: "Gizmos Audited", position: 2,
      lines: [{ name: "Ben Agent", units: 2 }], total: 2 },
  ],
  /* Deliberately NOT the sum of the rows (9 + 5 = 14). The view must show 99. */
  totals: { categories: { widgets: 12, gizmos: 2 }, total: 99, members: 2, submitted: 1, not_submitted: 1 },
  attention: [{ name: "Ben Agent", unit: "Widget Processing Team", blockers: "Waiting on monitoring login", help_needed: null }],
  children: [],
  built_at: "2026-09-29T22:00:00Z",
  ...over,
});

describe("the columns are the document's", () => {
  it("draws every category the document names, invented ones included", () => {
    render(<EodReportView doc={team()} />);
    const table = screen.getByRole("table", { name: /Agent submissions/ });
    expect(within(table).getByText("Widgets Done")).toBeInTheDocument();
    expect(within(table).getByText("Gizmos Audited")).toBeInTheDocument();
    /* And nothing the view might have known on its own. */
    expect(within(table).queryByText("Complaints")).not.toBeInTheDocument();
  });

  it("shows a zero-output category at team level, matching the reference report", () => {
    /* Ada has 0 Gizmos; the column still exists and reads 0. */
    render(<EodReportView doc={team()} />);
    const ada = screen.getByText("Ada Agent").closest("tr")!;
    expect(within(ada).getAllByText("0").length).toBeGreaterThan(0);
  });

  it("hides a category with no output above team level, where twelve empty columns would be noise", () => {
    const dept = team({
      level: "department",
      scope: { id: "d1", name: "Widget Department", service: "creditops" },
      rows: [{ id: "t1", name: "Widget Processing Team", role: "Team", members: 2, submitted: 1,
               categories: { widgets: 12 }, total: 12 }],
      totals: { categories: { widgets: 12, gizmos: 0 }, total: 12, members: 2, submitted: 1, not_submitted: 1 },
    });
    render(<EodReportView doc={dept} />);
    const table = screen.getByRole("table", { name: /Team submissions/ });
    expect(within(table).getByText("Widgets Done")).toBeInTheDocument();
    expect(within(table).queryByText("Gizmos Audited")).not.toBeInTheDocument();
  });
});

describe("the numbers are the document's, never recomputed", () => {
  it("shows the document's total even when the rows add up to something else", () => {
    render(<EodReportView doc={team()} />);
    /* 99 is nowhere in the rows (9 and 5). It is only in totals.total. */
    expect(screen.getByText("99")).toBeInTheDocument();
    expect(screen.queryByText("14")).not.toBeInTheDocument();
  });

  it("writes the summary lines and group totals from the groups block", () => {
    render(<EodReportView doc={team()} />);
    expect(screen.getByText("• Ada Agent completed 9 Widgets Done")).toBeInTheDocument();
    expect(screen.getByText("• Ben Agent completed 2 Gizmos Audited")).toBeInTheDocument();
    expect(screen.getByText("Total Widgets Done Output: 12")).toBeInTheDocument();
    expect(screen.getByText("Total Gizmos Audited Output: 2")).toBeInTheDocument();
  });

  it("carries the agent's own words and blockers", () => {
    render(<EodReportView doc={team()} />);
    expect(screen.getByText("9 - FTC (identity theft)")).toBeInTheDocument();
    expect(screen.getByText(/Blocker: Waiting on monitoring login/)).toBeInTheDocument();
    /* The attention section names him again, on purpose (Dee: its own section). */
    expect(screen.getByText(/Blockers \/ attention needed/)).toBeInTheDocument();
  });
});

describe("drill-down", () => {
  it("keeps the level below collapsed until opened, then draws it from embedded data", () => {
    const child = team();
    const dept = team({
      level: "department",
      scope: { id: "d1", name: "Widget Department", service: "creditops" },
      rows: [{ id: "t1", name: "Widget Processing Team", role: "Team", members: 2, submitted: 1,
               categories: { widgets: 12, gizmos: 2 }, total: 14 }],
      children: [child],
    });
    render(<EodReportView doc={dept} />);
    /* The heading names what the children are — a department's are teams. */
    expect(screen.getByText("Team reports")).toBeInTheDocument();
    /* Collapsed: the child's agents are not in the DOM. */
    expect(screen.queryByText("Ada Agent")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Widget Processing Team/ }));
    expect(screen.getByText("Ada Agent")).toBeInTheDocument();
  });
});
