/**
 * The two ways a timestamp lies: it shows the wrong clock, or it disagrees
 * with the divider above it.
 */
import { describe, expect, it } from "vitest";
import {
  BES_TIMEZONE, dayKeyIn, dayLabelIn, groupByDay, stampIn, timeIn,
} from "./conversation-clock";

const MANILA = "Asia/Manila";

/* 2026-09-08 03:40 UTC — 11:40 PM Sep 7 in New York, 11:40 AM Sep 8 in Manila.
   Every interesting disagreement in this file is a version of this instant. */
const LATE = "2026-09-08T03:40:00.000Z";

describe("which clock", () => {
  it("reads a BES conversation in Eastern, wherever the reader is", () => {
    expect(timeIn(LATE, BES_TIMEZONE)).toBe("11:40 PM EDT");
  });

  it("reads a partner conversation on the partner's clock", () => {
    expect(timeIn(LATE, MANILA)).toBe("11:40 AM GMT+8");
  });

  it("names the zone, so a number is never read as the reader's own morning", () => {
    /* The entire point of Dee's rule: an agent in Manila must not read
       "11:40 PM" in #general as their own late night. */
    expect(timeIn(LATE, BES_TIMEZONE)).toMatch(/E[DS]T$/);
  });

  it("puts the date and the time together on the row", () => {
    expect(stampIn(LATE, BES_TIMEZONE)).toBe("Sep 7, 2026, 11:40 PM EDT");
  });

  it("falls back to Eastern rather than blanking on an unknown zone", () => {
    /* The database validates the column, but a stale cached value must not
       empty out a conversation. */
    expect(timeIn(LATE, "Mars/Olympus_Mons")).toBe("11:40 PM EDT");
  });

  it("returns nothing for an unparseable timestamp instead of 'Invalid Date'", () => {
    expect(timeIn("not a date", BES_TIMEZONE)).toBe("");
    expect(stampIn("", BES_TIMEZONE)).toBe("");
    expect(dayKeyIn("nonsense", BES_TIMEZONE)).toBe("");
  });
});

describe("which day", () => {
  it("assigns the day in the channel's zone, not the reader's", () => {
    expect(dayKeyIn(LATE, BES_TIMEZONE)).toBe("2026-09-07");
    expect(dayKeyIn(LATE, MANILA)).toBe("2026-09-08");
  });

  it("agrees with the stamp on the same message", () => {
    /* The bug this pairing exists to prevent: a "Tuesday" divider above a
       message stamped 11:40 PM Monday. */
    expect(dayKeyIn(LATE, BES_TIMEZONE)).toBe("2026-09-07");
    expect(stampIn(LATE, BES_TIMEZONE)).toContain("Sep 7");
  });

  it("says Today and Yesterday relative to the channel's clock", () => {
    /* 1am Sep 8 UTC is still Sep 7 in New York, so "today" there is the 7th. */
    const now = new Date("2026-09-08T01:00:00.000Z");
    expect(dayLabelIn("2026-09-07", BES_TIMEZONE, now)).toBe("Today");
    expect(dayLabelIn("2026-09-06", BES_TIMEZONE, now)).toBe("Yesterday");
    /* The same instant is already the 8th in Manila. */
    expect(dayLabelIn("2026-09-08", MANILA, now)).toBe("Today");
    expect(dayLabelIn("2026-09-07", MANILA, now)).toBe("Yesterday");
  });

  it("writes an older day out in full", () => {
    const now = new Date("2026-09-17T16:00:00.000Z");
    expect(dayLabelIn("2026-09-08", BES_TIMEZONE, now)).toBe("Tuesday, September 8");
  });

  it("adds the year once the day is not in this one", () => {
    const now = new Date("2026-09-17T16:00:00.000Z");
    expect(dayLabelIn("2025-12-24", BES_TIMEZONE, now)).toBe("Wednesday, December 24, 2025");
  });

  it("names the right weekday in a zone far from UTC", () => {
    /* Building local midnight and re-projecting is what gets this wrong: the
       divider slips to the previous day at the edges. */
    const now = new Date("2026-09-17T16:00:00.000Z");
    expect(dayLabelIn("2026-09-08", MANILA, now)).toBe("Tuesday, September 8");
    expect(dayLabelIn("2026-09-08", "Pacific/Honolulu", now)).toBe("Tuesday, September 8");
  });
});

describe("splitting a conversation into days", () => {
  const at = (iso: string) => ({ createdAt: iso });
  const on = (rows: { createdAt: string }[], tz: string) =>
    groupByDay(rows, (m) => m.createdAt, tz, new Date("2026-09-17T16:00:00.000Z"));

  it("keeps one group per day, in order", () => {
    const groups = on([
      at("2026-09-07T14:00:00.000Z"),
      at("2026-09-07T15:00:00.000Z"),
      at("2026-09-08T14:00:00.000Z"),
    ], BES_TIMEZONE);
    expect(groups.map((g) => g.key)).toEqual(["2026-09-07", "2026-09-08"]);
    expect(groups.map((g) => g.messages.length)).toEqual([2, 1]);
  });

  it("loses no message", () => {
    const rows = ["2026-09-07T14:00:00.000Z", "2026-09-08T14:00:00.000Z", "2026-09-08T15:00:00.000Z"].map(at);
    expect(on(rows, BES_TIMEZONE).flatMap((g) => g.messages)).toEqual(rows);
  });

  it("splits the same two messages differently on a different clock", () => {
    /* 11:40 PM and 11:50 PM Eastern are one evening. In Manila they are the
       middle of the next day — still one group, but a different day. */
    const rows = [at("2026-09-08T03:40:00.000Z"), at("2026-09-08T03:50:00.000Z")];
    expect(on(rows, BES_TIMEZONE).map((g) => g.key)).toEqual(["2026-09-07"]);
    expect(on(rows, MANILA).map((g) => g.key)).toEqual(["2026-09-08"]);
  });

  it("carries the divider's wording with the group", () => {
    const groups = on([at("2026-09-08T14:00:00.000Z")], BES_TIMEZONE);
    expect(groups[0].label).toBe("Tuesday, September 8");
  });

  it("returns nothing for an empty conversation", () => {
    expect(on([], BES_TIMEZONE)).toEqual([]);
  });
});
