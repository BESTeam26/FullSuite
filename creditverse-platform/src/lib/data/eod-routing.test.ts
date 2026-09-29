/**
 * A report that reached nobody must not look like one that reached its lead.
 *
 * The routing reason has been recorded since routing was built and shown
 * nowhere, so the two cases were indistinguishable in the interface. On
 * 2026-09-20 eight of the roster were on no team: their End of Day was being
 * captured and notifying nobody, and the only way to find out was to query the
 * table.
 */
import { describe, expect, it } from "vitest";
import { describeEodRouting } from "@/lib/data/eod-day";

describe("describeEodRouting", () => {
  it("names the lead when there is one", () => {
    const r = describeEodRouting("team_lead", "Rowell Christian Pena");
    expect(r.label).toContain("Rowell Christian Pena");
    expect(r.needsAttention).toBe(false);
    expect(r.fix).toBeNull();
  });

  it("still reads sensibly when the lead's name is not to hand", () => {
    expect(describeEodRouting("team_lead").label).toBe("Goes to their team lead");
  });

  it("treats a lead's own report as normal, not as a gap", () => {
    expect(describeEodRouting("is_lead").needsAttention).toBe(false);
  });

  it("flags every case where the report reached nobody, and says what to do", () => {
    for (const reason of ["no_team", "no_lead", "ambiguous"]) {
      const r = describeEodRouting(reason);
      expect(r.needsAttention, reason).toBe(true);
      expect(r.fix, reason).toBeTruthy();
      expect(r.label, reason).toMatch(/nobody|Not sent/);
    }
  });

  it("does not turn an unrecorded reason into an alarm", () => {
    /* Reports written before routing was recorded say nothing, and silence is
       not the same as "reached nobody". */
    for (const reason of [null, undefined, "something_new"]) {
      expect(describeEodRouting(reason).needsAttention, String(reason)).toBe(false);
    }
    expect(describeEodRouting(null).label).toBe("Not recorded");
  });
});

describe("the rungs above the team", () => {
  it("names the person one rung up, whatever the rung", () => {
    expect(describeEodRouting("department_lead", "Daniel").label).toBe("Goes to Daniel");
    expect(describeEodRouting("division_lead", "Rowell").label).toBe("Goes to Rowell");
    expect(describeEodRouting("executive", "Aaron").label).toBe("Goes to Aaron");
  });
  it("treats the top of the ladder as normal, and an empty seat above as a gap", () => {
    expect(describeEodRouting("top").needsAttention).toBe(false);
    const r = describeEodRouting("unrouted");
    expect(r.needsAttention).toBe(true);
    expect(r.fix).toMatch(/Structure/);
  });
});
