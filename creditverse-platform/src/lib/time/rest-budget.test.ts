/**
 * Break and lunch are the DAY's budget, so the timer counts the day.
 */
import { describe, expect, it } from "vitest";
import {
  dayTotalForState, liveDaySeconds, restBudget, restChip, restClock,
  restDaySummary, restPhrase, restPunchLabel,
} from "@/lib/time-domain";
import type { TimeEntry } from "@/lib/data/time-entries";

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

/* ──────────────────────────────────────────────────────────────────────────
 * Dee's twelve proofs, 2026-09-21.
 *
 * "BREAK AND LUNCH TIMERS MUST BE DAILY ACCUMULATED TIMERS." Each numbered
 * test below is one of the twelve she listed. They run over real SEGMENTS,
 * not pre-summed totals, because the thing being proved is that separate
 * punches add up — and that they stay separate rows while they do.
 * ────────────────────────────────────────────────────────────────────────── */

const TODAY = "2026-09-21";
/* 2:00 PM Eastern — mid-afternoon, comfortably inside the ET workday. */
const NOW = new Date("2026-09-21T18:00:00.000Z");

const seg = (
  kind: "work" | "break" | "lunch",
  startMinutesAgo: number,
  lengthMinutes: number | null,
  over: Partial<TimeEntry> = {},
): TimeEntry => ({
  id: `${kind}-${startMinutesAgo}`,
  divisionId: "creditops",
  workDate: TODAY,
  startedAt: new Date(NOW.getTime() - startMinutesAgo * 60_000).toISOString(),
  endedAt: lengthMinutes === null
    ? undefined
    : new Date(NOW.getTime() - (startMinutesAgo - lengthMinutes) * 60_000).toISOString(),
  durationMinutes: lengthMinutes ?? undefined,
  autoStopped: false,
  kind,
  ...over,
});

const breakBudget = (entries: TimeEntry[], now = NOW) =>
  restBudget("break", liveDaySeconds(entries, TODAY, now), schedule);
const lunchBudget = (entries: TimeEntry[], now = NOW) =>
  restBudget("lunch", liveDaySeconds(entries, TODAY, now), schedule);

