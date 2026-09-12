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
import type { ClientLifecycle } from "@/lib/fulfillment/fulfillment-client-domain";
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
  assigned_agent_id,
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
    lifecycle: (row.lifecycle ?? "active") as ClientLifecycle,
    archivedAt: row.archived_at ?? null,
    assignedAgent: agentName ?? undefined,
    teamId: row.team_id ?? undefined,
    openItems: row.open_items,
    slaHoursRemaining: hoursUntil(row.due_at),
    processedOn: (row as { processed_on?: string | null }).processed_on ?? null,
    assignedAgentId: (row as { assigned_agent_id?: string | null }).assigned_agent_id ?? null,
    description: (row as { description?: string | null }).description ?? null,
    descriptionBody: (row as { description_body?: unknown }).description_body ?? null,
    nextAction: (row as { next_action?: string | null }).next_action ?? null,
    dueAt: row.due_at ?? null,
    lastActivity: relativeTime(row.last_activity_at),
    createdAt: row.created_at.slice(0, 10),
  };
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/**
 * The active client list.
 *
 * Excludes archived files. A partner whose fulfilment service was cancelled
 * keeps every client record it ever had — the cascade sets `archived_at`, which
 * takes them out of the working queues without touching their status, history,
 * letters or activity. Historical review reads them by id, which does not
 * filter (see `fetchFulfillmentClient`).
 */
export async function fetchFulfillmentClients(): Promise<FulfillmentClient[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("fulfillment_clients")
    .select(CLIENT_SELECT)
    .is("archived_at", null)
    .eq("is_fixture", false)
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
/**
 * Department rows for MANY clients in one bounded query — for the operational
 * client list (current department, work status, open work). Never one query
 * per row (rule 14). Returns a map keyed by client id.
 */
export async function fetchDepartmentStatusesForClients(
  clientIds: readonly string[],
): Promise<Record<string, DepartmentStatus[]>> {
  if (clientIds.length === 0) return {};
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("client_department_statuses")
    .select("*, assignee:profiles!client_department_statuses_assignee_id_fkey(full_name, email)")
    .in("client_id", [...clientIds]);
  if (error) throw error;
  const out: Record<string, DepartmentStatus[]> = {};
  for (const d of data ?? []) {
    const withAgent = d as typeof d & { assignee: { full_name: string | null; email: string } | null };
    (out[d.client_id] ??= []).push({
      department: d.department as DepartmentStatus["department"],
      status: d.status,
      assignee: withAgent.assignee?.full_name?.trim() || withAgent.assignee?.email || "Unassigned",
      assigneeId: d.assignee_id ?? null,
      updatedAt: d.updated_at,
    });
  }
  return out;
}

export async function fetchDepartmentStatuses(
  clientId: string,
): Promise<DepartmentStatus[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("client_department_statuses")
    .select("*, assignee:profiles!client_department_statuses_assignee_id_fkey(full_name, email)")
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
      assigneeId: d.assignee_id ?? null,
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
  /* Deliberately a server call, and deliberately still here.
     `created_by` is the one actor column NO policy constrains — there is no
     `created_by = auth.uid()` check anywhere — so a client-supplied value could
     forge who created a record (rules 4 and 10). `employee_id` on
     production_logs IS constrained, which is why that path could stop asking.
     Do not "optimize" this one away without first giving the column a
     `default auth.uid()` and a matching check. */
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

/**
 * Writes return the updated row.
 *
 * `.select()` costs nothing extra — PostgREST returns it from the same
 * statement — and it is what lets the caller patch one row into the cached
 * list instead of refetching all seventeen to see one field change (rule 14).
 * It also means the interface renders what the database actually stored,
 * triggers and all, rather than what the client hoped it would store.
 */
export async function updateClientStatus(
  clientId: string,
  status: Enums<"fulfillment_client_status">,
): Promise<FulfillmentClient> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("fulfillment_clients")
    .update(withActivityStamp({ status }))
    .eq("id", clientId)
    .select(CLIENT_SELECT)
    .single();
  if (error) throw error;
  return mapClientRow(data as unknown as ClientRow);
}

export async function updateClientAssignee(
  clientId: string,
  assignedAgentId: string | null,
): Promise<FulfillmentClient> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("fulfillment_clients")
    .update(withActivityStamp({ assigned_agent_id: assignedAgentId }))
    .eq("id", clientId)
    .select(CLIENT_SELECT)
    .single();
  if (error) throw error;
  return mapClientRow(data as unknown as ClientRow);
}

