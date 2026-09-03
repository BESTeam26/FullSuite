/**
 * CreditOps fulfillment data layer — Supabase ⇄ domain `FulfillmentClient`.
 *
 * All reads are RLS-scoped: agency staff see every client, an organization's
 * members see only their own. Outsourcing-only clients belong to a BES contract
 * rather than a customer organization, so only agency staff see those.
 *
 * The ONE EMAIL = ONE FILE PER PARTNER rule is enforced by a unique index in
 * the database. `checkAddConflict` below reports a collision *before* writing so
 * the interface can ask for a decision; the index is the backstop that holds
 * even if something bypasses the interface entirely.
 */

import { requireSupabase } from "@/lib/supabase/client";
import type {
  Enums,
  Tables,
  TablesInsert,
} from "@/lib/supabase/database.types";
import type {
  FulfillmentClient,
  FulfillmentClientRound,
  FulfillmentClientStatus,
} from "@/lib/fulfillment/fulfillment-client-domain";
import type { DepartmentStatus } from "@/lib/fulfillment/creditops-store-types";
import type { OutsourcingGroup } from "@/lib/fulfillment/ops-client-domain";
import type { ClientConflictResult } from "@/lib/fulfillment/ops-client-domain";
import { normalizeEmail } from "@/lib/fulfillment/ops-client-domain";

type ClientRow = Tables<"fulfillment_clients"> & {
  organizations: { name: string } | null;
  outsourcing_groups: { name: string } | null;
  assigned_agent: { full_name: string | null; email: string } | null;
};

/**
 * One bounded request. Partner names and the assignee come back with the row
 * rather than as per-client follow-ups (rule 14: no N+1).
 */
const CLIENT_SELECT = `
  *,
  organizations(name),
  outsourcing_groups(name),
  assigned_agent:profiles!fulfillment_clients_assigned_agent_id_fkey(full_name, email)
`;

/** Hours until the SLA deadline, to one decimal. Undefined when no deadline. */
const hoursUntil = (dueAt: string | null): number | undefined => {
  if (!dueAt) return undefined;
  return (
    Math.round(((new Date(dueAt).getTime() - Date.now()) / 3_600_000) * 10) / 10
  );
};

const relativeTime = (iso: string): string => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
};

export function mapClientRow(row: ClientRow): FulfillmentClient {
  const agentName =
    row.assigned_agent?.full_name?.trim() || row.assigned_agent?.email;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? undefined,
    mode: row.mode,
    organizationId: row.organization_id ?? undefined,
    organizationName: row.organizations?.name ?? undefined,
    outsourcingGroupId: row.outsourcing_group_id ?? undefined,
    outsourcingGroupName: row.outsourcing_groups?.name ?? undefined,
    autoSync: row.auto_sync,
    status: row.status as FulfillmentClientStatus,
    round: row.round as FulfillmentClientRound,
    assignedAgent: agentName ?? undefined,
    openItems: row.open_items,
    slaHoursRemaining: hoursUntil(row.due_at),
    lastActivity: relativeTime(row.last_activity_at),
    createdAt: row.created_at.slice(0, 10),
  };
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export async function fetchFulfillmentClients(): Promise<FulfillmentClient[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("fulfillment_clients")
    .select(CLIENT_SELECT)
    .order("name");
  if (error) throw error;
  return ((data ?? []) as unknown as ClientRow[]).map(mapClientRow);
}

export async function fetchOutsourcingGroups(): Promise<OutsourcingGroup[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("outsourcing_groups")
    .select("*, fulfillment_clients(count)")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((g) => {
    const counted = g as typeof g & {
      fulfillment_clients: { count: number }[] | null;
    };
    return {
      id: g.id,
      name: g.name,
      partnerName: g.partner_name,
      contactEmail: g.contact_email,
      contractRef: g.contract_ref ?? undefined,
      clientCount: counted.fulfillment_clients?.[0]?.count ?? 0,
      status: g.status,
      createdAt: g.created_at.slice(0, 10),
    };
  });
}

