import { describe, expect, it } from "vitest";
import {
  addDays, businessToday, deadlineWarning, displayName, holidaysForYear,
  holidayToday, isBusinessDay, nextBusinessDay, statusOf, upcomingHolidays,
  weekdayOf,
} from "./us-federal-holidays";

const on = (year: number, key: string) => holidaysForYear(year).find((h) => h.key === key)!;

describe("the rules produce the real dates", () => {
  /* Checked against the published federal calendar, not against the code. */
  it("2026", () => {
    expect(on(2026, "new_years_day").date).toBe("2026-01-01");
    expect(on(2026, "mlk_day").date).toBe("2026-01-19");
    expect(on(2026, "presidents_day").date).toBe("2026-02-16");
    expect(on(2026, "memorial_day").date).toBe("2026-05-25");
    expect(on(2026, "juneteenth").date).toBe("2026-06-19");
    expect(on(2026, "independence_day").date).toBe("2026-07-04");
    expect(on(2026, "labor_day").date).toBe("2026-09-07");
    expect(on(2026, "columbus_day").date).toBe("2026-10-12");
    expect(on(2026, "veterans_day").date).toBe("2026-11-11");
    expect(on(2026, "thanksgiving").date).toBe("2026-11-26");
    expect(on(2026, "christmas_day").date).toBe("2026-12-25");
  });

  it("2027, which a hard-coded 2026 list would get silently wrong", () => {
    expect(on(2027, "mlk_day").date).toBe("2027-01-18");
    expect(on(2027, "memorial_day").date).toBe("2027-05-31");
    expect(on(2027, "labor_day").date).toBe("2027-09-06");
    expect(on(2027, "thanksgiving").date).toBe("2027-11-25");
  });

  it("2030 and 2031, generated the same way", () => {
    expect(on(2030, "thanksgiving").date).toBe("2030-11-28");
    expect(on(2031, "memorial_day").date).toBe("2031-05-26");
    expect(on(2031, "mlk_day").date).toBe("2031-01-20");
  });
});

describe("observed dates follow 5 U.S.C. § 6103(b)", () => {
  it("a Saturday holiday is observed the Friday before", () => {
    /* 4 July 2026 is a Saturday. */
    expect(weekdayOf(2026, 7, 4)).toBe(6);
    expect(on(2026, "independence_day").observed).toBe("2026-07-03");
    /* 25 December 2027 is a Saturday. */
    expect(on(2027, "christmas_day").observed).toBe("2027-12-24");
  });

  it("a Sunday holiday is observed the Monday after", () => {
    /* 19 June 2027 is a Saturday; 4 July 2027 is a Sunday. */
    expect(on(2027, "independence_day").observed).toBe("2027-07-05");
    /* 1 January 2028 is a Saturday, so it is observed in 2027. */
    expect(on(2028, "new_years_day").observed).toBe("2027-12-31");
  });

  it("a floating holiday never moves — it is already a weekday", () => {
    for (const year of [2026, 2027, 2028, 2029, 2030]) {
      for (const key of ["mlk_day", "presidents_day", "memorial_day", "labor_day", "columbus_day", "thanksgiving"]) {
        const h = on(year, key);
        expect(h.observed).toBe(h.date);
      }
    }
  });

  it("keeps the statutory date AND the observed date, because they answer different questions", () => {
    const h = on(2026, "independence_day");
    expect(h.date).toBe("2026-07-04");     // Independence Day IS the 4th
    expect(h.observed).toBe("2026-07-03"); // the office is closed on the 3rd
  });
});

describe("holidays that did not always exist", () => {
  it("Juneteenth starts in 2021, not before", () => {
    expect(holidaysForYear(2020).some((h) => h.key === "juneteenth")).toBe(false);
    expect(holidaysForYear(2021).some((h) => h.key === "juneteenth")).toBe(true);
  });

  it("MLK Day starts in 1986", () => {
    expect(holidaysForYear(1985).some((h) => h.key === "mlk_day")).toBe(false);
    expect(holidaysForYear(1986).some((h) => h.key === "mlk_day")).toBe(true);
  });

  it("gives eleven holidays in a current year", () => {
    expect(holidaysForYear(2026)).toHaveLength(11);
  });
});

