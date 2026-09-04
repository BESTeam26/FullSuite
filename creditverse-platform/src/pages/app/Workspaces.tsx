/**
 * Custom Workspaces — the organization's flexible operations layer over the
 * canonical work engine (CLAUDE.md rule 17).
 *
 * Foundation surface: pick a workspace, see its board grouped by the
 * organization's own statuses, add items, move them between statuses. Every
 * item is a `work_items` row; moving it to a terminal status completes it in
 * the engine, so My Work, Attention and EOD stay in step without knowing this
 * page exists.
 *
 * Authorization is the database's. This page asks for the active
 * organization's workspaces and renders exactly what RLS returns: an entitled
 * member sees their organization's workspaces; BES staff see nothing until a
 * TalentOps share exists (Phase 7) — and the page says so rather than showing
 * an empty board that looks like a bug.
 */
import { useMemo, useState } from "react";
import { LayoutGrid, Plus, CheckCircle2 } from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import {
  useCreateWorkspaceItem,
  useUpdateWorkspaceItemStatus,
  useWorkspaceItems,
  useWorkspaces,
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
import { cn } from "@/lib/utils";

const Notice = ({ title, body }: { title: string; body: string }) => (
  <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
    <LayoutGrid className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
    <p className="text-sm font-semibold text-foreground">{title}</p>
    <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{body}</p>
  </div>
);

const ItemCard = ({
  item,
  workspace,
  meId,
  onMove,
  busy,
}: {
  item: WorkspaceItem;
  workspace: Workspace;
  meId: string | null;
  onMove: (statusId: string) => void;
  busy: boolean;
}) => {
  const type = workspace.itemTypes.find((t) => t.id === item.itemTypeId);
  return (
    <li className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <p className="text-sm font-medium text-foreground">{item.title}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {type && (
          <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
            {type.label}
          </span>
        )}
        <span>{item.priority}</span>
        <span>
          {item.assignedTo
            ? item.assignedTo === meId
              ? "Assigned to you"
              : "Assigned"
            : "Unassigned"}
        </span>
      </div>
      <div className="mt-2">
        <OpsSelect
          aria-label={`Status of ${item.title}`}
          size="inline"
          value={item.statusId ?? ""}
          disabled={busy}
          onValueChange={onMove}
          options={workspace.statuses.map((s) => ({ value: s.id, label: s.label }))}
        />
      </div>
    </li>
  );
};

const Board = ({ workspace, meId }: { workspace: Workspace; meId: string | null }) => {
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
    if (!title.trim()) return;
    create.mutate(
      {
        workspaceId: workspace.id,
        organizationId: workspace.organizationId,
        boardId: board?.id ?? null,
        title,
        itemTypeId: typeId || null,
      },
      { onSuccess: () => setTitle("") },
    );
  };

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-foreground">{workspace.name}</h2>
          {workspace.description && (
            <p className="text-xs text-muted-foreground">{workspace.description}</p>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {open} open · {items.length} total{board ? ` · ${board.name}` : ""}
        </span>
      </div>

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
        {create.error && (
          <span className="text-xs text-red-700">{(create.error as Error).message}</span>
        )}
      </form>

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
              <section
                key={status.id}
                aria-label={status.label}
                className="w-64 shrink-0 rounded-xl border border-border bg-muted/30 p-2"
              >
                <header className="mb-2 flex items-center justify-between px-1">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: status.colour ?? "hsl(var(--muted-foreground))" }}
                    />
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
                        busy={move.isPending}
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
};

export default function Workspaces() {
  const { viewMode, activeOrganization } = useAgency();
  const auth = useAuth();
  const organizationId = viewMode === "agency" ? null : (activeOrganization?.id ?? null);
  const { workspaces, isLoading, error, live } = useWorkspaces(organizationId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = workspaces.find((w) => w.id === selectedId) ?? workspaces[0] ?? null;
  const meId = auth.user?.id ?? null;

  return (
    <HqPageShell
      title="Workspaces"
      description="Your organization's own operations — boards, statuses and work items you define"
      icon={LayoutGrid}
    >
      {!live ? (
        <Notice title="Available when signed in" body="Workspaces read live organization data and are not part of the demo." />
      ) : viewMode === "agency" ? (
        <Notice
          title="No workspaces are shared with BES"
          body="Custom Workspaces belong to each organization. BES sees a workspace only when the organization shares it under an active TalentOps engagement — that bridge is not built yet, so nothing is listed here on purpose."
        />
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          Could not load workspaces: {error}
        </div>
      ) : isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : workspaces.length === 0 ? (
        <Notice
          title="No workspaces yet"
          body="Nothing is visible to you in this organization. Workspaces are created and configured by an organization admin; the configuration screen is not built yet."
        />
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          <nav aria-label="Workspaces" className="w-full shrink-0 lg:w-56">
            <ul className="space-y-1">
              {workspaces.map((w) => {
                const active = selected?.id === w.id;
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(w.id)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        active
                          ? "bg-primary/10 font-semibold text-foreground"
                          : "text-foreground hover:bg-muted",
                      )}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: w.colour ?? "hsl(var(--primary))" }}
                      />
                      <span className="truncate">{w.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          {selected && <Board key={selected.id} workspace={selected} meId={meId} />}
        </div>
      )}
    </HqPageShell>
  );
}
