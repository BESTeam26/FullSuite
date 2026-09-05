/**
 * CreditOps Header — minimal partner workspace header.
 *
 * Shows ONLY the selected Partner name + active client count + Status Guide
 * + the person's CreditOps role (a demo-only switcher when no membership exists).
 */

import { FileText, HelpCircle, Shield } from "lucide-react";
import {
  useCreditOpsAccess,
  CREDITOPS_ROLE_LIST,
  CREDITOPS_ROLES,
} from "@/lib/fulfillment/creditops-access";
import { OpsSelect } from "@/components/ui/ops-select";

interface CreditOpsHeaderProps {
  partnerName: string;
  clientCount: number | null;
  onOpenStatusGuide: () => void;
}

export function CreditOpsHeader({
  partnerName,
  clientCount,
  onOpenStatusGuide,
}: CreditOpsHeaderProps) {
  const access = useCreditOpsAccess();

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileText className="h-5 w-5" />
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

      <div className="flex items-center gap-2">
        {/* The role is read from the person's membership. Only demo mode,
            where no membership exists, offers a switcher to preview roles. */}
        <div
          className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1"
          title={access.roleDef.description}
        >
          <Shield className="h-3.5 w-3.5 text-primary" />
          {access.canSwitchRole ? (
            <OpsSelect
              value={access.role}
              onValueChange={(v) => access.setRole(v as typeof access.role)}
              aria-label="Preview a CreditOps role (demo mode)"
              options={CREDITOPS_ROLE_LIST.map((r) => ({
                value: r,
                label: CREDITOPS_ROLES[r].shortLabel,
              }))}
              className="border-0 bg-transparent px-0 font-semibold shadow-none focus:ring-0 data-[state=open]:ring-0"
            />
          ) : (
            <span className="text-xs font-semibold text-foreground">
              {access.roleDef.shortLabel}
            </span>
          )}
        </div>

        <button
          onClick={onOpenStatusGuide}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
        >
          <HelpCircle className="h-3.5 w-3.5 text-primary" />
          Status Guide
        </button>
      </div>
    </div>
  );
}
