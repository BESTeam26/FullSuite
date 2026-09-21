import { describe, expect, it } from "vitest";
import type { Workspace, WorkspaceItem } from "@/lib/workspaces/workspace-domain";
import { applyListQuery, DEFAULT_LIST_QUERY, groupWorkspaces, myWorkCounts, myWorkItems, treeGroupOf, workspaceOwnerLabel } from "./workspace-tree";

const W = (id: string, over: Partial<Workspace> = {}): Workspace => ({
  id, organizationId: null, name: id, description: null, icon: null, colour: null,
  boards: [], statuses: [], itemTypes: [], fields: [], ...over,
});
const I = (id: string, over: Partial<WorkspaceItem> = {}): WorkspaceItem => ({
  id, title: id, description: null, priority: "Normal", assignedTo: null, teamId: null,
  dueAt: null, completedAt: null, createdAt: "2026-09-01T00:00:00Z", boardId: null,
  statusId: null, itemTypeId: null, parentId: null, ...over,
});
const NOW = new Date("2026-09-21T10:00:00");

describe("the rail groups workspaces by who owns them (rule 16's three relationships)", () => {
  it("a partner's BES-owned workspace is a managed project; BES's own is internal; an organization's own is outsourcing", () => {
    expect(treeGroupOf({ organizationId: null, partnerGroupId: "p1" })).toBe("managed");
    expect(treeGroupOf({ organizationId: null, partnerGroupId: null })).toBe("internal");
    expect(treeGroupOf({ organizationId: "o1", partnerGroupId: null })).toBe("outsourcing");
  });
  it("headings appear in the mockup's order, A→Z inside, and an empty heading is not drawn", () => {
    const groups = groupWorkspaces([
      W("Zack", { partnerGroupId: "p2" }), W("Business Made Fair", { partnerGroupId: "p1" }), W("FullSuite"),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["managed", "internal"]);
    expect(groups[0].workspaces.map((w) => w.name)).toEqual(["Business Made Fair", "Zack"]);
  });
  it("the owner label prefers the joined name and never invents one", () => {
    expect(workspaceOwnerLabel(W("a", { organizationId: "o", organizationName: "Wavy One" }))).toBe("Wavy One");
    expect(workspaceOwnerLabel(W("b", { partnerGroupId: "p", partnerName: "ZackCredit" }))).toBe("ZackCredit");
    expect(workspaceOwnerLabel(W("c"))).toBe("BES");
  });
});

describe("MY WORK is about my own open work", () => {
  const items = [
    I("mine-today", { assignedTo: "me", dueAt: "2026-09-21T17:00:00" }),
    I("mine-late", { assignedTo: "me", dueAt: "2026-09-19T17:00:00" }),
    I("mine-done-late", { assignedTo: "me", dueAt: "2026-09-19T17:00:00", completedAt: "2026-09-20T00:00:00Z" }),
    I("theirs", { assignedTo: "someone", dueAt: "2026-09-21T09:00:00" }),
    I("starred-theirs", { assignedTo: "someone" }),
  ];
  const starred = new Set(["starred-theirs", "mine-done-late"]);
  it("counts assigned / due today / overdue for me only, and never counts completed work as overdue", () => {
    expect(myWorkCounts(items, "me", starred, NOW)).toEqual({ assigned: 2, today: 1, overdue: 1, starred: 2 });
  });
  it("Starred is a bookmark: it lists what I starred whether or not it is mine or open", () => {
    expect(myWorkItems("starred", items, "me", starred, NOW).map((i) => i.id)).toEqual(["mine-done-late", "starred-theirs"]);
  });
  it("with nobody signed in, the personal views are empty rather than everyone's work (rule 20b: narrowest true thing)", () => {
    expect(myWorkCounts(items, null, new Set(), NOW)).toEqual({ assigned: 0, today: 0, overdue: 0, starred: 0 });
  });
});

describe("the list toolbar", () => {
  const items = [
    I("b", { priority: "High", dueAt: "2026-09-25T00:00:00Z", createdAt: "2026-09-02T00:00:00Z" }),
    I("a", { priority: "Urgent", dueAt: "2026-09-22T00:00:00Z", assignedTo: "me" }),
    I("c", { createdAt: "2026-09-03T00:00:00Z" }),
  ];
  it("sorts by due date with undated work last, or by priority, or newest first", () => {
    expect(applyListQuery(items, DEFAULT_LIST_QUERY, "me").map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(applyListQuery(items, { ...DEFAULT_LIST_QUERY, sort: "priority" }, "me").map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(applyListQuery(items, { ...DEFAULT_LIST_QUERY, sort: "created" }, "me").map((i) => i.id)).toEqual(["c", "b", "a"]);
  });
  it("filters by assignee, priority and a search over title and description", () => {
    expect(applyListQuery(items, { ...DEFAULT_LIST_QUERY, assignee: "me" }, "me").map((i) => i.id)).toEqual(["a"]);
    expect(applyListQuery(items, { ...DEFAULT_LIST_QUERY, assignee: "unassigned" }, "me").map((i) => i.id)).toEqual(["b", "c"]);
    expect(applyListQuery(items, { ...DEFAULT_LIST_QUERY, priority: "High" }, "me").map((i) => i.id)).toEqual(["b"]);
    expect(applyListQuery(items, { ...DEFAULT_LIST_QUERY, search: "C" }, "me").map((i) => i.id)).toEqual(["c"]);
  });
});
