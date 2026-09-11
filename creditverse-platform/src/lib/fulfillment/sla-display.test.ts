import { describe, expect, it } from "vitest";
import { readSla } from "@/lib/fulfillment/sla-display";

describe("how long is left, read the way an agent reads it", () => {
  it("turns the numbers from Dee's screenshot into something scannable", () => {
    /* These four sat side by side and could not be told apart at a glance. */
    expect(readSla(901.2).label).toBe("37d remaining");
    expect(readSla(949.2).label).toBe("39d remaining");
    expect(readSla(-106.8).label).toBe("Overdue 4d 11h");
    expect(readSla(-58.8).label).toBe("Overdue 2d 11h");
  });

  it("keeps hours only while hours are the useful unit", () => {
    expect(readSla(6).label).toBe("6h remaining");
    expect(readSla(11.4).label).toBe("11h remaining");
  });

  it("says Due today rather than a number, between half a day and a day", () => {
    expect(readSla(13).label).toBe("Due today");
    expect(readSla(23.9).label).toBe("Due today");
  });

  it("shows the leftover hours only inside a week, where they change the plan", () => {
    expect(readSla(52).label).toBe("2d 4h remaining");
    expect(readSla(48).label).toBe("2d remaining");
    expect(readSla(24 * 30).label).toBe("30d remaining");
  });

  it("treats the moment of expiry as due, not as on track", () => {
    expect(readSla(0.5).label).toBe("Due now");
    expect(readSla(0.5).tone).toBe("overdue");
  });

  it("has nothing to say when there is no due date", () => {
    expect(readSla(null)).toEqual({ label: "—", tone: "none" });
    expect(readSla(undefined).tone).toBe("none");
  });

  it("a parked client is waiting, not late", () => {
    /* A 30-day dispute wait is the workflow behaving, and colouring it red
       would teach agents to ignore red. */
    const r = readSla(720, "2026-10-10");
    expect(r.label).toBe("Waiting until Oct 10");
    expect(r.tone).toBe("ontrack");
  });

  it("colours overdue and due-soon differently from on track", () => {
    expect(readSla(-5).tone).toBe("overdue");
    expect(readSla(6).tone).toBe("soon");
    expect(readSla(13).tone).toBe("today");
    expect(readSla(240).tone).toBe("ontrack");
  });
});
