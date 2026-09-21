/**
 * The TalentOps list view — rows grouped under a heading, with the columns
 * Dee's mockup shows: Task · Status · Assignee · Priority · Due date.
 *
 * Grouped by status inside one workspace, and by workspace for the MY WORK
 * views, where one list spans several workspaces with different status sets.
 * Every row is a canonical work item; the status control writes `status_id`
 * and the engine derives the stage (rule 17).
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Star, CheckCircle2, Circle, AlertTriangle, ListTree } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { OpsSelect } from "@/components/ui/ops-select";
import { cn } from "@/lib/utils";
import type { OrgMember } from "@/lib/data/workspaces";
import { groupItemsByStatus, isOverdue, sortedStatuses, type Workspace, type WorkspaceItem } from "@/lib/workspaces/workspace-domain";

export type ListItem = WorkspaceItem & { workspaceId: string };

const PRIORITY_PILL: Record<string, string> = {
  Urgent: "bg-red-500/10 text-red-700",
  High: "bg-amber-500/10 text-amber-800",
  Normal: "bg-muted text-muted-foreground",
};

const isToday = (iso: string) => {
  const d = new Date(iso); const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

export interface TaskListProps {
  items: ListItem[];
  /** Subtasks are counted on their parent's row, so the full item set is needed. */
  allItems: ListItem[];
  workspaces: Workspace[];
  groupBy: "status" | "workspace";
  members: OrgMember[];
  starred: ReadonlySet<string>;
  onToggleStar: (item: ListItem, starred: boolean) => void;
  onOpen: (item: ListItem) => void;
  /** Whether this person may change this row — the database decides for real. */
  canEdit: (item: ListItem) => boolean;
  onMove: (item: ListItem, statusId: string) => void;
  emptyMessage: string;
}

export function TaskList({ items, allItems, workspaces, groupBy, members, starred, onToggleStar, onOpen, canEdit, onMove, emptyMessage }: TaskListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const wsById = new Map(workspaces.map((w) => [w.id, w]));
  const subtaskCount = (id: string) => allItems.filter((i) => i.parentId === id).length;

  const sections: { key: string; label: string; colour: string | null; items: ListItem[] }[] = [];
  if (groupBy === "status") {
    const ws = items[0] ? wsById.get(items[0].workspaceId) : workspaces[0];
    if (ws) {
      const grouped = groupItemsByStatus(ws.statuses, items);
      for (const c of grouped.columns) sections.push({ key: c.status.id, label: c.status.label, colour: c.status.colour, items: c.items as ListItem[] });
      if (grouped.orphans.length) sections.push({ key: "orphans", label: "No status", colour: null, items: grouped.orphans as ListItem[] });
    }
  } else {
    const byWs = new Map<string, ListItem[]>();
    for (const i of items) byWs.set(i.workspaceId, [...(byWs.get(i.workspaceId) ?? []), i]);
    for (const [wsId, rows] of byWs) {
      const ws = wsById.get(wsId);
      sections.push({ key: wsId, label: ws?.name ?? "Workspace", colour: ws?.colour ?? null, items: rows });
    }
    sections.sort((a, b) => a.label.localeCompare(b.label));
  }
  const shown = sections.filter((s) => groupBy === "workspace" || s.items.length > 0 || s.key !== "orphans");

  if (items.length === 0) {
    return <p className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="w-10 px-3 py-2"><span className="sr-only">Done</span></th>
            <th scope="col" className="px-2 py-2">Task</th>
            <th scope="col" className="w-40 px-2 py-2">Status</th>
            <th scope="col" className="w-40 px-2 py-2">Assignee</th>
            <th scope="col" className="w-24 px-2 py-2">Priority</th>
            <th scope="col" className="w-32 px-2 py-2">Due date</th>
            <th scope="col" className="w-10 px-2 py-2"><span className="sr-only">Star</span></th>
          </tr>
        </thead>
        {shown.map((section) => {
          const open = !collapsed.has(section.key);
          return (
            <tbody key={section.key}>
              <tr className="border-b border-border bg-muted/30">
                <td colSpan={7} className="px-3 py-1.5">
                  <button type="button" aria-expanded={open}
                    onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(section.key)) n.delete(section.key); else n.add(section.key); return n; })}
                    className="inline-flex items-center gap-1.5 rounded text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <span className="h-2 w-2 rounded-full" style={{ background: section.colour ?? "hsl(var(--muted-foreground))" }} />
                    {section.label}
                    <span className="font-normal text-muted-foreground">{section.items.length}</span>
                  </button>
                </td>
              </tr>
              {open && section.items.map((item) => {
                const ws = wsById.get(item.workspaceId);
                const statuses = ws ? sortedStatuses(ws.statuses) : [];
                const terminal = statuses.find((s) => s.isTerminal);
                const assignee = members.find((m) => m.id === item.assignedTo);
                const overdue = isOverdue(item);
                const editable = canEdit(item);
                const subs = subtaskCount(item.id);
                const isStar = starred.has(item.id);
                return (
                  <tr key={item.id} className={cn("border-b border-border last:border-b-0 hover:bg-muted/40", item.completedAt && "text-muted-foreground")}>
                    <td className="px-3 py-1.5">
                      <button type="button" aria-label={item.completedAt ? `${item.title} is complete` : `Mark ${item.title} complete`} disabled={!editable || !terminal || !!item.completedAt}
                        onClick={() => terminal && onMove(item, terminal.id)}
                        className="rounded text-muted-foreground hover:text-foreground disabled:cursor-default disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {item.completedAt ? <CheckCircle2 className="h-4 w-4 text-status-success" /> : <Circle className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-2 py-1.5">
                      <button type="button" onClick={() => onOpen(item)} className="flex max-w-full items-center gap-2 rounded text-left font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <span className={cn("truncate", item.completedAt && "line-through")}>{item.title}</span>
                        {subs > 0 && <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-normal text-muted-foreground"><ListTree className="h-3 w-3" />{subs}</span>}
                        {groupBy === "workspace" && ws && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">{ws.name}</span>}
                      </button>
                    </td>
                    <td className="px-2 py-1.5">
                      {statuses.length > 0 ? (
                        <OpsSelect aria-label={`Status of ${item.title}`} size="inline" value={item.statusId ?? ""} disabled={!editable}
                          onValueChange={(v) => onMove(item, v)} options={statuses.map((s) => ({ value: s.id, label: s.label }))} />
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-foreground">{assignee?.name ?? (item.assignedTo ? "Assigned" : <span className="text-muted-foreground">Unassigned</span>)}</td>
                    <td className="px-2 py-1.5">
                      <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", PRIORITY_PILL[item.priority] ?? PRIORITY_PILL.Normal)}>{item.priority}</span>
                    </td>
                    <td className={cn("px-2 py-1.5 text-foreground", overdue && "font-semibold text-red-700")}>
                      {item.dueAt ? (
                        <span className="inline-flex items-center gap-1">{overdue && <AlertTriangle className="h-3.5 w-3.5" />}{isToday(item.dueAt) && !item.completedAt ? "Today" : formatDate(item.dueAt)}</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <button type="button" aria-pressed={isStar} aria-label={isStar ? `Unstar ${item.title}` : `Star ${item.title}`} onClick={() => onToggleStar(item, !isStar)}
                        className={cn("rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", isStar ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-foreground")}>
                        <Star className={cn("h-4 w-4", isStar && "fill-current")} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
