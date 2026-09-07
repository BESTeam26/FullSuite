import { describe, expect, it } from "vitest";
import type { WorkItem } from "@/lib/bes-domain";
import { bucketForManager, bucketMyWork, dayKey, isOverdue, sortItems, workloadBy } from "./team-views";

const NOW = new Date("2026-09-08T15:00:00").getTime();
const at = (h: number, dayOffset = 0) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};
const item = (over: Partial<WorkItem> & { id: string }): WorkItem => ({
  scope: "AGENCY", relatedType: "support", relatedId: "", title: over.id,
  stage: "Assigned", createdAt: "", ...over,
});

describe("my work buckets", () => {
  it("puts every item in exactly one bucket", () => {
    const items = [
      item({ id: "overdue", dueAt: at(9) }),
      item({ id: "due-today", dueAt: at(23) }),
      item({ id: "upcoming", dueAt: at(9, 3) }),
      item({ id: "blocked", stage: "Blocked", dueAt: at(9) }),
      item({ id: "done", stage: "Completed", completedAt: at(11) }),
      item({ id: "undated" }),
    ];
    const b = bucketMyWork(items, NOW);
    expect(b.overdue.map((i) => i.id)).toEqual(["overdue"]);
    expect(b.dueToday.map((i) => i.id)).toEqual(["due-today"]);
    expect(b.upcoming.map((i) => i.id)).toEqual(["upcoming"]);
    expect(b.completedToday.map((i) => i.id)).toEqual(["done"]);
    expect(b.other.map((i) => i.id)).toEqual(["undated"]);

    /* An overdue AND blocked task belongs under Blocked only — the blocker is
       the thing to act on, and counting it twice inflates the day. */
    expect(b.blocked.map((i) => i.id)).toEqual(["blocked"]);
    const total = b.overdue.length + b.dueToday.length + b.upcoming.length
      + b.blocked.length + b.completedToday.length + b.other.length;
    expect(total).toBe(items.length);
  });

  it("does not call an undated task overdue", () => {
    expect(isOverdue(item({ id: "x" }), NOW)).toBe(false);
    expect(isOverdue(item({ id: "x", dueAt: at(9) }), NOW)).toBe(true);
    expect(isOverdue(item({ id: "x", dueAt: at(9), completedAt: at(10) }), NOW)).toBe(false);
  });

  it("counts a day in the viewer's own timezone, not UTC", () => {
    /* 11:30pm local on the 8th is already the 9th in UTC for much of the
       Americas. A UTC boundary would push an evening completion into
       tomorrow's report and out of tonight's EOD. */
    expect(dayKey(new Date("2026-09-08T23:30:00"))).toBe("2026-09-08");
  });

  it("shows only work completed TODAY, not everything ever finished", () => {
    const b = bucketMyWork([
      item({ id: "today", stage: "Completed", completedAt: at(11) }),
      item({ id: "yesterday", stage: "Completed", completedAt: at(11, -1) }),
    ], NOW);
    expect(b.completedToday.map((i) => i.id)).toEqual(["today"]);
  });
});

describe("manager buckets", () => {
  it("separates unassigned from overdue, because nobody is watching it", () => {
    const b = bucketForManager([
      item({ id: "a", dueAt: at(9), assignedTo: "u1" }),
      item({ id: "b", dueAt: at(9) }),
      item({ id: "c", stage: "Blocked", assignedTo: "u1" }),
      item({ id: "d", stage: "Completed", completedAt: at(12), assignedTo: "u1" }),
    ], NOW);
    expect(b.overdue.map((i) => i.id).sort()).toEqual(["a", "b"]);
    expect(b.unassigned.map((i) => i.id)).toEqual(["b"]);
    expect(b.blocked.map((i) => i.id)).toEqual(["c"]);
    expect(b.recentlyCompleted.map((i) => i.id)).toEqual(["d"]);
  });
});

describe("workload", () => {
  it("counts per person and names the unassigned pile", () => {
    const rows = workloadBy(
      [
        item({ id: "1", assignedTo: "u1", dueAt: at(9) }),
        item({ id: "2", assignedTo: "u1" }),
        item({ id: "3" }),
        item({ id: "4", assignedTo: "u1", stage: "Completed", completedAt: at(10) }),
      ],
      (i) => i.assignedTo,
      (k) => (k === "u1" ? "Ada" : k),
      NOW,
    );
    const ada = rows.find((r) => r.label === "Ada")!;
    expect(ada.open).toBe(2);
    expect(ada.overdue).toBe(1);
    expect(ada.completedToday).toBe(1);
    expect(rows.find((r) => r.label === "Unassigned")!.open).toBe(1);
  });
});

describe("sorting", () => {
  it("puts urgent first and undated last", () => {
    const items = [
      item({ id: "normal-undated" }),
      item({ id: "urgent", priority: "Urgent", dueAt: at(9, 5) }),
      item({ id: "high", priority: "High", dueAt: at(9) }),
    ];
    expect(sortItems(items, "priority", () => "").map((i) => i.id)).toEqual(["urgent", "high", "normal-undated"]);
    expect(sortItems(items, "due", () => "").map((i) => i.id)).toEqual(["high", "urgent", "normal-undated"]);
  });
});
