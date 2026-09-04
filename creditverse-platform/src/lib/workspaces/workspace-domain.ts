/**
 * Custom Workspaces — domain.
 *
 * A workspace is an organization-owned container over the canonical work
 * engine. Statuses, item types and fields are DATA rows, never enums. Each
 * status maps to a canonical `work_stage`, which is how Attention, EOD and
 * completion keep working without knowing custom statuses exist (rule 17).
 */
import type { WorkStage } from "@/lib/bes-domain";

export interface WorkspaceStatus {
  id: string;
  key: string;
  label: string;
  colour: string | null;
  position: number;
  canonicalStage: WorkStage;
  isTerminal: boolean;
}

export interface WorkspaceItemType {
  id: string;
  key: string;
  label: string;
  icon: string | null;
  position: number;
}

export interface WorkspaceBoard {
  id: string;
  name: string;
  viewKind: "list" | "board";
  position: number;
}

export interface Workspace {
  id: string;
  organizationId: string;
  /** Present when loaded across organizations (BES shared view). */
  organizationName?: string;
  name: string;
  description: string | null;
  icon: string | null;
  colour: string | null;
  boards: WorkspaceBoard[];
  statuses: WorkspaceStatus[];
  itemTypes: WorkspaceItemType[];
}

export interface WorkspaceItem {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  assignedTo: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  boardId: string | null;
  statusId: string | null;
  itemTypeId: string | null;
}

const byPosition = <T extends { position: number; key?: string }>(a: T, b: T) =>
  a.position - b.position || (a.key ?? "").localeCompare(b.key ?? "");

export const sortedStatuses = (statuses: WorkspaceStatus[]) =>
  [...statuses].sort(byPosition);

/** The status a new item lands in when none is chosen — the first by position. */
export const defaultStatus = (
  statuses: WorkspaceStatus[],
): WorkspaceStatus | undefined => sortedStatuses(statuses)[0];

/**
 * Group items under each status column, in status order. Items whose status
 * is unknown to this workspace are listed under `orphans` rather than dropped
 * silently — a configuration drift should be visible, not hidden.
 */
export function groupItemsByStatus(
  statuses: WorkspaceStatus[],
  items: WorkspaceItem[],
): { columns: { status: WorkspaceStatus; items: WorkspaceItem[] }[]; orphans: WorkspaceItem[] } {
  const ordered = sortedStatuses(statuses);
  const buckets = new Map<string, WorkspaceItem[]>(ordered.map((s) => [s.id, []]));
  const orphans: WorkspaceItem[] = [];
  for (const item of items) {
    const bucket = item.statusId ? buckets.get(item.statusId) : undefined;
    if (bucket) bucket.push(item);
    else orphans.push(item);
  }
  return {
    columns: ordered.map((status) => ({ status, items: buckets.get(status.id) ?? [] })),
    orphans,
  };
}

/** Open = not in a terminal status. Mirrors `completed_at is null` in the engine. */
export const openItemCount = (statuses: WorkspaceStatus[], items: WorkspaceItem[]) => {
  const terminal = new Set(statuses.filter((s) => s.isTerminal).map((s) => s.id));
  return items.filter((i) => !i.statusId || !terminal.has(i.statusId)).length;
};
