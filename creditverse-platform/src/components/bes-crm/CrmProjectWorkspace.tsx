import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Hourglass,
  Loader2,
  ShieldCheck,
  ShieldX,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { OpsSelect } from "@/components/ui/ops-select";
import { formatDate } from "@/lib/format-date";
import {
  ENGINE_STATE_LABEL,
  QA_LABEL,
  WAITING_LABEL,
  WORK_UNIT_LABEL,
  WORK_UNIT_URGENCY,
  type WaitingReason,
} from "@/lib/crm/crm-domain";
import type { CrmProjectRow, CrmWorkUnit, EngineProgress } from "@/lib/data/crm-projects";
import {
  useCompleteWorkUnit,
  useCrmEngines,
  useCrmUnits,
  useFailQa,
  usePassQa,
  useSetWaiting,
} from "@/lib/data/use-crm";
import { useAuth } from "@/lib/auth/auth-context";
import {
  useCrmProjectTimeline,
  usePostCrmProjectComment,
} from "@/lib/data/use-work-timeline";
import { VISIBILITY_LABEL, type ActivityVisibility } from "@/lib/data/activity";
import { HealthPill, JourneyRail, ProgressBar } from "./CrmBoardTab";
import { CrmClientRequirementsPanel, CrmMilestonesPanel } from "./CrmProjectSidePanels";
import { cn } from "@/lib/utils";

/**
 * One project: its engines, their work, and the actions the model allows.
 *
 * WHAT A CUSTOMER CAN DO HERE, AND WHY THE LIST IS SHORT
 *
 * An organization user sees the same board — filtered by the database to
 * their own entitled projects — but every operating control below is BES-only
 * BY POLICY, not by hiding: `crm_complete_work_unit`, `crm_pass_qa` and the
 * rest verify BES scope in the database. The customer's surface is the
 * Updates tab, where they may read what BES published and write comments
 * (rule 17: association is not publication).
 */
export const CrmProjectWorkspace = ({
  project,
  isBes,
  onBack,
}: {
  project: CrmProjectRow;
  isBes: boolean;
  onBack: () => void;
}) => {
  const engines = useCrmEngines(project.id);
  const units = useCrmUnits(project.id);
  const [tab, setTab] = useState<"work" | "updates">(isBes ? "work" : "updates");

  const byEngine = useMemo(() => {
    const map = new Map<string, CrmWorkUnit[]>();
    for (const u of units.data ?? []) {
      const list = map.get(u.engineKey);
      if (list) list.push(u);
      else map.set(u.engineKey, [u]);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => WORK_UNIT_URGENCY[a.state] - WORK_UNIT_URGENCY[b.state],
      );
    }
    return map;
  }, [units.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" /> All projects
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-foreground">{project.name}</h2>
              <HealthPill health={project.health} />
            </div>
            <p className="text-xs text-muted-foreground">
              {project.partnerName}
              {project.targetGoLive ? <> · go-live {formatDate(project.targetGoLive)}</> : null}
            </p>
          </div>
        </div>
        <div className="w-full max-w-64">
          <ProgressBar percent={project.progress} />
        </div>
      </div>

      <JourneyRail stage={project.journey} />

      <div className="flex gap-1 border-b border-border">
        {(isBes ? (["work", "updates"] as const) : (["updates", "work"] as const)).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-t-lg px-3 py-1.5 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === t
                ? "border border-b-0 border-border bg-card text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "work" ? "Build" : "Updates"}
          </button>
        ))}
      </div>

      {tab === "updates" && <ProjectTimeline project={project} isBes={isBes} />}

      {tab === "work" && (
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="min-w-0 flex-1 space-y-3">
            {engines.isLoading && (
              <div className="space-y-2" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 rounded-xl border border-border bg-card" />
                ))}
              </div>
            )}
            {(engines.data ?? []).map((engine) => (
              <EngineSection
                key={engine.engineKey}
                engine={engine}
                units={byEngine.get(engine.engineKey) ?? []}
                projectId={project.id}
                isBes={isBes}
              />
            ))}
          </div>
          <aside className="w-full shrink-0 space-y-3 lg:w-72">
            <CrmClientRequirementsPanel projectId={project.id} isBes={isBes} />
            <CrmMilestonesPanel projectId={project.id} isBes={isBes} />
          </aside>
        </div>
      )}
    </div>
  );
};

const ENGINE_TONE: Record<string, string> = {
  BUILDING: "border-blue-500/30 bg-blue-500/10 text-status-info",
  QA: "border-purple-500/30 bg-purple-500/10 text-purple-700",
  ACTIVE: "border-emerald-500/30 bg-emerald-500/10 text-status-success",
  SUPPORT: "border-emerald-500/30 bg-emerald-500/10 text-status-success",
  COMPLETE: "border-border bg-muted text-muted-foreground",
  PLANNED: "border-border bg-muted text-muted-foreground",
};

