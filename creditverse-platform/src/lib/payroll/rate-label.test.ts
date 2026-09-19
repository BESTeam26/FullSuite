import { describe, expect, it } from "vitest";
import { describeRateBasis, rateSuffix } from "./rate-label";

const peso = (c: number) => `₱${(c / 100).toFixed(2)}`;

describe("a pay rate's suffix", () => {
  it("names the unit for every type, never a wrong one", () => {
    expect(rateSuffix("hourly")).toBe("/ hour");
    expect(rateSuffix("monthly")).toBe("/ month");
    expect(rateSuffix("per_cutoff")).toBe("/ cutoff");
  });
});

describe("the derived basis line", () => {
  const basis = { daysPerYear: 261, paidMinutesPerDay: 480, dailyCents: 91954, hourlyCents: 11494 };

  it("states the day, the hour and the factor for a monthly package", () => {
    expect(describeRateBasis("monthly", basis, peso))
      .toBe("≈ ₱919.54 a day · ₱114.94 an hour (261 paid days a year × 8h from the schedule)");
  });

  it("says why there is nothing when the schedule is missing, rather than guessing", () => {
    expect(describeRateBasis("monthly", { daysPerYear: null, paidMinutesPerDay: null, dailyCents: null, hourlyCents: null }, peso))
      .toBe("Set a work schedule to derive the daily and hourly rate.");
    expect(describeRateBasis("monthly", null, peso)).toBe("Set a work schedule to derive the daily and hourly rate.");
  });

  it("gives an hourly rate its day and nothing for a fixed cutoff", () => {
    expect(describeRateBasis("hourly", { ...basis, dailyCents: 92000, hourlyCents: 11500 }, peso))
      .toBe("≈ ₱920.00 a day (261 paid days a year × 8h from the schedule)");
    expect(describeRateBasis("per_cutoff", basis, peso)).toBeNull();
  });
});
