import { describe, expect, it } from "vitest";
import {
  PEOPLE_SECTIONS, groupedPeopleSections, isPeopleSectionSlug, peopleSectionFor, seesPeopleAndTeams,
  visiblePeopleSections,
} from "./people-sections";

const AGENT = { administers: false, manages: false, leadsTeam: false, payroll: false };
const LEAD = { administers: false, manages: false, leadsTeam: true, payroll: false };
const DIVISION_MANAGER = { administers: false, manages: true, leadsTeam: false, payroll: false };
const EXECUTIVE = { administers: true, manages: true, leadsTeam: false, payroll: false };
const PAYROLL_ADMIN = { ...EXECUTIVE, payroll: true };
const labels = (ctx: typeof AGENT) => visiblePeopleSections(ctx).map((s) => s.label);

/* Dee, 2026-09-19: the locked, role-adaptive tab lists. */
describe("People & Teams is role-adaptive", () => {
  it("an agent does not get People & Teams at all", () => {
    expect(labels(AGENT)).toEqual([]);
    expect(seesPeopleAndTeams(AGENT)).toBe(false);
  });

  it("a Team Lead gets the operational sections over their team", () => {
    expect(labels(LEAD)).toEqual([
      "Overview", "Team Members", "Schedule", "Attendance", "Time Off", "End of Day", "Performance",
    ]);
  });

  it("a Division Manager gets the same, plus organizational visibility", () => {
    expect(labels(DIVISION_MANAGER)).toEqual([
      "Overview", "Team Members", "Org Chart", "Schedule", "Attendance", "Time Off", "End of Day", "Performance",
    ]);
  });

  it("an Executive gets everything, in the locked order", () => {
    expect(labels(EXECUTIVE)).toEqual([
      "Overview", "Team Members", "Structure", "Positions", "Org Chart",
      "Schedule", "Attendance", "Time Off", "End of Day", "Performance",
    ]);
    expect(labels(EXECUTIVE)).not.toContain("Payroll");
  });

  it("Payroll appears only with the payroll capability — never for being an admin", () => {
    expect(labels(PAYROLL_ADMIN)).toEqual(PEOPLE_SECTIONS.map((s) => s.label));
    expect(labels(PAYROLL_ADMIN).at(-1)).toBe("Pay & Payroll");
    expect(labels({ ...AGENT, payroll: true })).toEqual(["Pay & Payroll"]);
  });
});

describe("resolving a URL segment", () => {
  it("opens the root as Overview", () => {
    expect(peopleSectionFor(undefined, LEAD)?.label).toBe("Overview");
    expect(peopleSectionFor("", LEAD)?.label).toBe("Overview");
  });

  it("answers a section this person may not open exactly like one that does not exist", () => {
    expect(peopleSectionFor("structure", LEAD)).toBeNull();
    expect(peopleSectionFor("nope", LEAD)).toBeNull();
    expect(peopleSectionFor("structure", EXECUTIVE)?.label).toBe("Structure");
  });

  it("tells a section slug from a profile id, so /app/people/:userId still works", () => {
    expect(isPeopleSectionSlug("schedule")).toBe(true);
    expect(isPeopleSectionSlug("41e20b82-394f-42a5-b4c2-56ab593f8f9a")).toBe(false);
  });
});

/**
 * Grouping is presentation, so the test that matters is that it did not
 * quietly change what anyone may open, or the order Dee locked.
 */
describe("the sections are grouped without being reordered", () => {
  it("every visible section lands in exactly one drawn cluster", () => {
    for (const ctx of [LEAD, DIVISION_MANAGER, EXECUTIVE, PAYROLL_ADMIN]) {
      const flat = groupedPeopleSections(ctx).flatMap((g) => g.sections);
      expect(flat.map((s) => s.slug)).toEqual(visiblePeopleSections(ctx).map((s) => s.slug));
    }
  });

  it("draws no empty cluster, so a lead sees fewer headings than an executive", () => {
    expect(groupedPeopleSections(LEAD).every((g) => g.sections.length > 0)).toBe(true);
    expect(groupedPeopleSections(LEAD).length)
      .toBeLessThan(groupedPeopleSections(PAYROLL_ADMIN).length);
  });

  it("offers an agent nothing to group", () => {
    expect(groupedPeopleSections(AGENT)).toEqual([]);
  });
});
