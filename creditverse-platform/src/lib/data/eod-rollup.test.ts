/**
 * A team total must never invent a number.
 *
 * Dee, 2026-09-16: *"If a metric cannot be calculated: show Not available
 * rather than 0. Zero means the system actually knows the value is zero. This
 * is especially important for time and production."*
 *
 * The distinction is the whole test: "the team produced nothing today" and
 * "nobody has reported yet" look identical once both are rendered as 0, and a
 * manager acts very differently on each.
 */
import { describe, expect, it } from "vitest";
import { rollupTotals, type RollupRow } from "./use-eod-rollup";

const row = (over: Partial<RollupRow>): RollupRow => ({
  employeeId: "u1", employeeName: "Someone", teamName: "Team", submitted: true,
  autoSubmitted: false, state: "submitted", production: 0, completed: 0,
  inProgress: 0, blocked: 0, minutesLogged: 0, blockers: null, helpNeeded: null,
  ...over,
});

describe("totals", () => {
  it("adds up what was reported", () => {
    const t = rollupTotals([row({ production: 8 }), row({ production: 6 })]);
    expect(t.production).toBe(14);
  });

  it("counts who submitted and who did not", () => {
    const t = rollupTotals([row({ submitted: true }), row({ submitted: false })]);
    expect(t.submitted).toBe(1);
    expect(t.missing).toBe(1);
    expect(t.members).toBe(2);
  });
});

describe("what it refuses to claim", () => {
  it("says Not available when nobody has reported a figure", () => {
    /* Null, never 0. Nobody has told us, which is not the same as nothing. */
    expect(rollupTotals([row({ production: null }), row({ production: null })]).production).toBeNull();
  });

  it("but says zero when the team genuinely did none", () => {
    expect(rollupTotals([row({ production: 0 }), row({ production: 0 })]).production).toBe(0);
  });

  it("sums only the people who reported, ignoring the ones who did not", () => {
    /* One person produced 8 and one has not reported. The answer is 8 — not 8
       averaged over two, and not null because somebody is missing. */
    expect(rollupTotals([row({ production: 8 }), row({ production: null })]).production).toBe(8);
  });

  it("applies the same rule to time, where it matters most", () => {
    expect(rollupTotals([row({ minutesLogged: null })]).minutesLogged).toBeNull();
    expect(rollupTotals([row({ minutesLogged: 0 })]).minutesLogged).toBe(0);
    expect(rollupTotals([row({ minutesLogged: 402 }), row({ minutesLogged: 30 })]).minutesLogged).toBe(432);
  });

  it("an empty team totals to nothing known, not to zero", () => {
    const t = rollupTotals([]);
    expect(t.members).toBe(0);
    expect(t.production).toBeNull();
    expect(t.minutesLogged).toBeNull();
  });
});
