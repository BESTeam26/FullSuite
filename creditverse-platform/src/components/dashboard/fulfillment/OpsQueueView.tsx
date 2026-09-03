/**
 * OpsQueueView — the presentation shell shared by every division's workflow
 * queue (dispute, onboarding, readiness, submissions, …).
 *
 * Each division decides WHICH clients belong in a queue; this component decides
 * how a queue LOOKS: header with icon and count, in-queue search, and the client
 * table. Only one column and the SLA warning threshold vary between divisions.
 */

import { useState, type ElementType, type ReactNode } from "react";
import { Search } from "lucide-react";
import { DivisionTable } from "@/components/dashboard/DivisionLayout";
import type { OpsClient } from "@/lib/fulfillment/ops-client-domain";

export interface OpsQueueColumn<T extends OpsClient> {
  label: string;
  render: (client: T) => ReactNode;
}

interface OpsQueueViewProps<T extends OpsClient> {
  title: string;
  icon: ElementType;
  /** Tailwind text-colour class for the header icon. */
  color: string;
  /** Clients already filtered to this queue by the division. */
  clients: T[];
  onOpenClient: (id: string) => void;
  /** The one division-specific column: dispute round, or requested amount. */
  detailColumn: OpsQueueColumn<T>;
  /** "Queue Status" in CreditOps, "Stage Status" in FundingOps. */
  statusColumnLabel: string;
  /** SLA hours at or below which the figure turns red. */
  slaWarningHours: number;
}

export function OpsQueueView<T extends OpsClient>({
  title,
  icon: Icon,
  color,
  clients,
  onOpenClient,
  detailColumn,
  statusColumnLabel,
  slaWarningHours,
}: OpsQueueViewProps<T>) {
  const [search, setSearch] = useState("");

  const visible = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl bg-muted ${color}`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-foreground tracking-wide">
              {title}
            </h2>
            <p className="text-xs text-muted-foreground">
              {visible.length} clients requiring action in this workflow queue
            </p>
          </div>
        </div>
        <div className="relative min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this queue..."
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <DivisionTable
        columns={[
          "Client Name",
          "Email / Phone",
          detailColumn.label,
          statusColumnLabel,
          "Assigned Agent",
          "SLA Hours",
          "Action",
        ]}
        rows={visible.map((c) => [
          <button onClick={() => onOpenClient(c.id)} className="text-left">
            <p className="font-bold text-foreground hover:text-primary">
              {c.name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {c.mode === "saas_pulled"
                ? c.organizationName
                : c.outsourcingGroupName}
            </p>
          </button>,
          <div>
            <p className="text-xs text-foreground">{c.email}</p>
            <p className="text-[11px] text-muted-foreground">
              {c.phone || "No phone"}
            </p>
          </div>,
          detailColumn.render(c),
          <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-700 border border-amber-500/30">
            {c.status}
          </span>,
          c.assignedAgent || "Unassigned",
          <span
            className={`font-extrabold ${c.slaHoursRemaining && c.slaHoursRemaining <= slaWarningHours ? "text-red-600" : "text-foreground"}`}
          >
            {c.slaHoursRemaining ? `${c.slaHoursRemaining}h` : "—"}
          </span>,
          <button
            onClick={() => onOpenClient(c.id)}
            className="rounded-md bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90"
          >
            Open File
          </button>,
        ])}
      />
    </div>
  );
}
