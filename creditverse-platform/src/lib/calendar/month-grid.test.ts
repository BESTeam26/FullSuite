import { describe, expect, it } from "vitest";
import { addMonths, dayKey, monthGrid, monthGridEnd, monthLabel } from "./month-grid";

describe("dayKey", () => {
  it("is the LOCAL day, not the UTC one", () => {
    /* An evening deadline must not land on tomorrow for anybody west of
       Greenwich, which is everybody at BES. */
    const evening = new Date(2026, 8, 30, 21, 30);
    expect(dayKey(evening)).toBe("2026-09-30");
  });

  it("pads the month and the day", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("monthGrid", () => {
  it("starts on a Sunday and ends on a Saturday", () => {
    const g = monthGrid(2026, 8); // September 2026
    expect(g[0].date.getDay()).toBe(0);
    expect(g[g.length - 1].date.getDay()).toBe(6);
  });

  it("is a whole number of weeks", () => {
    for (let m = 0; m < 12; m += 1) expect(monthGrid(2026, m).length % 7).toBe(0);
  });

  it("uses only the rows the month needs — five for a short February", () => {
    /* February 2026 starts on a Sunday and has 28 days: exactly four weeks. A
       fixed six-row grid would draw two empty rows. */
    expect(monthGrid(2026, 1).length).toBe(28);
    /* August 2026 starts on a Saturday and needs six rows. */
    expect(monthGrid(2026, 7).length).toBe(42);
  });

  it("contains every day of the month exactly once", () => {
    const g = monthGrid(2026, 8);
    const inMonth = g.filter((d) => d.inMonth).map((d) => d.dayOfMonth);
    expect(inMonth).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("marks the borrowed days from either side as out of month", () => {
    const g = monthGrid(2026, 8);
    expect(g.some((d) => !d.inMonth)).toBe(true);
    for (const d of g.filter((x) => !x.inMonth)) expect(d.date.getMonth()).not.toBe(8);
  });

  it("gets a leap February right", () => {
    const inMonth = monthGrid(2024, 1).filter((d) => d.inMonth);
    expect(inMonth.length).toBe(29);
    expect(inMonth[inMonth.length - 1].dayOfMonth).toBe(29);
  });

  it("produces unique keys", () => {
    const g = monthGrid(2026, 8);
    expect(new Set(g.map((d) => d.key)).size).toBe(g.length);
  });
});

describe("addMonths", () => {
  it("crosses a year boundary in both directions", () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });

  it("does not let the 31st become the 1st", () => {
    /* The bug this exists to avoid: `new Date(y, m, 31)` then setMonth(+1)
       rolls over. Working in whole months from an index cannot. */
    expect(addMonths(2026, 0, 1)).toEqual({ year: 2026, month: 1 });
  });

  it("moves by a year at a time", () => {
    expect(addMonths(2026, 5, 12)).toEqual({ year: 2027, month: 5 });
    expect(addMonths(2026, 5, -12)).toEqual({ year: 2025, month: 5 });
  });
});

describe("monthGridEnd", () => {
  it("is the last moment of the last cell, so a horizon covers the whole grid", () => {
    const end = monthGridEnd(2026, 8);
    const g = monthGrid(2026, 8);
    expect(dayKey(end)).toBe(g[g.length - 1].key);
    expect(end.getHours()).toBe(23);
  });
});

describe("monthLabel", () => {
  it("names the month and the year", () => {
    expect(monthLabel(2026, 8)).toMatch(/2026/);
  });
});
