/**
 * One header. Everything an agent needs before they decide what to do.
 *
 * Dee, 2026-09-12, locked the contents: client, partner, round, the Active
 * badge, then the current work — department, work status, due/SLA, assigned
 * agent — and three controls: Complete Work, Report Blocker, More.
 *
 * ── WHAT IT REPLACED ───────────────────────────────────────────────────────
 *
 * A header, then a Lifecycle panel, then a Credit Status panel, then a link
 * row — four bands of chrome before any work. The lifecycle is a badge now and
 * its controls live under More; the credit status is a badge and changing it
 * is a work action.
 *
 * ── THE SLA IS A SENTENCE ──────────────────────────────────────────────────
 *
 * "4d remaining", never "902.4h". Dee ruled the raw arithmetic out twice, and
 * the one helper that formats it is shared with every queue so they cannot
 * word the same fact differently.
 */
import { ArrowLeft, MoreHorizontal, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { readSla, SLA_TONE_CLASS } from "@/lib/fulfillment/sla-display";
import { clientGroupLabel } from "@/lib/fulfillment/fulfillment-client-domain";
import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import type { DepartmentStatus } from "@/lib/fulfillment/creditops-store-types";
import { departmentStatuses } from "@/lib/fulfillment/department-domain";
import type { CreditOpsDepartment } from "@/lib/fulfillment/creditops-access";
import { EditableChoiceCell, DueDateOverrideCell } from "../ClientRowEditors";
import { useDepartmentRoster } from "@/lib/data/use-department-roster";
import { OpsSelect } from "@/components/ui/ops-select";
import { useState } from "react";

const Badge = ({ children, tone }: { children: React.ReactNode; tone: string }) => (
  <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", tone)}>{children}</span>
);

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    <div className="mt-0.5 truncate text-xs font-semibold text-foreground">{children}</div>
  </div>
);

