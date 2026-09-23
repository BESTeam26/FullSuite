/**
 * The strip's numbers and the list's rows are one answer.
 *
 * A card reading "13 Overdue" that filters to twelve rows is worse than no
 * card: somebody reconciles it by hand, twice, and then stops trusting the
 * screen. Both come from `creditops_coverage_states()`, and these check the
 * arithmetic that sits between.
 */
import { describe, expect, it } from "vitest";
import { COVERAGE_STATES, summariseCoverage, type CoverageRow } from "./use-creditops-coverage";

const row = (department: string, state: CoverageRow["state"], id: string): CoverageRow => ({
  client_id: id, department, state, due_at: null, assignee: null,
});

const rows: CoverageRow[] = [
  row("Dispute", "overdue", "a"),
  row("Dispute", "overdue", "b"),
  row("Dispute", "on_track", "c"),
  row("Support", "unassigned", "d"),
  row("Support", "owner_away", "e"),
  row("Bureau Calling", "unassigned", "f"),
  row("Bureau Calling", "unassigned", "g"),
];

describe("the coverage totals", () => {
  it("add up to the number of actionable files", () => {
    const { total } = summariseCoverage(rows);
    expect(total.active).toBe(rows.length);
    expect(total.unassigned + total.owner_away + total.overdue + total.on_track).toBe(total.active);
  });

  it("counts each state exactly as the rows do", () => {
    const { total } = summariseCoverage(rows);
    for (const s of COVERAGE_STATES) {
      expect(total[s.id], s.id).toBe(rows.filter((r) => r.state === s.id).length);
    }
  });

  it("splits by queue without losing or duplicating a file", () => {
    const { total, queues } = summariseCoverage(rows);
    expect(queues.reduce((n, q) => n + q.active, 0)).toBe(total.active);
    expect(queues.map((q) => q.department).sort())
      .toEqual(["Bureau Calling", "Dispute", "Support"]);
  });

  it("puts the queues needing attention first, not the alphabet", () => {
    /* Bureau Calling has two unowned files and Dispute has two late ones.
       Unowned outranks late: chasing an owner who does not exist is not a
       follow-up. */
    const { queues } = summariseCoverage(rows);
    expect(queues[0].department).toBe("Bureau Calling");
    expect(queues[1].department).toBe("Support");
    expect(queues[2].department).toBe("Dispute");
  });

  it("an empty list is five zeroes, not a crash", () => {
    const { total, queues } = summariseCoverage([]);
    expect(total).toEqual({ active: 0, unassigned: 0, owner_away: 0, overdue: 0, on_track: 0 });
    expect(queues).toEqual([]);
  });

  it("every state the database can return has a card", () => {
    /* A state with no card would vanish from the strip while still counting
       toward Active work — the totals would stop adding up on screen. */
    const states = new Set(COVERAGE_STATES.map((s) => s.id));
    for (const r of rows) expect(states.has(r.state), r.state).toBe(true);
    expect(states).toEqual(new Set(["unassigned", "owner_away", "overdue", "on_track"]));
  });
});
