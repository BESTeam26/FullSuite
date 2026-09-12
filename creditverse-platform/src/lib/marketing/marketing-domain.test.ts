import { describe, expect, it } from "vitest";
import {
  approvalStateOf, calendarGrid, campaignProgress, compareByName, contentThisWeek,
  filterWork, isoDay, shiftMonth, shiftWeek, weekGrid,
  type MarketingWorkItem,
} from "./marketing-domain";

const item = (over: Partial<MarketingWorkItem> = {}): MarketingWorkItem => ({
  id: over.id ?? "i1", workspaceId: "w1", workspaceName: "BES Internal Marketing",
  partnerGroupId: null, partnerName: null, partnerContactName: null, title: "A post", description: null,
  priority: "Normal", assignedTo: null, assigneeName: null, teamId: null,
  dueAt: null, completedAt: null, createdAt: "2026-09-01T00:00:00Z", updatedAt: null,
  statusId: "s1", statusKey: "todo", statusLabel: "To Do", statusColour: null,
  statusPosition: 20, isTerminal: false, itemTypeId: null, itemTypeKey: "content",
  itemTypeLabel: "Content", campaignId: null, campaignName: null,
  publishOn: null, channel: null, contentType: null, ...over,
});

describe("partners are A→Z", () => {
  it("ignores case and accents, and compares numbers as numbers", () => {
    const rows = [
      { id: "1", name: "zenith" }, { id: "2", name: "Ápex" },
      { id: "3", name: "Apex 10" }, { id: "4", name: "Apex 2" },
    ];
    expect([...rows].sort(compareByName).map((r) => r.name))
      .toEqual(["Ápex", "Apex 2", "Apex 10", "zenith"]);
  });

  it("breaks a tie on id, so the order never changes between renders", () => {
    const a = { id: "aaa", name: "Same Name" };
    const b = { id: "bbb", name: "Same Name" };
    expect([b, a].sort(compareByName).map((r) => r.id)).toEqual(["aaa", "bbb"]);
  });
});

describe("the Content Calendar shows the same rows as the task list", () => {
  const month = new Date(2026, 9, 1); // October 2026

  it("puts a work item on its publish date, not its due date", () => {
    /* Dee: "one canonical work_item displayed by publish/scheduled date."
       A post approved on the 1st and published on the 5th belongs to the 5th. */
    const grid = calendarGrid(month, [item({ publishOn: "2026-10-05", dueAt: "2026-10-01T17:00:00Z" })]);
    expect(grid.find((d) => d.date === "2026-10-05")?.items).toHaveLength(1);
    expect(grid.find((d) => d.date === "2026-10-01")?.items).toHaveLength(0);
  });

  it("leaves work with no publish date off the calendar entirely", () => {
    /* It is a task, not unscheduled content looking for a home. Inventing a
       placeholder day for it is exactly the duplicate record Dee ruled out. */
    const grid = calendarGrid(month, [item({ publishOn: null })]);
    expect(grid.flatMap((d) => d.items)).toEqual([]);
  });

  it("is always 42 cells, so the grid does not change height between months", () => {
    for (const m of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      expect(calendarGrid(new Date(2026, m, 1), [])).toHaveLength(42);
    }
  });

  it("marks which days belong to the month and which are padding", () => {
    const grid = calendarGrid(month, []);
    expect(grid.filter((d) => d.inMonth)).toHaveLength(31);
    expect(grid[0].inMonth).toBe(false); // 1 Oct 2026 is a Thursday
    expect(grid.find((d) => d.date === "2026-10-01")?.inMonth).toBe(true);
  });

  it("marks today only on today", () => {
    const grid = calendarGrid(month, [], new Date(2026, 9, 14));
    expect(grid.filter((d) => d.isToday).map((d) => d.date)).toEqual(["2026-10-14"]);
  });

  it("puts several posts on one day, in a stable order", () => {
    const grid = calendarGrid(month, [
      item({ id: "b", title: "Reel", publishOn: "2026-10-07" }),
      item({ id: "a", title: "Carousel", publishOn: "2026-10-07" }),
    ]);
    expect(grid.find((d) => d.date === "2026-10-07")?.items.map((i) => i.title))
      .toEqual(["Carousel", "Reel"]);
  });

  it("builds a local date key without crossing a timezone boundary", () => {
    /* `toISOString().slice(0,10)` is a day out for anyone west of UTC after
       late afternoon — posts landing on the wrong day is the bug that makes a
       content calendar untrustworthy. */
    expect(isoDay(new Date(2026, 9, 5, 23, 30))).toBe("2026-10-05");
    expect(isoDay(new Date(2026, 0, 1, 0, 1))).toBe("2026-01-01");
  });

  it("pages between months without drifting", () => {
    expect(shiftMonth(new Date(2026, 0, 31), 1).getMonth()).toBe(1);
    expect(shiftMonth(new Date(2026, 11, 1), 1).getFullYear()).toBe(2027);
  });
});

