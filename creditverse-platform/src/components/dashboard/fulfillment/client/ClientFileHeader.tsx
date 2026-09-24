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
import {
  ArrowLeft, CalendarDays, ClipboardList, ExternalLink, Timer, UserRound,
} from "lucide-react";
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
    /* ── DEE'S MOCKUP, 2026-09-24 ────────────────────────────────────────
       Title and partner, then the state as CHIPS, then the four facts as
       cards with an icon each. The facts were a cramped four-column strip of
       small labels; as cards they are readable at a glance from across a
       desk, which is how a queue gets worked.

       Every field is still the same inline editor writing through the same
       canonical writer, and who may change what is still the database's
       answer. This is the same header, laid out as she drew it. */
    <header className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <button
            onClick={onBack}
            className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
          </button>
          <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">{client.name}</h1>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
            <span
              aria-hidden
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary"
            >
              {clientGroupLabel(client).slice(0, 2).toUpperCase()}
            </span>
            {clientGroupLabel(client)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canWork && (
            <Button size="sm" onClick={onCompleteWork}>
              Complete Work
            </Button>
          )}
          {/* A file worth two screens is a file worth two windows — an agent
              comparing a report against the dispute needs both at once. */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(`/app/creditops?client=${client.id}`, "_blank", "noopener")}
          >
            Open in new tab <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* The state of the file, read left to right: is it live, what is the
          credit status, which round. */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pt-2.5">
        <Badge
          tone={lifecycle === "active"
            ? "border-emerald-500/30 bg-emerald-500/10 text-status-success"
            : "border-border bg-muted text-muted-foreground"}
        >
          {lifecycle === "active" ? "Active" : lifecycle}
        </Badge>
        <Badge tone="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
          {client.status}
        </Badge>
        <Badge tone="border-border bg-muted text-muted-foreground">{client.round}</Badge>
      </div>

      <div className="grid gap-2 px-4 py-3 sm:grid-cols-2 xl:grid-cols-4">
        <FactCard icon={ClipboardList} label="Current work" tone="text-primary">
          {!current ? (
            <span className="text-muted-foreground">No open work</span>
          ) : (
            <>
              <p className="truncate text-sm font-bold text-foreground">{current.department}</p>
              {canWork ? (
                <EditableChoiceCell
                  label={`${current.department} work status`}
                  value={current.status}
                  options={departmentStatuses(current.department as CreditOpsDepartment)}
                  onSave={(next) => onStatusChange(current.department as CreditOpsDepartment, next)}
                />
              ) : (
                <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                  {current.status}
                </p>
              )}
            </>
          )}
        </FactCard>

        <FactCard icon={UserRound} label="Assigned to" tone="text-violet-600 dark:text-violet-400">
          {current && canWork ? (
            <AssigneeCell
              department={current.department as CreditOpsDepartment}
              value={current.assigneeId ?? null}
              valueName={current.assignee}
              onSave={(id) => onAssigneeChange(current.department as CreditOpsDepartment, id)}
            />
          ) : current?.assignee && current.assignee !== "Unassigned" ? (
            <p className="truncate text-sm font-semibold text-foreground">{current.assignee}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Unassigned</p>
          )}
        </FactCard>

        <FactCard icon={CalendarDays} label="Due date" tone="text-sky-600 dark:text-sky-400">
          {current && canManage ? (
            <DueDateOverrideCell
              value={due}
              department={current.department}
              onSave={(date, reason) => onDueChange(current.department as CreditOpsDepartment, date, reason)}
              onClear={() => onDueClear(current.department as CreditOpsDepartment)}
            />
          ) : (
            <p className="text-sm font-semibold text-foreground">
              {due ? formatDate(due) : <span className="text-muted-foreground">—</span>}
            </p>
          )}
        </FactCard>

        <FactCard icon={Timer} label="SLA" tone="text-amber-600 dark:text-amber-400">
          <p className={cn("text-sm font-semibold", SLA_TONE_CLASS[sla.tone])}>{sla.label}</p>
        </FactCard>
      </div>
    </header>
  );
}

/** One of the four facts, as a card with its own icon. */
function FactCard({
  icon: Icon, label, tone, children,
}: {
  icon: typeof ClipboardList;
  label: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-xl border border-border bg-background px-3 py-2.5">
      <span className={cn("mt-0.5 shrink-0 rounded-lg bg-muted p-1.5", tone)} aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="mt-0.5 min-w-0">{children}</div>
      </div>
    </div>
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
