/**
 * BES's own workspaces — the agency's internal work, not a customer's.
 *
 * The same `workspaces` table, the same boards and statuses, the same
 * `work_items`. What differs is the owner: an agency workspace carries
 * `agency_id` and leaves `organization_id` null, which is what keeps BES's
 * internal work outside every tenant boundary (rule 16). There is no
 * `agency_tasks` table and no second engine (rules 2, 17).
 *
 * Nothing here needs a client, a CreditOps case, a funding file or an
 * organization. An internal task stands on its own.
 */
import { requireSupabase } from "@/lib/supabase/client";
import { mapWorkspace, type WorkspaceInput } from "@/lib/data/workspaces";
import type { Workspace } from "@/lib/workspaces/workspace-domain";

export async function fetchAgencyWorkspaces(agencyId: string): Promise<Workspace[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("workspaces").select("*").eq("agency_id", agencyId)
    .is("archived_at", null).order("name");
  if (error) throw error;
  return (data ?? []).map(mapWorkspace);
}

export async function createAgencyWorkspace(agencyId: string, input: WorkspaceInput): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("workspaces")
    .insert({
      agency_id: agencyId, organization_id: null,
      name: input.name, description: input.description ?? null,
      icon: input.icon ?? null, colour: input.colour ?? null,
    })
    .select("id").single();
  if (error) throw error;
  return data.id;
}

/* ── Checklist ────────────────────────────────────────────────────────── */

export interface ChecklistItem {
  id: string; workItemId: string; label: string; done: boolean;
  position: number; doneBy: string | null; doneAt: string | null;
}

const mapChecklist = (r: Record<string, unknown>): ChecklistItem => ({
  id: r.id as string, workItemId: r.work_item_id as string, label: r.label as string,
  done: r.done as boolean, position: r.position as number,
  doneBy: (r.done_by as string) ?? null, doneAt: (r.done_at as string) ?? null,
});

export async function fetchChecklist(workItemId: string): Promise<ChecklistItem[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("work_checklist_items").select("*").eq("work_item_id", workItemId).order("position");
  if (error) throw error;
  return (data ?? []).map((r) => mapChecklist(r as Record<string, unknown>));
}

export async function addChecklistItem(workItemId: string, label: string, position: number): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("work_checklist_items").insert({ work_item_id: workItemId, label, position });
  if (error) throw error;
}

/** Who ticked it and when are stamped by the database, never sent from here. */
export async function setChecklistDone(id: string, done: boolean): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("work_checklist_items").update({ done }).eq("id", id);
  if (error) throw error;
}

export async function renameChecklistItem(id: string, label: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("work_checklist_items").update({ label }).eq("id", id);
  if (error) throw error;
}

export async function removeChecklistItem(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("work_checklist_items").delete().eq("id", id);
  if (error) throw error;
}

/* ── Blockers ─────────────────────────────────────────────────────────── */

export interface Blocker {
  id: string; workItemId: string; blockedById: string | null;
  blockedByTitle: string | null; note: string | null; resolvedAt: string | null;
}

export async function fetchBlockers(workItemId: string): Promise<Blocker[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("work_item_blockers")
    .select("id, work_item_id, blocked_by_id, note, resolved_at, blocked_by:work_items!work_item_blockers_blocked_by_id_fkey(title)")
    .eq("work_item_id", workItemId).order("created_at");
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const by = row.blocked_by as { title?: string } | null;
    return {
      id: row.id as string, workItemId: row.work_item_id as string,
      blockedById: (row.blocked_by_id as string) ?? null,
      blockedByTitle: by?.title ?? null,
      note: (row.note as string) ?? null,
      resolvedAt: (row.resolved_at as string) ?? null,
    };
  });
}

/** A blocker names another item, or says why in words. The database requires one. */
export async function addBlocker(input: { workItemId: string; blockedById?: string | null; note?: string | null }): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("work_item_blockers").insert({
    work_item_id: input.workItemId,
    blocked_by_id: input.blockedById ?? null,
    note: input.note ?? null,
  });
  if (error) throw error;
}

/** Resolved, not deleted — what blocked what is part of the history. */
export async function resolveBlocker(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("work_item_blockers").update({ resolved_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