const EngineSection = ({
  engine,
  units,
  projectId,
  isBes,
}: {
  engine: EngineProgress;
  units: CrmWorkUnit[];
  projectId: string;
  isBes: boolean;
}) => {
  /* Open when something in it needs a person; closed when it is done or has
     not started. The reader's time goes where the work is. */
  const [open, setOpen] = useState(
    engine.state === "BUILDING" || engine.state === "QA" || engine.blocked > 0,
  );
  if (engine.cancelled) return null;

  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {engine.label}
        </span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-medium",
            ENGINE_TONE[engine.state] ?? "border-border bg-muted text-muted-foreground",
          )}
        >
          {ENGINE_STATE_LABEL[engine.state] ?? engine.state}
        </span>
        <span className="w-32 shrink-0">
          <ProgressBar percent={engine.percent} />
        </span>
      </button>

      {open && (
        <ul className="space-y-1 border-t border-border p-3">
          {units.length === 0 && (
            <li className="py-2 text-center text-xs text-muted-foreground">
              No work units in this engine.
            </li>
          )}
          {units.map((u) => (
            <WorkUnitRow key={u.id} unit={u} projectId={projectId} isBes={isBes} />
          ))}
        </ul>
      )}
    </section>
  );
};

const STATE_TONE: Record<string, string> = {
  BLOCKED: "border-red-500/30 bg-red-500/10 text-status-danger",
  QA: "border-purple-500/30 bg-purple-500/10 text-purple-700",
  "IN PROGRESS": "border-blue-500/30 bg-blue-500/10 text-status-info",
  READY: "border-amber-500/30 bg-amber-500/10 text-status-warning",
  WAITING: "border-border bg-muted text-muted-foreground",
  PLANNED: "border-border bg-muted text-muted-foreground",
  COMPLETED: "border-emerald-500/30 bg-emerald-500/10 text-status-success",
};

const WorkUnitRow = ({
  unit,
  projectId,
  isBes,
}: {
  unit: CrmWorkUnit;
  projectId: string;
  isBes: boolean;
}) => {
  const [openAction, setOpenAction] = useState<"none" | "waiting" | "qa">("none");
  const complete = useCompleteWorkUnit(projectId);
  const done = unit.state === "COMPLETED";

  return (
    <li
      className={cn(
        "rounded-lg border border-border/60 px-3 py-2",
        done && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
            STATE_TONE[unit.state] ?? "border-border bg-muted text-muted-foreground",
          )}
        >
          {WORK_UNIT_LABEL[unit.state] ?? unit.state}
        </span>
        <span className={cn("min-w-0 flex-1 truncate text-xs text-foreground", done && "line-through")}>
          {unit.title}
        </span>
        {unit.assigneeName && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <UserRound className="h-3 w-3" /> {unit.assigneeName}
          </span>
        )}
        {unit.dueAt && !done && (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            due {formatDate(unit.dueAt)}
          </span>
        )}

        {isBes && !done && (
          <span className="flex shrink-0 items-center gap-1">
            {unit.state === "QA" ? (
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px]"
                onClick={() => setOpenAction(openAction === "qa" ? "none" : "qa")}
              >
                <ShieldCheck className="mr-1 h-3 w-3" /> Review
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  disabled={complete.isPending}
                  onClick={() => complete.mutate({ unitId: unit.id })}
                >
                  {complete.isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                  )}
                  {unit.requiresQa ? "Send to QA" : "Complete"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setOpenAction(openAction === "waiting" ? "none" : "waiting")}
                >
                  <Hourglass className="mr-1 h-3 w-3" /> Waiting
                </Button>
              </>
            )}
          </span>
        )}
      </div>

      {unit.state === "WAITING" && unit.waitingOn && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {WAITING_LABEL[unit.waitingOn]}
          {unit.waitingSince ? <> since {formatDate(unit.waitingSince)}</> : null}
          {unit.waitingNote ? <> — {unit.waitingNote}</> : null}
        </p>
      )}
      {unit.qaResult === "needs_fix" && unit.qaFeedback && (
        <p className="mt-1 flex items-start gap-1 text-[11px] text-status-warning">
          <ShieldX className="mt-0.5 h-3 w-3 shrink-0" /> {unit.qaFeedback}
        </p>
      )}
      {complete.error && (
        <p className="mt-1 text-[11px] text-status-danger">
          {(complete.error as Error).message}
        </p>
      )}

      {openAction === "waiting" && (
        <WaitingForm unit={unit} projectId={projectId} onDone={() => setOpenAction("none")} />
      )}
      {openAction === "qa" && (
        <QaForm unit={unit} projectId={projectId} onDone={() => setOpenAction("none")} />
      )}
    </li>
  );
};

