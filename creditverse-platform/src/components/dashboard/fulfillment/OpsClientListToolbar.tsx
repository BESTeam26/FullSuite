/**
 * OpsClientListToolbar — the controls above a division's Main Client List:
 * list/grid toggle, Assigned to Me, active count, Add Client, column picker,
 * search and status filter.
 *
 * These controls belong to the client list and deliberately do not render
 * globally on other views.
 */

import { Search, List, LayoutGrid, Plus, Columns3, X } from "lucide-react";
import type { ColDef } from "./ops-client-list-helpers";
import { cn } from "@/lib/utils";
import { OpsSelect } from "@/components/ui/ops-select";

interface OpsClientListToolbarProps<Id extends string> {
  view: "list" | "grid";
  onViewChange: (view: "list" | "grid") => void;
  assignedOnly: boolean;
  onAssignedOnlyChange: (value: boolean) => void;
  activeCount: number;
  onAddClient: () => void;
  /** Columns the current context allows, already filtered. */
  availableCols: ColDef<Id>[];
  visibleColIds: Id[];
  onVisibleColsChange: (ids: Id[]) => void;
  columnsOpen: boolean;
  onColumnsOpenChange: (open: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  statusOptions: readonly string[];
  /**
   * Extra filters the division supplies — department, round, assigned agent.
   *
   * Passed in rather than built here because the vocabularies belong to the
   * division: CreditOps rounds and FundingOps stages have nothing to say to
   * each other, and a shared toolbar that knew both would be a shared toolbar
   * that knew neither.
   */
  extraFilters?: {
    key: string;
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
  }[];
}

export function OpsClientListToolbar<Id extends string>({
  view,
  onViewChange,
  assignedOnly,
  onAssignedOnlyChange,
  activeCount,
  onAddClient,
  availableCols,
  visibleColIds,
  onVisibleColsChange,
  columnsOpen,
  onColumnsOpenChange,
  search,
  onSearchChange,
  statusFilter,
  extraFilters = [],
  onStatusFilterChange,
  statusOptions,
}: OpsClientListToolbarProps<Id>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
          <button
            onClick={() => onViewChange("list")}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              view === "list"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => onViewChange("grid")}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              view === "grid"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={() => onAssignedOnlyChange(!assignedOnly)}
          className={cn(
            "ml-1 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
            assignedOnly
              ? "border-emerald-600 bg-emerald-500/10 text-status-success"
              : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <span
            className={cn(
              "relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors",
              assignedOnly ? "bg-emerald-600" : "bg-muted-foreground/40",
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition",
                assignedOnly ? "translate-x-3" : "translate-x-0",
              )}
            />
          </span>
          Assigned to Me
        </button>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5">
          <span className="text-xs font-semibold text-foreground">
            {activeCount} Active
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onAddClient}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Add Client
        </button>

        <div className="relative">
          <button
            onClick={() => onColumnsOpenChange(!columnsOpen)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <Columns3 className="h-3.5 w-3.5" /> Columns
          </button>
          {columnsOpen && (
            <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-border bg-card p-2 shadow-lg">
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-[11px] font-bold uppercase text-muted-foreground">
                  Show Columns
                </span>
                <button onClick={() => onColumnsOpenChange(false)}>
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
              {availableCols.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-foreground hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={visibleColIds.includes(c.id)}
                    onChange={(e) =>
                      onVisibleColsChange(
                        e.target.checked
                          ? [...visibleColIds, c.id]
                          : visibleColIds.filter((x) => x !== c.id),
                      )
                    }
                    className="h-3.5 w-3.5"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="relative min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search client..."
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <OpsSelect
          value={statusFilter}
          onValueChange={onStatusFilterChange}
          options={statusOptions}
          aria-label="Filter by status"
        />

        {extraFilters.map((f) => (
          <OpsSelect
            key={f.key}
            value={f.value}
            onValueChange={f.onChange}
            options={f.options}
            aria-label={f.label}
          />
        ))}
      </div>
    </div>
  );
}
