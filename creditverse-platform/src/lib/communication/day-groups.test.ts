import { describe, expect, it } from "vitest";
import { dayBoundaries, dayKeyOf, dayLabel } from "./day-groups";

describe("which day a message belongs to", () => {
  it("uses the LOCAL day, not UTC", () => {
    /* A message at 8pm on the 17th in a UTC+8 timezone is from the 17th for
       the person reading it. `toISOString().slice(0,10)` would say the 17th
       only by luck and the 18th for anywhere east of Greenwich in the
       evening — which labels yesterday's standup "Today". */
    const evening = new Date(2026, 8, 17, 20, 30).toISOString();
    expect(dayKeyOf(evening)).toBe("2026-09-17");
  });

  it("answers empty for something that is not a date", () => {
    expect(dayKeyOf("not a date")).toBe("");
  });
});

describe("what the divider says", () => {
  const today = new Date(2026, 8, 17);

  it("says Today for today", () => {
    expect(dayLabel("2026-09-17", today)).toBe("Today");
  });

  it("says Yesterday for yesterday", () => {
    expect(dayLabel("2026-09-16", today)).toBe("Yesterday");
  });

  it("crosses a month boundary backwards correctly", () => {
    expect(dayLabel("2026-08-31", new Date(2026, 8, 1))).toBe("Yesterday");
  });

  it("writes an older date out, without the year when it is this year", () => {
    expect(dayLabel("2026-09-10", today)).toBe("Thursday, September 10");
  });

  it("includes the year once it is a different one", () => {
    expect(dayLabel("2025-12-24", today)).toContain("2025");
  });

  it("renders the date it was given, not one off by a day", () => {
    /* `new Date("2026-09-17")` is UTC midnight and prints as the 16th west of
       Greenwich. Built from the parts instead. */
    expect(dayLabel("2026-09-17", new Date(2026, 0, 1))).toContain("September 17");
  });
});

describe("where the dividers go", () => {
  const at = (d: number, h = 9) => new Date(2026, 8, d, h).toISOString();

  it("marks the first message of each day and nothing else", () => {
    const marks = dayBoundaries([at(16), at(16, 14), at(17), at(17, 10), at(17, 18)]);
    expect([...marks.keys()]).toEqual([0, 2]);
  });

  it("marks the very first message even in a one-day conversation", () => {
    expect([...dayBoundaries([at(17)]).keys()]).toEqual([0]);
  });

  it("returns nothing for an empty conversation", () => {
    expect(dayBoundaries([]).size).toBe(0);
  });

  it("skips a row whose timestamp is unusable rather than drawing a blank divider", () => {
    const marks = dayBoundaries([at(17), "nonsense", at(18)]);
    expect([...marks.keys()]).toEqual([0, 2]);
  });
});
