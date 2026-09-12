/**
 * Custom Workspaces — data access. RLS decides everything: a workspace is
 * returned only to members of an entitled organization (and, once Phase 7
 * lands, to BES under a shared TalentOps engagement). One nested select
 * returns a workspace with its boards, statuses and item types.
 */
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import type {
  CanonicalStage,
  FieldValue,
  Workspace,
  WorkspaceField,
  WorkspaceFieldType,
  WorkspaceItem,
} from "@/lib/workspaces/workspace-domain";

type WorkspaceRow = Tables<"workspaces"> & {
  workspace_boards: Tables<"workspace_boards">[];
  workspace_statuses: Tables<"workspace_statuses">[];
  workspace_item_types: Tables<"workspace_item_types">[];
  workspace_fields: Tables<"workspace_fields">[];
  organizations?: { name: string; agency_id: string } | null;
};

const choicesOf = (options: unknown): string[] => {
  const c = (options as { choices?: unknown } | null)?.choices;
  return Array.isArray(c) ? c.filter((x): x is string => typeof x === "string") : [];
};

const WORKSPACE_SELECT = `
  id, organization_id, agency_id, partner_group_id, module, name, description, icon, colour,
  workspace_boards(id, name, view_kind, position, archived_at),
  workspace_statuses(id, key, label, colour, position, canonical_stage, is_terminal),
  workspace_item_types(id, key, label, icon, position),
  workspace_fields(id, key, label, field_type, options, position, archived_at),
  organizations(name, agency_id)
`;

export const mapWorkspace = (row: WorkspaceRow): Workspace => ({
  id: row.id,
  organizationId: row.organization_id,
  organizationName: row.organizations?.name,
  /* The workspace's OWN agency first: an agency-owned workspace has no
     organization to borrow one from, and reading it through the join returned
     undefined — which is how activity and file rows lose their tenant stamp. */
  agencyId: row.agency_id ?? row.organizations?.agency_id ?? undefined,
  module: row.module ?? null,
  partnerGroupId: row.partner_group_id ?? null,
  name: row.name,
  description: row.description,
  icon: row.icon,
  colour: row.colour,
  boards: row.workspace_boards
    .filter((b) => !b.archived_at)
    .map((b) => ({ id: b.id, name: b.name, viewKind: b.view_kind as "list" | "board" | "calendar", position: b.position }))
    .sort((a, b) => a.position - b.position),
  statuses: row.workspace_statuses.map((s) => ({
    id: s.id, key: s.key, label: s.label, colour: s.colour, position: s.position,
    canonicalStage: s.canonical_stage, isTerminal: s.is_terminal,
  })),
  itemTypes: row.workspace_item_types
    .map((t) => ({ id: t.id, key: t.key, label: t.label, icon: t.icon, position: t.position }))
    .sort((a, b) => a.position - b.position),
  fields: row.workspace_fields
    .map((f) => ({
      id: f.id, key: f.key, label: f.label, fieldType: f.field_type as WorkspaceField["fieldType"],
      choices: choicesOf(f.options), position: f.position, archivedAt: f.archived_at,
    }))
    .sort((a, b) => a.position - b.position),
});

export async function fetchWorkspaces(organizationId: string): Promise<Workspace[]> {
  const { data, error } = await supabase
    .from("workspaces")
    .select(WORKSPACE_SELECT)
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as WorkspaceRow[]).map(mapWorkspace);
}

/**
 * The Sales & Marketing workspaces: BES's own, and one per partner.
 *
 * The same nested select as every other workspace read, so a marketing
 * workspace arrives with its statuses, item types, fields and boards already
 * attached — one request, not one per workspace (rule 14).
 */
export async function fetchMarketingWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await supabase
    .from("workspaces")
    .select(WORKSPACE_SELECT)
    .eq("module", "sales_marketing")
    .is("archived_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as WorkspaceRow[]).map(mapWorkspace);
}

/**
 * Every workspace the caller can reach across organizations — for BES, that is
 * exactly the set shared under live TalentOps engagements (RLS decides). One
 * request, with the owning organization's name.
 */
export async function fetchSharedWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await supabase
    .from("workspaces")
    .select(WORKSPACE_SELECT)
    .is("archived_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as WorkspaceRow[]).map(mapWorkspace);
}