export function ClientFileHeader({
  client,
  current,
  canWork,
  canManage,
  onBack,
  backLabel = "Back to clients",
  onCompleteWork,
  onStatusChange,
  onAssigneeChange,
  onDueChange,
  onDueClear,
}: {
  client: FulfillmentClient;
  current: DepartmentStatus | null;
  canWork: boolean;
  canManage: boolean;
  onBack: () => void;
  /** "Back to clients" on a page; "Close" when the card is a panel over the list. */
  backLabel?: string;
  onCompleteWork: () => void;
  onStatusChange: (department: CreditOpsDepartment, status: string) => Promise<void>;
  onAssigneeChange: (department: CreditOpsDepartment, assigneeId: string | null) => Promise<void>;
  onDueChange: (department: CreditOpsDepartment, date: string, reason: string) => Promise<void>;
  onDueClear: (department: CreditOpsDepartment) => Promise<void>;
}) {
  const due = (client as FulfillmentClient & { dueAt?: string | null }).dueAt ?? null;
  const sla = readSla(client.slaHoursRemaining);
  const lifecycle = client.lifecycle ?? "active";

  return (
    <header className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <button
            onClick={onBack}
            className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
          </button>
          <h1 className="truncate text-lg font-bold text-foreground">{client.name}</h1>
          <p className="truncate text-xs text-muted-foreground">{clientGroupLabel(client)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="border-border bg-muted text-muted-foreground">{client.status}</Badge>
          <Badge tone="border-border bg-muted text-foreground">{client.round}</Badge>
          {/* Lifecycle is a badge, not a panel. Managing it is under More. */}
          <Badge
            tone={lifecycle === "active"
              ? "border-emerald-500/30 bg-emerald-500/10 text-status-success"
              : "border-border bg-muted text-muted-foreground"}
          >
            {lifecycle === "active" ? "Active" : lifecycle}
          </Badge>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4 border-t border-border px-4 py-3">
        {/* ── THE THREE FIELDS A TASK CARD LETS YOU CHANGE ─────────────────
            Dee, 2026-09-21: opening a client should behave like a ClickUp
            task, and on a task you set the status, the owner and the date
            without going anywhere. These are the same editors the client list
            already uses and the same canonical writer
            (`set_client_department_status`), so a change made here and a
            change made in the row are one event.

            Who may change what is still the database's answer: the status and
            the owner need the department this file is in, and the due date is
            derived by the SLA engine — overriding it is a management act that
            demands a reason, so it is only editable for `ops.manage` and
            read-only for everyone else. */}
        <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="Current work">
            {!current ? (
              <span className="text-muted-foreground">No open work</span>
            ) : canWork ? (
              <span className="flex flex-wrap items-baseline gap-1">
                <span className="text-muted-foreground">{current.department}</span>
                <EditableChoiceCell
                  label={`${current.department} work status`}
                  value={current.status}
                  options={departmentStatuses(current.department as CreditOpsDepartment)}
                  onSave={(next) => onStatusChange(current.department as CreditOpsDepartment, next)}
                />
              </span>
            ) : (
              `${current.department} · ${current.status}`
            )}
          </Fact>
          <Fact label="Due">
            {current && canManage ? (
              <DueDateOverrideCell
                value={due}
                department={current.department}
                onSave={(date, reason) => onDueChange(current.department as CreditOpsDepartment, date, reason)}
                onClear={() => onDueClear(current.department as CreditOpsDepartment)}
              />
            ) : due ? formatDate(due) : <span className="text-muted-foreground">—</span>}
          </Fact>
          <Fact label="SLA">
            <span className={SLA_TONE_CLASS[sla.tone]}>{sla.label}</span>
          </Fact>
          <Fact label="Assigned to">
            {current && canWork ? (
              <AssigneeCell
                department={current.department as CreditOpsDepartment}
                value={current.assigneeId ?? null}
                valueName={current.assignee}
                onSave={(id) => onAssigneeChange(current.department as CreditOpsDepartment, id)}
              />
            ) : current?.assignee && current.assignee !== "Unassigned" ? (
              current.assignee
            ) : (
              <span className="text-muted-foreground">Unassigned</span>
            )}
          </Fact>
        </div>

        {/* One button. The "More" menu held a single real item, Manage
            client, which is now a folded section further down the page — and
            a dropdown is a layer like any other (Dee, 2026-09-22). The rest
            of it was a disabled row showing the client id. */}
        <div className="flex shrink-0 items-center gap-2">
          {canWork && <Button size="sm" onClick={onCompleteWork}>Complete Work</Button>}
        </div>
      </div>
    </header>
  );
}


/**
 * Who owns this file in this department.
 *
 * The roster is the department's own people, with their current load, from
 * `creditops_department_roster` — so a lead reassigning work can see who is
 * already carrying ten files. Unassigned is a real choice, not a blank.
 */
function AssigneeCell({ department, value, valueName, onSave }: {
  department: CreditOpsDepartment;
  value: string | null;
  valueName: string | null;
  onSave: (assigneeId: string | null) => Promise<void>;
}) {
  const roster = useDepartmentRoster(department);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const UNASSIGNED = "__unassigned__";

  if (editing) {
    return (
      <OpsSelect
        autoFocus
        openOnMount
        size="inline"
        aria-label={`${department} assignee`}
        value={value ?? UNASSIGNED}
        options={[
          { value: UNASSIGNED, label: "Unassigned" },
          ...roster.map((m) => ({
            value: m.id,
            label: `${m.name}${m.activeFiles > 0 ? ` · ${m.activeFiles} open` : ""}`,
          })),
        ]}
        onDismiss={() => setEditing(false)}
        onValueChange={(next) => {
          setSaving(true);
          void onSave(next === UNASSIGNED ? null : next)
            .finally(() => { setSaving(false); setEditing(false); });
        }}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={saving}
      onClick={() => setEditing(true)}
      aria-label={`${department} assignee — click to change`}
      className="group flex w-full items-center gap-1 rounded border border-transparent px-1 py-0.5 text-left text-[11px] transition-colors hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
    >
      {valueName && valueName !== "Unassigned"
        ? <span className="text-foreground">{valueName}</span>
        : <span className="text-muted-foreground">Unassigned</span>}
    </button>
  );
}
