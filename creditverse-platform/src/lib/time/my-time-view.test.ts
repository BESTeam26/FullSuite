import { describe, expect, it } from "vitest";
import {
  partnerSplit, recentWork, todayTimeline, weekBars, weekRangeLabel,
} from "./my-time-view";
import type { TimeEntry } from "@/lib/data/time-entries";

const NOW = new Date("2026-09-17T18:30:00.000Z");

const entry = (over: Partial<TimeEntry> = {}): TimeEntry => ({
  id: Math.random().toString(36).slice(2),
  divisionId: "creditops",
  workDate: "2026-09-17",
  startedAt: "2026-09-17T13:03:00.000Z",
  endedAt: "2026-09-17T14:21:00.000Z",
  durationMinutes: 78,
  autoStopped: false,
  kind: "work",
  ...over,
});

describe("the week the page is showing", () => {
  it("reads as Dee's mockup does", () => {
    expect(weekRangeLabel("2026-09-14")).toBe("Mon, Sep 14 – Sun, Sep 20, 2026");
  });

  it("does not slip a day west of Greenwich", () => {
    /* `new Date("2026-09-14")` is UTC midnight, which is the 13th in New York
       — the divider would name the wrong week. */
    expect(weekRangeLabel("2026-09-14")).toContain("Sep 14");
  });

  it("says nothing rather than 'Invalid Date' for a missing week", () => {
    expect(weekRangeLabel("")).toBe("");
  });
});

describe("partner work against internal work", () => {
  it("splits on whether the time was for a partner", () => {
    const split = partnerSplit([
      entry({ partnerGroupId: "p1", durationMinutes: 60 }),
      entry({ partnerGroupId: "p2", durationMinutes: 30 }),
      entry({ durationMinutes: 45 }),
    ], NOW);
    expect(split).toEqual({ partnerMinutes: 90, internalMinutes: 45 });
  });

  it("counts breaks and lunch as neither", () => {
    /* They are the day's rest — the by-partner table has always excluded
       them, and two places disagreeing about it is how a partner gets billed
       for somebody's lunch. */
    const split = partnerSplit([
      entry({ kind: "break", durationMinutes: 15 }),
      entry({ kind: "lunch", durationMinutes: 60 }),
      entry({ partnerGroupId: "p1", durationMinutes: 60 }),
    ], NOW);
    expect(split).toEqual({ partnerMinutes: 60, internalMinutes: 0 });
  });

  it("counts a running entry at what it has run so far", () => {
    const split = partnerSplit([
      entry({ partnerGroupId: "p1", startedAt: "2026-09-17T18:00:00.000Z", endedAt: undefined, durationMinutes: undefined }),
    ], NOW);
    expect(split.partnerMinutes).toBe(30);
  });
});

describe("the week as a chart", () => {
  const bars = () => weekBars([
    entry({ workDate: "2026-09-14", durationMinutes: 462 }),
    entry({ workDate: "2026-09-16", durationMinutes: 415 }),
    entry({ workDate: "2026-09-16", durationMinutes: 60 }),
    entry({ workDate: "2026-09-16", kind: "lunch", durationMinutes: 60 }),
  ], "2026-09-14", "2026-09-17", NOW);

  it("always has seven days, so the chart never jumps", () => {
    expect(bars()).toHaveLength(7);
    expect(bars().map((b) => b.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("adds up the day's work", () => {
    expect(bars()[2].minutes).toBe(475);
  });

  it("leaves rest out of the bar", () => {
    /* Wednesday's lunch must not make the day look longer than it was. */
    expect(bars()[2].minutes).toBe(415 + 60);
  });

  it("shows a day with no work as zero rather than dropping it", () => {
    expect(bars()[1]).toMatchObject({ label: "Tue", minutes: 0, future: false });
  });

  it("marks days that have not happened yet", () => {
    expect(bars().filter((b) => b.future).map((b) => b.label)).toEqual(["Fri", "Sat", "Sun"]);
  });
});

describe("work you are likely to start again", () => {
  it("offers the newest first", () => {
    const list = recentWork([
      entry({ startedAt: "2026-09-17T09:00:00.000Z", taskNote: "Older" }),
      entry({ startedAt: "2026-09-17T15:00:00.000Z", taskNote: "Newer" }),
    ]);
    expect(list.map((r) => r.title)).toEqual(["Newer", "Older"]);
  });

  it("keeps the same task for two partners apart", () => {
    /* Restarting means repeating the exact combination. Collapsing these would
       start the timer on the wrong partner's account. */
    const list = recentWork([
      entry({ taskNote: "Support Follow-up", partnerGroupId: "p1" }),
      entry({ taskNote: "Support Follow-up", partnerGroupId: "p2" }),
    ]);
    expect(list).toHaveLength(2);
  });

  it("does not repeat the same work twice", () => {
    const list = recentWork([
      entry({ taskNote: "Client Review", partnerGroupId: "p1", startedAt: "2026-09-17T09:00:00.000Z" }),
      entry({ taskNote: "Client Review", partnerGroupId: "p1", startedAt: "2026-09-17T14:00:00.000Z" }),
    ]);
    expect(list).toHaveLength(1);
  });

  it("names untitled work by its division rather than leaving it blank", () => {
    expect(recentWork([entry({ taskNote: undefined, divisionId: "talentops" })])[0].title)
      .toBe("TalentOps");
  });

  it("ignores breaks — nobody restarts a lunch", () => {
    expect(recentWork([entry({ kind: "lunch", taskNote: "Lunch" })])).toEqual([]);
  });

  it("stops at the limit", () => {
    const many = [1, 2, 3, 4, 5, 6].map((n) => entry({ taskNote: `Task ${n}` }));
    expect(recentWork(many, 4)).toHaveLength(4);
  });
});

describe("today as it happened", () => {
  it("is in the order it happened", () => {
    const rows = todayTimeline([
      entry({ startedAt: "2026-09-17T14:20:00.000Z", taskNote: "Second" }),
      entry({ startedAt: "2026-09-17T13:03:00.000Z", taskNote: "First" }),
    ], "2026-09-17", NOW);
    expect(rows.map((r) => r.entry.taskNote)).toEqual(["First", "Second"]);
  });

  it("says Running rather than an end time for an open entry", () => {
    const rows = todayTimeline([
      entry({ startedAt: "2026-09-17T18:14:00.000Z", endedAt: undefined, durationMinutes: undefined }),
    ], "2026-09-17", NOW);
    expect(rows[0].span).toMatch(/– Running$/);
    expect(rows[0].running).toBe(true);
    expect(rows[0].minutes).toBe(16);
  });

  it("leaves other days out", () => {
    const rows = todayTimeline([entry({ workDate: "2026-09-16" })], "2026-09-17", NOW);
    expect(rows).toEqual([]);
  });
});
