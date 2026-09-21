/**
 * The TalentOps rail — Dee's 2026-09-21 mockup, left column.
 *
 *   Projects                      [+]
 *   MY WORK      Assigned to me · Due today · Overdue · Starred (counts)
 *   WORKSPACES   MANAGED PROJECTS / BES INTERNAL / OUTSOURCING,
 *                each workspace expandable to its boards
 *
 * Everything drawn here was returned by RLS to this person; the rail groups,
 * it never widens (rule 20b). Counts are derived in `workspace-tree.ts`.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Folder, FileText, Plus, User, CalendarDays, Clock, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/lib/workspaces/workspace-domain";
import { MY_WORK_VIEWS, type MyWorkView, type TreeGroup, workspaceOwnerLabel } from "@/lib/talentops/workspace-tree";

export type RailSelection =
  | { kind: "my"; view: MyWorkView }
  | { kind: "workspace"; workspaceId: string; boardId: string | null };

const MY_WORK_ICON: Record<MyWorkView, typeof User> = { assigned: User, today: CalendarDays, overdue: Clock, starred: Star };

const rowClass = (active: boolean) =>
  cn(
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    active ? "bg-primary/10 font-semibold text-foreground" : "text-foreground hover:bg-muted",
  );

const Heading = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-1 mt-4 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>
);

export function TalentOpsRail({ groups, counts, selection, onSelect, canCreate, onCreate }: {
  groups: TreeGroup[];
  counts: Record<MyWorkView, number>;
  selection: RailSelection;
  onSelect: (s: RailSelection) => void;
  canCreate: boolean;
  onCreate: () => void;
}) {
  /* Every group open, and the selected workspace open — the mockup shows the
     tree unfolded to where you are. */
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const [openWorkspaces, setOpenWorkspaces] = useState<Set<string>>(new Set());
  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };
  const selectedWs = selection.kind === "workspace" ? selection.workspaceId : null;
  const isWsOpen = (w: Workspace) => openWorkspaces.has(w.id) || w.id === selectedWs;

  return (
    <nav aria-label="TalentOps" className="flex h-full w-full flex-col overflow-y-auto border-r border-border bg-card px-2 py-3 md:w-64 md:shrink-0">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-base font-bold text-foreground">Projects</h2>
        {canCreate && (
          <Button size="icon" variant="outline" className="h-7 w-7" onClick={onCreate} aria-label="New workspace"><Plus className="h-4 w-4" /></Button>
        )}
      </div>

      <Heading>My work</Heading>
      <ul className="space-y-0.5">
        {MY_WORK_VIEWS.map((v) => {
          const Icon = MY_WORK_ICON[v.key];
          const active = selection.kind === "my" && selection.view === v.key;
          return (
            <li key={v.key}>
              <button type="button" onClick={() => onSelect({ kind: "my", view: v.key })} aria-current={active ? "page" : undefined} className={rowClass(active)}>
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">{v.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{counts[v.key]}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <Heading>Workspaces</Heading>
      {groups.length === 0 && (
        <p className="px-2 py-3 text-xs text-muted-foreground">No workspaces are reachable for you yet.</p>
      )}
      {groups.map((g) => {
        const open = !closedGroups.has(g.key);
        return (
          <section key={g.key} aria-label={g.label} className="mb-1">
            <button type="button" onClick={() => setClosedGroups((s) => toggle(s, g.key))} aria-expanded={open}
              className="flex w-full items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {g.label}
            </button>
            {open && (
              <ul className="space-y-0.5">
                {g.workspaces.map((w) => {
                  const wsActive = selectedWs === w.id && selection.kind === "workspace" && selection.boardId === null;
                  const expanded = isWsOpen(w);
                  return (
                    <li key={w.id}>
                      <div className="flex items-center">
                        <button type="button" onClick={() => setOpenWorkspaces((s) => toggle(s, w.id))} aria-label={`${expanded ? "Collapse" : "Expand"} ${w.name}`}
                          className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </button>
                        <button type="button" onClick={() => onSelect({ kind: "workspace", workspaceId: w.id, boardId: null })} aria-current={wsActive ? "page" : undefined}
                          className={cn(rowClass(wsActive), "min-w-0 flex-1 px-1.5")}>
                          <Folder className="h-4 w-4 shrink-0" style={{ color: w.colour ?? undefined }} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{w.name}</span>
                            <span className="block truncate text-[11px] font-normal text-muted-foreground">{workspaceOwnerLabel(w)}</span>
                          </span>
                        </button>
                      </div>
                      {expanded && w.boards.length > 0 && (
                        <ul className="ml-7 space-y-0.5 border-l border-border pl-2">
                          {w.boards.map((b) => {
                            const active = selection.kind === "workspace" && selection.workspaceId === w.id && selection.boardId === b.id;
                            return (
                              <li key={b.id}>
                                <button type="button" onClick={() => onSelect({ kind: "workspace", workspaceId: w.id, boardId: b.id })} aria-current={active ? "page" : undefined} className={cn(rowClass(active), "py-1 text-[13px]")}>
                                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  <span className="truncate">{b.name}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </nav>
  );
}
