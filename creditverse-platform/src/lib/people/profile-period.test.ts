import { describe, expect, it } from "vitest";
import { periodProduction, periodWorkStats } from "./profile-period";

const range = { from: "2026-09-01", to: "2026-09-19" };
describe("current period work facts", () => {
  const items = [
    { assignedTo: "a", completedAt: "2026-09-03T10:00:00Z", dueAt: "2026-09-04T00:00:00Z", stage: "Completed" },
    { assignedTo: "a", completedAt: "2026-09-06T10:00:00Z", dueAt: "2026-09-05T00:00:00Z", stage: "Completed" },
    { assignedTo: "a", completedAt: "2026-09-07T10:00:00Z", stage: "Completed" },          // no due date: not in the SLA rate
    { assignedTo: "a", dueAt: "2026-09-10T00:00:00Z", stage: "In Processing" },             // overdue
    { assignedTo: "a", dueAt: "2026-09-30T00:00:00Z", stage: "Assigned" },                   // backlog, not overdue
    { assignedTo: "b", completedAt: "2026-09-03T10:00:00Z", dueAt: "2026-09-04T00:00:00Z", stage: "Completed" },
    { assignedTo: "a", completedAt: "2026-08-20T10:00:00Z", stage: "Completed" },           // last month
  ];
  it("counts completed, on-time share, overdue and backlog for the person", () => {
    expect(periodWorkStats(items, "a", range, "2026-09-19")).toEqual({ completed: 3, onTimePct: 50, overdue: 1, backlog: 2 });
  });
  it("has no SLA rate when nothing completed had a due date", () => {
    expect(periodWorkStats([{ assignedTo: "a", completedAt: "2026-09-03T10:00:00Z", stage: "Completed" }], "a", range, "2026-09-19").onTimePct).toBeNull();
  });
});

describe("current period production", () => {
  it("counts files and completed rounds from the logs", () => {
    const logs = [
      { workDate: "2026-09-02", actions: ["CRA Letters Prepared", "Round Processing Completed"] },
      { workDate: "2026-09-05", actions: ["Reimport / Credit Report Reviewed"] },
      { workDate: "2026-08-30", actions: ["Round Processing Completed"] },
    ];
    expect(periodProduction(logs, range)).toEqual({ files: 2, rounds: 1, actions: 3 });
  });
});