const ITEM_COLUMNS =
  "id, title, description, priority, assigned_to, team_id, due_at, completed_at, created_at, board_id, status_id, item_type_id";
type ItemRow = Pick<
  Tables<"work_items">,
  "id" | "title" | "description" | "priority" | "assigned_to" | "team_id" | "due_at" | "completed_at" | "created_at" | "board_id" | "status_id" | "item_type_id"
>;

export const mapWorkspaceItem = (r: ItemRow): WorkspaceItem => ({
  id: r.id, title: r.title, description: r.description, priority: r.priority,
  assignedTo: r.assigned_to, teamId: r.team_id, dueAt: r.due_at, completedAt: r.completed_at, createdAt: r.created_at,
  boardId: r.board_id, statusId: r.status_id, itemTypeId: r.item_type_id,
});

export const WORKSPACE_ITEMS_LIMIT = 200;

/** Items of one workspace — bounded, newest first. Only the visible screen's data. */
export async function fetchWorkspaceItems(workspaceId: string): Promise<WorkspaceItem[]> {
  const { data, error } = await supabase
    .from("work_items")
    .select(ITEM_COLUMNS)
    .eq("workspace_id", workspaceId)
    /* Work archived by a cancellation stays in the record and out of the
       board — it is history, not a card somebody still has to move. */
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(WORKSPACE_ITEMS_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapWorkspaceItem);
}

export const SHARED_ITEMS_LIMIT = 500;

/** All reachable workspace items in ONE request (TalentOps overview) — never one query per workspace. */
export async function fetchAllWorkspaceItems(): Promise<(WorkspaceItem & { workspaceId: string })[]> {
  const { data, error } = await supabase
    .from("work_items")
    .select(`${ITEM_COLUMNS}, workspace_id`)
    .not("workspace_id", "is", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(SHARED_ITEMS_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...mapWorkspaceItem(r), workspaceId: r.workspace_id as string }));
}

export interface CreateWorkspaceItemInput {
  workspaceId: string;
  /**
   * The owning organization, or NULL for a BES-internal workspace.
   *
   * The workspace's own owner decides the item's scope — the database checks
   * exactly that in `work_items_workspace_consistency`. Passing null here is
   * how BES holds work that is not about any customer, and it is why there is
   * no separate agency task writer.
   */
  organizationId: string | null;
  boardId: string | null;
  title: string;
  itemTypeId: string | null;
  statusId?: string | null;
  assignedTo?: string | null;
  teamId?: string | null;
  priority?: "Normal" | "High" | "Urgent";
  dueAt?: string | null;
  description?: string | null;
}

/**
 * Insert a canonical work item inside a workspace. agency_id and created_by
 * are derived server-side; stage is derived from the status by trigger.
 */
export async function createWorkspaceItem(input: CreateWorkspaceItemInput): Promise<WorkspaceItem> {
  const { data, error } = await supabase
    .from("work_items")
    .insert({
      scope: input.organizationId ? "ORGANIZATION" : "AGENCY",
      organization_id: input.organizationId,
      related_type: "project",
      title: input.title.trim(),
      stage: "Queued",
      priority: input.priority ?? "Normal",
      description: input.description ?? null,
      due_at: input.dueAt ?? null,
      workspace_id: input.workspaceId,
      board_id: input.boardId,
      status_id: input.statusId ?? null,
      item_type_id: input.itemTypeId,
      assigned_to: input.assignedTo ?? null,
      team_id: input.teamId ?? null,
    } as never)
    .select(ITEM_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return mapWorkspaceItem(data);
}

export async function updateWorkspaceItemStatus(itemId: string, statusId: string): Promise<void> {
  const { error } = await supabase
    .from("work_items")
    .update({ status_id: statusId } as never)
    .eq("id", itemId);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Item edits — every column is canonical work_items; RLS decides.      */
/* ------------------------------------------------------------------ */

export interface WorkspaceItemPatch {
  title?: string;
  description?: string | null;
  priority?: "Normal" | "High" | "Urgent";
  dueAt?: string | null;
  assignedTo?: string | null;
  teamId?: string | null;
  statusId?: string;
}

export async function updateWorkspaceItem(itemId: string, patch: WorkspaceItemPatch): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.dueAt !== undefined) row.due_at = patch.dueAt;
  if (patch.assignedTo !== undefined) row.assigned_to = patch.assignedTo;
  if (patch.teamId !== undefined) row.team_id = patch.teamId;
  if (patch.statusId !== undefined) row.status_id = patch.statusId;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from("work_items").update(row as never).eq("id", itemId);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Custom field values                                                  */
/* ------------------------------------------------------------------ */

export async function fetchItemFieldValues(itemId: string): Promise<Record<string, FieldValue>> {
  const { data, error } = await supabase
    .from("work_item_field_values")
    .select("field_id, value")
    .eq("work_item_id", itemId);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r) => [r.field_id, (r.value as FieldValue) ?? null]));
}

