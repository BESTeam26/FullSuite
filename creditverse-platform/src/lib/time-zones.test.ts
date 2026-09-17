import { describe, expect, it } from "vitest";
import { BES_TIMEZONE, offsetLabel, timeZoneOptions } from "./time-zones";

const AT = new Date("2026-09-17T16:00:00.000Z");

describe("choosing a timezone", () => {
  it("offers the zones BES works in first", () => {
    const first = timeZoneOptions(AT).slice(0, 8).map((o) => o.value);
    expect(first[0]).toBe(BES_TIMEZONE);
    expect(first).toContain("Asia/Manila");
    expect(first).toContain("America/Los_Angeles");
  });

  it("lists each zone once", () => {
    const values = timeZoneOptions(AT).map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("shows the offset, so two similar names can be told apart", () => {
    expect(offsetLabel("America/New_York", AT)).toBe("GMT-4");
    expect(offsetLabel("Asia/Manila", AT)).toBe("GMT+8");
  });

  it("labels a zone readably rather than with an underscore", () => {
    const la = timeZoneOptions(AT).find((o) => o.value === "America/Los_Angeles");
    expect(la?.label).toBe("America/Los Angeles · GMT-7");
  });

  it("returns something rather than nothing for a name it cannot format", () => {
    expect(offsetLabel("Mars/Olympus_Mons", AT)).toBe("");
  });
});
