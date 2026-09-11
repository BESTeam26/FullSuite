/**
 * The BES CRM project lifecycle, as rules rather than as a screen.
 *
 * A project is work UNDERNEATH a partner's service engagement. Its lifecycle
 * therefore says nothing about the relationship above it, and the thing worth
 * locking is which projects are in active work and which of them may be
 * destroyed — the rest is proved against the live database in phase 73, where
 * the policies and functions actually live.
 */
import { describe, expect, it } from "vitest";
import { isActiveProject, isDeletable, lifecycleStateOf } from "@/lib/crm/project-lifecycle";

interface TestProject {
  completedAt: string | null;
  archivedAt: string | null;
  deletionBlockers: string[];
}

const project = (over: Partial<TestProject> = {}): TestProject => ({
  completedAt: null,
  archivedAt: null,
  deletionBlockers: [],
  ...over,
});

describe("which projects are in active work", () => {
  it("a new project is active", () => {
    expect(lifecycleStateOf(project())).toBe("active");
    expect(isActiveProject(project())).toBe(true);
  });

  it("completing takes it out of active work", () => {
    const p = project({ completedAt: "2026-09-11T00:00:00Z" });
    expect(lifecycleStateOf(p)).toBe("completed");
    expect(isActiveProject(p)).toBe(false);
  });

  it("archiving takes it out of active work", () => {
    const p = project({ archivedAt: "2026-09-11T00:00:00Z" });
    expect(lifecycleStateOf(p)).toBe("archived");
    expect(isActiveProject(p)).toBe(false);
  });

  it("archived wins over completed, because it is the stronger statement", () => {
    /* A completed build that was later archived is archived. Reading it the
       other way would leave it in a Completed list nobody is tidying. */
    expect(lifecycleStateOf(project({
      completedAt: "2026-09-01T00:00:00Z",
      archivedAt: "2026-09-11T00:00:00Z",
    }))).toBe("archived");
  });

  it("reopening — both cleared — puts it back in active work", () => {
    expect(isActiveProject(project({ completedAt: null, archivedAt: null }))).toBe(true);
  });
});

describe("deletion is refused whenever there is something to lose", () => {
  it("an empty project is disposable", () => {
    expect(isDeletable(project())).toBe(true);
  });

  it("recorded production blocks it", () => {
    expect(isDeletable(project({ deletionBlockers: ["recorded production (13)"] }))).toBe(false);
  });

  it("any single blocker is enough — they are reasons, not a score", () => {
    for (const reason of [
      "logged time (2)",
      "work that has been started (13)",
      "completed milestones (7)",
      "attached files (1)",
      "client requirements (1)",
    ]) {
      expect(isDeletable(project({ deletionBlockers: [reason] }))).toBe(false);
    }
  });

  it("a completed project with history is not deletable — archive keeps it", () => {
    expect(isDeletable(project({
      completedAt: "2026-09-11T00:00:00Z",
      deletionBlockers: ["recorded production (13)"],
    }))).toBe(false);
  });
});
