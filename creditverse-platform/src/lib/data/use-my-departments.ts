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
 * ── SILENCE AND REFUSAL ARE DIFFERENT ANSWERS ──────────────────────────────
 *
 * This originally reported one thing — the departments found — and the access
 * layer read an empty list as "no opinion", falling back to every department
 * the role allowed. That was a defensible bet while almost nobody was on a
 * team: deriving strictly would have handed the roster a workspace with no
 * queue at all.
 *
 * It became a real bug the moment somebody joined a team that is NOT a
 * CreditOps department. Alliana is on the TalentOps Team; her department is
 * Dedicated Support; she found no CreditOps department — and was handed all
 * five CreditOps queues under MY DEPARTMENT (Dee, 2026-09-13).
 *
 * The distinction the code was missing:
 *
 *   on NO team at all              → genuinely no opinion. Fall back.
 *   on teams, none of them here    → a definite NO. This is not their module.
 *
 * So `onAnyTeam` is reported alongside the departments, and the access layer
 * can tell the two apart. Nothing about Alliana appears anywhere: the rule is
 * about the shape of the membership, not about who holds it.
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
  /**
   * Whether they belong to ANY live team. Distinguishes "nobody has placed
   * this person yet" from "they are placed, elsewhere" — which are opposite
   * answers to "should they see CreditOps queues?".
   */
  onAnyTeam: boolean;
  /** False while the teams or departments are still loading. */
  resolved: boolean;
}

/**
 * @param teamIdsOverride the teams to resolve for somebody OTHER than the
 * signed-in person — the View As preview passes the target's teams so the
 * CreditOps space renders from the effective person's placement, not the
 * previewer's (Dee, 2026-09-19).
 */
export function useMyCreditOpsDepartments(teamIdsOverride?: readonly string[]): MyDepartments {
  const auth = useAuth();
  const teams = useTeams();
  const departments = useDepartments();

  return useMemo(() => {
    const teamRows = teams.teams ?? [];
    const deptRows = departments.data ?? [];
    if (teamRows.length === 0 || deptRows.length === 0) {
      return { departments: [], onAnyTeam: false, resolved: false };
    }
    const keyById = new Map(deptRows.map((d) => [d.id, d.key]));
    const mine = new Set(teamIdsOverride ?? auth.teamIds);
    const found = new Set<CreditOpsDepartment>();
    for (const t of teamRows) {
      if (!mine.has(t.id) || !t.departmentId) continue;
      const dept = creditOpsDepartmentForKey(keyById.get(t.departmentId));
      if (dept) found.add(dept);
    }
    /* Any live team at all, whatever its department — the "placed elsewhere"
       signal. A team with no department still counts as being placed. */
    const onAnyTeam = teamRows.some((t) => mine.has(t.id));
    return { departments: [...found], onAnyTeam, resolved: true };
  }, [auth.teamIds, teams.teams, departments.data, teamIdsOverride]);
}
