/**
 * The BES team's working surface — the ClickUp replacement.
 *
 * Three views over ONE engine. My Work, the team's board and the manager's
 * view are filters over the same `work_items` rows, computed by
 * `lib/agency/team-views`, which is why they cannot disagree about whether a
 * task is overdue.
 *
 * Nothing here needs a client, a case, a funding file or an organization. An
 * internal task stands on its own: it belongs to a BES workspace, and the
 * workspace belongs to the agency.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle, CalendarClock, CheckCircle2, CircleSlash, ClipboardList,
  Layers, Loader2, Plus, UserPlus, Users,
} from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgencyWork } from "@/lib/data/use-work";
import { useAgencyMembers, useAgencyWorkspaces } from "@/lib/data/use-agency-work";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { WorkItem } from "@/lib/bes-domain";
import {
  applyFilters, bucketForManager, bucketMyWork, isOverdue, sortItems,
  workloadBy, type TeamSort,
} from "@/lib/agency/team-views";
import { AgencyTaskDrawer } from "@/components/agency/AgencyTaskDrawer";
import { NewAgencyTaskDialog } from "@/components/agency/NewAgencyTaskDialog";
import { ListManager } from "@/components/agency/ListManager";

const ALL = "__all__";

/** One task row. Clickable everywhere it appears — that is the point. */
function TaskRow({ item, nameOf, onOpen }: { item: WorkItem; nameOf: (id?: string) => string; onOpen: (id: string) => void }) {
  const overdue = isOverdue(item);
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {nameOf(item.assignedTo)}
          {item.dueAt && (
            <> · <span className={overdue ? "font-semibold text-status-danger" : ""}>Due {formatDate(item.dueAt)}</span></>
          )}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {item.priority && item.priority !== "Normal" && (
          <span className={cn(
            "rounded-full border px-1.5 py-0.5 text-[10px] font-bold",
            item.priority === "Urgent"
              ? "border-red-500/30 bg-red-500/10 text-red-700"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700",
          )}>{item.priority}</span>
        )}
        <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {item.stage}
        </span>
      </span>
    </button>
  );
}

function Bucket({
  title, icon: Icon, items, tone, nameOf, onOpen, empty,
}: {
  title: string; icon: typeof AlertTriangle; items: WorkItem[]; tone?: string;
  nameOf: (id?: string) => string; onOpen: (id: string) => void; empty: string;
}) {
  return (
    <ContentCard title={
      <span className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", tone ?? "text-muted-foreground")} />
        {title}
        <span className="rounded-full bg-muted px-1.5 text-xs font-semibold text-muted-foreground">{items.length}</span>
      </span>
    }>
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="-mx-2 divide-y divide-border/50">
          {items.map((i) => <TaskRow key={i.id} item={i} nameOf={nameOf} onOpen={onOpen} />)}
        </div>
      )}
    </ContentCard>
  );
}

