/**
 * Who at BES works on which partner.
 *
 * ── THREE DIFFERENT QUESTIONS, KEPT APART ──────────────────────────────────
 *
 *   ORGANIZATION STRUCTURE  where does this person belong inside BES?
 *   PARTNER ASSIGNMENT      which partner accounts may they work with?
 *   WORK ASSIGNMENT         what specific task is theirs?
 *
 * This module is the middle one only. Somebody's home team is BES CRM →
 * Automation Team; they are assigned to partner ABC's BES CRM engagement; the
 * task they own is one work item. Collapsing any two of those loses something
 * (Dee, §11).
 *
 * ── A TEAM ASSIGNMENT IS THE ONE WORTH MAKING ──────────────────────────────
 *
 * Assign Team Alpha to Partner A once, and everybody who joins Team Alpha
 * inherits it while everybody who leaves loses it — no partner-by-partner
 * cleanup, ever (Dee, §20). A direct user assignment is the exception for
 * somebody who works an account outside their team.
 *
 * ── ENDING, NOT DELETING ───────────────────────────────────────────────────
 *
 * `endAssignment` closes a row rather than removing it, so "who ran this
 * account in March" stays answerable after the account changes hands (rule 4).
 */
import { requireSupabase } from "@/lib/supabase/client";

export type AssignmentRole =
  | "account_manager" | "operations_manager" | "processor"
  | "support" | "specialist" | "assigned";

export const ASSIGNMENT_ROLE_LABEL: Record<AssignmentRole, string> = {
  account_manager: "Account manager",
  operations_manager: "Operations manager",
  processor: "Processor",
  support: "Support",
  specialist: "Specialist",
  assigned: "Assigned",
};

export interface PartnerAssignment {
  id: string;
  groupId: string;
  serviceId: string | null;
  userId: string | null;
  teamId: string | null;
  role: AssignmentRole;
  isPrimary: boolean;
  startedOn: string;
  endedOn: string | null;
  notes: string | null;
}

// prettier-ignore
const COLUMNS = "id, group_id, service_id, user_id, team_id, assignment_role, is_primary, started_on, ended_on, notes";

const map = (r: Record<string, unknown>): PartnerAssignment => ({
  id: r.id as string,
  groupId: r.group_id as string,
  serviceId: (r.service_id as string) ?? null,
  userId: (r.user_id as string) ?? null,
  teamId: (r.team_id as string) ?? null,
  role: (r.assignment_role as AssignmentRole) ?? "assigned",
  isPrimary: Boolean(r.is_primary),
  startedOn: r.started_on as string,
  endedOn: (r.ended_on as string) ?? null,
  notes: (r.notes as string) ?? null,
});

/** Every assignment on one partner, current and historical. */
export async function fetchPartnerAssignments(groupId: string): Promise<PartnerAssignment[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("partner_assignments").select(COLUMNS)
    .eq("group_id", groupId)
    .order("ended_on", { nullsFirst: true }).order("started_on", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => map(r as Record<string, unknown>));
}

/**
 * Live assignments across every partner, for the directory.
 *
 * One request rather than one per row — twenty-five partners would otherwise
 * be twenty-five round trips to draw one column (rule 14).
 */
export async function fetchAllLiveAssignments(): Promise<Record<string, PartnerAssignment[]>> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("partner_assignments").select(COLUMNS).is("ended_on", null);
  if (error) throw error;
  const out: Record<string, PartnerAssignment[]> = {};
  for (const row of data ?? []) {
    const a = map(row as Record<string, unknown>);
    out[a.groupId] = [...(out[a.groupId] ?? []), a];
  }
  return out;
}

export async function assignPartner(input: {
  agencyId: string;
  groupId: string;
  serviceId?: string | null;
  /** Exactly one of these. */
  userId?: string | null;
  teamId?: string | null;
  role?: AssignmentRole;
  isPrimary?: boolean;
  notes?: string;
}): Promise<string> {
  const sb = requireSupabase();
  if ((input.userId ? 1 : 0) + (input.teamId ? 1 : 0) !== 1) {
    throw new Error("An assignment names either a person or a team, not both and not neither");
  }

  /* At most one live primary per partner, enforced by a partial unique index.
     Closing the incumbent first turns a constraint violation into a handover,
     which is what the person pressing the button meant. */
  if (input.isPrimary) {
    const { error } = await sb.from("partner_assignments")
      .update({ ended_on: new Date().toISOString().slice(0, 10) } as never)
      .eq("group_id", input.groupId).eq("is_primary", true).is("ended_on", null);
    if (error) throw error;
  }

  const { data, error } = await sb.from("partner_assignments").insert({
    agency_id: input.agencyId,
    group_id: input.groupId,
    service_id: input.serviceId ?? null,
    user_id: input.userId ?? null,
    team_id: input.teamId ?? null,
    assignment_role: input.role ?? "assigned",
    is_primary: input.isPrimary ?? false,
    notes: input.notes?.trim() || null,
  } as never).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/** Close an assignment. The row stays — it is who worked the account. */
export async function endAssignment(id: string, endedOn?: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("partner_assignments")
    .update({ ended_on: endedOn ?? new Date().toISOString().slice(0, 10) } as never)
    .eq("id", id);
  if (error) throw error;
}