describe("the timezone trap", () => {
  /* THE ONE THAT MATTERS. Much of the BES team is in Manila, thirteen hours
     ahead of New York. On a Manila morning it is still the previous day in
     the U.S., and a device-local date would take the holiday banner down
     while the U.S. holiday is still running. */
  it("reads the U.S. date, not the device's", () => {
    /* 5 July 2026, 08:00 in Manila = 4 July 2026, 20:00 in New York. */
    const manilaMorning = new Date("2026-07-05T00:00:00Z"); // 08:00 Manila
    expect(businessToday(manilaMorning, "Asia/Manila")).toBe("2026-07-05");
    expect(businessToday(manilaMorning, "America/New_York")).toBe("2026-07-04");
  });

  it("a calendar date's weekday does not depend on where you read it", () => {
    /* `new Date("2026-07-04").getDay()` differs by timezone; this must not. */
    expect(weekdayOf(2026, 7, 4)).toBe(6); // Saturday
    expect(weekdayOf(2026, 11, 26)).toBe(4); // Thursday
  });
});

describe("what to show today", () => {
  it("counts down, then says today, then stops", () => {
    const july4 = on(2026, "independence_day"); // observed 2026-07-03
    expect(statusOf(july4, "2026-06-26")).toBe("upcoming");
    expect(statusOf(july4, "2026-07-03")).toBe("today");
    expect(statusOf(july4, "2026-07-04")).toBe("passed");
  });

  it("finds today's holiday by its OBSERVED date", () => {
    expect(holidayToday("2026-07-03")?.key).toBe("independence_day");
    /* The statutory date is not a day off when it falls at the weekend. */
    expect(holidayToday("2026-07-04")).toBeNull();
  });

  it("looks into next year in December, when every holiday left is in January", () => {
    const next = upcomingHolidays("2026-12-28", 3);
    expect(next.length).toBe(3);
    expect(next[0].year).toBe(2027);
    expect(next.map((h) => h.daysAway).every((d) => d >= 0)).toBe(true);
  });

  it("includes today's holiday in the upcoming list rather than hiding it", () => {
    const next = upcomingHolidays("2026-07-03", 3);
    expect(next[0].key).toBe("independence_day");
    expect(next[0].daysAway).toBe(0);
    expect(next[0].status).toBe("today");
  });
});

describe("business days", () => {
  it("weekends and observed holidays are not working days", () => {
    expect(isBusinessDay("2026-07-03")).toBe(false); // observed Independence Day
    expect(isBusinessDay("2026-07-04")).toBe(false); // Saturday
    expect(isBusinessDay("2026-07-06")).toBe(true);  // Monday
  });

  it("finds the next working day across a long weekend", () => {
    expect(nextBusinessDay("2026-07-02")).toBe("2026-07-06");
  });

  it("addDays crosses months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("deadline warnings are warnings, never reschedules", () => {
  it("names the holiday a task is due on", () => {
    expect(deadlineWarning("2026-11-26")).toMatch(/Thanksgiving Day/);
    expect(deadlineWarning("2026-07-03")).toMatch(/Independence Day/);
  });

  it("flags the day after a holiday, which is the day everything lands", () => {
    expect(deadlineWarning("2026-11-27")).toMatch(/business day after Thanksgiving Day/);
  });

  it("says nothing about an ordinary working day", () => {
    expect(deadlineWarning("2026-07-08")).toBeNull();
  });

  it("returns a message and never a date — rescheduling is the manager's call", () => {
    const warning = deadlineWarning("2026-11-26");
    expect(warning).toBeTypeOf("string");
    expect(warning).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("display names are a policy choice, kept apart from the dates", () => {
  it("shows Presidents Day while the statute says Washington's Birthday", () => {
    const h = on(2026, "presidents_day");
    expect(h.name).toBe("Washington's Birthday");
    expect(displayName(h)).toBe("Presidents Day");
    /* The date is the statute's either way. */
    expect(h.date).toBe("2026-02-16");
  });

  it("keeps Columbus Day's federal date accurate whatever it is called", () => {
    expect(on(2026, "columbus_day").date).toBe("2026-10-12");
  });
});