export const AgencyTeamWorkspace = () => {
  const { user, agencyId, agencyRole } = useAuth();
  const work = useAgencyWork();
  const workspaces = useAgencyWorkspaces();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);

  const openId = params.get("task");
  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("task", id); else next.delete("task");
    setParams(next, { replace: true });
  };

  const items = work.items;
  const members = useAgencyMembers();
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of members.data ?? []) m.set(p.id, p.name);
    return m;
  }, [members.data]);
  const nameOf = (id?: string) => {
    if (!id) return "Unassigned";
    if (id === user?.id) return "You";
    /* "Assigned" rather than a guessed name: the picker is scoped, so a person
       outside the caller's scope legitimately has no name here. */
    return nameById.get(id) ?? "Assigned";
  };

  const mine = useMemo(() => items.filter((i) => i.assignedTo === user?.id), [items, user?.id]);
  const buckets = useMemo(() => bucketMyWork(mine), [mine]);
  const manager = useMemo(() => bucketForManager(items), [items]);

  const [sort, setSort] = useState<TeamSort>("due");
  const [assignee, setAssignee] = useState(ALL);
  const [stage, setStage] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [search, setSearch] = useState("");

  const teamList = useMemo(() => {
    const filtered = applyFilters(items, {
      assignee: assignee === ALL ? null : assignee,
      stage: stage === ALL ? null : stage,
      priority: priority === ALL ? null : priority,
      includeCompleted,
    });
    const q = search.trim().toLowerCase();
    const searched = q ? filtered.filter((i) => i.title.toLowerCase().includes(q)) : filtered;
    return sortItems(searched, sort, nameOf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, assignee, stage, priority, includeCompleted, search, sort]);

  const byPerson = useMemo(() => workloadBy(items, (i) => i.assignedTo, nameOf), [items, nameOf]);
  const isManager = agencyRole === "agency_owner" || agencyRole === "agency_admin" || agencyRole === "agency_manager" || agencyRole === "agency_team_lead";

  const assignees = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of items) if (i.assignedTo) seen.set(i.assignedTo, nameOf(i.assignedTo));
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return (
    <HqPageShell
      title="Team Workspace"
      description="BES internal work — tasks, lists and boards for the team"
      icon={ClipboardList}
      actions={
        <Button size="sm" onClick={() => setCreating(true)} disabled={!agencyId}>
          <Plus className="mr-1.5 h-4 w-4" /> New task
        </Button>
      }
    >
      {work.error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          Could not load the team's work: {work.error}
        </div>
      )}

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">My Work</TabsTrigger>
          <TabsTrigger value="team">Team Work</TabsTrigger>
          {isManager && <TabsTrigger value="manager">Manager</TabsTrigger>}
          {isManager && <TabsTrigger value="lists">Lists</TabsTrigger>}
        </TabsList>

        {/* ── Mine ─────────────────────────────────────────────────── */}
        <TabsContent value="mine" className="mt-4 space-y-3">
          {work.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading your work…
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              <Bucket title="Overdue" icon={AlertTriangle} tone="text-status-danger" items={buckets.overdue}
                nameOf={nameOf} onOpen={setOpen} empty="Nothing overdue." />
              <Bucket title="Due today" icon={CalendarClock} tone="text-amber-600" items={buckets.dueToday}
                nameOf={nameOf} onOpen={setOpen} empty="Nothing due today." />
              <Bucket title="Blocked" icon={CircleSlash} tone="text-amber-600" items={buckets.blocked}
                nameOf={nameOf} onOpen={setOpen} empty="Nothing blocked." />
              <Bucket title="Upcoming" icon={CalendarClock} items={buckets.upcoming}
                nameOf={nameOf} onOpen={setOpen} empty="Nothing scheduled." />
              <Bucket title="No due date" icon={Layers} items={buckets.other}
                nameOf={nameOf} onOpen={setOpen} empty="Nothing without a date." />
              <Bucket title="Completed today" icon={CheckCircle2} tone="text-status-success" items={buckets.completedToday}
                nameOf={nameOf} onOpen={setOpen} empty="Nothing finished yet today." />
            </div>
          )}
        </TabsContent>

        {/* ── Team ─────────────────────────────────────────────────── */}
        <TabsContent value="team" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks…"
              aria-label="Search tasks" className="h-8 w-full sm:w-56" />
            <OpsSelect aria-label="Assignee" size="sm" value={assignee} onValueChange={setAssignee}
              options={[{ value: ALL, label: "Everyone" }, ...assignees]} />
            <OpsSelect aria-label="Status" size="sm" value={stage} onValueChange={setStage}
              options={[{ value: ALL, label: "Any status" },
                ...["Queued", "Assigned", "In Processing", "Ready for QA", "QA Review", "Blocked", "Attention", "Completed"]
                  .map((s) => ({ value: s, label: s }))]} />
            <OpsSelect aria-label="Priority" size="sm" value={priority} onValueChange={setPriority}
              options={[{ value: ALL, label: "Any priority" }, ...["Urgent", "High", "Normal"].map((p) => ({ value: p, label: p }))]} />
            <OpsSelect aria-label="Sort by" size="sm" value={sort} onValueChange={(v) => setSort(v as TeamSort)}
              options={[
                { value: "due", label: "Sort: due date" }, { value: "priority", label: "Sort: priority" },
                { value: "status", label: "Sort: status" }, { value: "assignee", label: "Sort: assignee" },
                { value: "title", label: "Sort: title" },
              ]} />
            <Button size="sm" variant={includeCompleted ? "secondary" : "ghost"}
              onClick={() => setIncludeCompleted((v) => !v)}>
              {includeCompleted ? "Hiding nothing" : "Show completed"}
            </Button>
          </div>

          <ContentCard title={`${teamList.length} ${teamList.length === 1 ? "task" : "tasks"}`}>
            {teamList.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No tasks match these filters.
              </p>
            ) : (
              <div className="-mx-2 divide-y divide-border/50">
                {teamList.map((i) => <TaskRow key={i.id} item={i} nameOf={nameOf} onOpen={setOpen} />)}
              </div>
            )}
          </ContentCard>
        </TabsContent>

        {/* ── Manager ──────────────────────────────────────────────── */}
        {isManager && (
          <TabsContent value="manager" className="mt-4 space-y-3">
            <div className="grid gap-3 lg:grid-cols-2">
              <Bucket title="Unassigned" icon={UserPlus} tone="text-status-danger" items={manager.unassigned}
                nameOf={nameOf} onOpen={setOpen} empty="Everything has an owner." />
              <Bucket title="Overdue" icon={AlertTriangle} tone="text-status-danger" items={manager.overdue}
                nameOf={nameOf} onOpen={setOpen} empty="Nothing overdue." />
              <Bucket title="Blocked" icon={CircleSlash} tone="text-amber-600" items={manager.blocked}
                nameOf={nameOf} onOpen={setOpen} empty="Nobody is blocked." />
              <Bucket title="Due today" icon={CalendarClock} items={manager.dueToday}
                nameOf={nameOf} onOpen={setOpen} empty="Nothing due today." />
              <Bucket title="Completed today" icon={CheckCircle2} tone="text-status-success" items={manager.recentlyCompleted}
                nameOf={nameOf} onOpen={setOpen} empty="Nothing finished yet today." />
            </div>

            <ContentCard title={<span className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /> Workload by person</span>}>
              <p className="mb-2 text-xs text-muted-foreground">
                Open task counts. Not a performance measure — a count says nothing about how
                big or hard the work is.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="py-1.5 pr-3">Person</th>
                      <th className="py-1.5 pr-3">Open</th>
                      <th className="py-1.5 pr-3">Overdue</th>
                      <th className="py-1.5 pr-3">Blocked</th>
                      <th className="py-1.5 pr-3">Due today</th>
                      <th className="py-1.5">Done today</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {byPerson.map((r) => (
                      <tr key={r.key} className="transition-colors hover:bg-muted/40">
                        <td className="py-1.5 pr-3 font-medium text-foreground">{r.label}</td>
                        <td className="py-1.5 pr-3">{r.open}</td>
                        <td className={cn("py-1.5 pr-3", r.overdue > 0 && "font-semibold text-status-danger")}>{r.overdue}</td>
                        <td className={cn("py-1.5 pr-3", r.blocked > 0 && "font-semibold text-amber-700")}>{r.blocked}</td>
                        <td className="py-1.5 pr-3">{r.dueToday}</td>
                        <td className="py-1.5 text-status-success">{r.completedToday}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ContentCard>
          </TabsContent>
        )}
      </Tabs>

        {isManager && (
          <TabsContent value="lists" className="mt-4 space-y-4">
            {(workspaces.data ?? []).length === 0 ? (
              <ContentCard title="No workspace yet">
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Creating your first task makes a BES Team workspace with a list in it.
                </p>
              </ContentCard>
            ) : (
              (workspaces.data ?? []).map((w) => (
                <ContentCard key={w.id} title={w.name}>
                  <ListManager workspace={w} />
                </ContentCard>
              ))
            )}
          </TabsContent>
        )}
      {openId && <AgencyTaskDrawer itemId={openId} onClose={() => setOpen(null)} allItems={items} />}
      {creating && (
        <NewAgencyTaskDialog
          open={creating}
          onOpenChange={setCreating}
          workspaces={workspaces.data ?? []}
          onCreated={(id) => { setCreating(false); setOpen(id); }}
        />
      )}
    </HqPageShell>
  );
};
