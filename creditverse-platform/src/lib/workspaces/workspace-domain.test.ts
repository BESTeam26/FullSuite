import { describe, expect, it } from "vitest";
import {
  defaultStatus,
  groupItemsByStatus,
  isOverdue,
  isTerminalStage,
  openItemCount,
  slugKey,
  validateFieldValue,
  type WorkspaceField,
  type WorkspaceItem,
  type WorkspaceStatus,
} from "./workspace-domain";

const S = (id: string, position: number, isTerminal = false): WorkspaceStatus => ({
  id, key: id, label: id, colour: null, position,
  canonicalStage: isTerminal ? "Completed" : "Queued", isTerminal,
});
const I = (id: string, statusId: string | null): WorkspaceItem => ({
  id, title: id, description: null, priority: "Normal", assignedTo: null,
  teamId: null, dueAt: null, completedAt: null, createdAt: "2026-09-04T00:00:00Z",
  boardId: null, statusId, itemTypeId: null,
});
const F = (fieldType: WorkspaceField["fieldType"], choices: string[] = []): WorkspaceField => ({
  id: "f", key: "f", label: "F", fieldType, choices, position: 0, archivedAt: null,
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

  it("keys are stable, lowercase and start with a letter", () => {
    expect(slugKey("Target Close!")).toBe("target_close");
    expect(slugKey("  2026 Plan ")).toBe("s_2026_plan");
    expect(slugKey("")).toBe("");
  });

  it("only Completed is terminal", () => {
    expect(isTerminalStage("Completed")).toBe(true);
    expect(isTerminalStage("QA Review")).toBe(false);
  });

  it("validates field values by type, mirroring the database", () => {
    expect(validateFieldValue(F("text"), "ok")).toBeNull();
    expect(validateFieldValue(F("text"), "x".repeat(2001))).not.toBeNull();
    expect(validateFieldValue(F("number"), 3)).toBeNull();
    expect(validateFieldValue(F("number"), "3")).not.toBeNull();
    expect(validateFieldValue(F("date"), "2026-09-04")).toBeNull();
    expect(validateFieldValue(F("date"), "04/09/2026")).not.toBeNull();
    expect(validateFieldValue(F("select", ["a", "b"]), "a")).toBeNull();
    expect(validateFieldValue(F("select", ["a", "b"]), "c")).not.toBeNull();
    expect(validateFieldValue(F("checkbox"), true)).toBeNull();
    expect(validateFieldValue(F("checkbox"), "yes")).not.toBeNull();
    expect(validateFieldValue(F("number"), null)).toBeNull();
  });

  it("overdue means past due and not complete", () => {
    const now = Date.parse("2026-09-04T12:00:00Z");
    expect(isOverdue({ ...I("a", null), dueAt: "2026-09-01T00:00:00Z" }, now)).toBe(true);
    expect(isOverdue({ ...I("a", null), dueAt: "2026-09-01T00:00:00Z", completedAt: "2026-09-02T00:00:00Z" }, now)).toBe(false);
    expect(isOverdue({ ...I("a", null), dueAt: "2026-09-09T00:00:00Z" }, now)).toBe(false);
  });
});
