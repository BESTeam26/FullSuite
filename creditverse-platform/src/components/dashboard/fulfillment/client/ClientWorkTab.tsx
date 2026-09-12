/**
 * What this file needs doing, and nothing else.
 *
 * Dee, 2026-09-12: "Show only current actionable work, next action, persistent
 * checklist if relevant, contextual actions for the active department, blocker
 * state if any, Complete Work button. Do NOT permanently show every
 * department, every handoff option, every SLA field, or every possible
 * action."
 *
 * ── VIEW MODE vs WORK MODE ─────────────────────────────────────────────────
 *
 * Every authorized CreditOps employee can OPEN every client — that is the
 * shared directory, locked. What they can DO depends on whether they work the
 * department that currently holds the file. A Support agent looking at a
 * Complaints file sees where it is, who has it and when it is due; they do not
 * see Complete Work.
 *
 * Absent, not disabled. A greyed button says "you are not allowed this",
 * which is true but useless; saying which department holds the file tells
 * them who to ask.
 */
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Plus, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useCreditOpsAccess } from "@/lib/fulfillment/creditops-access";
import type { CreditOpsDepartment } from "@/lib/fulfillment/creditops-access";
import { ClientWorkflowActions } from "@/components/dashboard/fulfillment/ClientWorkflowActions";
import {
  reportWorkBlocker, useChecklistActions, useWorkChecklist,
} from "@/lib/data/use-client-work-detail";
import type { DepartmentStatus } from "@/lib/fulfillment/creditops-store-types";
import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import { ClientNotesCard } from "./ClientNotesCard";
import { ClientUpdateComposer } from "./ClientUpdateComposer";

/**
 * Complete Work, with what has been checked already visible on it.
 *
 * Dee: "When the standard required actions are checked: show ✓ Complete
 * Work." The tick is a readiness signal, not a gate — somebody who genuinely
 * finished without every box is not stopped, they are just not told they are
 * done.
 */
function CompleteButton({
  clientId, department, onCompleteWork,
}: { clientId: string; department: CreditOpsDepartment; onCompleteWork: () => void }) {
  const items = useWorkChecklist(clientId, department);
  const rows = items.data ?? [];
  const outstanding = rows.filter((r) => !r.done).length;
  const ready = rows.length > 0 && outstanding === 0;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button onClick={onCompleteWork}>
        {ready ? <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> : null}
        Complete Work
      </Button>
      {rows.length > 0 && (
        <span className="text-[11px] text-muted-foreground">
          {ready
            ? "Everything standard is checked."
            : `${outstanding} standard ${outstanding === 1 ? "step" : "steps"} still open`}
        </span>
      )}
    </div>
  );
}

