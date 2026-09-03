/**
 * FundingOps Client Store — the shared ops client store, bound to FundingOps.
 *
 * This is the SINGLE source of truth for the FundingOps fulfillment workspace:
 * the client list, every stage queue and the Client Work workspace all read from
 * and write to it. Behaviour lives in createOpsClientStore; this file supplies
 * the FundingOps seed data, stage seeding and id prefixes.
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
  type StatusChangeHandler as OpsStatusChangeHandler,
} from "@/lib/fulfillment/ops-client-store";

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

const store = createOpsClientStore<FundingClient, FundingDepartmentStatus>({
  seedClients: seedFundingClients,
  seedDepartmentStatuses: seedFundingDepartmentStatuses,
  activityIdPrefix: "fact",
  clientIdPrefix: "ffc",
  queryKey: "fundingops",
  /* No `live` backend: FundingOps has no tables yet, so this division stays on
     seed data even when the app is in live mode. Phase 5 supplies one. */
});

export const FundingOpsStoreProvider = store.Provider;
export const useFundingOpsStore = store.useStore;
export const setFundingStatusChangeHandler = store.setStatusChangeHandler;
