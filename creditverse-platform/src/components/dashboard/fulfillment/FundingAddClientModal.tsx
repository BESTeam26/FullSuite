/**
 * Funding Add Client Modal — FundingOps, bound to the shared ops add-client
 * modal.
 *
 * Supplies the FundingOps status vocabulary, assignee pool and its one extra
 * field (Requested amount), plus how a FundingOps record is built.
 */

import { useState } from "react";
import { useTeams } from "@/lib/data/use-teams";
import { OpsSelect } from "@/components/ui/ops-select";
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
  /** Passed through when the caller has no partner in context. */
  partnerOptions?: { scopeId: string; name: string; mode: string }[];
  open: boolean;
  onClose: () => void;
  partner: FundingOpsPartner | undefined;
}

export function FundingAddClientModal({
  partnerOptions,
  open,
  onClose,
  partner,
}: FundingAddClientModalProps) {
  const store = useFundingOpsStore();
  const [requested, setRequested] = useState("");
  /* Creation is a ceiling act (migration 0023): a team-scoped user can only
     create inside a team their scope reaches. Pre-selected from the user's own
     teams; the database still decides. */
  const { teams, mustChooseTeam, defaultTeamId } = useTeams();
  const [teamId, setTeamId] = useState<string>(defaultTeamId ?? "");

  return (
    <OpsAddClientModal<FundingClient>
      open={open}
      onClose={onClose}
      isNative={partner?.mode === "native_fundingops"}
      nativeNotice="This Partner uses the native BES FundingOps SaaS connection. New clients are typically pulled from their workspace. Use this form only to add a manual record that is not in their system."
      partnerName={partner?.name}
      partnerOptions={partnerOptions}
      statusOptions={STATUS_OPTIONS}
      defaultStatus="Onboarding"
      assignees={FUNDING_ELIGIBLE_ASSIGNEES}
      onResetExtras={() => {
        setRequested("");
        setTeamId(defaultTeamId ?? "");
      }}
      extraField={
        <div className="grid gap-3 sm:grid-cols-2">
          {teams.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-foreground">
                Team{mustChooseTeam ? "" : " (optional)"}
              </label>
              <OpsSelect
                value={teamId}
                onValueChange={setTeamId}
                options={[
                  ...(mustChooseTeam ? [] : [{ value: "", label: "No team" }]),
                  ...teams.map((t) => ({ value: t.id, label: t.name })),
                ]}
                size="field"
                aria-label="Team"
                className="mt-1"
              />
            </div>
          )}

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
        const requestedNum = requested
          ? Number(requested.replace(/[^0-9]/g, "")) || 0
          : 0;
        const base = {
          name: common.name,
          email: common.email,
          phone: common.phone,
          status: common.status as FundingClient["status"],
          assignedAgent: common.assignee,
          teamId: teamId || undefined,
          openFiles: requestedNum > 0 ? 1 : 0,
          totalRequested: requestedNum,
          autoSync: scope.mode === "native_fundingops",
          provenance:
            scope.mode === "outsourcing_only"
              ? ("agency_manual" as const)
              : ("bes_saas_synced" as const),
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
              organizationName: partner?.name ?? "FundingOps",
            };
      }}
      onCheckConflict={(payload) => store.checkAddConflict(payload)}
      onAdd={(payload) => store.addClient(payload)}
    />
  );
}
