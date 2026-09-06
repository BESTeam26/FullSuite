import { describe, expect, it } from "vitest";
import {
  birthdayGreeting,
  birthdayLabel,
  clientBirthdayGreeting,
  daysInMonth,
  daysUntilBirthday,
  monthDayOf,
  upcomingBirthdays,
  whenLabel,
} from "./birthday";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("daysUntilBirthday", () => {
  it("is zero on the day itself", () => {
    expect(daysUntilBirthday({ birthMonth: 3, birthDay: 14 }, day("2026-03-14"))).toBe(0);
  });

  it("counts forward within the year and rolls into the next", () => {
    expect(daysUntilBirthday({ birthMonth: 3, birthDay: 20 }, day("2026-03-14"))).toBe(6);
    expect(daysUntilBirthday({ birthMonth: 1, birthDay: 5 }, day("2026-12-31"))).toBe(5);
  });

  it("greets 29 February on the 28th in a common year", () => {
    expect(daysUntilBirthday({ birthMonth: 2, birthDay: 29 }, day("2026-02-28"))).toBe(0);
    expect(daysUntilBirthday({ birthMonth: 2, birthDay: 29 }, day("2028-02-29"))).toBe(0);
  });
});

describe("upcomingBirthdays", () => {
  const people = [
    { id: "a", name: "Zoe", birthMonth: 3, birthDay: 14 },
    { id: "b", name: "Alex", birthMonth: 3, birthDay: 14 },
    { id: "c", name: "Sam", birthMonth: 3, birthDay: 20 },
    { id: "d", name: "Kim", birthMonth: 9, birthDay: 1 },
  ];

  it("returns today first, then by date, then by name, dropping anyone further out", () => {
    const out = upcomingBirthdays(people, day("2026-03-14"), 14);
    expect(out.map((p) => p.name)).toEqual(["Alex", "Zoe", "Sam"]);
    expect(out[0].isToday).toBe(true);
    expect(out[2].daysAway).toBe(6);
  });

  it("returns nothing when no one is close", () => {
    expect(upcomingBirthdays(people, day("2026-06-01"), 14)).toEqual([]);
  });
});

describe("wording", () => {
  it("uses the first name and names the organization when there is one", () => {
    expect(birthdayGreeting("Dee Gallardo", "Cedar Financial")).toBe("Happy birthday, Dee! Everyone at Cedar Financial is wishing you a great day.");
    expect(birthdayGreeting("Dee")).toBe("Happy birthday, Dee! Wishing you a great day.");
    expect(clientBirthdayGreeting("Cleo Chan", "Cedar Financial")).toBe("Happy birthday, Cleo — from all of us at Cedar Financial.");
  });

  it("says when in plain words and labels a birthday without a year", () => {
    expect([whenLabel(0), whenLabel(1), whenLabel(5)]).toEqual(["today", "tomorrow", "in 5 days"]);
    expect(birthdayLabel(3, 14)).toBe("March 14");
  });
});

describe("monthDayOf and daysInMonth", () => {
  it("reads a stored date and refuses anything else", () => {
    expect(monthDayOf("1988-03-14")).toEqual({ month: 3, day: 14 });
    expect(monthDayOf(null)).toBeNull();
    expect(monthDayOf("not a date")).toBeNull();
  });

  it("offers 29 February because no year is stored", () => {
    expect(daysInMonth(2)).toBe(29);
    expect(daysInMonth(4)).toBe(30);
    expect(daysInMonth(12)).toBe(31);
  });
});