export function ClientWorkTab({
  client,
  clientId,
  current,
  nextAction,
  onCompleteWork,
}: {
  client: FulfillmentClient;
  clientId: string;
  /** The department row currently holding this file, or null. */
  current: DepartmentStatus | null;
  nextAction: string | null;
  onCompleteWork: () => void;
}) {
  const access = useCreditOpsAccess();
  const { toast } = useToast();
  const department = (current?.department ?? null) as CreditOpsDepartment | null;
  const canWork = department ? access.canLogDepartment(department) : false;

  /* Notes are not department work, so they survive the case below: a file
     nobody is working is exactly when somebody writes down what to do with it
     next (Dee, 2026-09-12). */
  const notes = <ClientNotesCard clientId={clientId} notes={client.description ?? ""} />;

  if (!current || !department) {
    return (
      <div className="space-y-3">
        <ContentCard title="Current work">
          <p className="text-xs text-muted-foreground">
            No department is working this file right now. It will appear here when the workflow
            opens work on it.
          </p>
        </ContentCard>
        {notes}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ContentCard title="Current work">
        <p className="text-sm font-bold text-foreground">
          {department} · {current.status}
        </p>
        {nextAction?.trim() ? (
          <div className="mt-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Next action</p>
            <p className="mt-0.5 text-xs text-foreground">{nextAction}</p>
          </div>
        ) : null}

        <Blocker clientId={clientId} department={department} canWork={canWork} />

        {canWork ? (
          <CompleteButton clientId={clientId} department={department} onCompleteWork={onCompleteWork} />
        ) : (
          <p className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            This file is with <span className="font-medium text-foreground">{department}</span>. You can
            see where it stands; completing its work belongs to that department.
          </p>
        )}
      </ContentCard>

      {/* Standard actions first — an agent checks what they did rather than
          typing it. Custom steps are secondary, for the unusual file. */}
      <Checklist clientId={clientId} department={department} canWork={canWork} />

      {notes}

      {/* Posting an update while working. Removed in the consolidation and
          restored: one post puts the note in History and any screenshot in
          Documents, from the same write (Dee, 2026-09-12). */}
      <ClientUpdateComposer client={client} />

      {canWork && <ClientWorkflowActions clientId={clientId} department={department} />}
    </div>
  );
}

/**
 * A line when everything is fine, a panel when it is not.
 *
 * Dee: "Do not give 'This file is workable - no active blocker' a giant
 * permanent section. If everything is normal, a small indicator is enough."
 */
function Blocker({
  clientId, department, canWork,
}: { clientId: string; department: CreditOpsDepartment; canWork: boolean }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [entering, setEntering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  const save = async (next: string | null) => {
    setBusy(true);
    try {
      await reportWorkBlocker(clientId, department, next);
      setBlocked(next);
      setEntering(false);
      setReason("");
      toast({ title: next ? "Blocker reported" : "Blocker cleared" });
    } catch (e) {
      toast({ title: "That did not save", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (blocked) {
    return (
      <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
          <AlertTriangle className="h-3.5 w-3.5" /> Blocked
        </p>
        <p className="mt-0.5 text-xs text-foreground">{blocked}</p>
        {canWork && (
          <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => void save(null)}>
            Clear blocker
          </Button>
        )}
      </div>
    );
  }

  if (entering) {
    return (
      <div className="mt-3 flex gap-2">
        <Input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What is stopping this file?"
          aria-label="Reason for the blocker"
          className="h-8 text-xs"
        />
        <Button size="sm" disabled={!reason.trim() || busy} onClick={() => void save(reason.trim())}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Report"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setEntering(false); setReason(""); }}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
      <ShieldCheck className="h-3.5 w-3.5 text-status-success" />
      Workable
      {canWork && (
        <button
          type="button"
          onClick={() => setEntering(true)}
          className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Report blocker
        </button>
      )}
    </p>
  );
}

/**
 * Persisted, and hidden when there is nothing in it.
 *
 * Dee: "Do not show empty checklist UI just because the feature exists." It
 * was `useState` until today and reset on every reload.
 */
function Checklist({
  clientId, department, canWork,
}: { clientId: string; department: CreditOpsDepartment; canWork: boolean }) {
  const items = useWorkChecklist(clientId, department);
  const actions = useChecklistActions(clientId, department);
  const [adding, setAdding] = useState("");
  const rows = items.data ?? [];

  if (rows.length === 0 && !canWork) return null;

  const done = rows.filter((r) => r.done).length;

  return (
    <ContentCard title={rows.length > 0 ? `Checklist (${done}/${rows.length})` : "Checklist"}>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No standard steps are configured for {department} yet.
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="group flex items-center gap-2">
              <input
                type="checkbox"
                checked={r.done}
                disabled={!canWork}
                onChange={() => actions.toggle.mutate({ id: r.id, done: !r.done })}
                aria-label={r.label}
                className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
              />
              <span className={cn("flex-1 text-xs", r.done ? "text-muted-foreground line-through" : "text-foreground")}>
                {r.label}
              </span>
              {canWork && (
                <button
                  type="button"
                  aria-label={`Remove ${r.label}`}
                  onClick={() => actions.remove.mutate(r.id)}
                  className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWork && (
        <div className="mt-2 flex gap-2">
          <Input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !adding.trim()) return;
              actions.add.mutate({ label: adding, sort: rows.length });
              setAdding("");
            }}
            placeholder="+ Add a custom step (unusual work only)"
            aria-label="Add a custom step"
            className="h-8 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!adding.trim()}
            onClick={() => { actions.add.mutate({ label: adding, sort: rows.length }); setAdding(""); }}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </ContentCard>
  );
}
