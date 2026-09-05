import { describe, expect, it } from "vitest";
import {
  currentDepartment,
  handoffEntryStatus,
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
