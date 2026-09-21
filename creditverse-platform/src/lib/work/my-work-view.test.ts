/**
 * What "my work" means on a phone: mine, actionable, and in plain words.
 */
import { describe, expect, it } from "vitest";
import type { WorkItem } from "@/lib/bes-domain";
import {
  actionableCount, dueLabel, dueTone, groupMyWork, isWaiting, workHref,
} from "./my-work-view";

const NOW = new Date("2026-09-21T10:00:00");
const at = (iso: string) => iso;
const item = (over: Partial<WorkItem> = {}): WorkItem => ({
  id: over.id ?? "w1", scope: "AGENCY", relatedType: "project", relatedId: "r1",
  title: "A task", stage: "Assigned", createdAt: "2026-09-01T00:00:00Z", ...over,
});

describe("what counts as mine to do", () => {
  it("blocked work is waiting on somebody else, not on my list", () => {
    expect(isWaiting(item({ stage: "Blocked" }))).toBe(true);
    expect(isWaiting(item({ stage: "Attention" }))).toBe(false);
  });
  it("the headline counts actionable work only — waiting and completed are out", () => {
    expect(actionableCount([
      item({ id: "a" }),
      item({ id: "b", stage: "Blocked" }),
      item({ id: "c", completedAt: "2026-09-20T00:00:00Z" }),
    ])).toBe(1);
  });
});

describe("due dates in words, not hours", () => {
  it("says overdue in days, and today when the hour has passed", () => {
    expect(dueLabel(at("2026-09-19T17:00:00"), NOW)).toBe("Overdue by 2 days");
    expect(dueLabel(at("2026-09-20T17:00:00"), NOW)).toBe("Overdue by a day");
    expect(dueLabel(at("2026-09-21T09:00:00"), NOW)).toBe("Overdue today");
  });
  it("counts the hours only inside the last day", () => {
    expect(dueLabel(at("2026-09-21T13:00:00"), NOW)).toBe("Due in 3 hours");
    expect(dueLabel(at("2026-09-21T10:30:00"), NOW)).toBe("Due within the hour");
  });
  it("names the day inside the week, then the date", () => {
    expect(dueLabel(at("2026-09-22T09:00:00"), NOW)).toBe("Due tomorrow");
    expect(dueLabel(at("2026-09-25T09:00:00"), NOW)).toBe("Due Friday");
    expect(dueLabel(at("2026-10-15T09:00:00"), NOW)).toBe("Due Oct 15");
  });
  it("says so plainly when there is no due date, and never invents one", () => {
    expect(dueLabel(null, NOW)).toBe("No due date");
    expect(dueLabel("not a date", NOW)).toBe("No due date");
    expect(dueTone(null, NOW)).toBe("none");
  });
});

describe("the day's order", () => {
  const items = [
    item({ id: "later", dueAt: at("2026-10-01T09:00:00") }),
    item({ id: "late", dueAt: at("2026-09-18T09:00:00") }),
    item({ id: "blocked", stage: "Blocked", dueAt: at("2026-09-18T09:00:00") }),
    item({ id: "today", dueAt: at("2026-09-21T17:00:00") }),
    item({ id: "soon", dueAt: at("2026-09-23T09:00:00") }),
    item({ id: "undated" }),
    item({ id: "done", completedAt: "2026-09-20T00:00:00Z", dueAt: at("2026-09-18T09:00:00") }),
  ];
  it("puts late first, then today, then the next few days, then the rest — waiting last and apart", () => {
    expect(groupMyWork(items, NOW).map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
      ["overdue", ["late"]],
      ["today", ["today"]],
      ["soon", ["soon"]],
      ["later", ["later", "undated"]],
      ["waiting", ["blocked"]],
    ]);
  });
  it("draws no empty group and never lists completed work", () => {
    const groups = groupMyWork([item({ id: "only", dueAt: at("2026-09-21T17:00:00") })], NOW);
    expect(groups.map((g) => g.key)).toEqual(["today"]);
  });
});

describe("one tap opens the record itself", () => {
  it("a workspace task opens its workspace", () => {
    expect(workHref(item({ workspaceId: "ws1" }))).toBe("/app/talentops?ws=ws1");
  });
  it("a CreditOps file opens the client, on whichever surface the viewer is on", () => {
    expect(workHref(item({ relatedType: "fulfillment", relatedId: "c1" }))).toBe("/app/creditops?client=c1");
    expect(workHref(item({ relatedType: "fulfillment", relatedId: "c1" }), "organization")).toBe("/app/operations?client=c1");
  });
  it("funding and CRM reach their own records", () => {
    expect(workHref(item({ relatedType: "funding_deal", relatedId: "f1" }))).toBe("/app/fundingops?client=f1");
    expect(workHref(item({ relatedType: "project", relatedId: "p1" }))).toBe("/app/bes-crm?project=p1");
  });
  it("is null rather than a link that goes nowhere", () => {
    expect(workHref(item({ relatedType: "support", relatedId: "" }))).toBeNull();
    expect(workHref(item({ relatedType: "support", relatedId: "x" }))).toBeNull();
  });
});
