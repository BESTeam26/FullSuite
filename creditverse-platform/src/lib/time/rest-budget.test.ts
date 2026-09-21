/**
 * Break and lunch are the DAY's budget, so the timer counts the day.
 */
import { describe, expect, it } from "vitest";
import { dayTotalForState, restBudget } from "@/lib/time-domain";

const day = { workSeconds: 5 * 3600, breakSeconds: 22 * 60, lunchSeconds: 65 * 60 };
const schedule = { breakMinutes: 30, lunchMinutes: 60 };

describe("the day's rest against the day's allowance", () => {
  it("counts everything of that kind today, not the sitting in progress", () => {
    expect(restBudget("break", day, schedule).usedSeconds).toBe(22 * 60);
  });
  it("says what is left, and never as a negative", () => {
    expect(restBudget("break", day, schedule).remainingSeconds).toBe(8 * 60);
    expect(restBudget("lunch", day, schedule).remainingSeconds).toBe(0);
  });
  it("reports an over-run separately, because pay treats it separately", () => {
    expect(restBudget("lunch", day, schedule).overSeconds).toBe(5 * 60);
    expect(restBudget("break", day, schedule).overSeconds).toBe(0);
  });
  it("claims no allowance for somebody with no schedule", () => {
    const b = restBudget("break", day, null);
    expect(b.allowanceSeconds).toBeNull();
    expect(b.remainingSeconds).toBeNull();
    expect(b.usedSeconds).toBe(22 * 60);
  });
});

describe("the big number follows the state", () => {
  it("shows the day's total for whatever is running", () => {
    expect(dayTotalForState("work", day)).toBe(5 * 3600);
    expect(dayTotalForState("break", day)).toBe(22 * 60);
    expect(dayTotalForState("lunch", day)).toBe(65 * 60);
  });
});
