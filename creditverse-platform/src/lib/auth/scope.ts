/**
 * Person-level scope — the frontend's READ of the model the database enforces.
 *
 * Nothing here grants access. `in_scope(...)` in Postgres is the only place a
 * record is authorized; this module exists so the interface can label the
 * user's reach honestly ("Team A · lead") and avoid offering actions RLS will
 * refuse. Keep it pure and free of I/O so it is testable and cannot drift into
 * a second permission system (rule 5, rule 13).
 *
 * Vocabulary mirrors `public.access_scope` exactly. Team membership is the
 * roster; scope is the ceiling. A lead supervises their team whatever their
 * ceiling — same three-step order as the SQL: responsibility, ceiling,
 * supervision.
 */
import type { AccessScope } from "@/lib/auth/auth-context";

export interface ScopeContext {
  userId: string | null;
  scope: AccessScope | null;
  scopeDivision: string | null;
  teamIds: readonly string[];
  ledTeamIds: readonly string[];
}

export interface RecordCoordinates {
  division?: string | null;
  teamId?: string | null;
  assigneeId?: string | null;
  creatorId?: string | null;
}

export const SCOPE_LABEL: Record<AccessScope, string> = {
  agency: "Agency-wide",
  division: "Division",
  department: "Department",
  team: "Team",
  assigned: "Assigned only",
  self: "Own records",
};

/** Whether the ceiling admits an unassigned record sitting in a team queue. */
export const seesUnassignedTeamQueue = (scope: AccessScope | null) =>
  scope === "agency" || scope === "division" || scope === "department" || scope === "team";

/**
 * Mirror of `public.in_scope` for optimistic UI decisions. A `true` here still
 * means nothing until the database agrees; a `false` means "do not bother
 * asking" — the request would be refused.
 */
export function likelyInScope(ctx: ScopeContext, rec: RecordCoordinates): boolean {
  if (!ctx.userId || !ctx.scope) return false;
  // 1. responsibility
  if (rec.assigneeId && rec.assigneeId === ctx.userId) return true;
  // 2. ceiling
  switch (ctx.scope) {
    case "agency":
      return true;
    case "division":
      if (rec.division && rec.division === ctx.scopeDivision) return true;
      break;
    case "team":
      if (rec.teamId && ctx.teamIds.includes(rec.teamId)) return true;
      break;
    case "self":
      if (rec.creatorId && rec.creatorId === ctx.userId) return true;
      break;
    case "department":
      // Needs the team → department join the frontend does not hold; defer to RLS.
      break;
    case "assigned":
      break;
  }
  // 3. supervision
  return Boolean(rec.teamId && ctx.ledTeamIds.includes(rec.teamId));
}

/** One line the interface can show next to a person: what their reach is. */
export function describeScope(ctx: ScopeContext): string {
  if (!ctx.scope) return "No BES scope";
  const base = SCOPE_LABEL[ctx.scope];
  const leads = ctx.ledTeamIds.length;
  return leads ? `${base} · leads ${leads} team${leads === 1 ? "" : "s"}` : base;
}
