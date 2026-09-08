import { describe, expect, it } from "vitest";
import {
  currentDepartment,
  describeHandoff,
  handoffEntryStatus,
  handoffTargets,
  planHandoffs,
  departmentStatuses,
  isOpenDepartmentStatus,
  isValidDepartmentStatus,
  nextDepartment,
  openDepartments,
} from "./department-domain";

const rows = [
  { department: "Onboarding", status: "OB READY FOR R1", updatedAt: "2026-09-01" },
  { department: "Dispute", status: "READY FOR PROCESSING", updatedAt: "2026-09-02" },
  { department: "Support", status: "SUPPORT NEW", updatedAt: "2026-09-02" },
  { department: "Complaints", status: "CM NOT NEEDED", updatedAt: "2026-09-02" },
  { department: "Bureau Calling", status: "BC NOT NEEDED", updatedAt: "2026-09-02" },
];

describe("department / work status", () => {
  it("vocabulary comes from the Status Guide", () => {
    expect(departmentStatuses("Bureau Calling")).toEqual(["BC NOT NEEDED", "BC NEEDED", "BC IN PROGRESS", "BC COMPLETED"]);
    expect(isValidDepartmentStatus("Support", "billing issue")).toBe(true);
    expect(isValidDepartmentStatus("Support", "BC NEEDED")).toBe(false);
  });
  it("closed statuses mean no open work; current department is the first open one in order", () => {
    expect(isOpenDepartmentStatus("CM NOT NEEDED")).toBe(false);
    expect(isOpenDepartmentStatus("Letters Pending")).toBe(true);
    expect(openDepartments(rows).map((r) => r.department)).toEqual(["Dispute", "Support"]);
    expect(currentDepartment(rows)?.department).toBe("Dispute");
    expect(currentDepartment([])).toBeNull();
  });
  it("hand-off follows the department order and stops at the end", () => {
    expect(nextDepartment("Onboarding")).toBe("Dispute");
    expect(nextDepartment("Bureau Calling")).toBeNull();
  });
  it("a hand-off opens the next department on its first open status", () => {
    expect(handoffEntryStatus("Complaints")).toBe("LETTERS PENDING");
    expect(handoffEntryStatus("Bureau Calling")).toBe("BC NEEDED");
    expect(handoffEntryStatus("Support")).toBe("SUPPORT NEW");
  });
});

describe("handing off to several departments at once", () => {
  const row = (department: string, status: string) => ({
    department, status, updatedAt: "2026-09-08T00:00:00Z",
  });

  it("offers every department except the one the file is with", () => {
    expect(handoffTargets("Dispute")).toEqual(["Onboarding", "Support", "Complaints", "Bureau Calling"]);
    /* Bureau Calling used to be "the last department in the sequence" and could
       hand off to nothing at all. */
    expect(handoffTargets("Bureau Calling")).toContain("Complaints");
    expect(handoffTargets("Bureau Calling")).not.toContain("Bureau Calling");
  });

  it("opens Bureau Calling AND Complaints from one handoff", () => {
    const plan = planHandoffs("Dispute", ["Bureau Calling", "Complaints"], []);
    expect(plan.opening.map((o) => o.department)).toEqual(["Bureau Calling", "Complaints"]);
    expect(plan.opening.map((o) => o.entryStatus)).toEqual(["BC NEEDED", "LETTERS PENDING"]);
    expect(plan.alreadyOpen).toEqual([]);
  });

  it("leaves a department that is already working the file exactly where it is", () => {
    /* Re-sending a file to Bureau Calling mid-call must not knock it back to
       BC NEEDED and lose where it had got to. */
    const plan = planHandoffs("Dispute", ["Bureau Calling", "Complaints"],
      [row("Bureau Calling", "BC IN PROGRESS")]);
    expect(plan.alreadyOpen).toEqual([{ department: "Bureau Calling", status: "BC IN PROGRESS" }]);
    expect(plan.opening.map((o) => o.department)).toEqual(["Complaints"]);
  });

  it("re-opens a department whose work was closed", () => {
    const plan = planHandoffs("Dispute", ["Bureau Calling"], [row("Bureau Calling", "BC COMPLETED")]);
    expect(plan.opening).toEqual([{ department: "Bureau Calling", entryStatus: "BC NEEDED" }]);
  });

  it("refuses to hand a file to the department it is already with", () => {
    const plan = planHandoffs("Dispute", ["Dispute", "Support"], []);
    expect(plan.refused.map((r) => r.department)).toEqual(["Dispute"]);
    expect(plan.opening.map((o) => o.department)).toEqual(["Support"]);
  });

  it("ignores a department named twice", () => {
    const plan = planHandoffs("Dispute", ["Support", "Support"], []);
    expect(plan.opening).toHaveLength(1);
  });

  it("does NOT close the source department", () => {
    /* A handoff opens the target. Finishing your own part is a separate,
       deliberate status change — otherwise handing to Complaints would
       silently declare Dispute finished. */
    const rows = [row("Dispute", "IN PROCESSING")];
    const plan = planHandoffs("Dispute", ["Complaints"], rows);
    expect(plan.opening.map((o) => o.department)).toEqual(["Complaints"]);
    expect(rows[0].status).toBe("IN PROCESSING");
  });

  it("says what it did, for the timeline", () => {
    const plan = planHandoffs("Dispute", ["Bureau Calling", "Complaints"],
      [row("Complaints", "LETTERS PENDING")]);
    expect(describeHandoff("Dispute", plan)).toBe(
      "From Dispute: opened Bureau Calling; Complaints already working it");
  });

  it("says so when there is nothing to do", () => {
    const plan = planHandoffs("Dispute", ["Dispute"], []);
    expect(describeHandoff("Dispute", plan)).toBe("Nothing to hand off");
  });
});
