/**
 * TalentOps — the BES work workspace, to Dee's 2026-09-21 mockup.
 *
 *   BES sidebar │ Projects rail │ the selected work (List · Board · Activity) │ item drawer
 *
 * One task engine underneath (rule 17): every row is a canonical `work_items`
 * record, statuses are the workspace's own rows, subtasks are items with a
 * parent, stars are the person's own rows. Time, production, EOD, attention,
 * files and comments keep working without being taught what TalentOps is.
 *
 * Who sees which workspace is the database's decision. A BES-owned workspace
 * (a partner's managed project, or BES internal) reaches the staff its
 * `workspace_reach` allows; an organization's own workspace reaches BES only
 * under a live TalentOps share. This page groups what came back and hides
 * controls the database would refuse — hiding is courtesy, the refusal is
 * real either way (rules 1 and 20b).
 *
 * Sales & Marketing folded in here 2026-09-21 (Dee: "I can just create that
 * project inside TalentOps"): its workspaces are ordinary rows in this tree.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronRight, Filter, LayoutGrid, List as ListIcon, Activity, Plus, Search, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { isAdminRole } from "@/lib/agency/navigation";
import { useAgencyMembers, useAgencyTeams, useCreateAgencyWorkspace } from "@/lib/data/use-agency-work";
import { useAllWorkspaceItems, useCreateWorkspaceItem, useMoveWorkspaceItem, useMyStars, useSharedWorkspaces, useToggleStar } from "@/lib/data/use-workspaces";
import { useActiveShares } from "@/lib/data/use-workspace-shares";
import type { OrgMember, OrgTeam } from "@/lib/data/workspaces";
import { defaultStatus, topLevelItems, type Workspace, type WorkspaceItem } from "@/lib/workspaces/workspace-domain";
import {
  applyListQuery, DEFAULT_LIST_QUERY, GROUP_BADGE, groupWorkspaces, MY_WORK_VIEWS, myWorkCounts, myWorkItems,
  treeGroupOf, workspaceOwnerLabel, type ListQuery, type MyWorkView,
} from "@/lib/talentops/workspace-tree";
import { TalentOpsRail, type RailSelection } from "@/components/talentops/TalentOpsRail";
import { TaskList, type ListItem } from "@/components/talentops/TaskList";
import { WorkspaceActivity } from "@/components/talentops/WorkspaceActivity";
import { WorkspaceBoard } from "@/components/workspaces/WorkspaceBoard";
import { WorkItemDrawer } from "@/components/workspaces/WorkItemDrawer";
import { NewWorkspaceDialog } from "@/components/workspaces/NewWorkspaceDialog";
import { cn } from "@/lib/utils";

type Tab = "list" | "board" | "activity";
const TABS: { key: Tab; label: string; icon: typeof ListIcon }[] = [
  { key: "list", label: "List", icon: ListIcon },
  { key: "board", label: "Board", icon: LayoutGrid },
  { key: "activity", label: "Activity", icon: Activity },
];
const isMyWorkView = (v: string | null): v is MyWorkView => MY_WORK_VIEWS.some((x) => x.key === v);

/** The rail selection lives in the URL so a link to a board is a link to a board. */
function useSelection(): [RailSelection, (s: RailSelection) => void] {
  const [params, setParams] = useSearchParams();
  const ws = params.get("ws");
  const view = params.get("view");
  const selection: RailSelection = ws
    ? { kind: "workspace", workspaceId: ws, boardId: params.get("board") }
    : { kind: "my", view: isMyWorkView(view) ? view : "assigned" };
  const select = (s: RailSelection) => {
    const next = new URLSearchParams(params);
    next.delete("ws"); next.delete("board"); next.delete("view");
    if (s.kind === "my") next.set("view", s.view);
    else { next.set("ws", s.workspaceId); if (s.boardId) next.set("board", s.boardId); }
    setParams(next, { replace: true });
  };
  return [selection, select];
}

