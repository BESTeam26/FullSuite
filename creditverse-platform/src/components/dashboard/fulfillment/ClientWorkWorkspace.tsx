/**
 * The CreditOps client file: one header, four tabs.
 *
 * Dee, 2026-09-12: "The current CreditOps Client Profile is too complicated
 * and fragmented… I want a MAJOR UX CONSOLIDATION, not another section added
 * to the existing page."
 *
 * ── WHAT THIS REPLACED ─────────────────────────────────────────────────────
 *
 * Nineteen stacked sections down one page: header, lifecycle panel, credit
 * status panel, a link row, Main Description, Next Action, Progress, Actions,
 * Assignment & Dates, Workability, Checklist, the whole Complete Work form
 * permanently expanded, Attachments, and on the right Sensitive Identity,
 * Funding and Activity History. An agent had to understand four status
 * systems and look in three places for facts about one person.
 *
 * Now the page answers Dee's four questions in the header — where is this
 * client, what needs doing, when is it due, who has it — and everything else
 * is one of four tabs.
 *
 * ── WHAT DID NOT CHANGE ────────────────────────────────────────────────────
 *
 * Not one backend concept. Lifecycle, credit status, department statuses,
 * concurrent departments, the SLA engine, production, the Vault, audit — all
 * canonical and all untouched. This is presentation. The management controls
 * that used to sit at the top of every client are under More → Manage client,
 * behind `ops.manage`; permanent delete remains owner-only in the database.
 */

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import { useCreditOpsAccess, type CreditOpsDepartment } from "@/lib/fulfillment/creditops-access";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { currentDepartment } from "@/lib/fulfillment/department-domain";
import { clientGroupLabel } from "@/lib/fulfillment/fulfillment-client-domain";
import { setClientDepartmentStatus } from "@/lib/data/fulfillment-clients";
import { setDueOverride, clearDueOverride } from "@/lib/data/client-workflow";
import { ClientFileHeader } from "./client/ClientFileHeader";
import { ClientWorkTab } from "./client/ClientWorkTab";
import { ClientInfoTab } from "./client/ClientInfoTab";
import { ClientDocumentsTab } from "./client/ClientDocumentsTab";
import { ClientHistoryTab } from "./client/ClientHistoryTab";
import { WhereThisFileIs } from "@/components/clients/WhereThisFileIs";
import { ClientUpdateComposer } from "./client/ClientUpdateComposer";
import { CompleteWorkSection } from "./CompleteWorkSection";
import { ClientLifecycleControl } from "./ClientLifecycleControl";
import { ClientStatusControl } from "./ClientStatusControl";
import { ClientAssignmentCard } from "./ClientAssignmentCard";

