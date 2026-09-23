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
import { useNavigate } from "react-router-dom";
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
import { QUICK_VIEWS, matchesQuickView, quickViewCounts, type QuickViewId } from "@/lib/fulfillment/quick-views";
import { BulkActionBar } from "./BulkActionBar";
import { CreditOpsCoverageStrip } from "./CreditOpsCoverageStrip";
import { useCreditOpsCoverage, type CoverageState } from "@/lib/data/use-creditops-coverage";
import type { CreditOpsPartner } from "@/lib/fulfillment/creditops-partners";
import { useAuth } from "@/lib/auth/auth-context";
import { useCreditOpsAccess } from "@/lib/fulfillment/creditops-access";
import {
  countActive,
  filterAndSortClients,
} from "@/lib/fulfillment/ops-client-filtering";
import {
  COLUMN_DEFS,
  customColDef,
  STATUS_OPTIONS,
  loadPrefs,
  savePrefs,
  type ViewPrefs,
} from "./client-list-helpers";
import { ClientListTable } from "./ClientListTable";
import { AddClientColumn } from "./AddClientColumn";
import { useClientColumns } from "@/lib/data/client-columns";
import { ClientListGrid } from "./ClientListGrid";
import { OpsClientListToolbar } from "./OpsClientListToolbar";
import { AddClientModal } from "./AddClientModal";

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
  const { displayName, ledTeamIds, teamIds, user } = useAuth();
  /* Filters follow the person's legitimate scope (Dee, 2026-09-19): one
     authorized department needs no department filter; an unrestricted agent
     filter belongs to management and team leads, not to an agent. */
  const { myDepartments, canAccessManagement } = useCreditOpsAccess();
  const departmentOptions = canAccessManagement ? [...CREDITOPS_DEPARTMENT_ORDER] : myDepartments;
  const showDepartmentFilter = departmentOptions.length > 1;
  const showAgentFilter = canAccessManagement || (ledTeamIds?.length ?? 0) > 0;
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
  /* Dee's CreditOps design, 2026-09-23: "Quick views — work your list your
     way." Defaults to All so nobody lands on an empty screen wondering where
     their queue went. */
  const [quickView, setQuickView] = useState<QuickViewId>("all");
  /* Selected rows, for the bulk bar. Cleared whenever the view changes: a
     selection you can no longer see is a selection you can act on by accident. */
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  /* The coverage card somebody has clicked, if any. Separate from the quick
     view: "my work" and "what is falling through" are different questions and
     a lead uses both at once. */
  const [coverageFilter, setCoverageFilter] = useState<CoverageState | null>(null);
  const coverage = useCreditOpsCoverage();
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
  /* ── A CLIENT OPENS. IT IS NOT A LAYER ─────────────────────────────────
     Dee, 2026-09-22, for the third time: "I told you to OPEN it instead of a
     layer into another layer... That's friction."

     It was a panel over the list, and Manage was a second panel over that.
     Clicking a client now goes to its own address, so it has a URL you can
     send, a back button that works, and no second window stacked on a first. */
  const navigate = useNavigate();
  const openClient = (id: string) => navigate(`/app/creditops/cases/${id}`);

  /* A notification deep link (`?client=`) lands on the same address. */
  useEffect(() => {
    if (initialOpenClientId) navigate(`/app/creditops/cases/${initialOpenClientId}`, { replace: true });
  }, [initialOpenClientId, navigate]);

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

  /* The quick view narrows what the table shows, and the counts on the tabs
     come from the SAME list before that narrowing — so "Unassigned (5)" and
     the five rows you get by clicking it are the same five, always. */
  const quickCtx = useMemo(
    () => ({ userId: user?.id ?? "", teamIds: teamIds ?? [] }),
    [user?.id, teamIds],
  );
  const quickCounts = useMemo(() => quickViewCounts(shown, quickCtx), [shown, quickCtx]);
  /* The clients in the chosen coverage state, taken from the rows the strip
     counted — so a card reading 13 filters to thirteen and never twelve. */
  const coverageIds = useMemo(() => {
    if (!coverageFilter) return null;
    return new Set((coverage.data ?? []).filter((r) => r.state === coverageFilter).map((r) => r.client_id));
  }, [coverage.data, coverageFilter]);

  const inView = useMemo(() => {
    const byQuickView = quickView === "all" ? shown : shown.filter((c) => matchesQuickView(c, quickView, quickCtx));
    return coverageIds ? byQuickView.filter((c) => coverageIds.has(c.id)) : byQuickView;
  }, [shown, quickView, quickCtx, coverageIds]);

  /* Anything selected that the current view no longer shows is dropped, so a
     bulk action can only ever reach rows on screen. */
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(inView.map((c) => c.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [inView]);

  const activeCount = inView.filter((c) => isActiveClient(c)).length;

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
    for (const c of inView) {
      const due = (c as { dueAt?: string | null }).dueAt ?? null;
      if (due) {
        const day = String(due).slice(0, 10);
        if (day === today) dueToday += 1;
        else if (day < today) overdue += 1;
      }
      const rows = departmentRows[c.id] ?? [];
      if (rows.length > 0 && openDepartments(rows).every((r) => !isActionableDepartmentStatus(r.status))) waiting += 1;
    }
    return { total: inView.length, active: activeCount, dueToday, overdue, waiting };
  }, [inView, departmentRows, activeCount]);

  // Mode / Source is only meaningful in the cross-partner Management view.
  // Inside a single ManagedOps or Outsourcing Partner workspace, the mode is
  // implied by the group, so we hide it to reduce clutter.
  const { columns: customColumns } = useClientColumns();
  const hideModeCol = !!partner && GROUPS_HIDING_MODE.includes(partner.group);
  const availableCols = hideModeCol
    ? COLUMN_DEFS.filter((c) => c.id !== "mode")
    : COLUMN_DEFS;
  /* The built-in columns the person has switched on, then the ones somebody
     added. Custom columns are always shown: you added it because you wanted
     to see it, and hiding it behind a second control is the complication Dee
     asked us not to add (2026-09-22). */
  const visibleCols = [
    ...availableCols.filter((c) => prefs.visibleCols.includes(c.id)),
    ...customColumns.map(customColDef),
  ];

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
      <CreditOpsCoverageStrip
        rows={coverage.data ?? []}
        loading={coverage.isPending}
        active={coverageFilter}
        onPick={setCoverageFilter}
      />

      {/* Dee's CreditOps design, 2026-09-23 — "Quick views: work your list
          your way." The count beside each label is computed from the same
          predicate that filters the rows, so the tab and the table can never
          disagree. */}
      <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-border" role="tablist" aria-label="Quick views">
        {QUICK_VIEWS.map((v) => {
          const on = quickView === v.id;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setQuickView(v.id)}
              className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                on
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              {v.label}{" "}
              <span className={on ? "text-primary" : "text-muted-foreground"}>({quickCounts[v.id]})</span>
            </button>
          );
        })}
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
            {/* A tile that says 0 while the list is still arriving is not a
                slower truth, it is a different one — "there is no work here".
                The bar keeps the tile exactly the height the number will be,
                so nothing moves when the figure lands (Dee, 2026-09-23:
                screens "flash and blink before it load properly"). */}
            {store.loading ? (
              <div
                aria-hidden
                className="mt-0.5 h-[1.75rem] w-10 animate-pulse rounded bg-muted"
              />
            ) : (
              <p className={`mt-0.5 text-lg font-bold ${s.tone}`}>{s.value}</p>
            )}
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
        extraActions={<AddClientColumn />}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        extraFilters={[
          ...(showDepartmentFilter ? [{
            key: "department", label: "Filter by department", value: departmentFilter,
            onChange: setDepartmentFilter,
            options: [
              { value: "all", label: "All departments" },
              ...departmentOptions.map((d) => ({ value: d, label: d })),
            ],
          }] : []),
          {
            key: "round", label: "Filter by round", value: roundFilter,
            onChange: setRoundFilter,
            options: [
              { value: "all", label: "All rounds" },
              ...[...new Set(store.clients.map((c) => c.round))].filter(Boolean).sort()
                .map((r) => ({ value: r, label: r })),
            ],
          },
          ...(showAgentFilter ? [{
            key: "agent", label: "Filter by assigned agent", value: agentFilter,
            onChange: setAgentFilter,
            options: [
              { value: "all", label: "All agents" },
              { value: "__unassigned__", label: "Unassigned" },
              ...agentNames.map((n) => ({ value: n, label: n })),
            ],
          }] : []),
        ]}
        onStatusFilterChange={setStatusFilter}
        statusOptions={STATUS_OPTIONS}
      />

      {/* "No clients match your filters" is a STATEMENT ABOUT THE FILTERS, and
          for the 400ms before the list arrives it is not true — there are
          clients, they are in flight. An operator who reads it concludes the
          queue is empty, or that their filter is wrong, and it is neither.
          The skeleton stands in the same place at the same height, so the real
          rows replace it without the page moving (Dee, 2026-09-23). */}
      {store.loading ? (
        <div className="overflow-hidden rounded-xl border border-border" aria-busy="true" aria-label="Loading clients">
          <div className="h-10 border-b border-border bg-muted/40" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border px-3 py-2.5 last:border-b-0">
              <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="h-4 w-28 animate-pulse rounded bg-muted" />
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : inView.length === 0 ? (
        <ContentCard title="No clients match your filters">
          <p className="text-sm text-muted-foreground">
            Adjust the status filter or search to find clients for this Partner.
          </p>
        </ContentCard>
      ) : prefs.view === "list" ? (
        <ClientListTable
          departmentRows={departmentRows}
          clients={inView}
          selected={selected}
          onSelectedChange={setSelected}
          visibleCols={visibleCols}
          prefs={prefs}
          setPrefs={setPrefs}
          onOpenClient={openClient}
        />
      ) : (
        <ClientListGrid clients={inView} onOpenClient={openClient} />
      )}

      <AddClientModal
        open={showAddClient}
        onClose={() => setShowAddClient(false)}
        partner={partner}
      />
    </div>
  );
}
