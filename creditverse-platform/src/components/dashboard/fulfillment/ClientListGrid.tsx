/**
 * ClientListGrid — CreditOps grid/card view, bound to the shared ops grid.
 */

import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import { OpsClientListGrid } from "./OpsClientListGrid";
import { FulfillmentStatusPill } from "./client-list-helpers";

interface ClientListGridProps {
  clients: FulfillmentClient[];
  onOpenClient: (id: string) => void;
}

export function ClientListGrid({ clients, onOpenClient }: ClientListGridProps) {
  return (
    <OpsClientListGrid
      clients={clients}
      onOpenClient={onOpenClient}
      renderStatus={(c) => <FulfillmentStatusPill status={c.status} />}
      renderSecondary={(c) => (
        <span className="text-xs text-muted-foreground">{c.round}</span>
      )}
      renderOpenCount={(c) => <span>{c.openItems} open</span>}
    />
  );
}