const WAITING_OPTIONS = (Object.keys(WAITING_LABEL) as WaitingReason[]).map((k) => ({
  value: k,
  label: WAITING_LABEL[k],
}));

const WaitingForm = ({
  unit,
  projectId,
  onDone,
}: {
  unit: CrmWorkUnit;
  projectId: string;
  onDone: () => void;
}) => {
  const setWaiting = useSetWaiting(projectId);
  const [reason, setReason] = useState<WaitingReason>("client");
  const [note, setNote] = useState("");
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-muted/40 p-2">
      <OpsSelect
        value={reason}
        onValueChange={(v) => setReason(v as WaitingReason)}
        options={WAITING_OPTIONS}
        size="sm"
      />
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="What exactly is being waited for?"
        className="text-xs"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={setWaiting.isPending}
          onClick={() =>
            setWaiting.mutate(
              { unitId: unit.id, reason, note: note.trim() || null },
              { onSuccess: onDone },
            )
          }
        >
          Mark waiting
        </Button>
      </div>
      {setWaiting.error && (
        <p className="text-[11px] text-status-danger">{(setWaiting.error as Error).message}</p>
      )}
    </div>
  );
};

/**
 * The QA decision. Passing may complete the unit and start its dependants;
 * failing requires feedback, because "needs fix" with no reason sends the
 * builder back to guess.
 */
const QaForm = ({
  unit,
  projectId,
  onDone,
}: {
  unit: CrmWorkUnit;
  projectId: string;
  onDone: () => void;
}) => {
  const pass = usePassQa(projectId);
  const fail = useFailQa(projectId);
  const [feedback, setFeedback] = useState("");
  const busy = pass.isPending || fail.isPending;
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-muted/40 p-2">
      <Textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={2}
        placeholder="What was checked — and if it fails, what must change."
        className="text-xs"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs text-status-danger"
          disabled={busy || feedback.trim().length === 0}
          onClick={() =>
            fail.mutate({ unitId: unit.id, feedback: feedback.trim() }, { onSuccess: onDone })
          }
        >
          <ShieldX className="mr-1 h-3 w-3" /> Needs fix
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={busy}
          onClick={() =>
            pass.mutate({ unitId: unit.id, note: feedback.trim() || null }, { onSuccess: onDone })
          }
        >
          <ShieldCheck className="mr-1 h-3 w-3" /> Pass
        </Button>
      </div>
      {(pass.error || fail.error) && (
        <p className="text-[11px] text-status-danger">
          {((pass.error ?? fail.error) as Error).message}
        </p>
      )}
    </div>
  );
};

/* ── Updates: the customer-facing half ───────────────────────────────────── */

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const ProjectTimeline = ({
  project,
  isBes,
}: {
  project: CrmProjectRow;
  isBes: boolean;
}) => {
  const auth = useAuth();
  const { entries, isLoading, error } = useCrmProjectTimeline(project.id);
  const post = usePostCrmProjectComment();
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<ActivityVisibility>(
    isBes ? "bes_internal" : "shared_with_partner",
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const agencyId = auth.agencyMembership?.agency_id;
    if (!text.trim() || !agencyId) return;
    post.mutate(
      {
        projectId: project.id,
        agencyId,
        organizationId: project.organizationId ?? undefined,
        detail: text,
        visibility,
      },
      { onSuccess: () => setText("") },
    );
  };

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="space-y-2 rounded-xl border border-border bg-card p-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={isBes ? "Post an update…" : "Ask a question or leave a comment…"}
        />
        <div className="flex items-center justify-between gap-2">
          {isBes ? (
            <OpsSelect
              value={visibility}
              onValueChange={(v) => setVisibility(v as ActivityVisibility)}
              options={(["bes_internal", "shared_with_partner"] as const).map((v) => ({
                value: v,
                label: VISIBILITY_LABEL[v],
              }))}
              size="sm"
            />
          ) : (
            <span className="text-[11px] text-muted-foreground">
              Visible to BES and your team
            </span>
          )}
          <Button size="sm" type="submit" disabled={post.isPending || !text.trim()}>
            Post
          </Button>
        </div>
        {post.error && (
          <p className="text-[11px] text-status-danger">{(post.error as Error).message}</p>
        )}
      </form>

      {isLoading && <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>}
      {error && <p className="text-xs text-status-danger">{error}</p>}
      {!isLoading && entries.length === 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          {isBes ? "Nothing posted yet." : "BES has not published updates yet."}
        </p>
      )}
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-lg border border-border bg-card px-3 py-2">
            <p className="text-xs text-foreground">{entry.detail || entry.action}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {entry.actor || "System"} · {when(entry.timestamp)}
              {isBes ? <> · {VISIBILITY_LABEL[entry.visibility] ?? entry.visibility}</> : null}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
};
