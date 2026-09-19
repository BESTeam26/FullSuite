import { describe, expect, it } from "vitest";
import { TIME_SECTIONS, timeSectionFor, visibleTimeSections } from "./time-sections";

const AGENT = { manages: false, leadsTeam: false };
const LEAD = { manages: false, leadsTeam: true };
const MANAGER = { manages: true, leadsTeam: false };

/* Dee, 2026-09-19: Time & Attendance is "ME". Managing other people lives in
   People & Teams — see people-sections.test.ts. */
describe("Time & Attendance is the person's own, for every role", () => {
  it("gives everybody the same four sections", () => {
    for (const ctx of [AGENT, LEAD, MANAGER]) {
      expect(visibleTimeSections(ctx).map((s) => s.label))
        .toEqual(["Overview", "My Time", "My Attendance", "My Time Off"]);
    }
  });

  it("no longer carries Team Management — that is People & Teams now", () => {
    expect(TIME_SECTIONS.map((s) => s.slug)).not.toContain("team");
    expect(timeSectionFor("team", MANAGER)).toBeNull();
  });
});

describe("resolving a URL segment", () => {
  it("finds the overview at the module root", () => {
    expect(timeSectionFor(undefined, AGENT)?.label).toBe("Overview");
    expect(timeSectionFor("", AGENT)?.label).toBe("Overview");
  });

  it("finds a section by its slug", () => {
    expect(timeSectionFor("attendance", AGENT)?.label).toBe("My Attendance");
    expect(timeSectionFor("time-off", LEAD)?.label).toBe("My Time Off");
  });

  it("answers null for a section that does not exist", () => {
    expect(timeSectionFor("nonsense", AGENT)).toBeNull();
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