/** Department statuses for ONE client — loaded when a file is opened, not with the list. */
export async function fetchDepartmentStatuses(
  clientId: string,
): Promise<DepartmentStatus[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("client_department_statuses")
    .select("*, assignee:profiles(full_name, email)")
    .eq("client_id", clientId);
  if (error) throw error;
  return (data ?? []).map((d) => {
    const withAgent = d as typeof d & {
      assignee: { full_name: string | null; email: string } | null;
    };
    return {
      department: d.department as DepartmentStatus["department"],
      status: d.status,
      assignee:
        withAgent.assignee?.full_name?.trim() ||
        withAgent.assignee?.email ||
        "Unassigned",
      updatedAt: d.updated_at,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Identity check — reports, never writes                              */
/* ------------------------------------------------------------------ */

/**
 * What would adding this email to this partner collide with?
 *
 * Scoped server-side: one query returns only rows sharing the email, and the
 * caller's RLS still applies, so this cannot be used to probe clients the user
 * is not entitled to see.
 */
export async function checkAddConflict(
  email: string,
  scopeId: string,
): Promise<ClientConflictResult<FulfillmentClient>> {
  const sb = requireSupabase();
  const normalized = normalizeEmail(email);
  if (!normalized) return { crossScopeMatches: [] };

  const { data, error } = await sb
    .from("fulfillment_clients")
    .select(CLIENT_SELECT)
    .ilike("email", normalized);
  if (error) throw error;

  const matches = ((data ?? []) as unknown as ClientRow[]).map(mapClientRow);
  const scopeOf = (c: FulfillmentClient) =>
    c.organizationId ?? c.outsourcingGroupId ?? "";
  return {
    sameScopeDuplicate: matches.find((c) => scopeOf(c) === scopeId),
    crossScopeMatches: matches.filter((c) => scopeOf(c) !== scopeId),
  };
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

/**
 * The signed-in user's id, for columns that record who acted.
 *
 * Never substitute another id here. `created_by` and `employee_id` reference
 * profiles, so an agency id or a client id would either violate the foreign key
 * or — worse — attribute the work to the wrong record (rule 4).
 */
async function currentUserId(): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) {
    throw new Error("No signed-in user — cannot attribute this change.");
  }
  return data.user.id;
}

/** Touch last_activity_at alongside any operational change. */
const withActivityStamp = <T extends object>(patch: T) => ({
  ...patch,
  last_activity_at: new Date().toISOString(),
});

export async function updateClientStatus(
  clientId: string,
  status: Enums<"fulfillment_client_status">,
) {
  const sb = requireSupabase();
  const { error } = await sb
    .from("fulfillment_clients")
    .update(withActivityStamp({ status }))
    .eq("id", clientId);
  if (error) throw error;
}

export async function updateClientAssignee(
  clientId: string,
  assignedAgentId: string | null,
) {
  const sb = requireSupabase();
  const { error } = await sb
    .from("fulfillment_clients")
    .update(withActivityStamp({ assigned_agent_id: assignedAgentId }))
    .eq("id", clientId);
  if (error) throw error;
}

export async function updateClientContact(
  clientId: string,
  field: "email" | "phone",
  value: string,
) {
  const sb = requireSupabase();
  // Written out rather than computed so the column stays a known key.
  const patch =
    field === "email"
      ? withActivityStamp({ email: value })
      : withActivityStamp({ phone: value });
  const { error } = await sb
    .from("fulfillment_clients")
    .update(patch)
    .eq("id", clientId);
  if (error) throw error;
}

export interface CreateFulfillmentClientInput {
  agencyId: string;
  name: string;
  email: string;
  phone?: string;
  mode: Enums<"fulfillment_mode">;
  organizationId?: string;
  outsourcingGroupId?: string;
  autoSync: boolean;
  status: Enums<"fulfillment_client_status">;
  round: Enums<"fulfillment_round">;
  assignedAgentId?: string | null;
}

/**
 * Create a client. The unique index still guards the same-partner duplicate, so
 * a collision that slips past the pre-check surfaces as a clear error rather
 * than a second file.
 */
export async function createFulfillmentClient(
  input: CreateFulfillmentClientInput,
): Promise<string> {
  const sb = requireSupabase();
  const row: TablesInsert<"fulfillment_clients"> = {
    agency_id: input.agencyId,
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
    mode: input.mode,
    organization_id: input.organizationId ?? null,
    outsourcing_group_id: input.outsourcingGroupId ?? null,
    auto_sync: input.autoSync,
    status: input.status,
    round: input.round,
    assigned_agent_id: input.assignedAgentId ?? null,
    created_by: await currentUserId(),
  };
  const { data, error } = await sb
    .from("fulfillment_clients")
    .insert(row)
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error(
        "This email already exists on this partner. One email = one file per partner.",
      );
    }
    throw error;
  }
  return data.id;
}

/* ------------------------------------------------------------------ */
/* Production logs — one row per unit of work completed                */
/* ------------------------------------------------------------------ */

export interface LogProductionInput {
  agencyId: string;
  clientId: string;
  organizationId?: string;
  outsourcingGroupId?: string;
  department: Enums<"fulfillment_department">;
  productionUnitType: string;
  actions: string[];
  workNotes?: string;
}

export async function logProduction(input: LogProductionInput) {
  const sb = requireSupabase();
  const { error } = await sb.from("production_logs").insert({
    agency_id: input.agencyId,
    employee_id: await currentUserId(),
    client_id: input.clientId,
    organization_id: input.organizationId ?? null,
    outsourcing_group_id: input.outsourcingGroupId ?? null,
    division_id: "creditops",
    department: input.department,
    production_unit_type: input.productionUnitType,
    production_unit_quantity: 1,
    actions: input.actions,
    work_notes: input.workNotes ?? null,
    work_date: new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Webhook deliveries — the outbound CRM signal log                    */
/* ------------------------------------------------------------------ */

/**
 * The most recent outbound signals, newest first.
 *
 * Bounded deliberately: this is a log that grows forever, and the panel only
 * ever shows a recent window (rule 14 — never fetch a whole tenant dataset to
 * fill one screen).
 */
export async function fetchWebhookDeliveries(limit = 200) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("webhook_deliveries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function recordWebhookDelivery(input: {
  agencyId: string;
  endpointId?: string;
  endpointName: string;
  clientId?: string;
  clientName: string;
  partnerName: string;
  previousStatus?: string;
  newStatus: string;
  status: Enums<"webhook_delivery_status">;
  message?: string;
}) {
  const sb = requireSupabase();
  const { error } = await sb.from("webhook_deliveries").insert({
    agency_id: input.agencyId,
    endpoint_id: input.endpointId ?? null,
    endpoint_name: input.endpointName,
    client_id: input.clientId ?? null,
    client_name: input.clientName,
    partner_name: input.partnerName,
    previous_status: input.previousStatus ?? null,
    new_status: input.newStatus,
    status: input.status,
    message: input.message ?? null,
  });
  if (error) throw error;
}
