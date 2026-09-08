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

/* ── Handing off to more than one department at once ───────────────────── */

/**
 * ── WHY `nextDepartment` IS NOT THE WHOLE STORY ────────────────────────────
 *
 * `CREDITOPS_DEPARTMENT_ORDER` reads like a pipeline, and the Hand off button
 * followed it one step at a time — which meant Bureau Calling was "the last
 * department in the sequence" and a round that needed BOTH Bureau Calling and
 * Complaints & Mailing could only be sent to one of them.
 *
 * That is not how the work runs. Dee: "these parts can be done simultaneously
 * and next steps on these can be multiple handoffs." After a round goes out,
 * bureau calls and CFPB complaints proceed in PARALLEL, and Support runs
 * alongside both throughout.
 *
 * So the order stays as a DISPLAY order and a sensible default, and stops
 * being a constraint. Any department may hand to any other; a file can be open
 * in several at once, which is what `client_department_statuses` has always
 * been able to represent — one row per department, each with its own status
 * and assignee.
 *
 * ── TWO RULES THAT MAKE FAN-OUT SAFE ───────────────────────────────────────
 *
 * 1. A handoff OPENS the target and does not close the source. Finishing your
 *    own part is a separate, deliberate status change — otherwise handing a
 *    file to Complaints would silently declare Dispute finished.
 *
 * 2. Handing to a department that is ALREADY OPEN leaves it alone. Re-sending
 *    a file to Bureau Calling that is mid-call would otherwise knock it back
 *    to "BC NEEDED" and lose where it had got to.
 */

/** Every department a file may be handed to from here — all but itself. */
export function handoffTargets(from: CreditOpsDepartment): CreditOpsDepartment[] {
  return CREDITOPS_DEPARTMENT_ORDER.filter((d) => d !== from);
}

export interface HandoffPlan {
  /** Will be opened, at this entry status. */
  opening: { department: CreditOpsDepartment; entryStatus: string }[];
  /** Already has open work — left exactly as it is. */
  alreadyOpen: { department: CreditOpsDepartment; status: string }[];
  /** Cannot be handed to, and why. */
  refused: { department: CreditOpsDepartment; reason: string }[];
}

/**
 * What handing this file to these departments would actually do.
 *
 * Worked out BEFORE anything is written, so the interface can say "opens
 * Bureau Calling; Complaints is already working it" rather than reporting it
 * afterwards — or worse, resetting a department that was mid-way through.
 */
export function planHandoffs(
  from: CreditOpsDepartment | null,
  targets: readonly CreditOpsDepartment[],
  rows: readonly DepartmentStatusRow[],
): HandoffPlan {
  const plan: HandoffPlan = { opening: [], alreadyOpen: [], refused: [] };
  const seen = new Set<CreditOpsDepartment>();

  for (const target of targets) {
    if (seen.has(target)) continue;
    seen.add(target);

    if (from !== null && target === from) {
      plan.refused.push({ department: target, reason: "A file cannot be handed to the department it is already with" });
      continue;
    }

    const existing = rows.find((r) => r.department === target);
    if (existing && isOpenDepartmentStatus(existing.status)) {
      plan.alreadyOpen.push({ department: target, status: existing.status });
      continue;
    }

    plan.opening.push({ department: target, entryStatus: handoffEntryStatus(target) });
  }

  return plan;
}

/** A sentence for the activity timeline and the confirmation. */
export function describeHandoff(from: CreditOpsDepartment | null, plan: HandoffPlan): string {
  const parts: string[] = [];
  if (plan.opening.length > 0) {
    parts.push(`opened ${plan.opening.map((o) => o.department).join(", ")}`);
  }
  if (plan.alreadyOpen.length > 0) {
    parts.push(`${plan.alreadyOpen.map((o) => o.department).join(", ")} already working it`);
  }
  if (parts.length === 0) return "Nothing to hand off";
  return `${from ? `From ${from}: ` : ""}${parts.join("; ")}`;
}
