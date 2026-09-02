/**
 * ClientListGrid — the grid/card view of the Main Client List.
 */

import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import {
  FulfillmentStatusPill,
  ModeBadge,
  Avatar,
} from "./client-list-helpers";

interface ClientListGridProps {
  clients: FulfillmentClient[];
  onOpenClient: (id: string) => void;
}

export function ClientListGrid({ clients, onOpenClient }: ClientListGridProps) {
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
            <FulfillmentStatusPill status={c.status} />
            <span className="text-xs text-muted-foreground">{c.round}</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={c.assignedAgent ?? "Unassigned"} />{" "}
              {c.assignedAgent ?? "Unassigned"}
            </span>
            <span>{c.openItems} open</span>
          </div>
        </div>
      ))}
    </div>
  );
}
