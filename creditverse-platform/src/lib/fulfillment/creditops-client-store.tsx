/**
 * CreditOps Client Store — the shared ops client store, bound to CreditOps.
 *
 * This is the SINGLE source of truth for the CreditOps fulfillment workspace:
 * the Main Client List, every Queue and the Client Work workspace all read from
 * and write to it.
 *
 * Dual-mode. In live mode it reads and writes `fulfillment_clients` and friends
 * through the data layer; without Supabase credentials it falls back to seed
 * data so the workspace stays explorable. Behaviour lives in
 * createOpsClientStore; this file supplies the CreditOps seed data, department
 * seeding, id prefixes and the live backend.
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
  type OpsClientLiveBackend,
  type StatusChangeHandler as OpsStatusChangeHandler,
} from "@/lib/fulfillment/ops-client-store";
import {
  createFulfillmentClient,
  fetchDepartmentStatuses,
  fetchFulfillmentClients,
  updateClientContact,
  updateClientStatus,
} from "@/lib/data/fulfillment-clients";
import { logProduction } from "@/lib/data/production";
import type { Enums } from "@/lib/supabase/database.types";

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

/**
 * `updateAssignee` is deliberately ABSENT, not stubbed.
 *
 * Assignees are still names rather than profile rows; the scoped assignee
 * picker becomes real in Phase 4 alongside Workforce. A name cannot be resolved
 * to a profile id without guessing, and guessing would attribute work to the
 * wrong person (rule 4: never infer identity from a display name).
 *
 * Omitting the method makes the store report `canAssign: false`, so the
 * interface hides the control instead of offering it and then failing after the
 * click (rule 3).
 */
const live: OpsClientLiveBackend<FulfillmentClient, DepartmentStatus> = {
  fetchClients: fetchFulfillmentClients,
  fetchDepartmentStatuses,
  updateStatus: (clientId, status) =>
    updateClientStatus(clientId, status as Enums<"fulfillment_client_status">),
  updateContact: updateClientContact,
  addClient: (client, agencyId) =>
    createFulfillmentClient({
      agencyId,
      name: client.name,
      email: client.email,
      phone: client.phone,
      mode: client.mode,
      organizationId: client.organizationId,
      outsourcingGroupId: client.outsourcingGroupId,
      autoSync: client.autoSync,
      teamId: client.teamId,
      status: client.status as Enums<"fulfillment_client_status">,
      round: client.round as Enums<"fulfillment_round">,
    }),
  logProduction: async (input, agencyId, employeeId) =>
    logProduction({
      service: "creditops",
      agencyId,
      employeeId,
      requestId: input.requestId,
      fulfillmentClientId: input.clientId,
      departmentKey: input.department,
      unitType: input.department,
      actions: input.actions,
      workNotes: input.workNotes,
    }),
};

const store = createOpsClientStore<FulfillmentClient, DepartmentStatus>({
  seedClients: seedFulfillmentClients,
  seedDepartmentStatuses,
  activityEntityType: "fulfillment_client",
  activityIdPrefix: "act",
  clientIdPrefix: "fc",
  queryKey: "creditops",
  live,
});

export const CreditOpsStoreProvider = store.Provider;
export const useCreditOpsStore = store.useStore;
export const setStatusChangeHandler = store.setStatusChangeHandler;