export function ClientWorkWorkspace({
  clientId,
  onBack,
  backLabel,
}: {
  clientId: string;
  onBack: () => void;
  /** Set by whoever mounts the card — a panel closes, a page goes back. */
  backLabel?: string;
}) {
  const store = useCreditOpsStore();
  const access = useCreditOpsAccess();
  const perms = useAgencyPermissions();
  const [completing, setCompleting] = useState(false);

  const client = store.clients.find((c) => c.id === clientId);
  const rows = store.getDepartmentStatuses(clientId);
  const current = useMemo(() => currentDepartment(rows), [rows]);

  if (!client) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-center">
        <div>
          <p className="text-sm font-semibold text-foreground">Client not found</p>
          <button
            onClick={onBack}
            className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            Back to list
          </button>
        </div>
      </div>
    );
  }

  const department = (current?.department ?? null) as CreditOpsDepartment | null;
  /* VIEW MODE vs WORK MODE. Everyone authorized can open every client — the
     shared directory is locked. What they can DO depends on whether they work
     the department currently holding the file. */
  const canWork = department ? access.canLogDepartment(department) : false;
  const canManage = perms.can("ops.manage");

  /* The card's editable fields all go through the canonical writers the list
     already uses, then refresh the department rows the header reads. Nothing
     here decides who may write — `set_client_department_status` and the SLA
     override refuse on their own (rule 1). */
  const refreshDepartments = () => store.refreshDepartmentStatuses(clientId);
  const onStatusChange = async (dept: CreditOpsDepartment, status: string) => {
    await setClientDepartmentStatus({ clientId, department: dept, status });
    refreshDepartments();
  };
  const onAssigneeChange = async (dept: CreditOpsDepartment, assigneeId: string | null) => {
    /* The status is unchanged; the writer takes both together because
       reassigning is a status-row event, recorded with the same audit. */
    const row = rows.find((r) => r.department === dept);
    await setClientDepartmentStatus({
      clientId, department: dept, status: row?.status ?? "", assigneeId,
    });
    refreshDepartments();
  };
  const onDueChange = async (dept: CreditOpsDepartment, date: string, reason: string) => {
    await setDueOverride(clientId, dept, date, reason);
    refreshDepartments();
  };
  const onDueClear = async (dept: CreditOpsDepartment) => {
    await clearDueOverride(clientId, dept);
    refreshDepartments();
  };

  return (
    <div className="space-y-4 text-xs">
      <ClientFileHeader
        client={client}
        current={current}
        canWork={canWork}
        canManage={canManage}
        onBack={onBack}
        backLabel={backLabel}
        onCompleteWork={() => setCompleting(true)}
        onStatusChange={onStatusChange}
        onAssigneeChange={onAssigneeChange}
        onDueChange={onDueChange}
        onDueClear={onDueClear}
      />

      {/* ── ONE SCROLL, NOT LAYER OVER LAYER ──────────────────────────────
          Dee, 2026-09-22: *"once the agent open the file, the work and all
          checklist should be already there and not layer over layer."*

          It was a panel, inside it four tabs, inside those a stack of cards,
          and Complete Work opened a second drawer on top. Three layers before
          an agent could see what to do. Her ClickUp has none of that: you
          open a task and the description, the checklist and the comments are
          simply there, one after another.

          So the tabs are gone. The work and its checklist lead, the activity
          follows, and the two REFERENCE sections — who the person is, and
          their files — are folded shut underneath, because they are things
          you look up rather than things you do. */}
      <ClientWorkTab
        client={client}
        clientId={clientId}
        current={current}
        nextAction={(client as { nextAction?: string | null }).nextAction ?? null}
        onCompleteWork={() => setCompleting(true)}
      />

      {completing && (
        <div className="rounded-2xl border border-primary/40 bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-foreground">Complete work — {client.name}</h2>
              <p className="text-xs text-muted-foreground">
                What you finished, anything worth recording, and where the file goes next.
              </p>
            </div>
            <button type="button" onClick={() => setCompleting(false)}
              className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Not now
            </button>
          </div>
          <CompleteWorkSection
            clientId={clientId}
            clientName={client.name}
            partnerName={clientGroupLabel(client)}
            currentStatus={client.status}
          />
        </div>
      )}

      {/* Several departments can hold one file at once, and by Dee's queue
          doctrine (§23) that has to stay visible. Shown only when there IS
          more than one, so a simple file stays simple. */}
      {rows.length > 1 && <WhereThisFileIs rows={rows} />}

      {/* Dee, 2026-09-23: "History is the one that I don't want automatically
          shown, that can be collapsible." It is the audit trail — something
          you consult when a question comes up, not something you read while
          working — and left open it pushed everything below it down the page. */}
      <FoldedSection label="History" hint="Every change on this file, and who made it">
        <ClientHistoryTab clientId={clientId} />
      </FoldedSection>

      <FoldedSection label="Client info" hint="Contact, identity, sensitive details">
        <ClientInfoTab
          client={client}
          /* No empty cross-module card: the funding panel appears only when a
             funding relationship exists (Dee, 2026-09-11). */
          hasFunding={Boolean((client as { fundingClientId?: string | null }).fundingClientId)}
        />
      </FoldedSection>

      <FoldedSection label="Documents" hint="Everything filed against this client">
        <ClientDocumentsTab clientId={clientId} />
      </FoldedSection>

      {/* ── COMPLETE WORK OPENS IN PLACE, NOT ON TOP ──────────────────────
          It is still a deliberate action — Dee, 2026-09-11: "Do NOT
          permanently display the giant Complete Work form", and that stands;
          446 lines of form on every client was the original complaint.

          But it used to open as a second drawer over the panel, which is the
          layering she objected to on 2026-09-22. It now expands where the
          button is, at the end of the work it belongs to, so finishing a file
          is the bottom of the same scroll rather than another window. */}

      {/* ── MANAGEMENT CONTROLS, FOLDED INTO THE PAGE ─────────────────────
          Lifecycle, the credit status vocabulary and the date corrections.
          Dee: "Normal agents should NOT have prominent access to archive /
          change lifecycle, SLA override, advanced date corrections" — still
          true, which is why it is shut by default and why each component
          keeps its own capability check.

          But it used to be a second panel opened over the first, and that is
          the layering Dee objected to on 2026-09-22. Folded, it is in the
          page, in order, and closing it does not close the client. */}
      {canManage && (
        <FoldedSection label="Manage this client"
          hint="Corrections and lifecycle · recorded with your name">
          <div className="space-y-3">
            <ClientStatusControl client={client} />
            <ClientAssignmentCard clientId={clientId} />
            <ClientLifecycleControl client={client} canEdit={canManage} />
          </div>
        </FoldedSection>
      )}
    </div>
  );
}

/**
 * A reference section, shut until somebody wants it.
 *
 * Not a tab: a tab hides its contents behind a decision about which tab you
 * are on, and you cannot scroll past it to see what else exists. A folded
 * section is in the page, in order, and says what is inside it.
 */
function FoldedSection({ label, hint, children }: {
  label: string; hint: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />
        <span className="text-xs font-bold text-foreground">{label}</span>
        <span className="truncate text-[11px] text-muted-foreground">{hint}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
