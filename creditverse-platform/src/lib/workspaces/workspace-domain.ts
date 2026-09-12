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

export type WorkspaceFieldType = "text" | "number" | "date" | "select" | "checkbox";

export interface WorkspaceField {
  id: string;
  key: string;
  label: string;
  fieldType: WorkspaceFieldType;
  choices: string[];
  position: number;
  archivedAt: string | null;
}

export type FieldValue = string | number | boolean | null;

export const FIELD_TYPE_LABEL: Record<WorkspaceFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Choice",
  checkbox: "Checkbox",
};

/** The canonical stages a workspace status may map onto (work_stage enum). */
export const CANONICAL_STAGES = [
  "Queued", "Assigned", "In Processing", "Ready for QA", "QA Review", "Completed", "Blocked", "Attention",
] as const;
export type CanonicalStage = (typeof CANONICAL_STAGES)[number];

/** "Done" in a workspace IS the engine's Completed — the database enforces the same equivalence. */
export const isTerminalStage = (stage: string) => stage === "Completed";

/** Stable machine key from a label: lowercase, underscores, letters/digits only, starts with a letter. */
export function slugKey(label: string): string {
  const k = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return /^[a-z]/.test(k) ? k : k ? `s_${k}`.slice(0, 40) : "";
}

/**
 * Mirrors the database trigger so the form can refuse bad input before a round
 * trip. The database remains the authority.
 */
export function validateFieldValue(field: WorkspaceField, value: FieldValue): string | null {
  if (value === null || value === "") return null;
  switch (field.fieldType) {
    case "text":
      return typeof value === "string" && value.length <= 2000 ? null : "Text of at most 2000 characters";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : "A number";
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? null : "A date (YYYY-MM-DD)";
    case "select":
      return typeof value === "string" && field.choices.includes(value) ? null : "One of the field's choices";
    case "checkbox":
      return typeof value === "boolean" ? null : "True or false";
  }
}

export interface WorkspaceBoard {
  id: string;
  name: string;
  /* `calendar` joined when Sales & Marketing needed one — a third view over
     the same work items, never a second data source (2026-09-13). */
  viewKind: "list" | "board" | "calendar";
  position: number;
}

export interface Workspace {
  id: string;
  /**
   * Null for a workspace BES owns — its own marketing, for instance. The
   * platform has agency-owned workspaces precisely so BES does not have to be
   * modelled as one of its own customers (Dee: "Do NOT create BES as a fake
   * Partner").
   */
  organizationId: string | null;
  /** Present when loaded across organizations (BES shared view). */
  organizationName?: string;
  /** The owning agency — activity and file rows are stamped with it. */
  agencyId?: string;
  /** The BES module this workspace belongs to, when it belongs to one. */
  module?: string | null;
  /** The partner it belongs to, for a partner workspace inside a module. */
  partnerGroupId?: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  colour: string | null;
  boards: WorkspaceBoard[];
  statuses: WorkspaceStatus[];
  itemTypes: WorkspaceItemType[];
  fields: WorkspaceField[];
}

export interface WorkspaceItem {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  assignedTo: string | null;
  teamId: string | null;
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

/** Overdue = due in the past and not yet complete. Attention uses the same idea in SQL. */
export const isOverdue = (item: WorkspaceItem, now = Date.now()) =>
  !!item.dueAt && !item.completedAt && Date.parse(item.dueAt) < now;

/** Open = not in a terminal status. Mirrors `completed_at is null` in the engine. */
export const openItemCount = (statuses: WorkspaceStatus[], items: WorkspaceItem[]) => {
  const terminal = new Set(statuses.filter((s) => s.isTerminal).map((s) => s.id));
  return items.filter((i) => !i.statusId || !terminal.has(i.statusId)).length;
};
