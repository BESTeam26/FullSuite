/**
 * The report's name is specified to the character, and the same string is the
 * page heading, the email subject and the notification — so it is tested once
 * rather than typed three times.
 */
import { describe, expect, it } from "vitest";
import { eodReportName, formatReportDate } from "./report-name";

describe("the name Dee specified", () => {
  it("matches her example exactly", () => {
    expect(eodReportName("James Ivan Lazo", "2026-09-16"))
      .toBe("James Ivan Lazo - EOD Report - September 16, 2026");
  });

  it("drops the leading zero from the day, as a person would write it", () => {
    expect(formatReportDate("2026-09-05")).toBe("September 5, 2026");
  });

  it("handles both ends of the year", () => {
    expect(formatReportDate("2026-01-01")).toBe("January 1, 2026");
    expect(formatReportDate("2026-12-31")).toBe("December 31, 2026");
  });
});

describe("what it refuses to get wrong", () => {
  it("does not shift the date into the previous day for a western timezone", () => {
    /* `new Date("2026-09-16")` is UTC midnight, which is the 16th only east of
       Greenwich. The string is parsed, never dated. */
    expect(formatReportDate("2026-09-16")).toBe("September 16, 2026");
  });

  it("returns an unparseable date unchanged rather than inventing one", () => {
    expect(formatReportDate("not-a-date")).toBe("not-a-date");
  });

  it("falls back to a neutral word when the profile has no name", () => {
    /* Never an email address: an email in a page heading is somebody's address
       on a screen they may be sharing. */
    expect(eodReportName("", "2026-09-16")).toBe("Team member - EOD Report - September 16, 2026");
  });

  it("trims a name that arrived with whitespace", () => {
    expect(eodReportName("  Alliana Catcha  ", "2026-09-16"))
      .toBe("Alliana Catcha - EOD Report - September 16, 2026");
  });
});
