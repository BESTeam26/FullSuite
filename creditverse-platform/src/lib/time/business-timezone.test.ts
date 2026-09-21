/**
 * One clock for the workforce: America/New_York, whatever the device says.
 *
 * These are the assertions that stop the Manila half of the team being filed
 * on the wrong day again — and the reason copy never says "EST".
 */
import { describe, expect, it } from "vitest";
import { besAbbrev, besTime, besWorkDate, BES_TZ, BES_TZ_LABEL, shiftInDeviceZone, shiftLabel } from "./business-timezone";

/* 2026-09-21 22:02 Eastern (EDT) is 2026-09-22 10:02 in Manila. The exact
   moment three real punches were filed on the wrong day. */
const DURING_EDT = new Date("2026-09-22T02:02:00Z");
/* 2026-01-15 21:00 Eastern (EST) — the same shape of day in winter. */
const DURING_EST = new Date("2026-01-16T02:00:00Z");

describe("the workday is Eastern, not the device's", () => {
  it("a moment inside the Eastern evening belongs to the Eastern day, though Manila says tomorrow", () => {
    expect(besWorkDate(DURING_EDT)).toBe("2026-09-21");
    /* What a Manila device would have said, and what used to be stored. */
    expect(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" })
      .format(DURING_EDT)).toBe("2026-09-22");
  });

  it("and in winter, when Eastern is EST, the same rule holds", () => {
    expect(besWorkDate(DURING_EST)).toBe("2026-01-15");
  });

  it("the canonical zone is the IANA identifier, never an offset", () => {
    expect(BES_TZ).toBe("America/New_York");
  });
});

describe("ET in prose, EDT or EST on a timestamp", () => {
  it("copy says Eastern Time (ET), because EST is only half the year", () => {
    expect(BES_TZ_LABEL).toBe("Eastern Time (ET)");
    expect(BES_TZ_LABEL).not.toContain("EST");
  });

  it("a September time is EDT and a January time is EST — from the database, not a guess", () => {
    expect(besAbbrev(DURING_EDT)).toBe("EDT");
    expect(besAbbrev(DURING_EST)).toBe("EST");
  });

  it("a timestamp reads in Eastern with the abbreviation of its own date", () => {
    expect(besTime(DURING_EDT)).toBe("10:02 PM EDT");
    expect(besTime(DURING_EST)).toBe("9:00 PM EST");
  });

  it("a shift reads the same hours all year; only the abbreviation moves", () => {
    expect(shiftLabel("09:00", "18:00", DURING_EDT)).toBe("9:00 AM – 6:00 PM EDT");
    expect(shiftLabel("09:00", "18:00", DURING_EST)).toBe("9:00 AM – 6:00 PM EST");
  });
});

describe("daylight saving is the database's job", () => {
  it("the hour before and after the spring change both resolve, with the right abbreviation", () => {
    /* 2026-03-08 06:59Z is 01:59 EST; 07:00Z is 03:00 EDT. */
    expect(besAbbrev(new Date("2026-03-08T06:59:00Z"))).toBe("EST");
    expect(besAbbrev(new Date("2026-03-08T07:00:00Z"))).toBe("EDT");
  });

  it("and the transition creates no missing or duplicated workday", () => {
    expect(besWorkDate(new Date("2026-03-08T06:59:00Z"))).toBe("2026-03-08");
    expect(besWorkDate(new Date("2026-03-08T07:00:00Z"))).toBe("2026-03-08");
    /* The autumn change, when 01:00–02:00 happens twice. */
    expect(besWorkDate(new Date("2026-11-01T05:30:00Z"))).toBe("2026-11-01");
    expect(besWorkDate(new Date("2026-11-01T06:30:00Z"))).toBe("2026-11-01");
  });
});

describe("the reader's own city, beneath the Eastern line", () => {
  it("says nothing when the device is already on Eastern", () => {
    /* The suite runs on Eastern, which is the case that must stay silent —
       a second line repeating the first is noise. */
    expect(shiftInDeviceZone("09:00", "18:00", new Date("2026-09-22T02:02:00Z"))).toBeNull();
  });
});
