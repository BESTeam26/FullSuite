import { describe, expect, it } from "vitest";
import {
  defaultStatus,
  groupItemsByStatus,
  openItemCount,
  type WorkspaceItem,
  type WorkspaceStatus,
} from "./workspace-domain";

const S = (id: string, position: number, isTerminal = false): WorkspaceStatus => ({
  id, key: id, label: id, colour: null, position,
  canonicalStage: isTerminal ? "Completed" : "Queued", isTerminal,
});
const I = (id: string, statusId: string | null): WorkspaceItem => ({
  id, title: id, description: null, priority: "Normal", assignedTo: null,
  dueAt: null, completedAt: null, createdAt: "2026-09-04T00:00:00Z",
  boardId: null, statusId, itemTypeId: null,
});

describe("workspace domain", () => {
  const statuses = [S("done", 3, true), S("backlog", 0), S("doing", 1)];

  it("default status is the first by position, regardless of array order", () => {
    expect(defaultStatus(statuses)?.id).toBe("backlog");
  });

  it("groups items under statuses in position order and surfaces orphans", () => {
    const { columns, orphans } = groupItemsByStatus(statuses, [
      I("a", "doing"), I("b", "backlog"), I("c", "ghost"), I("d", null),
    ]);
    expect(columns.map((c) => c.status.id)).toEqual(["backlog", "doing", "done"]);
    expect(columns[0].items.map((i) => i.id)).toEqual(["b"]);
    expect(columns[1].items.map((i) => i.id)).toEqual(["a"]);
    expect(orphans.map((i) => i.id)).toEqual(["c", "d"]);
  });

  it("counts open items as those not in a terminal status", () => {
    expect(openItemCount(statuses, [I("a", "done"), I("b", "doing"), I("c", null)])).toBe(2);
  });
});
