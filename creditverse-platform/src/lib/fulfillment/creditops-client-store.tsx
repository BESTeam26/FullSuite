/**
 * CreditOps Client Store — the shared ops client store, bound to CreditOps.
 *
 * This is the SINGLE source of truth for the CreditOps fulfillment workspace:
 * the Main Client List, every Queue and the Client Work workspace all read from
 * and write to it. Behaviour lives in createOpsClientStore; this file supplies
 * the CreditOps seed data, department seeding and id prefixes.
 */

import { seedFulfillmentClients } from "@/lib/fulfillment/fulfillment-client-seed";
import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import {
  type ActivityEntry,
  type DepartmentStatus,
  type CommentMark,
  COMMENT_MARKS,
  getMark,
  seedDepartmentStatuses,
} from "@/lib/fulfillment/creditops-store-types";
import {
  createOpsClientStore,
  type AddClientOutcome as OpsAddClientOutcome,
  type StatusChangeHandler as OpsStatusChangeHandler,
} from "@/lib/fulfillment/ops-client-store";

export type StatusChangeHandler = OpsStatusChangeHandler;
export type AddClientOutcome = OpsAddClientOutcome<FulfillmentClient>;
export type { ActivityEntry, DepartmentStatus, CommentMark };
export { COMMENT_MARKS, getMark };

/* Eligible assignees — scoped, NOT the entire agency directory.
   In a real backend this is derived from Partner + Team + Department + permission scope. */
export const ELIGIBLE_ASSIGNEES = [
  "Keila Betancourt",
  "Carlos Mendoza",
  "Maria Santos",
  "James Wilson",
  "Unassigned",
];

const store = createOpsClientStore<FulfillmentClient, DepartmentStatus>({
  seedClients: seedFulfillmentClients,
  seedDepartmentStatuses,
  activityIdPrefix: "act",
  clientIdPrefix: "fc",
});

export const CreditOpsStoreProvider = store.Provider;
export const useCreditOpsStore = store.useStore;
export const setStatusChangeHandler = store.setStatusChangeHandler;
