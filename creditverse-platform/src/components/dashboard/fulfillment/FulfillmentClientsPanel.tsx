/**
 * Fulfillment Clients panel — Main Client List for the selected CreditOps Partner.
 *
 * ONE canonical client list per Partner. A fast ClickUp/Airtable-style
 * operational client table, purpose-built for CreditOps.
 *
 * Filtering, the toolbar and the outsourcing-group card are shared with
 * FundingOps; this file supplies the CreditOps store, columns, statuses and
 * its own sort fields.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { isActiveClient } from "@/lib/fulfillment/fulfillment-client-domain";
import { OpsSelect } from "@/components/ui/ops-select";
import { useDepartmentStatusMap } from "@/lib/data/use-department-statuses";
import {
  CREDITOPS_DEPARTMENT_ORDER, currentDepartment,
  isActionableDepartmentStatus, openDepartments,
} from "@/lib/fulfillment/department-domain";
import type { DepartmentStatus } from "@/lib/fulfillment/creditops-store-types";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import type { CreditOpsPartner } from "@/lib/fulfillment/creditops-partners";
import { useAuth } from "@/lib/auth/auth-context";
import {
  countActive,
  filterAndSortClients,
} from "@/lib/fulfillment/ops-client-filtering";
import {
  COLUMN_DEFS,
  STATUS_OPTIONS,
  loadPrefs,
  savePrefs,
  type ViewPrefs,
} from "./client-list-helpers";
import { ClientListTable } from "./ClientListTable";
import { ClientListGrid } from "./ClientListGrid";
import { OpsClientListToolbar } from "./OpsClientListToolbar";
import { AddClientModal } from "./AddClientModal";
import { ClientWorkWorkspace } from "./ClientWorkWorkspace";

const ALL_STATUSES = "All Statuses";
/* Who is looking, not a name in the source. "Assigned to me" used to mean
   "assigned to Keila Betancourt" for everybody, so the filter showed the wrong
   person's work to whoever opened it. */

/** Groups whose Partner workspace hides the Mode / Source column. */
const GROUPS_HIDING_MODE = ["managed", "outsourcing"];

interface FulfillmentClientsPanelProps {
  selectedScope?: string;
  assignedOnlyFilter?: boolean;
  partner?: CreditOpsPartner | undefined;
  /** Opens this client's workspace on mount / when it changes (deep link). */
  initialOpenClientId?: string | null;
}