/**
 * The dispute round the file is on.
 *
 * A plain field, deliberately: the round is what BES says it is, and there is
 * no arithmetic that could derive it. `updateClientStatus` owns the credit
 * status; this owns the round; neither reaches into the other.
 */
export async function updateClientRound(
  clientId: string,
  round: Enums<"fulfillment_round">,
): Promise<FulfillmentClient> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("fulfillment_clients")
    .update(withActivityStamp({ round }))
    .eq("id", clientId)
    .select(CLIENT_SELECT)
    .single();
  if (error) throw error;
  return mapClientRow(data as unknown as ClientRow);
}

export async function updateClientContact(
  clientId: string,
  field: "email" | "phone",
  value: string,
): Promise<FulfillmentClient> {
  const sb = requireSupabase();
  // Written out rather than computed so the column stays a known key.
  const patch =
    field === "email"
      ? withActivityStamp({ email: value })
      : withActivityStamp({ phone: value });
  const { data, error } = await sb
    .from("fulfillment_clients")
    .update(patch)
    .eq("id", clientId)
    .select(CLIENT_SELECT)
    .single();
  if (error) throw error;
  return mapClientRow(data as unknown as ClientRow);
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
  /**
   * Owning team. Creation is a ceiling act (migration 0023): a team-scoped user
   * may only create inside a team their scope reaches, so the intake form must
   * choose one. Agency- and division-scoped users may leave it unset.
   */
  teamId?: string | null;
}

/**
 * Create a client. The unique index still guards the same-partner duplicate, so
 * a collision that slips past the pre-check surfaces as a clear error rather
 * than a second file.
 */
/**
 * `client_id` is supplied by the database, not by us: a BEFORE INSERT trigger
 * (0094) resolves or creates the canonical client from this row's own partner
 * and email, so a caller never has to know about clients to record one. The
 * column is NOT NULL — a case with no person should not exist — which is why
 * the generated type asks for it and this one does not.
 */
type FulfillmentClientsInsert = Omit<TablesInsert<"fulfillment_clients">, "client_id">;
/* The cast at the insert says the same thing to the compiler: the column is
   required in the row and supplied by the trigger, not by this caller. */

