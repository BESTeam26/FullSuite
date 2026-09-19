import { describe, expect, it } from "vitest";
import { AGE_OF_MAJORITY, ageLabel, ageOn, isMinor } from "@/lib/people/age";

const ON = new Date(2026, 8, 19); // 2026-09-19

describe("age is derived, never stored", () => {
  it("counts whole years and only after the birthday has passed", () => {
    expect(ageOn("2002-09-19", ON)).toBe(24); // birthday today counts
    expect(ageOn("2002-09-20", ON)).toBe(23); // tomorrow: not yet
    expect(ageOn("2006-09-07", ON)).toBe(20);
  });

  it("flags anyone under the threshold, and nobody at or over it", () => {
    expect(isMinor("2008-09-20", ON)).toBe(true);   // 17
    expect(isMinor("2008-09-19", ON)).toBe(false);  // 18 today
    expect(AGE_OF_MAJORITY).toBe(18);
  });

  it("reads as words management can act on", () => {
    expect(ageLabel("2005-09-23", ON).text).toBe("20 · Adult");
    expect(ageLabel("2010-01-01", ON)).toEqual({ age: 16, minor: true, text: "16 · Under 18" });
  });

  it("never reports a negative age for a date in the future", () => {
    expect(ageOn("2030-01-01", ON)).toBe(0);
  });
});
