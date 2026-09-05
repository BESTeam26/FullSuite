/**
 * FundingOps Header — minimal partner workspace header.
 *
 * Shows the selected Partner name + active client count + the person's
 * FundingOps role (a demo-only switcher when no membership exists).
 */

import { Landmark, Shield } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import {
  useFundingOpsAccess,
  FUNDINGOPS_ROLE_LIST,
  FUNDINGOPS_ROLES,
} from "@/lib/fulfillment/fundingops-access";

interface Props {
  partnerName: string;
  clientCount: number | null;
}

export function FundingOpsHeader({ partnerName, clientCount }: Props) {
  const access = useFundingOpsAccess();

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Landmark className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-base font-bold text-foreground">{partnerName}</h1>
          {clientCount !== null && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              {clientCount} Active Clients
            </span>
          )}
        </div>
      </div>

      <div
        className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1"
        title={access.roleDef.description}
      >
        <Shield className="h-3.5 w-3.5 text-primary" />
        {access.canSwitchRole ? (
          <OpsSelect
            value={access.role}
            onValueChange={(v) => access.setRole(v as typeof access.role)}
            aria-label="Preview a FundingOps role (demo mode)"
            options={FUNDINGOPS_ROLE_LIST.map((r) => ({
              value: r,
              label: FUNDINGOPS_ROLES[r].shortLabel,
            }))}
            className="border-0 bg-transparent px-0 font-semibold shadow-none focus:ring-0 data-[state=open]:ring-0"
          />
        ) : (
          <span className="text-xs font-semibold text-foreground">
            {access.roleDef.shortLabel}
          </span>
        )}
      </div>
    </div>
  );
}
