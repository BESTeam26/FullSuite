/**
 * Department / work status — the operational truth for a client file, kept
 * separate from the client's credit status (round, dispute status) and from
 * results (report items). Separation proposal step 1.
 *
 * One row per (client, department) in `client_department_statuses` /
 * `funding_department_statuses`: status, assignee, updated_at. This module is
 * the single place that knows each department's vocabulary, which statuses
 * mean "no open work", which department follows which on a hand-off, and how
 * to derive "current department" for a list. Deterministic; unit-tested.
 */
import type { CreditOpsDepartment } from "@/lib/fulfillment/creditops-access";
import { CREDIT_OPS_STATUS_GUIDE } from "@/lib/fulfillment/creditops-status-guide";

export interface DepartmentStatusRow {
  department: string;
  status: string;
  assigneeId?: string | null;
  assignee?: string;
  updatedAt: string;
}

/** CreditOps department order — the default hand-off sequence. */
export const CREDITOPS_DEPARTMENT_ORDER: readonly CreditOpsDepartment[] = [
  "Onboarding",
  "Dispute",
  "Support",
  "Complaints",
  "Bureau Calling",
];

const CATEGORY_FOR: Record<CreditOpsDepartment, "onboarding" | "dispute" | "support" | "complaints" | "bureau"> = {
  Onboarding: "onboarding",
  Dispute: "dispute",
  Support: "support",
  Complaints: "complaints",
  "Bureau Calling": "bureau",
};

/** The statuses a department may hold — from the Status Guide, the one vocabulary. */
export function departmentStatuses(department: CreditOpsDepartment): string[] {
  return CREDIT_OPS_STATUS_GUIDE.filter((i) => i.category === CATEGORY_FOR[department]).map((i) => i.code);
}

/** Statuses that mean "nothing open for this department". */
export const CLOSED_DEPARTMENT_STATUSES: ReadonlySet<string> = new Set([
  "BC NOT NEEDED",
  "BC COMPLETED",
  "CM NOT NEEDED",
  "CM COMPLETED",
  "SUPPORT RESOLVED",
  "OB READY FOR R1",
  "PARTNER ENDORSED",
  "COMPLETED",
  "ARCHIVED / INACTIVE",
]);

export const isOpenDepartmentStatus = (status: string) => !CLOSED_DEPARTMENT_STATUSES.has(status.toUpperCase());

/** Open department rows, in department order. */
export function openDepartments(rows: readonly DepartmentStatusRow[]): DepartmentStatusRow[] {
  const order = new Map(CREDITOPS_DEPARTMENT_ORDER.map((d, i) => [d as string, i]));
  return rows
    .filter((r) => isOpenDepartmentStatus(r.status))
    .sort((a, b) => (order.get(a.department) ?? 99) - (order.get(b.department) ?? 99));
}

/** "Where is this file right now?" — the first open department, or none. */
export function currentDepartment(rows: readonly DepartmentStatusRow[]): DepartmentStatusRow | null {
  return openDepartments(rows)[0] ?? null;
}

/** The department that follows on a hand-off; null at the end of the sequence. */
export function nextDepartment(department: CreditOpsDepartment): CreditOpsDepartment | null {
  const i = CREDITOPS_DEPARTMENT_ORDER.indexOf(department);
  return i >= 0 && i < CREDITOPS_DEPARTMENT_ORDER.length - 1 ? CREDITOPS_DEPARTMENT_ORDER[i + 1] : null;
}

/** Does the new status belong to this department's vocabulary? */
export function isValidDepartmentStatus(department: CreditOpsDepartment, status: string): boolean {
  return departmentStatuses(department).includes(status.toUpperCase());
}

/** The status a department opens with when a file is handed to it. */
export function handoffEntryStatus(department: CreditOpsDepartment): string {
  const open = departmentStatuses(department).find((st) => isOpenDepartmentStatus(st));
  return open ?? departmentStatuses(department)[0];
}
