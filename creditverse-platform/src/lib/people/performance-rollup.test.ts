/**
 * A group's score is its people, at every level.
 *
 * The trap this guards is double counting: somebody on two teams must add to
 * both team rows and to their department exactly once, or a department's score
 * quietly becomes a weighted average of how many teams people happen to sit on.
 */
import { describe, expect, it } from "vitest";
import { rollupBy, isMeasured, UNPLACED, type RollupPerson } from "@/lib/people/performance-rollup";
import type { PersonScore } from "@/lib/people/performance-metrics";

const score = (over: Partial<PersonScore> = {}): PersonScore => ({
  attendance: 80, quality: 90, compliance: 70, output: null,
  delivered: 0, overall: 80, belowMinimum: false, ...over,
});

const person = (name: string, over: Partial<RollupPerson> = {}): RollupPerson => ({
  userId: name, name, division: "CreditOps", department: "Dispute", teams: ["Dispute Team"],
  score: score(), ...over,
});

describe("rolling performance up", () => {
  it("averages a division from its people", () => {
    const rows = rollupBy([
      person("a", { score: score({ overall: 60 }) }),
      person("b", { score: score({ overall: 80 }) }),
    ], "division");
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("CreditOps");
    expect(rows[0].people).toBe(2);
    expect(rows[0].overall).toBe(70);
  });

  it("counts somebody on two teams once per team, and once in their department", () => {
    const both = person("a", { teams: ["Dispute Team", "Support Team"] });
    expect(rollupBy([both], "team").map((r) => r.label).sort())
      .toEqual(["Dispute Team", "Support Team"]);
    const dept = rollupBy([both], "department");
    expect(dept).toHaveLength(1);
    expect(dept[0].people).toBe(1);
  });

  it("puts somebody with no department in their own row rather than inventing one", () => {
    const rows = rollupBy([person("a", { department: null })], "department");
    expect(rows[0].label).toBe(UNPLACED);
  });

  it("sorts best first but always leaves the unplaced row last", () => {
    const rows = rollupBy([
      person("a", { department: null, score: score({ overall: 99 }) }),
      person("b", { department: "Dispute", score: score({ overall: 50 }) }),
      person("c", { department: "Onboarding", score: score({ overall: 70 }) }),
    ], "department");
    expect(rows.map((r) => r.label)).toEqual(["Onboarding", "Dispute", UNPLACED]);
  });

  it("counts how many people each measure actually covers", () => {
    const rows = rollupBy([
      person("a", { score: score({ quality: 90 }) }),
      person("b", { score: score({ quality: null }) }),
    ], "division");
    expect(rows[0].measured.quality).toBe(1);
    expect(rows[0].measured.attendance).toBe(2);
    /* The average is over who HAS the measure, never over everybody. */
    expect(rows[0].scores.quality).toBe(90);
  });

  it("says a group is unmeasured rather than scoring it zero", () => {
    const nothing = score({ attendance: null, quality: null, compliance: null, output: null, overall: null });
    const [row] = rollupBy([person("a", { score: nothing })], "division");
    expect(isMeasured(row)).toBe(false);
    expect(row.overall).toBeNull();
    /* And a group with one measured person IS measured. */
    const [mixed] = rollupBy([person("a", { score: nothing }), person("b")], "division");
    expect(isMeasured(mixed)).toBe(true);
  });

  it("groups by person when that is the level asked for", () => {
    expect(rollupBy([person("Ada"), person("Ben")], "person").map((r) => r.label).sort())
      .toEqual(["Ada", "Ben"]);
  });
});
