/**
 * Funding Add Client Modal — FundingOps, bound to the shared ops add-client
 * modal.
 *
 * Supplies the FundingOps status vocabulary, assignee pool and its one extra
 * field (Requested amount), plus how a FundingOps record is built.
 */

import { useState } from "react";
import {
  useFundingOpsStore,
  FUNDING_ELIGIBLE_ASSIGNEES,
} from "@/lib/fulfillment/fundingops-client-store";
import type { FundingClient } from "@/lib/fulfillment/fundingops-domain";
import type { FundingOpsPartner } from "@/lib/fulfillment/fundingops-partners";
import { OpsAddClientModal } from "./OpsAddClientModal";

const STATUS_OPTIONS = [
  "Onboarding",
  "Readiness Review",
  "Document Review",
  "Lender Matching",
  "Submitted",
  "Stipulations",
  "Offer Received",
  "Funded",
];

interface FundingAddClientModalProps {
  open: boolean;
  onClose: () => void;
  partner: FundingOpsPartner | undefined;
}

export function FundingAddClientModal({
  open,
  onClose,
  partner,
}: FundingAddClientModalProps) {
  const store = useFundingOpsStore();
  const [requested, setRequested] = useState("");

  return (
    <OpsAddClientModal<FundingClient>
      open={open}
      onClose={onClose}
      isNative={partner?.mode === "native_fundingops"}
      nativeNotice="This Partner uses the native BES FundingOps SaaS connection. New clients are typically pulled from their workspace. Use this form only to add a manual record that is not in their system."
      partnerName={partner?.name}
      statusOptions={STATUS_OPTIONS}
      defaultStatus="Onboarding"
      assignees={FUNDING_ELIGIBLE_ASSIGNEES}
      onResetExtras={() => setRequested("")}
      extraField={
        <div>
          <label className="text-xs font-semibold text-foreground">
            Requested $
          </label>
          <input
            value={requested}
            onChange={(e) => setRequested(e.target.value)}
            placeholder="250000"
            className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      }
      buildPayload={(common) => {
        const scopeId = partner?.scopeId ?? "all";
        const requestedNum = requested
          ? Number(requested.replace(/[^0-9]/g, "")) || 0
          : 0;
        const base = {
          name: common.name,
          email: common.email,
          phone: common.phone,
          status: common.status as FundingClient["status"],
          assignedAgent: common.assignee,
          openFiles: requestedNum > 0 ? 1 : 0,
          totalRequested: requestedNum,
          autoSync: partner?.mode === "native_fundingops",
          provenance:
            partner?.mode === "outsourcing_only"
              ? ("agency_manual" as const)
              : ("bes_saas_synced" as const),
        };
        return partner?.mode === "outsourcing_only"
          ? {
              ...base,
              mode: "outsourcing_only" as const,
              outsourcingGroupId: scopeId,
              outsourcingGroupName: partner.name,
            }
          : {
              ...base,
              mode: "saas_pulled" as const,
              organizationId: scopeId,
              organizationName: partner?.name ?? "FundingOps",
            };
      }}
      onCheckConflict={(payload) => store.checkAddConflict(payload)}
      onAdd={(payload) => store.addClient(payload)}
    />
  );
}