export function FulfillmentClientsPanel({
  selectedScope = "all",
  assignedOnlyFilter = false,
  partner,
  initialOpenClientId = null,
}: FulfillmentClientsPanelProps) {
  const { displayName } = useAuth();
  const store = useCreditOpsStore();
  const [prefs, setPrefs] = useState<ViewPrefs>(() => loadPrefs());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES);
  /* Dee's filter set, 2026-09-12: Search · Partner · Department · Status ·
     Round · Assigned Agent. Partner is the workspace you are already in, so
     it is a filter only in the cross-partner view. */
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [roundFilter, setRoundFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [assignedOnly, setAssignedOnly] = useState(assignedOnlyFilter);
  /* Lifecycle view: active clients by default; history stays one click away. */
  const [lifecycleView, setLifecycleView] = useState<"active" | "all" | "archived">("active");
  const lifecycleFiltered = useMemo(
    () =>
      store.clients.filter((c) =>
        lifecycleView === "all" ? true : lifecycleView === "active" ? isActiveClient(c) : (c.lifecycle ?? (isActiveClient(c) ? "active" : "archived")) === "archived",
      ),
    [store.clients, lifecycleView],
  );
  const [showColumns, setShowColumns] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [openClientId, setOpenClientId] = useState<string | null>(
    initialOpenClientId,
  );

  useEffect(() => {
    if (initialOpenClientId) setOpenClientId(initialOpenClientId);
  }, [initialOpenClientId]);

  useEffect(() => savePrefs(prefs), [prefs]);
  const setPref = <K extends keyof ViewPrefs>(key: K, value: ViewPrefs[K]) =>
    setPrefs((p) => ({ ...p, [key]: value }));

  const departmentRowsRef = useRef<Record<string, DepartmentStatus[]>>({});
  const filtered = useMemo(
    () =>
      filterAndSortClients(
        lifecycleFiltered,
        {
          selectedScope,
          search,
          statusFilter,
          allStatusesLabel: ALL_STATUSES,
          assignedOnly,
          currentAgent: displayName ?? "",
        },
        {
          field: prefs.sortField,
          direction: prefs.sortDir,
          extraSortValue: (c, field) =>
            field === "round"
              ? c.round
              : field === "openItems"
                ? c.openItems
                : field === "department"
                  ? (currentDepartment(departmentRowsRef.current[c.id] ?? [])?.department ?? "")
                  : field === "workStatus"
                    ? (currentDepartment(departmentRowsRef.current[c.id] ?? [])?.status ?? "")
                    : field === "openWork"
                      ? openDepartments(departmentRowsRef.current[c.id] ?? []).length
                      : undefined,
        },
      ),
    [
      lifecycleFiltered,
      search,
      statusFilter,
      selectedScope,
      assignedOnly,
      prefs.sortField,
      prefs.sortDir,
    ],
  );

  /* One bounded query for the visible clients' department rows — the
     operational columns read from it; never a query per row (rule 14). */
  const visibleIds = useMemo(() => filtered.map((c) => c.id), [filtered]);
  const { byClient: departmentRows } = useDepartmentStatusMap(visibleIds);
  departmentRowsRef.current = departmentRows;
  /* Applied AFTER the department rows arrive, because department, work
     status and the department's assignee live on those rows rather than on
     the client — the same reason the queues read them (Dee, 2026-09-12). */
  const shown = useMemo(() => {
    if (departmentFilter === "all" && roundFilter === "all" && agentFilter === "all") return filtered;
    return filtered.filter((c) => {
      const cur = currentDepartment(departmentRows[c.id] ?? []);
      if (departmentFilter !== "all" && cur?.department !== departmentFilter) return false;
      if (roundFilter !== "all" && c.round !== roundFilter) return false;
      if (agentFilter !== "all") {
        const who = cur?.assignee ?? "Unassigned";
        if (agentFilter === "__unassigned__" ? who !== "Unassigned" : who !== agentFilter) return false;
      }
      return true;
    });
  }, [filtered, departmentRows, departmentFilter, roundFilter, agentFilter]);

  const agentNames = useMemo(() => {
    const seen = new Set<string>();
    for (const rows of Object.values(departmentRows)) {
      for (const r of rows) if (r.assignee && r.assignee !== "Unassigned") seen.add(r.assignee);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [departmentRows]);

  const activeCount = shown.filter((c) => isActiveClient(c)).length;

  /**
   * The five numbers Dee asked for, counted over what is on screen.
   *
   * Derived from the rows already in hand — no extra query for a card (rule
   * 14) — and "waiting" uses the department row rather than the credit
   * status, so it means the same thing here as it does in the engine, in My
   * Work and in the queues.
   */
  const summary = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let dueToday = 0, overdue = 0, waiting = 0;
    for (const c of shown) {
      const due = (c as { dueAt?: string | null }).dueAt ?? null;
      if (due) {
        const day = String(due).slice(0, 10);
        if (day === today) dueToday += 1;
        else if (day < today) overdue += 1;
      }
      const rows = departmentRows[c.id] ?? [];
      if (rows.length > 0 && openDepartments(rows).every((r) => !isActionableDepartmentStatus(r.status))) waiting += 1;
    }
    return { total: shown.length, active: activeCount, dueToday, overdue, waiting };
  }, [shown, departmentRows, activeCount]);

  // Mode / Source is only meaningful in the cross-partner Management view.
  // Inside a single ManagedOps or Outsourcing Partner workspace, the mode is
  // implied by the group, so we hide it to reduce clutter.
  const hideModeCol = !!partner && GROUPS_HIDING_MODE.includes(partner.group);
  const availableCols = hideModeCol
    ? COLUMN_DEFS.filter((c) => c.id !== "mode")
    : COLUMN_DEFS;
  const visibleCols = availableCols.filter((c) =>
    prefs.visibleCols.includes(c.id),
  );

  if (openClientId) {
    return (
      <ClientWorkWorkspace
        clientId={openClientId}
        onBack={() => setOpenClientId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-2 flex items-center justify-end gap-2 text-xs">
        <span className="text-muted-foreground">Show</span>
        <OpsSelect
          value={lifecycleView}
          onValueChange={(v) => setLifecycleView(v as "active" | "all" | "archived")}
          options={[
            { value: "active", label: "Active clients" },
            { value: "all", label: "All clients" },
            { value: "archived", label: "Archived clients" },
          ]}
          aria-label="Lifecycle filter"
        />
      </div>
      {/* Dee, 2026-09-12: Total · Active · Due Today · Overdue · Waiting.
          "These summary metrics should be useful and not oversized." */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { label: "Total clients", value: summary.total, tone: "text-foreground" },
          { label: "Active", value: summary.active, tone: "text-status-success" },
          { label: "Due today", value: summary.dueToday, tone: summary.dueToday > 0 ? "text-status-warning" : "text-foreground" },
          { label: "Overdue", value: summary.overdue, tone: summary.overdue > 0 ? "text-status-danger" : "text-foreground" },
          { label: "Waiting", value: summary.waiting, tone: "text-muted-foreground" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className={`mt-0.5 text-lg font-bold ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <OpsClientListToolbar
        view={prefs.view}
        onViewChange={(v) => setPref("view", v)}
        assignedOnly={assignedOnly}
        onAssignedOnlyChange={setAssignedOnly}
        activeCount={activeCount}
        onAddClient={() => setShowAddClient(true)}
        availableCols={availableCols}
        visibleColIds={prefs.visibleCols}
        onVisibleColsChange={(ids) => setPref("visibleCols", ids)}
        columnsOpen={showColumns}
        onColumnsOpenChange={setShowColumns}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        extraFilters={[
          {
            key: "department", label: "Filter by department", value: departmentFilter,
            onChange: setDepartmentFilter,
            options: [
              { value: "all", label: "All departments" },
              ...CREDITOPS_DEPARTMENT_ORDER.map((d) => ({ value: d, label: d })),
            ],
          },
          {
            key: "round", label: "Filter by round", value: roundFilter,
            onChange: setRoundFilter,
            options: [
              { value: "all", label: "All rounds" },
              ...[...new Set(store.clients.map((c) => c.round))].filter(Boolean).sort()
                .map((r) => ({ value: r, label: r })),
            ],
          },
          {
            key: "agent", label: "Filter by assigned agent", value: agentFilter,
            onChange: setAgentFilter,
            options: [
              { value: "all", label: "All agents" },
              { value: "__unassigned__", label: "Unassigned" },
              ...agentNames.map((n) => ({ value: n, label: n })),
            ],
          },
        ]}
        onStatusFilterChange={setStatusFilter}
        statusOptions={STATUS_OPTIONS}
      />

      {filtered.length === 0 ? (
        <ContentCard title="No clients match your filters">
          <p className="text-sm text-muted-foreground">
            Adjust the status filter or search to find clients for this Partner.
          </p>
        </ContentCard>
      ) : prefs.view === "list" ? (
        <ClientListTable
          departmentRows={departmentRows}
          clients={shown}
          visibleCols={visibleCols}
          prefs={prefs}
          setPrefs={setPrefs}
          onOpenClient={setOpenClientId}
        />
      ) : (
        <ClientListGrid clients={shown} onOpenClient={setOpenClientId} />
      )}

      <AddClientModal
        open={showAddClient}
        onClose={() => setShowAddClient(false)}
        partner={partner}
      />
    </div>
  );
}
