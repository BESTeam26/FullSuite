/**
 * FundingClientListGrid — FundingOps grid/card view, bound to the shared ops grid.
 */

import type { FundingClient } from "@/lib/fulfillment/fundingops-domain";
import { formatCurrency } from "@/lib/fulfillment/fundingops-domain";
import { OpsClientListGrid } from "./OpsClientListGrid";
import { FundingStatusPill } from "./funding-client-list-helpers";

interface FundingClientListGridProps {
  clients: FundingClient[];
  onOpenClient: (id: string) => void;
}

export function FundingClientListGrid({
  clients,
  onOpenClient,
}: FundingClientListGridProps) {
  return (
    <OpsClientListGrid
      clients={clients}
      onOpenClient={onOpenClient}
      renderStatus={(c) => <FundingStatusPill status={c.status} />}
      renderSecondary={(c) => (
        <span className="text-xs font-semibold text-foreground">
          {c.totalRequested ? formatCurrency(c.totalRequested) : "—"}
        </span>
      )}
      renderOpenCount={(c) => <span>{c.openFiles} open file(s)</span>}
    />
  );
}