describe("Dee's accumulation rules", () => {
  it("1 · a first ten-minute break counts from zero up to ten", () => {
    const start = breakBudget([seg("break", 0, null)]);
    expect(start.usedSeconds).toBe(0);
    const tenIn = breakBudget([seg("break", 0, null)], new Date(NOW.getTime() + 10 * 60_000));
    expect(tenIn.usedSeconds).toBe(10 * 60);
  });

  it("2 · a second break resumes from the first, not from zero", () => {
    /* Ten minutes banked, a new break just begun: the counter reads 10:00,
       which is the whole point — 00:00 would say the allowance is untouched. */
    const b = breakBudget([seg("break", 120, 10), seg("break", 0, null)]);
    expect(b.usedSeconds).toBe(10 * 60);
    expect(restClock(b.usedSeconds)).toBe("10:00");
  });

  it("3 · thirty minutes in total is still entirely paid", () => {
    const b = breakBudget([seg("break", 200, 12), seg("break", 120, 10), seg("break", 60, 8)]);
    expect(b.usedSeconds).toBe(30 * 60);
    expect(b.overSeconds).toBe(0);
    expect(restDaySummary(liveDaySeconds([seg("break", 200, 12), seg("break", 120, 10), seg("break", 60, 8)], TODAY, NOW), schedule))
      .toMatchObject({ paidBreakMinutes: 30, overBreakMinutes: 0 });
  });

  it("4 · the thirty-first minute is over, and unpaid", () => {
    const entries = [seg("break", 200, 20), seg("break", 60, 11)];
    const b = breakBudget(entries);
    expect(b.overSeconds).toBe(60);
    expect(restPhrase("break", b)).toMatchObject({ over: true, detail: "Over break by 1:00 · unpaid" });
    /* Paid stops at the allowance; the extra minute is reported, never paid. */
    expect(restDaySummary(liveDaySeconds(entries, TODAY, NOW), schedule))
      .toMatchObject({ paidBreakMinutes: 30, overBreakMinutes: 1 });
  });

  it("5 · three break segments aggregate, and remain three rows", () => {
    /* Dee: "Do not merge the raw rows into one fake punch." */
    const entries = [seg("break", 300, 12), seg("break", 180, 12), seg("break", 60, 9)];
    expect(breakBudget(entries).usedSeconds).toBe(33 * 60);
    expect(breakBudget(entries).overSeconds).toBe(3 * 60);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.durationMinutes)).toEqual([12, 12, 9]);
  });

  it("6 · split lunches aggregate the same way", () => {
    const entries = [seg("lunch", 300, 42), seg("lunch", 100, 26)];
    const l = lunchBudget(entries);
    expect(l.usedSeconds).toBe(68 * 60);
    expect(l.overSeconds).toBe(8 * 60);
  });

  it("7 · a second lunch resumes from the previous total", () => {
    const b = lunchBudget([seg("lunch", 300, 42), seg("lunch", 0, null)]);
    expect(restClock(b.usedSeconds)).toBe("42:00");
    expect(restPhrase("lunch", b).heading).toBe("On lunch · 42:00 used today");
  });

  it("8 · a refresh during an active break rebuilds the same accumulated total", () => {
    /* There is no browser accumulator to lose: the figure is recomputed from
       the segments and the open entry's server `started_at` every render. */
    const entries = [seg("break", 200, 18), seg("break", 5, null)];
    const first = breakBudget(entries);
    const afterReload = breakBudget(entries.map((e) => ({ ...e })));
    expect(afterReload.usedSeconds).toBe(first.usedSeconds);
    expect(first.usedSeconds).toBe(23 * 60);
  });

  it("9 and 10 · the same inputs give the same totals on any device, and time asleep still counts", () => {
    const entries = [seg("break", 200, 18), seg("break", 5, null)];
    /* "Mobile" simply renders later — nothing about the figure is per-device,
       and a backgrounded app that misses 300 ticks still reads correctly
       because the elapsed span is now minus the server's start. */
    const later = new Date(NOW.getTime() + 5 * 60_000);
    expect(breakBudget(entries, later).usedSeconds).toBe(28 * 60);
  });

  it("11 · the day resets on the ET work_date, not on the device's midnight", () => {
    /* Yesterday's break carries a different `work_date`, so it is not counted
       however the reader's own calendar is set — the server stamped that
       column from Eastern (20260921014000). */
    const yesterday = { ...seg("break", 900, 25), workDate: "2026-09-20" };
    expect(breakBudget([yesterday, seg("break", 60, 7)]).usedSeconds).toBe(7 * 60);
  });

  it("12 · My Time's summary uses the cap payroll pays on", () => {
    /* `payable_minutes` pays least(day's break, allowance) per work_date.
       `restDaySummary` applies the same cap, so the screen and the payslip
       cannot disagree. */
    const entries = [seg("work", 480, 380), seg("break", 300, 38), seg("lunch", 200, 74)];
    expect(restDaySummary(liveDaySeconds(entries, TODAY, NOW), schedule)).toEqual({
      workMinutes: 380, paidBreakMinutes: 30, overBreakMinutes: 8,
      lunchMinutes: 74, overLunchMinutes: 14,
    });
  });
});

describe("what each surface says", () => {
  it("names the remaining allowance on the button, before it is pressed", () => {
    expect(restPunchLabel("break", breakBudget([seg("break", 60, 24)]))).toBe("Break · 6m paid left");
    expect(restPunchLabel("break", breakBudget([seg("break", 60, 30)]))).toBe("Break · unpaid");
    expect(restPunchLabel("lunch", lunchBudget([seg("lunch", 60, 42)]))).toBe("Lunch · 18m standard left");
    expect(restPunchLabel("lunch", lunchBudget([seg("lunch", 60, 70)]))).toBe("Lunch · over allowance");
  });

  it("carries the compact totals while somebody is working", () => {
    const d = liveDaySeconds([seg("break", 300, 24), seg("lunch", 200, 42)], TODAY, NOW);
    expect(restChip("break", restBudget("break", d, schedule))).toBe("Break 24 / 30m");
    expect(restChip("lunch", restBudget("lunch", d, schedule))).toBe("Lunch 42 / 60m");
  });

  it("says lunch is unpaid whether or not it is over", () => {
    expect(restPhrase("lunch", lunchBudget([seg("lunch", 60, 48)])).detail)
      .toBe("Lunch is unpaid · 12:00 remaining in standard lunch");
    expect(restPhrase("lunch", lunchBudget([seg("lunch", 60, 67)])).detail).toBe("Over lunch by 7:00");
  });

  it("promises no allowance to somebody with no schedule, and pays them none", () => {
    const d = liveDaySeconds([seg("break", 60, 20)], TODAY, NOW);
    expect(restPunchLabel("break", restBudget("break", d, null))).toBe("Break");
    expect(restDaySummary(d, null)).toMatchObject({ paidBreakMinutes: 0, overBreakMinutes: 20 });
  });

  it("never pads the leftmost unit, and always pads the rest", () => {
    expect(restClock(5 * 60 + 42)).toBe("5:42");
    expect(restClock(24 * 60 + 18)).toBe("24:18");
    expect(restClock(3600 + 7 * 60 + 22)).toBe("1:07:22");
  });
});
