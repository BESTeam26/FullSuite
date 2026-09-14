/**
 * MY DEPARTMENT, as a rule rather than as a lookup.
 *
 * Pulled out of the React context so the decision can be tested without a
 * database, a session or a component — and so the pane, the icon rail and the
 * workspace tabs cannot each answer it slightly differently.
 *
 * ── THE DISTINCTION THAT WAS MISSING ────────────────────────────────────────
 *
 *   on teams, none of them here  → a definite NO. Not their module.
 *   on no team at all            → nobody has placed them. The role answers,
 *                                  so a real operator is never left unable to
 *                                  work when the database would have allowed
 *                                  it.
 *
 * Reading both as "no opinion" is what showed a TalentOps agent all five
 * CreditOps queues (Dee, 2026-09-13).
 */
import type { CreditOpsDepartment } from "@/lib/fulfillment/creditops-access";

export interface DepartmentScopeInput {
  /** Departments this person's live teams put them in. */
  teamDepartments: readonly CreditOpsDepartment[];
  /** Whether they belong to ANY live team, in any division. */
  onAnyTeam: boolean;
  /** Departments their role permits at all. Membership may narrow this, never widen it. */
  roleDepartments: readonly CreditOpsDepartment[];
  /**
   * Present only to say that it changes nothing here. Management's broader
   * reach is a separate band with its own label, because "running the
   * operation means seeing the work in it" was true and "…so call it My
   * Department" never was.
   */
  canAccessManagement?: boolean;
}

export function departmentScopeOf(input: DepartmentScopeInput): CreditOpsDepartment[] {
  const { teamDepartments, onAnyTeam, roleDepartments } = input;
  if (teamDepartments.length > 0) {
    return roleDepartments.filter((d) => teamDepartments.includes(d));
  }
  return onAnyTeam ? [] : [...roleDepartments];
}
