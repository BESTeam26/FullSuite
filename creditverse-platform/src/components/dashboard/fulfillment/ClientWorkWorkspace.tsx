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
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import { useCreditOpsAccess, type CreditOpsDepartment } from "@/lib/fulfillment/creditops-access";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { currentDepartment } from "@/lib/fulfillment/department-domain";
import { clientGroupLabel } from "@/lib/fulfillment/fulfillment-client-domain";
import { ClientFileHeader } from "./client/ClientFileHeader";
import { ClientWorkTab } from "./client/ClientWorkTab";
import { ClientInfoTab } from "./client/ClientInfoTab";
import { ClientDocumentsTab } from "./client/ClientDocumentsTab";
import { ClientHistoryTab } from "./client/ClientHistoryTab";
import { ClientUpdateComposer } from "./client/ClientUpdateComposer";
import { CompleteWorkSection } from "./CompleteWorkSection";
import { ClientLifecycleControl } from "./ClientLifecycleControl";
import { ClientStatusControl } from "./ClientStatusControl";
import { ClientAssignmentCard } from "./ClientAssignmentCard";

const TABS = [
  { id: "work", label: "Work" },
  { id: "info", label: "Client Info" },
  { id: "documents", label: "Documents" },
  { id: "history", label: "History" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function ClientWorkWorkspace({
  clientId,
  onBack,
}: {
  clientId: string;
  onBack: () => void;
}) {
  const store = useCreditOpsStore();
  const access = useCreditOpsAccess();
  const perms = useAgencyPermissions();
  const [tab, setTab] = useState<TabId>("work");
  const [completing, setCompleting] = useState(false);
  const [managing, setManaging] = useState(false);

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

  return (
    <div className="space-y-4 text-xs">
      <ClientFileHeader
        client={client}
        current={current}
        canWork={canWork}
        canManage={canManage}
        onBack={onBack}
        onCompleteWork={() => setCompleting(true)}
        onManage={() => setManaging(true)}
      />

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "border-b-2 px-3.5 py-2 text-xs font-bold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "work" && (
        <ClientWorkTab
          client={client}
          clientId={clientId}
          current={current}
          nextAction={(client as { nextAction?: string | null }).nextAction ?? null}
          onCompleteWork={() => setCompleting(true)}
        />
      )}
      {tab === "info" && (
        <ClientInfoTab
          client={client}
          /* No empty cross-module card: the funding panel appears only when a
             funding relationship exists (Dee, 2026-09-11). */
          hasFunding={Boolean((client as { fundingClientId?: string | null }).fundingClientId)}
        />
      )}
      {tab === "documents" && <ClientDocumentsTab clientId={clientId} />}
      {tab === "history" && (
        <div className="space-y-3">
          {/* The same composer as the Work tab: an agent reading the history
              and wanting to add to it should not have to change tab. */}
          <ClientUpdateComposer client={client} />
          <ClientHistoryTab clientId={clientId} />
        </div>
      )}

      {/* ── COMPLETE WORK IS A DRAWER ──────────────────────────────────────
          Dee: "Do NOT permanently display the giant Complete Work form."
          It was 446 lines of form expanded on every client, whether or not
          anybody was completing anything. The component is unchanged — the
          production record, the actions and the handoff rules are all exactly
          as they were; it is simply opened when it is wanted. */}
      <Sheet open={completing} onOpenChange={setCompleting}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="text-sm">Complete work — {client.name}</SheetTitle>
            <SheetDescription className="text-xs">
              What you finished, anything worth recording, and where the file goes next.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <CompleteWorkSection
              clientId={clientId}
              clientName={client.name}
              partnerName={clientGroupLabel(client)}
              currentStatus={client.status}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* ── MANAGEMENT CONTROLS, BEHIND More ───────────────────────────────
          Lifecycle, the credit status vocabulary and the SLA/date overrides.
          Dee: "Normal agents should NOT have prominent access to archive /
          change lifecycle, SLA override, advanced date corrections." Each of
          these components keeps its own capability check — this only decides
          where they are, never who may use them. */}
      <Sheet open={managing} onOpenChange={setManaging}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="text-sm">Manage {client.name}</SheetTitle>
            <SheetDescription className="text-xs">
              Corrections and lifecycle. Everything here is recorded with your name.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <ClientStatusControl client={client} />
            <ClientAssignmentCard clientId={clientId} />
            <ClientLifecycleControl client={client} canEdit={canManage} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
