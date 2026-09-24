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
import { ChevronRight, X } from "lucide-react";
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
import { ClientDetailsCard } from "./client/ClientDetailsCard";
import { ClientDocumentsTab } from "./client/ClientDocumentsTab";
import { ClientHistoryTab } from "./client/ClientHistoryTab";
import { WhereThisFileIs } from "@/components/clients/WhereThisFileIs";
import { ClientUpdateComposer } from "./client/ClientUpdateComposer";
import { ClientActivityRail } from "./client/ClientActivityRail";
import { useClientDocuments } from "@/lib/data/use-client-work-detail";
import { useClientPosts } from "@/lib/data/use-client-posts";
import { useMyQueue, pickNext } from "@/lib/data/use-next-client";
import { Briefcase, FolderOpen, MessageSquare, ShieldCheck } from "lucide-react";
import { CompleteWorkSection } from "./CompleteWorkSection";
import { ClientLifecycleControl } from "./ClientLifecycleControl";
import { ClientStatusControl } from "./ClientStatusControl";
import { ClientAssignmentCard } from "./ClientAssignmentCard";

type TabId = "work" | "info" | "files" | "history";

/**
 * The tabs from Dee's mockup, with live counts.
 *
 * A count on a tab is the reason somebody opens it. "Files" tells an agent
 * nothing; "Files 24" tells them there is a year of paperwork behind it, and
 * a zero tells them not to bother looking.
 */
