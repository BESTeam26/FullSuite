/**
 * Agency Settings → Positions.
 *
 * Dee, §15: create, edit, move, archive, restore, assign a person, set the
 * reports-to position, set acting coverage, end an assignment. All of it on
 * the same canonical records the org chart draws.
 *
 * ── WHY ASSIGNING SOMEBODY IS TWO SEPARATE CONTROLS ────────────────────────
 *
 * Filling a seat and covering a seat are different acts (§8). The CFO example
 * is the reason: the seat is permanently VACANT and somebody is acting in it,
 * and both are true at the same time. One control with a dropdown of four
 * types would let somebody "fill" a seat by accident when they meant to cover
 * it for a fortnight, and filling is the one that consumes the headcount.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Archive, ArchiveRestore, Crown, History, Loader2, Plus, UserMinus, UserPlus, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { formatDate } from "@/lib/format-date";
import { useAuth } from "@/lib/auth/auth-context";
import { useOrganizationTree } from "@/lib/data/use-organization-structure";
import { usePositionHistory, usePositions, usePositionActions } from "@/lib/data/use-positions";
import { useWorkforce } from "@/lib/data/use-workforce";
import type { AssignmentType, Position } from "@/lib/data/positions";
import { cn } from "@/lib/utils";

const STATE_LABEL: Record<Position["state"], string> = {
  filled: "Filled", covered: "Covered", vacant: "Vacant",
};
const STATE_TONE: Record<Position["state"], string> = {
  filled: "bg-status-success/10 text-status-success",
  covered: "bg-amber-500/15 text-amber-700",
  vacant: "bg-muted text-muted-foreground",
};

export function PositionsSection() {
  const auth = useAuth();
  const positions = usePositions();
  const tree = useOrganizationTree();
  const workforce = useWorkforce();
  const actions = usePositionActions();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const openId = params.get("position");
  const rows = (positions.data ?? []).filter((p) => showArchived || !p.archivedAt);
  const open = rows.find((p) => p.id === openId) ?? null;
  const canManage = auth.isAgencyAdmin;

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("position", id); else next.delete("position");
    setParams(next, { replace: true });
  };

  if (positions.isLoading || tree.isLoading) {
    return <p className="p-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></p>;
  }

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-foreground">Positions</h2>
          <p className="text-xs text-muted-foreground">
            A position is a seat in the company. It exists whether or not somebody is in it, and it
            keeps its history when people move.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
            aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide archived" : "Show archived"}
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => setCreating((v) => !v)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New position
            </Button>
          )}
        </div>
      </header>

      {creating && canManage && (
        <PositionForm tree={tree.data!} positions={rows} onDone={() => setCreating(false)} />
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {rows.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setOpen(p.id === openId ? null : p.id)}
              aria-expanded={p.id === openId}
              className={cn(
                "flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                p.archivedAt && "opacity-60",
              )}>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  {p.divisionTier === "leadership" && <Crown className="h-3.5 w-3.5 text-amber-600" />}
                  <span className="truncate text-sm font-semibold text-foreground">{p.title}</span>
                  {p.headcount > 1 && (
                    <span className="text-[10px] text-muted-foreground">{p.headcount} seats</span>
                  )}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {[p.divisionName, p.departmentName, p.teamName].filter(Boolean).join(" · ") || "Company level"}
                  {p.reportsToTitle && ` — reports to ${p.reportsToTitle}`}
                  {p.reportsToPerson && ` (${p.reportsToPerson})`}
                </span>
              </span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", STATE_TONE[p.state])}>
                {STATE_LABEL[p.state]}
              </span>
              <span className="w-40 shrink-0 truncate text-right text-xs text-foreground">
                {p.holders.map((h) => h.name).join(", ") || (p.coverage.length > 0
                  ? `${p.coverage[0].name} (${p.coverage[0].type})`
                  : "—")}
              </span>
            </button>

            {p.id === openId && (
              <PositionDetail position={p} tree={tree.data!} positions={rows}
                people={(workforce.data?.people ?? []).map((x) => ({ userId: x.userId, name: x.name }))}
                canManage={canManage} onClose={() => setOpen(null)} />
            )}
          </li>
        ))}
        {rows.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            No positions yet. Create the seats first, then put people in them.
          </li>
        )}
      </ul>

      {actions.save.isError && (
        <p role="alert" className="text-xs text-status-danger">{(actions.save.error as Error).message}</p>
      )}
    </section>
  );
}

function PositionDetail({
  position: p, tree, positions, people, canManage, onClose,
}: {
  position: Position;
  tree: NonNullable<ReturnType<typeof useOrganizationTree>["data"]>;
  positions: Position[];
  people: { userId: string; name: string }[];
  canManage: boolean;
  onClose: () => void;
}) {
  const actions = usePositionActions();
  const history = usePositionHistory({ positionId: p.id });
  const [editing, setEditing] = useState(false);
  const [who, setWho] = useState("");
  const [kind, setKind] = useState<AssignmentType>("permanent");
  const [showHistory, setShowHistory] = useState(false);

  const busy = actions.assign.isPending || actions.end.isPending;
  const error = (actions.assign.error ?? actions.end.error ?? actions.archive.error) as Error | null;

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {p.description || "No description."}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
            aria-pressed={showHistory} onClick={() => setShowHistory((v) => !v)}>
            <History className="mr-1 h-3.5 w-3.5" /> History
          </Button>
          {canManage && !p.archivedAt && (
            <>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                onClick={() => setEditing((v) => !v)}>Edit</Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                onClick={() => actions.archive.mutate({ id: p.id, archived: true })}>
                <Archive className="mr-1 h-3.5 w-3.5" /> Archive
              </Button>
            </>
          )}
          {canManage && p.archivedAt && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
              onClick={() => actions.archive.mutate({ id: p.id, archived: false })}>
              <ArchiveRestore className="mr-1 h-3.5 w-3.5" /> Restore
            </Button>
          )}
          <button type="button" onClick={onClose} aria-label="Close position"
            className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {editing && canManage && (
        <PositionForm tree={tree} positions={positions} position={p} onDone={() => setEditing(false)} />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Occupants title="In the seat" note={`${p.holders.length} of ${p.headcount}`}
          rows={p.holders.map((h) => ({ id: h.assignmentId, name: h.name, sub: `since ${formatDate(h.from)}` }))}
          empty="Vacant. Nobody is in this seat."
          canManage={canManage} onEnd={(id) => actions.end.mutate(id)} />
        <Occupants title="Covering it"
          rows={p.coverage.map((c) => ({
            id: c.assignmentId, name: c.name,
            sub: `${c.type} since ${formatDate(c.from)}${c.note ? ` — ${c.note}` : ""}`,
          }))}
          empty="Nobody is covering it."
          canManage={canManage} onEnd={(id) => actions.end.mutate(id)} />
      </div>

      {canManage && !p.archivedAt && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <OpsSelect size="sm" value={who} onValueChange={setWho}
            aria-label="Person" placeholder="Choose a person"
            options={people.map((x) => ({ value: x.userId, label: x.name }))} />
          <OpsSelect size="sm" value={kind} onValueChange={(v) => setKind(v as AssignmentType)}
            aria-label="How they hold it"
            options={[
              { value: "permanent", label: "Permanently — fills the seat" },
              { value: "acting", label: "Acting — covers it" },
              { value: "interim", label: "Interim — covers it" },
              { value: "temporary", label: "Temporary — covers it" },
            ]} />
          <Button size="sm" variant="outline" disabled={!who || busy}
            onClick={() => {
              actions.assign.mutate({ positionId: p.id, userId: who, assignmentType: kind });
              setWho("");
            }}>
            {actions.assign.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                      : <UserPlus className="mr-1 h-3.5 w-3.5" />}
            Assign
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {kind === "permanent"
              ? "Fills the seat and uses one of its headcount."
              : "Covers the seat without filling it — the seat stays vacant."}
          </span>
        </div>
      )}

      {showHistory && (
        <div className="mt-2 rounded-lg border border-border bg-card p-2.5">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Everybody who has held this seat
          </p>
          {history.isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (history.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Nobody yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {(history.data ?? []).map((h) => (
                <li key={h.id} className="text-xs text-foreground">
                  <span className="font-semibold">{h.name}</span>
                  {" — "}{h.assignmentType}{", "}
                  {formatDate(h.from)}{" to "}{h.until ? formatDate(h.until) : "now"}
                  {h.note && <span className="text-muted-foreground"> · {h.note}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">
            Assignments end; they are never deleted. Who held this seat last quarter does not change
            when somebody new takes it.
          </p>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-xs text-status-danger">{error.message}</p>}
    </div>
  );
}

function Occupants({
  title, note, rows, empty, canManage, onEnd,
}: {
  title: string;
  note?: string;
  rows: { id: string; name: string; sub: string }[];
  empty: string;
  canManage: boolean;
  onEnd: (assignmentId: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 flex items-baseline gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {title} {note && <span className="font-normal normal-case">{note}</span>}
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-foreground">{r.name}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{r.sub}</span>
              </span>
              {canManage && (
                <button type="button" aria-label={`End ${r.name}'s assignment`} onClick={() => onEnd(r.id)}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-status-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <UserMinus className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PositionForm({
  tree, positions, position, onDone,
}: {
  tree: NonNullable<ReturnType<typeof useOrganizationTree>["data"]>;
  positions: Position[];
  position?: Position;
  onDone: () => void;
}) {
  const actions = usePositionActions();
  const [title, setTitle] = useState(position?.title ?? "");
  const [description, setDescription] = useState(position?.description ?? "");
  const [divisionId, setDivisionId] = useState(position?.divisionId ?? "");
  const [departmentId, setDepartmentId] = useState(position?.departmentId ?? "");
  const [teamId, setTeamId] = useState(position?.teamId ?? "");
  const [reportsTo, setReportsTo] = useState(position?.reportsToId ?? "");
  const [headcount, setHeadcount] = useState(String(position?.headcount ?? 1));

  const departments = useMemo(
    () => tree.departments.filter((d) => !d.archived && (!divisionId || d.divisionId === divisionId)),
    [tree.departments, divisionId],
  );
  const teams = useMemo(
    () => tree.teams.filter((t) => !t.archived && (!departmentId || t.departmentId === departmentId)),
    [tree.teams, departmentId],
  );

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
      <Input className="h-8" value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="Title, e.g. Processing Team Lead" aria-label="Position title" />
      <Input className="h-8" value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder="What the seat is for (optional)" aria-label="Position description" />
      <div className="grid gap-2 sm:grid-cols-2">
        <OpsSelect size="sm" value={divisionId}
          onValueChange={(v) => { setDivisionId(v); setDepartmentId(""); setTeamId(""); }}
          aria-label="Division" placeholder="Company level — no division"
          options={[{ value: "", label: "Company level — no division" },
                    ...tree.divisions.filter((d) => !d.archived)
                      .map((d) => ({ value: d.id, label: d.name }))]} />
        <OpsSelect size="sm" value={departmentId}
          onValueChange={(v) => { setDepartmentId(v); setTeamId(""); }}
          aria-label="Department" placeholder="No department"
          options={[{ value: "", label: "No department" },
                    ...departments.map((d) => ({ value: d.id, label: d.name }))]} />
        <OpsSelect size="sm" value={teamId} onValueChange={setTeamId}
          aria-label="Team" placeholder="No team"
          options={[{ value: "", label: "No team" },
                    ...teams.map((t) => ({ value: t.id, label: t.name }))]} />
        <OpsSelect size="sm" value={reportsTo} onValueChange={setReportsTo}
          aria-label="Reports to" placeholder="Reports to nobody"
          options={[{ value: "", label: "Reports to nobody" },
                    ...positions.filter((p) => p.id !== position?.id)
                      .map((p) => ({ value: p.id, label: p.title }))]} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Seats
          <Input className="h-8 w-16" type="number" min={1} max={500} value={headcount}
            onChange={(e) => setHeadcount(e.target.value)} aria-label="Headcount" />
        </label>
        <Button size="sm" disabled={!title.trim() || actions.save.isPending}
          onClick={async () => {
            await actions.save.mutateAsync({
              id: position?.id ?? null,
              title, description,
              divisionId: divisionId || null,
              departmentId: departmentId || null,
              teamId: teamId || null,
              reportsToPositionId: reportsTo || null,
              headcount: Math.max(1, Math.min(500, Number(headcount) || 1)),
            });
            onDone();
          }}>
          {actions.save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {position ? "Save" : "Create"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Division, department and team are all optional — a company-level seat like Chief Executive
        Officer belongs to none of them.
      </p>
      {actions.save.isError && (
        <p role="alert" className="text-xs text-status-danger">{(actions.save.error as Error).message}</p>
      )}
    </div>
  );
}
