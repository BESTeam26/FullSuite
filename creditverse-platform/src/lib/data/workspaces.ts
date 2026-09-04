/**
 * Custom Workspaces — data access. RLS decides everything: a workspace is
 * returned only to members of an entitled organization (and, once Phase 7
 * lands, to BES under a shared TalentOps engagement). One nested select
 * returns a workspace with its boards, statuses and item types.
 */
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import type {
  Workspace,
  WorkspaceItem,
} from "@/lib/workspaces/workspace-domain";

type WorkspaceRow = Tables<"workspaces"> & {
  workspace_boards: Tables<"workspace_boards">[];
  workspace_statuses: Tables<"workspace_statuses">[];
  workspace_item_types: Tables<"workspace_item_types">[];
  organizations?: { name: string } | null;
};

const WORKSPACE_SELECT = `
  id, organization_id, name, description, icon, colour,
  workspace_boards(id, name, view_kind, position, archived_at),
  workspace_statuses(id, key, label, colour, position, canonical_stage, is_terminal),
  workspace_item_types(id, key, label, icon, position)
`;

export const mapWorkspace = (row: WorkspaceRow): Workspace => ({
  id: row.id,
  organizationId: row.organization_id,
  organizationName: row.organizations?.name,
  name: row.name,
  description: row.description,
  icon: row.icon,
  colour: row.colour,
  boards: row.workspace_boards
    .filter((b) => !b.archived_at)
    .map((b) => ({ id: b.id, name: b.name, viewKind: b.view_kind as "list" | "board", position: b.position }))
    .sort((a, b) => a.position - b.position),
  statuses: row.workspace_statuses.map((s) => ({
    id: s.id, key: s.key, label: s.label, colour: s.colour, position: s.position,
    canonicalStage: s.canonical_stage, isTerminal: s.is_terminal,
  })),
  itemTypes: row.workspace_item_types
    .map((t) => ({ id: t.id, key: t.key, label: t.label, icon: t.icon, position: t.position }))
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
 * Every workspace the caller can reach across organizations — for BES, that is
 * exactly the set shared under live TalentOps engagements (RLS decides). One
 * request, with the owning organization's name.
 */
export async function fetchSharedWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await supabase
    .from("workspaces")
    .select(`${WORKSPACE_SELECT}, organizations(name)`)
    .is("archived_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as WorkspaceRow[]).map(mapWorkspace);
}

const ITEM_COLUMNS =
  "id, title, description, priority, assigned_to, due_at, completed_at, created_at, board_id, status_id, item_type_id";
type ItemRow = Pick<
  Tables<"work_items">,
  "id" | "title" | "description" | "priority" | "assigned_to" | "due_at" | "completed_at" | "created_at" | "board_id" | "status_id" | "item_type_id"
>;

export const mapWorkspaceItem = (r: ItemRow): WorkspaceItem => ({
  id: r.id, title: r.title, description: r.description, priority: r.priority,
  assignedTo: r.assigned_to, dueAt: r.due_at, completedAt: r.completed_at, createdAt: r.created_at,
  boardId: r.board_id, statusId: r.status_id, itemTypeId: r.item_type_id,
});

export const WORKSPACE_ITEMS_LIMIT = 200;

/** Items of one workspace — bounded, newest first. Only the visible screen's data. */
export async function fetchWorkspaceItems(workspaceId: string): Promise<WorkspaceItem[]> {
  const { data, error } = await supabase
    .from("work_items")
    .select(ITEM_COLUMNS)
    .eq("workspace_id", workspaceId)
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
    .order("created_at", { ascending: false })
    .limit(SHARED_ITEMS_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...mapWorkspaceItem(r), workspaceId: r.workspace_id as string }));
}

export interface CreateWorkspaceItemInput {
  workspaceId: string;
  organizationId: string;
  boardId: string | null;
  title: string;
  itemTypeId: string | null;
  statusId?: string | null;
  assignedTo?: string | null;
}

/**
 * Insert a canonical work item inside a workspace. agency_id and created_by
 * are derived server-side; stage is derived from the status by trigger.
 */
export async function createWorkspaceItem(input: CreateWorkspaceItemInput): Promise<WorkspaceItem> {
  const { data, error } = await supabase
    .from("work_items")
    .insert({
      scope: "ORGANIZATION",
      organization_id: input.organizationId,
      related_type: "project",
      title: input.title.trim(),
      stage: "Queued",
      priority: "Normal",
      workspace_id: input.workspaceId,
      board_id: input.boardId,
      status_id: input.statusId ?? null,
      item_type_id: input.itemTypeId,
      assigned_to: input.assignedTo ?? null,
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
