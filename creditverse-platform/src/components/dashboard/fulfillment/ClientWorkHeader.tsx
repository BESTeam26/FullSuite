/**
 * ClickUp-style Client Work File Header & Summary Bar.
 */

import { ArrowLeft, AlertTriangle } from "lucide-react";
import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import { getPartnerByScope } from "@/lib/fulfillment/creditops-partners";
import { clientGroupLabel } from "@/lib/fulfillment/fulfillment-client-domain";

interface Props {
  client: FulfillmentClient;
  onBack: () => void;
}

export function ClientWorkHeader({ client, onBack }: Props) {
  const partner = getPartnerByScope(
    client.organizationId ?? client.outsourcingGroupId ?? "",
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 rounded-xl shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onBack}
          className="mr-2 inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h1 className="text-base font-extrabold text-foreground">
          {client.name}
        </h1>

        <span className="rounded-full bg-blue-500/10 px-3 py-0.5 text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wide border border-blue-500/20">
          {client.status}
        </span>

        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          ADMIN
        </span>
        <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-400">
          {partner?.name ?? clientGroupLabel(client)}
        </span>
        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          TEAM: TEST CREDITOPS QA TEAM
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted-foreground">
          Due 6/8/2026{" "}
          <span className="ml-1 inline-flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 font-bold text-status-danger">
            <AlertTriangle className="h-3 w-3" /> 83d overdue
          </span>
        </span>
        <span className="rounded bg-muted px-2 py-0.5 font-semibold text-muted-foreground">
          SLA Status: <strong className="text-foreground">DUE IN 36D</strong>
        </span>
      </div>
    </div>
  );
}