export default function TalentOps() {
  const auth = useAuth();
  const meId = auth.user?.id ?? null;
  const perms = useAgencyPermissions();
  const manages = isAdminRole(auth.agencyMembership?.role) || perms.can("talentops.tasks.manage") || perms.can("ops.manage");

  const { workspaces, isLoading: wsLoading, error: wsError } = useSharedWorkspaces();
  const { items: allItems, error: itemsError } = useAllWorkspaceItems();
  const { shares } = useActiveShares();
  const { starred } = useMyStars();
  const toggleStar = useToggleStar();
  const move = useMoveWorkspaceItem();
  const create = useCreateWorkspaceItem();
  const createWorkspace = useCreateAgencyWorkspace();
  const agencyMembers = useAgencyMembers();
  const agencyTeams = useAgencyTeams();

  const [selection, select] = useSelection();
  const [tab, setTab] = useState<Tab>("list");
  const [query, setQuery] = useState<ListQuery>(DEFAULT_LIST_QUERY);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newWorkspace, setNewWorkspace] = useState(false);

  const groups = useMemo(() => groupWorkspaces(workspaces), [workspaces]);
  const counts = useMemo(() => myWorkCounts(allItems, meId, starred), [allItems, meId, starred]);
  const members: OrgMember[] = agencyMembers.data ?? [];
  const teams: OrgTeam[] = useMemo(() => (agencyTeams.data ?? []).map((t) => ({ id: t.id, name: t.name, memberIds: [] })), [agencyTeams.data]);

  const workspace: Workspace | null = selection.kind === "workspace" ? workspaces.find((w) => w.id === selection.workspaceId) ?? null : null;
  const board = workspace && selection.kind === "workspace" && selection.boardId ? workspace.boards.find((b) => b.id === selection.boardId) ?? null : null;

  /* An organization's own workspace is writable only under a 'work' share;
     a BES-owned one follows the person's own capability. */
  const canWriteWorkspace = (w: Workspace) =>
    treeGroupOf(w) === "outsourcing" ? shares.some((s) => s.workspaceId === w.id && s.access === "work") : manages;
  const canEdit = (item: ListItem) => {
    const w = workspaces.find((x) => x.id === item.workspaceId);
    return !!w && (canWriteWorkspace(w) || item.assignedTo === meId);
  };

  const scoped: ListItem[] = useMemo(() => {
    if (selection.kind === "my") return myWorkItems(selection.view, allItems, meId, starred);
    return allItems.filter((i) => i.workspaceId === selection.workspaceId && (!selection.boardId || i.boardId === selection.boardId));
  }, [selection, allItems, meId, starred]);
  const listed = useMemo(() => applyListQuery(topLevelItems(scoped), query, meId), [scoped, query, meId]);

  const openItem = allItems.find((i) => i.id === openItemId) ?? null;
  const openWorkspace = openItem ? workspaces.find((w) => w.id === openItem.workspaceId) ?? null : null;

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !newTitle.trim()) return;
    create.mutate(
      {
        workspaceId: workspace.id, organizationId: workspace.organizationId, boardId: board?.id ?? workspace.boards[0]?.id ?? null,
        title: newTitle, itemTypeId: workspace.itemTypes[0]?.id ?? null, statusId: defaultStatus(workspace.statuses)?.id ?? null,
        assignedTo: query.assignee === "me" ? meId : null,
      },
      { onSuccess: () => { setNewTitle(""); setAdding(false); } },
    );
  };

  const title = selection.kind === "my" ? MY_WORK_VIEWS.find((v) => v.key === selection.view)!.label : workspace?.name ?? "Workspace";
  const emptyMessage = selection.kind === "my"
    ? { assigned: "Nothing is assigned to you right now.", today: "Nothing of yours is due today.", overdue: "Nothing of yours is overdue.", starred: "Star a task to keep it here." }[selection.view]
    : query.search || query.assignee !== "all" || query.priority !== "all" ? "No tasks match these filters." : "No tasks here yet.";

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <div className="flex flex-1 flex-col md:flex-row">
        <TalentOpsRail groups={groups} counts={counts} selection={selection} onSelect={(s) => { select(s); setTab("list"); }} canCreate={manages} onCreate={() => setNewWorkspace(true)} />

        <main className="min-w-0 flex-1 px-4 py-4 md:px-6">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span>TalentOps</span>
            <ChevronRight className="h-3 w-3" />
            {selection.kind === "my" ? <span className="text-foreground">My work</span> : (
              <>
                <span>Projects</span>
                <ChevronRight className="h-3 w-3" />
                <button type="button" onClick={() => workspace && select({ kind: "workspace", workspaceId: workspace.id, boardId: null })} className={cn("rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", !board && "text-foreground")}>{workspace?.name ?? "…"}</button>
                {board && (<><ChevronRight className="h-3 w-3" /><span className="text-foreground">{board.name}</span></>)}
              </>
            )}
          </nav>

          {/* Header */}
          <header className="mb-3 flex flex-wrap items-start gap-3">
            {workspace && (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white" style={{ background: workspace.colour ?? "hsl(var(--primary))" }} aria-hidden>
                {workspace.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-foreground">{title}</h1>
                {workspace && <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-foreground">{GROUP_BADGE[treeGroupOf(workspace)]}</span>}
                {workspace && !canWriteWorkspace(workspace) && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">View only</span>}
              </div>
              {board && <p className="text-sm font-semibold text-foreground">{board.name}</p>}
              <p className="text-xs text-muted-foreground">
                {selection.kind === "my" ? "Across every workspace you can reach." : workspace?.description ?? `${workspaceOwnerLabel(workspace!)} · ${workspace?.boards.length ?? 0} lists`}
              </p>
            </div>
          </header>

          {/* Tabs — Board and Activity are per workspace; MY WORK is a list. */}
          {workspace && (
            <div role="tablist" aria-label="View" className="mb-3 flex gap-1 border-b border-border">
              {TABS.map((t) => (
                <button key={t.key} role="tab" type="button" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                  className={cn("-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    tab === t.key ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  <t.icon className="h-4 w-4" />{t.label}
                </button>
              ))}
            </div>
          )}

          {wsError && <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700">Could not load workspaces: {wsError}</p>}
          {itemsError && <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700">Could not load tasks: {itemsError}</p>}
          {move.error && <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700">Could not move task: {(move.error as Error).message}</p>}

          {selection.kind === "workspace" && !workspace && !wsLoading && (
            <p className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center text-sm text-muted-foreground">This workspace is not reachable for you.</p>
          )}

          {(selection.kind === "my" || workspace) && (tab === "list" || selection.kind === "my") && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {workspace && canWriteWorkspace(workspace) && (
                  <Button size="sm" onClick={() => setAdding((a) => !a)} aria-expanded={adding}><Plus className="mr-1 h-4 w-4" /> Add task</Button>
                )}
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Filter className="h-3.5 w-3.5" /> Filter</span>
                <OpsSelect aria-label="Assignee filter" size="sm" value={query.assignee} onValueChange={(v) => setQuery({ ...query, assignee: v as ListQuery["assignee"] })}
                  options={[{ value: "all", label: "Anyone" }, { value: "me", label: "Me" }, { value: "unassigned", label: "Unassigned" }]} />
                <OpsSelect aria-label="Priority filter" size="sm" value={query.priority} onValueChange={(v) => setQuery({ ...query, priority: v as ListQuery["priority"] })}
                  options={[{ value: "all", label: "Any priority" }, "Urgent", "High", "Normal"]} />
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ArrowUpDown className="h-3.5 w-3.5" /> Sort</span>
                <OpsSelect aria-label="Sort" size="sm" value={query.sort} onValueChange={(v) => setQuery({ ...query, sort: v as ListQuery["sort"] })}
                  options={[{ value: "due", label: "Due date" }, { value: "priority", label: "Priority" }, { value: "created", label: "Newest" }]} />
                <label className="relative ml-auto min-w-[12rem] flex-1 sm:flex-none">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query.search} onChange={(e) => setQuery({ ...query, search: e.target.value })} placeholder="Search tasks…" aria-label="Search tasks" className="h-8 pl-7 text-sm" />
                </label>
              </div>
              {adding && workspace && (
                <form onSubmit={addTask} className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-card p-2">
                  <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={`New task in ${board?.name ?? workspace.name}`} aria-label="New task title" className="h-8 flex-1 text-sm" autoFocus autoComplete="off" />
                  <Button type="submit" size="sm" disabled={!newTitle.trim() || create.isPending}>Add</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
                  {create.error && <span className="text-xs text-red-700">{(create.error as Error).message}</span>}
                </form>
              )}
              <TaskList
                items={listed} allItems={allItems} workspaces={workspaces} groupBy={selection.kind === "my" ? "workspace" : "status"}
                members={members} starred={starred}
                onToggleStar={(item, on) => toggleStar.mutate({ itemId: item.id, starred: on })}
                onOpen={(item) => setOpenItemId(item.id)} canEdit={canEdit}
                onMove={(item, statusId) => move.mutate({ workspaceId: item.workspaceId, itemId: item.id, statusId })}
                emptyMessage={emptyMessage}
              />
            </>
          )}

          {workspace && tab === "board" && (
            <WorkspaceBoard key={`${workspace.id}:${board?.id ?? "all"}`} workspace={workspace} meId={meId} members={members} teams={teams}
              canAssign={canWriteWorkspace(workspace)} readOnly={!canWriteWorkspace(workspace)} subtitle={board?.name} onOpenItem={(i) => setOpenItemId(i.id)} />
          )}
          {workspace && tab === "activity" && <WorkspaceActivity itemIds={scoped.map((i) => i.id)} />}
        </main>
      </div>

      {openWorkspace && (
        <WorkItemDrawer key={openItem?.id ?? "none"} itemId={openItem?.id ?? null} workspace={openWorkspace} members={members} teams={teams}
          canAssign={canWriteWorkspace(openWorkspace)} readOnly={!canWriteWorkspace(openWorkspace) && openItem?.assignedTo !== meId}
          onOpenItem={(i: WorkspaceItem) => setOpenItemId(i.id)} onClose={() => setOpenItemId(null)} />
      )}

      <NewWorkspaceDialog open={newWorkspace} onOpenChange={setNewWorkspace} pending={createWorkspace.isPending}
        error={createWorkspace.error ? (createWorkspace.error as Error).message : null}
        onCreate={(input) => createWorkspace.mutate(input, { onSuccess: (id) => { setNewWorkspace(false); select({ kind: "workspace", workspaceId: id, boardId: null }); } })} />
    </div>
  );
}