function TabBar({ tab, onPick, clientId }: {
  tab: TabId; onPick: (t: TabId) => void; clientId: string;
}) {
  const files = useClientDocuments(clientId);
  const posts = useClientPosts(clientId);
  const TABS: { id: TabId; label: string; icon: typeof Briefcase; count?: number }[] = [
    { id: "work", label: "Work", icon: Briefcase },
    /* Credit and Identity & Access were two tabs over one subject — both
       opened on the same person and the same editable details, and Credit
       carried the identity panel anyway. Dee, 2026-09-24: combine them. */
    { id: "info", label: "Client info", icon: ShieldCheck },
    { id: "files", label: "Files", icon: FolderOpen, count: files.data?.length },
    { id: "history", label: "History", icon: MessageSquare, count: posts.data?.length },
  ];
  return (
    <div role="tablist" aria-label="Client file" className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map((t) => {
        const on = t.id === tab;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onPick(t.id)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            <t.icon className="h-3.5 w-3.5" aria-hidden />
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ClientWorkWorkspace({
  clientId,
  onBack,
  backLabel,
  onOpenClient,
}: {
  clientId: string;
  onBack: () => void;
  /** Set by whoever mounts the card — a panel closes, a page goes back. */
  backLabel?: string;
  /**
   * Open a different client without going back to the list.
   *
   * Supplied by the queues, which own which client is open. Where it is not
   * supplied — the standalone case page — Complete Work simply closes, and
   * the button says so rather than offering a journey it cannot make.
   */
  onOpenClient?: (clientId: string) => void;
}) {
  const store = useCreditOpsStore();
  const access = useCreditOpsAccess();
  const perms = useAgencyPermissions();
  const [completing, setCompleting] = useState(false);
  const [tab, setTab] = useState<TabId>("work");

  /* The next file this person should work — most urgent first, from the same
     view My Work reads, so the button and the queue cannot disagree about
     what is actionable or whose it is. */
  const queue = useMyQueue();
  const next = onOpenClient ? pickNext(queue.data ?? [], clientId) : null;

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

  const activity = (
    <ClientActivityRail
      clientId={clientId}
      organizationId={(client as { organizationId?: string | null }).organizationId ?? null}
      composer={<ClientUpdateComposer client={client} />}
    />
  );

  return (
    /* ── DEE'S MOCKUP, 2026-09-24 ────────────────────────────────────────
       Three columns: the work, a reference column beside it, and the
       conversation on the right.

       It was one column with everything folded, so opening a client showed
       neither the person's details nor a year of comments. Tabs are back in
       the MIDDLE only — Work, Credit, Identity, Files, Activity — because
       those are alternatives to each other, while Quick Info and the
       conversation are things you read WHILE working and must not be behind
       a choice.

       Nothing here changes what may be seen. Every panel keeps the check it
       already had. */
    <div className="grid gap-4 text-xs xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-4">
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

        <TabBar tab={tab} onPick={setTab} clientId={clientId} />

        {/* One column under the tabs. Quick Info was a third column repeating
            what the header and the Credit tab already say — Dee, 2026-09-24:
            "I don't need the Quick info". */}
        <div className="min-w-0 space-y-4">
            {tab === "work" && (
              <>
                {/* Managing the client sits at the top of the work, not under
                    the history — Dee, 2026-09-24. Shut by default, and each
                    control inside keeps its own capability check. */}
                {canManage && (
                  <FoldedSection label="Manage this client"
                    hint="Lifecycle, status, assignment and dates · recorded with your name">
                    <div className="space-y-3">
                      <ClientStatusControl client={client} />
                      <ClientAssignmentCard clientId={clientId} />
                      <ClientLifecycleControl client={client} canEdit={canManage} />
                    </div>
                  </FoldedSection>
                )}

                <ClientWorkTab
                  client={client}
                  clientId={clientId}
                  current={current}
                  nextAction={(client as { nextAction?: string | null }).nextAction ?? null}
                  onCompleteWork={() => setCompleting(true)}
                />

                {/* Several departments can hold one file at once, and by Dee's
                    queue doctrine (§23) that has to stay visible. */}
                {rows.length > 1 && <WhereThisFileIs rows={rows} />}
              </>
            )}

            {/* Everything about the person: their details and a way to
                correct them, the credit file, and the protected identity and
                logins. The imported files arrived with gaps the import itself
                reported — a missing date of birth, an address it could not
                parse — and until now nothing on this screen could fix one. */}
            {tab === "info" && (
              <>
                <ClientDetailsCard clientId={clientId} />
                <ClientInfoTab
                  client={client}
                  hasFunding={Boolean((client as { fundingClientId?: string | null }).fundingClientId)}
                />
              </>
            )}

            {tab === "files" && <ClientDocumentsTab clientId={clientId} />}

            {tab === "history" && <ClientHistoryTab clientId={clientId} />}
        </div>

        {/* ── COMPLETE WORK IS DOCKED, NOT APPENDED ─────────────────────
            Dee, 2026-09-24: "This complete work button doesn't have any
            function at all." It had one. It rendered the form at the BOTTOM
            of a page that is now several screens long, so pressing the button
            opened something nobody could see — which is indistinguishable
            from a dead control, and worse, because you press it twice.

            Her mockup docks it to the bottom right, over the work, and that
            is what this is: fixed, above everything, with its own scroll for
            a long checklist. */}
        {completing && (
          <div
            role="dialog"
            aria-modal="false"
            aria-label={`Complete work for ${client.name}`}
            className="fixed bottom-4 right-4 z-40 flex max-h-[85vh] w-[min(26rem,calc(100vw-2rem))] flex-col rounded-2xl border border-border bg-card shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-foreground">Complete work</h2>
                <p className="truncate text-[11px] text-muted-foreground">
                  {client.name}
                  {current ? ` · ${current.department}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompleting(false)}
                aria-label="Close"
                className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <CompleteWorkSection
                clientId={clientId}
                clientName={client.name}
                partnerName={clientGroupLabel(client)}
                currentStatus={client.status}
                submitLabel={next ? "Complete & next client" : "Complete Work"}
                onCompleted={() => {
                  setCompleting(false);
                  /* Straight to the next file. Dee's mockup ends the panel
                     with this, and the point is that an agent working a queue
                     never returns to the list. Where there is no next one,
                     the panel just closes on a finished file. */
                  if (next) onOpenClient?.(next.clientId);
                }}
              />
              {next && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Next: <span className="font-medium text-foreground">{next.clientName}</span>
                  {next.department ? ` · ${next.department}` : ""}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sticky so the conversation stays beside the work rather than
          scrolling away from it; its own scrollbar, like ClickUp's. */}
      <div className="xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)]">{activity}</div>
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
