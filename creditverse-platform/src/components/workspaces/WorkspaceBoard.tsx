/**
 * One workspace as columns of the organization's own statuses. Used by the
 * organization (Workspaces) and by BES (TalentOps / shared view).
 * `readOnly` reflects a 'view' share. Cards open the item drawer; the quick-add
 * row creates a canonical work item in one keystroke.
 */
import { useMemo, useState } from "react";
import { Plus, CheckCircle2, AlertTriangle, Calendar, User } from "lucide-react";
import { useCreateWorkspaceItem, useUpdateWorkspaceItemStatus, useWorkspaceItems } from "@/lib/data/use-workspaces";
import type { OrgMember, OrgTeam } from "@/lib/data/workspaces";
import { groupItemsByStatus, isOverdue, openItemCount, type Workspace, type WorkspaceItem } from "@/lib/workspaces/workspace-domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { cn } from "@/lib/utils";

const NONE = "__none__";
const PRIORITY_TONE: Record<string, string> = { Urgent: "text-red-700", High: "text-amber-700", Normal: "text-muted-foreground" };

const ItemCard = ({ item, workspace, members, onOpen, onMove, disabled }: {
  item: WorkspaceItem; workspace: Workspace; members: OrgMember[]; onOpen: () => void; onMove: (statusId: string) => void; disabled: boolean;
}) => {
  const type = workspace.itemTypes.find((t) => t.id === item.itemTypeId);
  const assignee = members.find((m) => m.id === item.assignedTo);
  const overdue = isOverdue(item);
  return (
    <li className={cn("rounded-lg border bg-card p-2.5 shadow-sm transition-colors hover:border-primary/40", overdue ? "border-red-500/40" : "border-border")}>
      <button type="button" onClick={onOpen} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
        <p className="text-sm font-medium leading-snug text-foreground">{item.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {type && <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">{type.label}</span>}
          {item.priority !== "Normal" && <span className={cn("font-semibold", PRIORITY_TONE[item.priority])}>{item.priority}</span>}
          <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{assignee?.name ?? (item.assignedTo ? "Assigned" : "Unassigned")}</span>
          {item.dueAt && (
            <span className={cn("inline-flex items-center gap-1", overdue && "font-semibold text-red-700")}>
              {overdue ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
              {new Date(item.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      </button>
      <div className="mt-2">
        <OpsSelect aria-label={`Status of ${item.title}`} size="inline" value={item.statusId ?? ""} disabled={disabled} onValueChange={onMove}
          options={workspace.statuses.map((s) => ({ value: s.id, label: s.label }))} />
      </div>
    </li>
  );
};

export function WorkspaceBoard({ workspace, meId, members = [], teams = [], canAssign = false, readOnly = false, subtitle, onOpenItem }: {
  workspace: Workspace; meId: string | null; members?: OrgMember[]; teams?: OrgTeam[]; canAssign?: boolean; readOnly?: boolean; subtitle?: string;
  onOpenItem: (item: WorkspaceItem) => void;
}) {
  const { items, isLoading, error } = useWorkspaceItems(workspace.id);
  const move = useUpdateWorkspaceItemStatus(workspace.id);
  const create = useCreateWorkspaceItem();
  const [title, setTitle] = useState("");
  const [typeId, setTypeId] = useState<string>(workspace.itemTypes[0]?.id ?? "");
  const [assignee, setAssignee] = useState<string>(NONE);
  const [priority, setPriority] = useState<"Normal" | "High" | "Urgent">("Normal");
  const [due, setDue] = useState("");
  const board = [...workspace.boards].sort((a, b) => a.position - b.position)[0] ?? null;
  void meId; void teams;

  const grouped = useMemo(() => groupItemsByStatus(workspace.statuses, items), [workspace.statuses, items]);
  const open = openItemCount(workspace.statuses, items);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || readOnly) return;
    create.mutate(
      {
        workspaceId: workspace.id, organizationId: workspace.organizationId, boardId: board?.id ?? null, title, itemTypeId: typeId || null,
        assignedTo: assignee === NONE ? null : assignee, priority, dueAt: due ? new Date(`${due}T17:00:00`).toISOString() : null,
      },
      { onSuccess: () => { setTitle(""); setDue(""); setPriority("Normal"); setAssignee(NONE); } },
    );
  };

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-foreground">{workspace.name}</h2>
          <p className="text-xs text-muted-foreground">{subtitle ?? workspace.description ?? ""}</p>
        </div>
        <span className="text-xs text-muted-foreground">{open} open · {items.length} total{board ? ` · ${board.name}` : ""}{readOnly ? " · view only" : ""}</span>
      </div>

      {!readOnly && (
        <form onSubmit={submit} className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a work item and press Enter" aria-label="New item title" className="h-8 min-w-[14rem] flex-1 text-sm" autoComplete="off" />
          {workspace.itemTypes.length > 0 && <OpsSelect aria-label="Item type" size="sm" value={typeId} onValueChange={setTypeId} options={workspace.itemTypes.map((t) => ({ value: t.id, label: t.label }))} />}
          {canAssign && <OpsSelect aria-label="Assignee" size="sm" value={assignee} onValueChange={setAssignee} options={[{ value: NONE, label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))]} />}
          <OpsSelect aria-label="Priority" size="sm" value={priority} onValueChange={(v) => setPriority(v as typeof priority)} options={["Normal", "High", "Urgent"]} />
          <Input type="date" aria-label="Due date" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 w-40 text-xs" />
          <Button type="submit" size="sm" disabled={!title.trim() || create.isPending}><Plus className="mr-1 h-4 w-4" /> Add</Button>
          {create.error && <span className="text-xs text-red-700">{(create.error as Error).message}</span>}
        </form>
      )}

      {error && <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700">Could not load items: {error}</div>}
      {move.error && <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700">Could not move item: {(move.error as Error).message}</div>}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-2.5">
            {grouped.columns.map(({ status, items: colItems }) => (
              <section key={status.id} aria-label={status.label} className="w-64 shrink-0 rounded-lg border border-border bg-muted/30 p-2">
                <header className="mb-2 flex items-center justify-between px-1">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: status.colour ?? "hsl(var(--muted-foreground))" }} />
                    {status.label}
                    {status.isTerminal && <CheckCircle2 className="h-3 w-3 text-status-success" />}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{colItems.length}</span>
                </header>
                {colItems.length === 0 ? <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">Empty</p> : (
                  <ul className="space-y-1.5">
                    {colItems.map((item) => (
                      <ItemCard key={item.id} item={item} workspace={workspace} members={members} onOpen={() => onOpenItem(item)}
                        disabled={readOnly || move.isPending} onMove={(statusId) => move.mutate({ itemId: item.id, statusId })} />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
          {grouped.orphans.length > 0 && <p className="mt-2 text-xs text-amber-700">{grouped.orphans.length} item(s) reference a status this workspace no longer defines.</p>}
        </div>
      )}
    </div>
  );
}