export async function createFulfillmentClient(
  input: CreateFulfillmentClientInput,
): Promise<string> {
  const sb = requireSupabase();
  const row: FulfillmentClientsInsert = {
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
    team_id: input.teamId ?? null,
    created_by: await currentUserId(),
  };
  const { data, error } = await sb
    .from("fulfillment_clients")
    .insert(row as TablesInsert<"fulfillment_clients">)
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

/* Production moved to lib/data/production.ts — one canonical, service-aware path. */

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

/**
 * Set one department's work status (and optional assignee) on a client. The
 * database function validates the status against the department's vocabulary,
 * upserts the row and writes the activity event in one transaction, as the
 * caller — policies decide who may (separation step 1).
 */
export async function setClientDepartmentStatus(input: {
  clientId: string;
  department: Enums<"fulfillment_department">;
  status: string;
  assigneeId?: string | null;
  note?: string | null;
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_client_department_status", {
    p_client: input.clientId,
    p_department: input.department,
    p_status: input.status,
    p_assignee: input.assigneeId ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw error;
}

/** Archive / reactivate / complete / graduate — a lifecycle transition with its activity event, never a delete. */
export async function setClientLifecycle(input: { clientId: string; lifecycle: ClientLifecycle; reason?: string | null }): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_client_lifecycle", { p_client: input.clientId, p_lifecycle: input.lifecycle, p_reason: input.reason ?? null });
  if (error) throw error;
}

/**
 * Hand a file to several departments at once.
 *
 * The plan is worked out first (`planHandoffs`) so a department already
 * mid-way through is left alone rather than reset — re-sending a file to
 * Bureau Calling must not knock it back to BC NEEDED and lose where it had
 * got to.
 *
 * Sequential rather than parallel on purpose: each write is its own RPC with
 * its own activity event, and firing them together would interleave the
 * timeline entries into an order that does not read as one action.
 *
 * Returns what actually happened, so the screen can say "opened Bureau
 * Calling; Complaints was already working it" instead of claiming success.
 */
/**
 * Hand off to one or more departments, in ONE transaction.
 *
 * ── WHY THIS IS AN RPC AND NOT A LOOP ──────────────────────────────────────
 *
 * It used to call `setClientDepartmentStatus` once per destination from the
 * browser. Two things were wrong with that, and only the louder one was the
 * RLS bug (0211):
 *
 *   · it was not atomic. Complaints could open, Bureau Calling be refused,
 *     and the operator be left with a half-done handoff and no clear account
 *     of it (Dee, §5);
 *   · "is this already open" was decided from a snapshot the browser read
 *     earlier — a check-then-write race with anybody else on the same file.
 *
 * `planHandoffs` still decides which status each department is ENTERED at.
 * That rule is tested and there is exactly one copy of it (§4: no second
 * handoff engine). The database validates every status it is handed, decides
 * "already open" inside the transaction, and reports what it actually did —
 * so the interface can only claim what happened (§30).
 */
export async function handOffToDepartments(input: {
  clientId: string;
  from: Enums<"fulfillment_department"> | null;
  targets: Enums<"fulfillment_department">[];
  rows: readonly { department: string; status: string; updatedAt: string }[];
  note?: string | null;
}): Promise<{ opened: string[]; alreadyOpen: string[]; refused: string[] }> {
  const { planHandoffs } = await import("@/lib/fulfillment/department-domain");
  const plan = planHandoffs(
    input.from as never,
    input.targets as never,
    input.rows as never,
  );

  /* Nothing legal to do. Say so rather than calling the database to be told. */
  if (plan.opening.length === 0) {
    return {
      opened: [],
      alreadyOpen: plan.alreadyOpen.map((o) => o.department),
      refused: plan.refused.map((r) => r.department),
    };
  }

  const sb = requireSupabase();
  const { data, error } = await sb.rpc("handoff_client_departments", {
    p_client: input.clientId,
    p_from: input.from as Enums<"fulfillment_department">,
    p_targets: plan.opening.map((o) => o.department) as Enums<"fulfillment_department">[],
    p_statuses: plan.opening.map((o) => o.entryStatus),
    p_note: [
      input.from ? `Handed off from ${input.from}` : "Handed off",
      input.note?.trim() || null,
    ].filter(Boolean).join(" — "),
  });
  if (error) throw error;

  const result = (data ?? {}) as { opened?: string[]; alreadyOpen?: string[] };
  return {
    /* What the DATABASE says it opened, not what the plan hoped to open. */
    opened: result.opened ?? [],
    alreadyOpen: [
      ...plan.alreadyOpen.map((o) => o.department),
      ...(result.alreadyOpen ?? []),
    ].filter((d, i, all) => all.indexOf(d) === i),
    refused: plan.refused.map((r) => r.department),
  };
}

/**
 * Edit one field of a client from the list, spreadsheet-style.
 *
 * The activity entry is written by the database trigger on
 * `fulfillment_clients`, never here — a screen that logs its own changes is a
 * screen that can log a change it failed to make.
 *
 * `due_at` is deliberately NOT writable here. Since the SLA engine it is a
 * DERIVED column — the earliest of the client's open department deadlines,
 * rewritten by the database whenever work moves — so a value typed into it
 * survives only until the next status change. Adjusting a deadline goes
 * through `set_department_due_override`, which keeps the calculated date
 * beside the override and records the reason.
 */
export async function updateClientField(input: {
  clientId: string;
  round?: Enums<"fulfillment_round">;
  processedOn?: string | null;
  /** The standing working description and the one-line next action (0212). */
  description?: string | null;
  /**
   * The same notes as a document, so an @mention is a node carrying a user id
   * and the database can tell exactly who was named. Written together with
   * `description`, which stays the plain-text mirror (2026-09-12).
   */
  descriptionBody?: unknown;
  nextAction?: string | null;
}): Promise<void> {
  const sb = requireSupabase();
  const row: Record<string, unknown> = {};
  if (input.round !== undefined) row.round = input.round;
  if (input.description !== undefined) row.description = input.description?.trim() || null;
  if (input.descriptionBody !== undefined) row.description_body = input.descriptionBody ?? null;
  if (input.nextAction !== undefined) row.next_action = input.nextAction?.trim() || null;
  if (input.processedOn !== undefined) row.processed_on = input.processedOn;
  if (Object.keys(row).length === 0) return;
  const { error } = await sb
    .from("fulfillment_clients").update(withActivityStamp(row) as never).eq("id", input.clientId);
  if (error) throw error;
}
