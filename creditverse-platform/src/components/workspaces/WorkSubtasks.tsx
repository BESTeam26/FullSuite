/**
 * A work item's subtasks — canonical work items with `parent_id` set, in the
 * same workspace, each with its own status, assignee, time and production.
 *
 * Distinct from the checklist on purpose: a checklist line is a tick inside
 * one task; a subtask is work somebody can own. The drawer offers both, as
 * Dee's TalentOps mockup does.
 */
import { useState } from "react";
import { Plus, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateWorkspaceItem, useWorkspaceItems } from "@/lib/data/use-workspaces";
import { defaultStatus, subtasksOf, type Workspace, type WorkspaceItem } from "@/lib/workspaces/workspace-domain";
import { cn } from "@/lib/utils";

export function WorkSubtasks({ parent, workspace, readOnly, onOpen }: {
  parent: WorkspaceItem;
  workspace: Workspace;
  readOnly: boolean;
  /** Opening a subtask replaces the drawer's item; the caller owns that state. */
  onOpen: (item: WorkspaceItem) => void;
}) {
  const { items } = useWorkspaceItems(workspace.id);
  const create = useCreateWorkspaceItem();
  const [title, setTitle] = useState("");
  const subtasks = subtasksOf(items, parent.id);
  const done = subtasks.filter((s) => !!s.completedAt).length;

  if (subtasks.length === 0 && readOnly) return null;

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      {
        workspaceId: workspace.id, organizationId: workspace.organizationId, boardId: parent.boardId,
        title, itemTypeId: parent.itemTypeId, statusId: defaultStatus(workspace.statuses)?.id ?? null,
        parentId: parent.id, priority: "Normal",
      },
      { onSuccess: () => setTitle("") },
    );
  };

  return (
    <section aria-label="Subtasks">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Subtasks{subtasks.length > 0 && <span className="ml-1 font-normal normal-case tracking-normal">{done}/{subtasks.length}</span>}
      </p>
      {subtasks.length > 0 && (
        <ul className="mb-2 space-y-1">
          {subtasks.map((s) => {
            const status = workspace.statuses.find((st) => st.id === s.statusId);
            return (
              <li key={s.id}>
                <button type="button" onClick={() => onOpen(s)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {s.completedAt ? <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className={cn("min-w-0 flex-1 truncate", s.completedAt && "text-muted-foreground line-through")}>{s.title}</span>
                  {status && <span className="shrink-0 text-[11px] text-muted-foreground">{status.label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!readOnly && (
        <form onSubmit={add} className="flex items-center gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add subtask" aria-label="New subtask" className="h-8 text-sm" autoComplete="off" />
          <Button type="submit" size="sm" variant="outline" disabled={!title.trim() || create.isPending}><Plus className="mr-1 h-4 w-4" /> Add</Button>
        </form>
      )}
      {create.error && <p className="mt-1 text-xs text-red-700">{(create.error as Error).message}</p>}
    </section>
  );
}
