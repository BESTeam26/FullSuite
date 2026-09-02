/**
 * FundingClientListGrid — the grid/card view of the FundingOps Main Client List.
 */

import type { FundingClient } from "@/lib/fulfillment/fundingops-domain";
import { formatCurrency } from "@/lib/fulfillment/fundingops-domain";
import {
  FundingStatusPill,
  FundingModeBadge,
  FundingAvatar,
} from "./funding-client-list-helpers";

interface FundingClientListGridProps {
  clients: FundingClient[];
  onOpenClient: (id: string) => void;
}

export function FundingClientListGrid({
  clients,
  onOpenClient,
}: FundingClientListGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {clients.map((c) => (
        <div
          key={c.id}
          onClick={() => onOpenClient(c.id)}
          className="cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm hover:border-primary/40"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <FundingAvatar name={c.name} size="md" />
              <div>
                <p className="font-semibold text-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.email}</p>
              </div>
            </div>
            <FundingModeBadge client={c} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <FundingStatusPill status={c.status} />
            <span className="text-xs font-semibold text-foreground">
              {c.totalRequested ? formatCurrency(c.totalRequested) : "—"}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <FundingAvatar name={c.assignedAgent ?? "Unassigned"} />{" "}
              {c.assignedAgent ?? "Unassigned"}
            </span>
            <span>{c.openFiles} open file(s)</span>
          </div>
        </div>
      ))}
    </div>
  );
}
