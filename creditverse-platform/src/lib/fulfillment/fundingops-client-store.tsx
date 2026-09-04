/**
 * FundingOps Client Store — the shared ops client store, bound to FundingOps.
 *
 * This is the SINGLE source of truth for the FundingOps fulfillment workspace:
 * the client list, every stage queue and the Client Work workspace all read from
 * and write to it. Behaviour lives in createOpsClientStore; this file supplies
 * the FundingOps seed data, stage seeding and id prefixes.
 *
 * Dual-mode, like CreditOps: live mode reads and writes `funding_clients` and
 * friends through the data layer; without Supabase credentials it falls back to
 * seed data so the workspace stays explorable.
 *
 * NOTE: unlike CreditOps, FundingOps does not currently wire a webhook bridge —
 * setFundingStatusChangeHandler exists but nothing calls it yet.
 */

import { seedFundingClients } from "@/lib/fulfillment/fundingops-seed";
import type { FundingClient } from "@/lib/fulfillment/fundingops-domain";
import {
  type FundingActivityEntry,
  type FundingDepartmentStatus,
  type FundingCommentMark,
  FUNDING_COMMENT_MARKS,
  getFundingMark,
  seedFundingDepartmentStatuses,
} from "@/lib/fulfillment/fundingops-store-types";
import {
  createOpsClientStore,
  type AddClientOutcome as OpsAddClientOutcome,
  type OpsClientLiveBackend,
  type StatusChangeHandler as OpsStatusChangeHandler,
} from "@/lib/fulfillment/ops-client-store";
import {
  createFundingClient,
  fetchFundingClients,
  fetchFundingDepartmentStatuses,
  updateFundingClientContact,
  updateFundingClientStatus,
} from "@/lib/data/funding-clients";
import type { Enums } from "@/lib/supabase/database.types";

export type FundingStatusChangeHandler = OpsStatusChangeHandler;
export type AddFundingClientOutcome = OpsAddClientOutcome<FundingClient>;
export type {
  FundingActivityEntry,
  FundingDepartmentStatus,
  FundingCommentMark,
};
export { FUNDING_COMMENT_MARKS, getFundingMark };

/* Eligible assignees — scoped, NOT the entire agency directory. */
export const FUNDING_ELIGIBLE_ASSIGNEES = [
  "Keila Betancourt",
  "Carlos Mendoza",
  "Maria Santos",
  "James Wilson",
  "Unassigned",
];

/**
 * `updateAssignee` is deliberately ABSENT, exactly as in CreditOps.
 *
 * Assignees are still names, not profile rows. Resolving a name to an id would
 * mean guessing at identity (rule 4), so the store reports `canAssign: false`
 * and the interface renders the assignee read-only rather than offering a
 * control that fails after the click (rule 3). Phase 4's Workforce directory
 * supplies the real picker.
 */
const live: OpsClientLiveBackend<FundingClient, FundingDepartmentStatus> = {
  fetchClients: fetchFundingClients,
  fetchDepartmentStatuses: fetchFundingDepartmentStatuses,
  updateStatus: (clientId, status) =>
    updateFundingClientStatus(
      clientId,
      status as Enums<"funding_client_status">,
    ),
  updateContact: updateFundingClientContact,
  addClient: (client, agencyId) =>
    createFundingClient({
      agencyId,
      name: client.name,
      email: client.email,
      phone: client.phone,
      mode: client.mode,
      provenance: client.provenance as Enums<"funding_provenance">,
      organizationId: client.organizationId,
      outsourcingGroupId: client.outsourcingGroupId,
      autoSync: client.autoSync,
      teamId: client.teamId,
      status: client.status as Enums<"funding_client_status">,
    }),
  /* FundingOps production is logged against a DEAL, not a dispute unit, so it
     does not share the CreditOps Complete Work path. Left unimplemented rather
     than wired to the wrong table. */
  /**
   * Not a no-op. `production_logs.department` is the CreditOps
   * `fulfillment_department` enum and `division_id` defaults to 'creditops', so
   * FundingOps production cannot be stored without a schema change to the
   * production engine. Until that lands this must FAIL visibly — an `async ()
   * => {}` here made "Complete Work" on a deal look like it succeeded while
   * recording nothing, which is a placeholder pretending to be production
   * behaviour (rule 12). The store's error surface shows the reason.
   */
  logProduction: async () => {
    throw new Error(
      "Production logging for FundingOps is not available yet — the production engine only stores CreditOps departments.",
    );
  },
};

const store = createOpsClientStore<FundingClient, FundingDepartmentStatus>({
  seedClients: seedFundingClients,
  seedDepartmentStatuses: seedFundingDepartmentStatuses,
  activityEntityType: "funding_client",
  activityIdPrefix: "fact",
  clientIdPrefix: "ffc",
  queryKey: "fundingops",
  live,
});

export const FundingOpsStoreProvider = store.Provider;
export const useFundingOpsStore = store.useStore;
export const setFundingStatusChangeHandler = store.setStatusChangeHandler;
