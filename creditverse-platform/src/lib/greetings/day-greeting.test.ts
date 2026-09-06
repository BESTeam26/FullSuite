import { describe, expect, it } from "vitest";
import { dayGreeting, dayPart, greetingName } from "./day-greeting";

const at = (hour: number) => new Date(2026, 8, 5, hour, 0, 0);

describe("dayPart", () => {
  it("splits the day at noon and five", () => {
    expect([dayPart(at(0)), dayPart(at(11)), dayPart(at(12)), dayPart(at(16)), dayPart(at(17)), dayPart(at(23))])
      .toEqual(["morning", "morning", "afternoon", "afternoon", "evening", "evening"]);
  });
});

describe("greetingName", () => {
  it("prefers what the person asked to be called", () => {
    expect(greetingName("Dee", "Deirdre Gallardo")).toBe("Dee");
    expect(greetingName("  ", "Deirdre Gallardo")).toBe("Deirdre");
    expect(greetingName(null, "[TEST] Olive Owner")).toBe("Olive");
    expect(greetingName(null, null)).toBe("there");
  });
});

describe("dayGreeting", () => {
  it("reads as a sentence", () => {
    expect(dayGreeting(at(9), "Dee", "Deirdre Gallardo")).toBe("Good morning, Dee");
    expect(dayGreeting(at(19), null, null)).toBe("Good evening, there");
  });
});