describe("filtering the task list", () => {
  const rows = [
    item({ id: "1", title: "October launch", partnerName: "Apex", campaignName: "Q4 Launch" }),
    item({ id: "2", title: "Weekly reel", assigneeName: "Roniel Pena", isTerminal: true, statusKey: "completed" }),
    item({ id: "3", title: "Newsletter", channel: "Email", campaignId: "c1" }),
  ];

  it("hides finished work when asked, and shows it when not", () => {
    expect(filterWork(rows, { openOnly: true }).map((r) => r.id)).toEqual(["1", "3"]);
    expect(filterWork(rows, {})).toHaveLength(3);
  });

  it("searches the title, partner, campaign, assignee and channel together", () => {
    expect(filterWork(rows, { search: "apex" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterWork(rows, { search: "roniel" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterWork(rows, { search: "q4" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterWork(rows, { search: "email" }).map((r) => r.id)).toEqual(["3"]);
  });

  it("combines filters rather than replacing them", () => {
    expect(filterWork(rows, { openOnly: true, campaignId: "c1" }).map((r) => r.id)).toEqual(["3"]);
  });
});

describe("campaign progress", () => {
  it("counts only the work in that campaign", () => {
    const rows = [
      item({ id: "1", campaignId: "c1", isTerminal: true }),
      item({ id: "2", campaignId: "c1" }),
      item({ id: "3", campaignId: "c2", isTerminal: true }),
    ];
    expect(campaignProgress(rows, "c1")).toEqual({ total: 2, done: 1, percent: 50 });
  });

  it("is zero, not NaN, for a campaign nobody has put work in yet", () => {
    expect(campaignProgress([], "c1")).toEqual({ total: 0, done: 0, percent: 0 });
  });
});

describe("where content stands with the partner", () => {
  it("derives the approval state from the status, never a second column", () => {
    /* A stored approval flag drifts from the status the moment somebody moves
       a card, and then two screens disagree about whether a partner said yes. */
    expect(approvalStateOf(item({ statusKey: "in_progress" }))).toBe("none");
    expect(approvalStateOf(item({ statusKey: "partner_approval" }))).toBe("awaiting");
    expect(approvalStateOf(item({ statusKey: "changes_requested" }))).toBe("changes_requested");
    expect(approvalStateOf(item({ statusKey: "approved_scheduled" }))).toBe("approved");
  });

  it("counts Published as approved, because the partner did say yes", () => {
    /* Approval is not publication — but publication does not un-approve it. */
    expect(approvalStateOf(item({ statusKey: "published", isTerminal: true }))).toBe("approved");
  });
});

describe("the week view", () => {
  it("is seven days, Sunday first, matching the month view's columns", () => {
    const week = weekGrid(new Date(2026, 9, 14), []); // a Wednesday
    expect(week).toHaveLength(7);
    expect(week[0].date).toBe("2026-10-11"); // the Sunday
    expect(week[6].date).toBe("2026-10-17");
  });

  it("shows the same rows the month view would, on the same days", () => {
    const post = item({ publishOn: "2026-10-14", title: "Midweek reel" });
    const week = weekGrid(new Date(2026, 9, 14), [post]);
    const month = calendarGrid(new Date(2026, 9, 1), [post]);
    expect(week.find((d) => d.date === "2026-10-14")?.items[0].id).toBe(post.id);
    expect(month.find((d) => d.date === "2026-10-14")?.items[0].id).toBe(post.id);
  });

  it("pages across a month boundary without losing a day", () => {
    const week = weekGrid(shiftWeek(new Date(2026, 9, 28), 1), []);
    expect(week.map((d) => d.date)).toEqual([
      "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04",
      "2026-11-05", "2026-11-06", "2026-11-07",
    ]);
  });

  it("counts the next seven days as 'this week', including today", () => {
    const today = new Date(2026, 9, 14);
    const rows = [
      item({ id: "a", publishOn: "2026-10-14" }),
      item({ id: "b", publishOn: "2026-10-20" }),
      item({ id: "c", publishOn: "2026-10-21" }),
      item({ id: "d", publishOn: "2026-10-13" }),
    ];
    expect(contentThisWeek(rows, today).map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("the calendar filters", () => {
  const rows = [
    item({ id: "1", partnerGroupId: "g1", partnerName: "Apex", channel: "Instagram", statusKey: "partner_approval" }),
    item({ id: "2", partnerGroupId: null, partnerName: null, channel: "Email", statusKey: "in_progress" }),
    item({ id: "3", partnerGroupId: "g1", partnerName: "Apex", channel: "Instagram", statusKey: "changes_requested" }),
  ];

  it("narrows to one partner", () => {
    expect(filterWork(rows, { partnerGroupId: "g1" }).map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("can name BES's own work, which has no partner group", () => {
    /* A partner filter that could only name partners would make BES's own
       content unreachable in the global view. */
    expect(filterWork(rows, { partnerGroupId: "__bes__" }).map((r) => r.id)).toEqual(["2"]);
  });

  it("narrows by platform and by approval state", () => {
    expect(filterWork(rows, { channel: "Instagram" }).map((r) => r.id)).toEqual(["1", "3"]);
    expect(filterWork(rows, { approvalState: "awaiting" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterWork(rows, { approvalState: "changes_requested" }).map((r) => r.id)).toEqual(["3"]);
  });

  it("combines them rather than replacing one with the next", () => {
    expect(filterWork(rows, { partnerGroupId: "g1", approvalState: "awaiting" }).map((r) => r.id))
      .toEqual(["1"]);
  });
});
