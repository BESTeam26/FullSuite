/**
 * Add Client Modal — CreditOps, bound to the shared ops add-client modal.
 *
 * Supplies the CreditOps status vocabulary, assignee pool and its one extra
 * field (dispute Round), plus how a CreditOps record is built.
 */

import { useState } from "react";
import {
  useCreditOpsStore,
  ELIGIBLE_ASSIGNEES,
} from "@/lib/fulfillment/creditops-client-store";
import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import type { CreditOpsPartner } from "@/lib/fulfillment/creditops-partners";
import { OpsAddClientModal } from "./OpsAddClientModal";
import { OpsSelect } from "@/components/ui/ops-select";

const STATUS_OPTIONS = [
  "Onboarding",
  "Ready for Processing",
  "In Processing",
  "Ready for QA",
  "In Dispute",
  "Awaiting Response",
  "Completed",
];

const ROUND_OPTIONS: FulfillmentClient["round"][] = [
  "Pre-Round",
  "Round 1",
  "Round 2",
  "Round 3",
  "Round 4+",
];

interface AddClientModalProps {
  open: boolean;
  onClose: () => void;
  partner: CreditOpsPartner | undefined;
}

export function AddClientModal({
  open,
  onClose,
  partner,
}: AddClientModalProps) {
  const store = useCreditOpsStore();
  const [round, setRound] = useState<FulfillmentClient["round"]>("Pre-Round");

  return (
    <OpsAddClientModal<FulfillmentClient>
      open={open}
      onClose={onClose}
      isNative={partner?.mode === "native_creditops"}
      nativeNotice="This Partner uses the native BES CreditOps SaaS connection. New clients are typically pulled from their workspace. Use this form only to add a manual record that is not in their system."
      partnerName={partner?.name}
      statusOptions={STATUS_OPTIONS}
      defaultStatus="Onboarding"
      assignees={ELIGIBLE_ASSIGNEES}
      onResetExtras={() => setRound("Pre-Round")}
      extraField={
        <div>
          <label className="text-xs font-semibold text-foreground">Round</label>
          <OpsSelect
            value={round}
            onValueChange={(v) => setRound(v as FulfillmentClient["round"])}
            options={ROUND_OPTIONS}
            size="field"
            aria-label="Round"
            className="mt-1"
          />
        </div>
      }
      buildPayload={(common, chosen) => {
        // No sentinel. "all" is a UI filter value, not a partner; sending it
        // put the literal string into a uuid column and the insert failed with
        // a raw Postgres error (22P02). Use the partner in context, or the one
        // picked in the modal when opened from the management-level list.
        const scope = partner ?? chosen;
        if (!scope) throw new Error("Select a partner before adding a client.");
        const scopeId = scope.scopeId;
        const base = {
          name: common.name,
          email: common.email,
          phone: common.phone,
          status: common.status as FulfillmentClient["status"],
          round,
          assignedAgent: common.assignee,
          openItems: 0,
          autoSync: partner?.mode === "saas_pulled",
        };
        return scope.mode === "outsourcing_only"
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
              organizationName: partner?.name ?? "Managed Ops",
            };
      }}
      onCheckConflict={(payload) => store.checkAddConflict(payload)}
      onAdd={(payload) => store.addClient(payload)}
    />
  );
}
