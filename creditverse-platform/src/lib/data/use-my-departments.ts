/**
 * Which CreditOps departments the signed-in person actually works.
 *
 * Dee, 2026-09-11: "Use our EXISTING canonical team assignments, department
 * assignments, partner assignments, roles and capabilities. DO NOT create
 * another sidebar-specific role/access system."
 *
 * So this invents nothing. It joins three things the session already holds:
 *
 *   auth.teamIds        the teams this person belongs to (resolved once)
 *   useTeams()          each team's department_id (cached, agency-scoped)
 *   useDepartments()    each department's key and division (cached)
 *
 * ── WHY A PERSON WITH NO DEPARTMENT TEAM IS NOT LOCKED OUT ─────────────────
 *
 * Most of the BES roster is not yet in a department-bearing team. Deriving
 * strictly would hand those people a workspace with no queue at all, which is
 * a worse failure than the one being fixed — an operator who cannot work is
 * not "securely scoped", and the database would have let them work.
 *
 * So this reports what team membership SAYS, and the access layer treats
 * "says nothing" as "no opinion" and falls back to the role's departments.
 * Putting somebody in a Complaints team is what narrows their workspace, and
 * that is a deliberate act by Dee rather than a silent inference.
 */
import { useMemo } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useTeams } from "@/lib/data/use-teams";
import { useDepartments } from "@/lib/data/use-agency-teams";
import { creditOpsDepartmentForKey } from "@/lib/fulfillment/department-domain";
import type { CreditOpsDepartment } from "@/lib/fulfillment/creditops-access";

export interface MyDepartments {
  /** The CreditOps departments this person's teams put them in. */
  departments: CreditOpsDepartment[];
  /** False while the teams or departments are still loading. */
  resolved: boolean;
}

export function useMyCreditOpsDepartments(): MyDepartments {
  const auth = useAuth();
  const teams = useTeams();
  const departments = useDepartments();

  return useMemo(() => {
    const teamRows = teams.teams ?? [];
    const deptRows = departments.data ?? [];
    if (teamRows.length === 0 || deptRows.length === 0) {
      return { departments: [], resolved: false };
    }
    const keyById = new Map(deptRows.map((d) => [d.id, d.key]));
    const mine = new Set(auth.teamIds);
    const found = new Set<CreditOpsDepartment>();
    for (const t of teamRows) {
      if (!mine.has(t.id) || !t.departmentId) continue;
      const dept = creditOpsDepartmentForKey(keyById.get(t.departmentId));
      if (dept) found.add(dept);
    }
    return { departments: [...found], resolved: true };
  }, [auth.teamIds, teams.teams, departments.data]);
}
