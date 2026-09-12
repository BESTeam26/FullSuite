/**
 * Partner Dashboard — a SUMMARY of one Partner's CreditOps operation.
 *
 * Dee, 2026-09-11: *"The Partner dashboard should summarize that Partner's
 * operation… But these are SUMMARY metrics only. Do NOT recreate full
 * department queue boards inside the Partner dashboard."*
 *
 * ── WHAT THIS REPLACED, AND WHY ─────────────────────────────────────────────
 *
 * It used to be five per-department status grids, two gauge rings, a workload
 * chart and an escalation banner — a second copy of every department's board,
 * per partner, that had to be kept in step with the real queues. That is the
 * duplication Dee removed: there is ONE Dispute Queue, ONE Complaints Queue,
 * and looking at Kevin Hernandez's complaint work is that queue with a partner
 * filter.
 *
 * So every tile here is a number and a destination. Nothing is worked from
 * this page.
 *
 * Every figure derives from the store's rows and their department statuses —
 * the same records the Main Client List and the global queues show, scoped to
 * `selectedScope`. An empty Partner reads zero everywhere; nothing is floored
 * or invented.
 */

import { useMemo } from "react";
import {
  AlertTriangle,
  CalendarClock,
  HelpCircle,
  Hourglass,
  Mail,
  Phone,
  Users,
} from "lucide-react";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import { isActiveClient } from "@/lib/fulfillment/fulfillment-client-domain";
import {
  isOpenDepartmentStatus,
  isWaitingDepartmentStatus,
} from "@/lib/fulfillment/department-domain";
import type { DepartmentStatus } from "@/lib/fulfillment/creditops-store-types";
import { cn } from "@/lib/utils";

interface CreditOpsDashboardViewProps {
  selectedScope: string;
  /** Display name of the Partner whose records are in scope. */
  partnerName?: string;
  /** Open another view of this same partner — the Main Client List. */
  onNavigateToView?: (viewId: string) => void;
  /**
   * Open the ONE global department queue, narrowed to this partner.
   *
   * Absent on an organization's own CreditOps page, which has no global layer
   * above it; those tiles fall back to the client list rather than offering a
   * destination that does not exist there.
   */
  onOpenGlobalQueue?: (queueId: string) => void;
}

/** Whole days between today and a deadline; negative once it has passed. */
const daysUntil = (dueAt: string | null | undefined): number | null => {
  if (!dueAt) return null;
  const at = Date.parse(`${String(dueAt).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(at)) return null;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((at - today) / 86_400_000);
};

interface Tile {
  label: string;
  value: number;
  icon: typeof Users;
  /** A global queue id, or null to open this partner's client list. */
  queue: string | null;
  tone?: string;
}

export function CreditOpsDashboardView({
  selectedScope,
  partnerName = "Partner",
  onNavigateToView,
  onOpenGlobalQueue,
}: CreditOpsDashboardViewProps) {
  const store = useCreditOpsStore();

  const scopedClients = useMemo(
    () =>
      store.clients.filter(
        (c) =>
          selectedScope === "all" ||
          c.organizationId === selectedScope ||
          c.outsourcingGroupId === selectedScope,
      ),
    [store.clients, selectedScope],
  );

  const active = useMemo(
    () => scopedClients.filter((c) => isActiveClient(c)),
    [scopedClients],
  );

  /* Open files per department, and how many of those are waiting rather than
     actionable. One pass over the department rows of the active clients. */
  const counts = useMemo(() => {
    const open = new Map<string, number>();
    let waiting = 0;
    for (const client of active) {
      let clientWaiting = false;
      for (const row of store.getDepartmentStatuses(client.id) as DepartmentStatus[]) {
        if (!isOpenDepartmentStatus(row.status)) continue;
        open.set(row.department, (open.get(row.department) ?? 0) + 1);
        if (isWaitingDepartmentStatus(row.status)) clientWaiting = true;
      }
      /* Counted per CLIENT, not per row: a file waiting in two departments is
         one client waiting, which is what the number is asked to mean. */
      if (clientWaiting) waiting += 1;
    }
    return { open, waiting };
  }, [active, store]);

  const dueToday = active.filter((c) => daysUntil(c.dueAt) === 0).length;
  const overdue = active.filter((c) => {
    const d = daysUntil(c.dueAt);
    return d !== null && d < 0;
  }).length;
  const openIn = (department: string) => counts.open.get(department) ?? 0;

  const tiles: Tile[] = [
    { label: "Active Clients", value: active.length, icon: Users, queue: null },
    {
      label: "Due Today",
      value: dueToday,
      icon: CalendarClock,
      queue: null,
      tone: dueToday > 0 ? "text-status-warning" : undefined,
    },
    {
      label: "Overdue",
      value: overdue,
      icon: AlertTriangle,
      queue: null,
      tone: overdue > 0 ? "text-status-danger" : undefined,
    },
    { label: "Waiting", value: counts.waiting, icon: Hourglass, queue: null },
    { label: "Support Open", value: openIn("Support"), icon: HelpCircle, queue: "support-queue" },
    { label: "Complaints Open", value: openIn("Complaints"), icon: Mail, queue: "complaints-queue" },
    { label: "Bureau Calling Open", value: openIn("Bureau Calling"), icon: Phone, queue: "bureau-queue" },
  ];

  const open = (tile: Tile) => {
    if (tile.queue && onOpenGlobalQueue) onOpenGlobalQueue(tile.queue);
    else onNavigateToView?.("main-list");
  };

  return (
    <div className="space-y-4 text-xs text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div>
          <h2 className="text-sm font-bold text-foreground">{partnerName}</h2>
          <p className="text-[11px] text-muted-foreground">
            {active.length} active {active.length === 1 ? "client" : "clients"} · a summary of
            this partner&apos;s operation. Department work happens in the CreditOps queues.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <button
              key={tile.label}
              type="button"
              onClick={() => open(tile)}
              className={cn(
                "rounded-xl border border-border bg-card p-3.5 text-left shadow-sm transition-colors",
                "hover:border-primary/50 hover:bg-muted/40",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  {tile.label}
                </span>
              </span>
              <span className={cn("mt-1 block text-2xl font-black", tile.tone ?? "text-foreground")}>
                {tile.value}
              </span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                {tile.queue ? "Open in the queue" : "Open the client list"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
