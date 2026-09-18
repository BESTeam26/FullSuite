import { describe, expect, it } from "vitest";
import { TIME_SECTIONS, timeSectionFor, visibleTimeSections } from "./time-sections";

const AGENT = { manages: false, leadsTeam: false };
const LEAD = { manages: false, leadsTeam: true };
const MANAGER = { manages: true, leadsTeam: false };

describe("who sees what", () => {
  it("gives a normal employee their own four sections", () => {
    /* Dee's spec: Overview, My Time, Attendance, Time Off. */
    expect(visibleTimeSections(AGENT).map((s) => s.label))
      .toEqual(["Overview", "My Time", "Attendance", "Time Off"]);
  });

  it("adds Team Management for somebody who actually leads a team", () => {
    expect(visibleTimeSections(LEAD).map((s) => s.label)).toContain("Team Management");
  });

  it("adds it for management too", () => {
    expect(visibleTimeSections(MANAGER).map((s) => s.label)).toContain("Team Management");
  });

  it("does NOT give it to an agent, whatever else they are", () => {
    /* Dee: "Do not show Team Management merely because somebody is an Agency
       Admin." The audience is a real team-lead relationship or management
       capability — never a role name. */
    expect(visibleTimeSections(AGENT).map((s) => s.slug)).not.toContain("team");
  });
});

describe("resolving a URL segment", () => {
  it("finds the overview at the module root", () => {
    expect(timeSectionFor(undefined, AGENT)?.label).toBe("Overview");
    expect(timeSectionFor("", AGENT)?.label).toBe("Overview");
  });

  it("finds a section this person may open", () => {
    expect(timeSectionFor("attendance", AGENT)?.label).toBe("Attendance");
  });

  it("answers the same for a section that does not exist and one they may not open", () => {
    /* A 'you are not allowed' page tells somebody the section exists. */
    expect(timeSectionFor("team", AGENT)).toBeNull();
    expect(timeSectionFor("nonsense", AGENT)).toBeNull();
  });

  it("opens Team Management for a lead", () => {
    expect(timeSectionFor("team", LEAD)?.label).toBe("Team Management");
  });
});

describe("the module's shape", () => {
  it("has exactly one section at the root", () => {
    expect(TIME_SECTIONS.filter((s) => s.slug === "")).toHaveLength(1);
  });

  it("uses unique slugs", () => {
    const slugs = TIME_SECTIONS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
