import { describe, expect, it } from "vitest";
import {
  PEOPLE_SECTIONS, isPeopleSectionSlug, peopleSectionFor, seesPeopleAndTeams, visiblePeopleSections,
} from "./people-sections";

const AGENT = { administers: false, manages: false, leadsTeam: false };
const LEAD = { administers: false, manages: false, leadsTeam: true };
const DIVISION_MANAGER = { administers: false, manages: true, leadsTeam: false };
const EXECUTIVE = { administers: true, manages: true, leadsTeam: false };
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
    expect(labels(EXECUTIVE)).toEqual(PEOPLE_SECTIONS.map((s) => s.label));
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