/** Upsert one value; the database validates the type against the field. */
export async function setItemFieldValue(itemId: string, fieldId: string, value: FieldValue): Promise<void> {
  const { error } = await supabase
    .from("work_item_field_values")
    .upsert({ work_item_id: itemId, field_id: fieldId, value: value as never }, { onConflict: "work_item_id,field_id" });
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Workspace configuration — org admins only (RLS)                      */
/* ------------------------------------------------------------------ */

export interface WorkspaceInput { name: string; description?: string | null; icon?: string | null; colour?: string | null }

/**
 * A workspace needs at least one status before anything can live in it.
 *
 * `work_items_workspace_consistency` derives an item's canonical stage from
 * its status and refuses the item when there is none — so a workspace with no
 * statuses silently rejects every task, with a message ("status belongs to
 * another workspace") that describes the symptom and hides the cause. Nothing
 * seeded them: the workspaces that work got theirs from a migration's own seed
 * data, and every one created through the application since was born unusable.
 *
 * Seeded here rather than by a database trigger on purpose. A trigger changes
 * the contract for every existing writer — an admin who creates a workspace
 * and then adds their own status keyed 'done' collides with the one the
 * trigger just made. These are DEFAULTS, so they belong where the default is
 * being chosen.
 */
export const DEFAULT_STATUSES: StatusInput[] = [
  { key: "todo", label: "To do", colour: "slate", position: 0, canonicalStage: "Queued" },
  { key: "in_progress", label: "In progress", colour: "blue", position: 1, canonicalStage: "In Processing" },
  { key: "blocked", label: "Blocked", colour: "amber", position: 2, canonicalStage: "Blocked" },
  { key: "done", label: "Done", colour: "emerald", position: 3, canonicalStage: "Completed" },
];

export async function seedWorkspaceDefaults(workspaceId: string): Promise<void> {
  const { error } = await supabase.from("workspace_statuses").insert(
    DEFAULT_STATUSES.map((s) => ({
      workspace_id: workspaceId, key: s.key, label: s.label, colour: s.colour,
      position: s.position, canonical_stage: s.canonicalStage,
      /* Derived from the stage, exactly as `createStatus` does — one rule for
         what "terminal" means, not two that can disagree. */
      is_terminal: s.canonicalStage === "Completed",
    })) as never,
  );
  if (error) throw new Error(error.message);
  await createBoard(workspaceId, "Tasks", 0);
}

export async function createWorkspace(organizationId: string, input: WorkspaceInput): Promise<string> {
  const { data, error } = await supabase
    .from("workspaces")
    .insert({ organization_id: organizationId, name: input.name.trim(), description: input.description ?? null, icon: input.icon ?? null, colour: input.colour ?? null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await seedWorkspaceDefaults(data.id);
  return data.id;
}

export async function updateWorkspace(id: string, patch: Partial<WorkspaceInput> & { archivedAt?: string | null }): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.icon !== undefined) row.icon = patch.icon;
  if (patch.colour !== undefined) row.colour = patch.colour;
  if (patch.archivedAt !== undefined) row.archived_at = patch.archivedAt;
  const { error } = await supabase.from("workspaces").update(row as never).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createBoard(workspaceId: string, name: string, position: number): Promise<void> {
  const { error } = await supabase.from("workspace_boards").insert({ workspace_id: workspaceId, name: name.trim(), view_kind: "board", position });
  if (error) throw new Error(error.message);
}
export async function updateBoard(id: string, patch: { name?: string; position?: number; archivedAt?: string | null }): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.position !== undefined) row.position = patch.position;
  if (patch.archivedAt !== undefined) row.archived_at = patch.archivedAt;
  const { error } = await supabase.from("workspace_boards").update(row as never).eq("id", id);
  if (error) throw new Error(error.message);
}

