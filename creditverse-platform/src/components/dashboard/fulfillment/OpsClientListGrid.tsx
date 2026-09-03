/**
 * OpsClientListGrid — the grid/card view of a division's Main Client List.
 *
 * CreditOps and FundingOps show the same card: avatar, name, email, mode badge,
 * status pill, assigned agent. They differ in only two spots, which the caller
 * supplies: the secondary field (dispute round vs requested amount) and the
 * open-work count label (open items vs open files).
 */

import type { ReactNode } from "react";
import type { OpsClient } from "@/lib/fulfillment/ops-client-domain";
import { Avatar, ModeBadge } from "./ops-client-list-helpers";

interface OpsClientListGridProps<T extends OpsClient> {
  clients: T[];
  onOpenClient: (id: string) => void;
  /** Status chip for this division's vocabulary. */
  renderStatus: (client: T) => ReactNode;
  /** Right-hand value on the status row: round, or requested amount. */
  renderSecondary: (client: T) => ReactNode;
  /** Bottom-right open-work count, already labelled. */
  renderOpenCount: (client: T) => ReactNode;
}

export function OpsClientListGrid<T extends OpsClient>({
  clients,
  onOpenClient,
  renderStatus,
  renderSecondary,
  renderOpenCount,
}: OpsClientListGridProps<T>) {
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
              <Avatar name={c.name} size="md" />
              <div>
                <p className="font-semibold text-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.email}</p>
              </div>
            </div>
            <ModeBadge client={c} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            {renderStatus(c)}
            {renderSecondary(c)}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={c.assignedAgent ?? "Unassigned"} />{" "}
              {c.assignedAgent ?? "Unassigned"}
            </span>
            {renderOpenCount(c)}
          </div>
        </div>
      ))}
    </div>
  );
}
