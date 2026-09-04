/**
 * One workspace rendered as columns of the organization's own statuses.
 * Used by the organization (Workspaces) and by BES (TalentOps / shared view).
 * `readOnly` reflects a 'view' share: the database would refuse the write
 * anyway; the control is disabled so the UI does not promise what it cannot do.
 */
import { useMemo, useState } from "react";
import { Plus, CheckCircle2 } from "lucide-react";
import {
  useCreateWorkspaceItem,
  useUpdateWorkspaceItemStatus,
  useWorkspaceItems,
} from "@/lib/data/use-workspaces";
import {
  groupItemsByStatus,
  openItemCount,
  type Workspace,
  type WorkspaceItem,
} from "@/lib/workspaces/workspace-domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";

const ItemCard = ({
  item,
  workspace,
  meId,
  onMove,
  disabled,
}: {
  item: WorkspaceItem;
  workspace: Workspace;
  meId: string | null;
  onMove: (statusId: string) => void;
  disabled: boolean;
}) => {
  const type = workspace.itemTypes.find((t) => t.id === item.itemTypeId);
  return (
    <li className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <p className="text-sm font-medium text-foreground">{item.title}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {type && (
          <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">{type.label}</span>
        )}
        <span>{item.priority}</span>
        <span>
          {item.assignedTo ? (item.assignedTo === meId ? "Assigned to you" : "Assigned") : "Unassigned"}
        </span>
      </div>
      <div className="mt-2">
        <OpsSelect
          aria-label={`Status of ${item.title}`}
          size="inline"
          value={item.statusId ?? ""}
          disabled={disabled}
          onValueChange={onMove}
          options={workspace.statuses.map((s) => ({ value: s.id, label: s.label }))}
        />
      </div>
    </li>
  );
};

export function WorkspaceBoard({
  workspace,
  meId,
  readOnly = false,
  subtitle,
}: {
  workspace: Workspace;
  meId: string | null;
  readOnly?: boolean;
  subtitle?: string;
}) {
  const { items, isLoading, error } = useWorkspaceItems(workspace.id);
  const move = useUpdateWorkspaceItemStatus(workspace.id);
  const create = useCreateWorkspaceItem();
  const [title, setTitle] = useState("");
  const [typeId, setTypeId] = useState<string>(workspace.itemTypes[0]?.id ?? "");
  const board = workspace.boards[0] ?? null;

  const grouped = useMemo(() => groupItemsByStatus(workspace.statuses, items), [workspace.statuses, items]);
  const open = openItemCount(workspace.statuses, items);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || readOnly) return;
    create.mutate(
      { workspaceId: workspace.id, organizationId: workspace.organizationId, boardId: board?.id ?? null, title, itemTypeId: typeId || null },
      { onSuccess: () => setTitle("") },
    );
  };

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-foreground">{workspace.name}</h2>
          <p className="text-xs text-muted-foreground">
            {subtitle ?? workspace.description ?? ""}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {open} open · {items.length} total{board ? ` · ${board.name}` : ""}
          {readOnly ? " · view only" : ""}
        </span>
      </div>

      {!readOnly && (
        <form onSubmit={submit} className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New item title"
            aria-label="New item title"
            className="h-9 max-w-sm text-sm"
          />
          {workspace.itemTypes.length > 0 && (
            <OpsSelect
              aria-label="Item type"
              size="sm"
              value={typeId}
              onValueChange={setTypeId}
              options={workspace.itemTypes.map((t) => ({ value: t.id, label: t.label }))}
            />
          )}
          <Button type="submit" size="sm" disabled={!title.trim() || create.isPending}>
            <Plus className="mr-1 h-4 w-4" /> Add item
          </Button>
          {create.error && <span className="text-xs text-red-700">{(create.error as Error).message}</span>}
        </form>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          Could not load items: {error}
        </div>
      )}
      {move.error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          Could not move item: {(move.error as Error).message}
        </div>
      )}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-3">
            {grouped.columns.map(({ status, items: colItems }) => (
              <section key={status.id} aria-label={status.label} className="w-64 shrink-0 rounded-xl border border-border bg-muted/30 p-2">
                <header className="mb-2 flex items-center justify-between px-1">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: status.colour ?? "hsl(var(--muted-foreground))" }} />
                    {status.label}
                    {status.isTerminal && <CheckCircle2 className="h-3 w-3 text-status-success" />}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{colItems.length}</span>
                </header>
                {colItems.length === 0 ? (
                  <p className="px-1 py-4 text-center text-[11px] text-muted-foreground">Empty</p>
                ) : (
                  <ul className="space-y-2">
                    {colItems.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        workspace={workspace}
                        meId={meId}
                        disabled={readOnly || move.isPending}
                        onMove={(statusId) => move.mutate({ itemId: item.id, statusId })}
                      />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
          {grouped.orphans.length > 0 && (
            <p className="mt-3 text-xs text-amber-700">
              {grouped.orphans.length} item(s) reference a status this workspace no longer defines.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