export interface StatusInput { key: string; label: string; colour: string | null; position: number; canonicalStage: CanonicalStage }

export async function createStatus(workspaceId: string, s: StatusInput): Promise<void> {
  const { error } = await supabase.from("workspace_statuses").insert({
    workspace_id: workspaceId, key: s.key, label: s.label.trim(), colour: s.colour, position: s.position,
    canonical_stage: s.canonicalStage, is_terminal: s.canonicalStage === "Completed",
  });
  if (error) throw new Error(error.message);
}
export async function updateStatus(id: string, patch: Partial<Omit<StatusInput, "key">>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) row.label = patch.label.trim();
  if (patch.colour !== undefined) row.colour = patch.colour;
  if (patch.position !== undefined) row.position = patch.position;
  if (patch.canonicalStage !== undefined) { row.canonical_stage = patch.canonicalStage; row.is_terminal = patch.canonicalStage === "Completed"; }
  const { error } = await supabase.from("workspace_statuses").update(row as never).eq("id", id);
  if (error) throw new Error(error.message);
}
/** Fails (FK restrict) while any item still uses the status; the UI reports that honestly. */
export async function deleteStatus(id: string): Promise<void> {
  const { error } = await supabase.from("workspace_statuses").delete().eq("id", id);
  if (error) throw new Error(error.code === "23503" ? "This status is still used by items. Move them first." : error.message);
}

export async function createItemType(workspaceId: string, key: string, label: string, position: number): Promise<void> {
  const { error } = await supabase.from("workspace_item_types").insert({ workspace_id: workspaceId, key, label: label.trim(), position });
  if (error) throw new Error(error.message);
}
export async function deleteItemType(id: string): Promise<void> {
  const { error } = await supabase.from("workspace_item_types").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export interface FieldInput { key: string; label: string; fieldType: WorkspaceFieldType; choices?: string[]; position: number }

export async function createField(workspaceId: string, f: FieldInput): Promise<void> {
  const { error } = await supabase.from("workspace_fields").insert({
    workspace_id: workspaceId, key: f.key, label: f.label.trim(), field_type: f.fieldType, position: f.position,
    options: f.fieldType === "select" ? ({ choices: (f.choices ?? []).map((c) => c.trim()).filter(Boolean) } as never) : null,
  });
  if (error) throw new Error(error.message);
}
export async function archiveField(id: string, archived: boolean): Promise<void> {
  const { error } = await supabase.from("workspace_fields").update({ archived_at: archived ? new Date().toISOString() : null } as never).eq("id", id);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* People and teams — server-authorized lists, never local profiles      */
/* ------------------------------------------------------------------ */

export interface OrgMember { id: string; name: string; email: string; role: string }

/** Only what assignable_profiles returns for this caller: org admins get their members; everyone else gets nothing. */
export async function fetchAssignableOrgMembers(organizationId: string): Promise<OrgMember[]> {
  const { data, error } = await supabase.rpc("assignable_profiles", { p_scope: "ORGANIZATION", p_org: organizationId });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ id: r.id, name: r.full_name?.trim() || r.email, email: r.email, role: r.role }));
}

export interface OrgTeam { id: string; name: string; memberIds: string[] }

export async function fetchOrgTeams(organizationId: string): Promise<OrgTeam[]> {
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, team_memberships(user_id)")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((t) => ({ id: t.id, name: t.name, memberIds: (t.team_memberships ?? []).map((m) => m.user_id) }));
}
export async function createOrgTeam(organizationId: string, name: string): Promise<void> {
  const { error } = await supabase.from("teams").insert({ organization_id: organizationId, name: name.trim() } as never);
  if (error) throw new Error(error.message);
}
export async function setTeamMember(teamId: string, userId: string, member: boolean): Promise<void> {
  const { error } = member
    ? await supabase.from("team_memberships").insert({ team_id: teamId, user_id: userId, is_lead: false })
    : await supabase.from("team_memberships").delete().eq("team_id", teamId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
