/**
 * FundingOps data layer — Supabase ⇄ domain `FundingClient` / file / deal.
 *
 * Deliberately shaped like `fulfillment-clients.ts`. Same partner scoping, same
 * one-email-per-partner rule enforced by a unique index, same "check before you
 * write" conflict report. A reader who knows the CreditOps file knows this one.
 *
 * All reads are RLS-scoped: agency staff see every client, an organization's
 * members see only their own, and outsourcing-only clients belong to a BES
 * contract so only agency staff see those.
 */

import { requireSupabase } from "@/lib/supabase/client";
import type {
  Enums,
  Tables,
  TablesInsert,
} from "@/lib/supabase/database.types";
import type {
  FundingBusiness,
  FundingClient,
  FundingClientStatus,
  FundingDeal,
  FundingFile,
  FundingProvenance,
} from "@/lib/fulfillment/fundingops-domain";
import type { FundingDepartmentStatus } from "@/lib/fulfillment/fundingops-store-types";
import type { ClientConflictResult } from "@/lib/fulfillment/ops-client-domain";
import { normalizeEmail } from "@/lib/fulfillment/ops-client-domain";

type ClientRow = Tables<"funding_clients"> & {
  organizations: { name: string } | null;
  outsourcing_groups: { name: string } | null;
  assigned_agent: { full_name: string | null; email: string } | null;
  funding_files: { count: number }[] | null;
};

/**
 * One bounded request. Partner names, the assignee and the open-file count come
 * back with the row rather than as per-client follow-ups (rule 14: no N+1).
 * Two foreign keys point at `profiles`, so the assignee needs an explicit hint.
 */
const CLIENT_SELECT = `
  *,
  organizations(name),
  outsourcing_groups(name),
  assigned_agent:profiles!funding_clients_assigned_agent_id_fkey(full_name, email),
  funding_files(count)
`;

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

export function mapFundingClientRow(row: ClientRow): FundingClient {
  const agentName =
    row.assigned_agent?.full_name?.trim() || row.assigned_agent?.email;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? undefined,
    mode: row.mode,
    provenance: row.provenance as FundingProvenance,
    organizationId: row.organization_id ?? undefined,
    organizationName: row.organizations?.name ?? undefined,
    outsourcingGroupId: row.outsourcing_group_id ?? undefined,
    fulfillmentClientId: row.fulfillment_client_id ?? null,
    lifecycle: (row.lifecycle ?? "active") as FundingClient["lifecycle"],
    archivedAt: row.archived_at ?? null,
    outsourcingGroupName: row.outsourcing_groups?.name ?? undefined,
    autoSync: row.auto_sync,
    status: row.status as FundingClientStatus,
    assignedAgent: agentName ?? undefined,
    teamId: row.team_id ?? undefined,
    openFiles: row.funding_files?.[0]?.count ?? 0,
    slaHoursRemaining: hoursUntil(row.due_at),
    lastActivity: relativeTime(row.last_activity_at),
    createdAt: row.created_at.slice(0, 10),
  };
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export async function fetchFundingClients(): Promise<FundingClient[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("funding_clients")
    .select(CLIENT_SELECT)
    .order("name");
  if (error) throw error;
  return ((data ?? []) as unknown as ClientRow[]).map(mapFundingClientRow);
}

/**
 * Department rows for MANY funding clients in one bounded query — for the
 * operational client list (current department, work status, open work).
 */
export async function fetchFundingDepartmentStatusesForClients(
  clientIds: readonly string[],
): Promise<Record<string, FundingDepartmentStatus[]>> {
  if (clientIds.length === 0) return {};
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("funding_department_statuses")
    .select("*, assignee:profiles(full_name, email)")
    .in("client_id", [...clientIds]);
  if (error) throw error;
  const out: Record<string, FundingDepartmentStatus[]> = {};
  for (const d of data ?? []) {
    const withAgent = d as typeof d & { assignee: { full_name: string | null; email: string } | null };
    (out[d.client_id] ??= []).push({
      department: d.department as FundingDepartmentStatus["department"],
      status: d.status,
      fileId: d.file_id ?? null,
      assigneeId: d.assignee_id ?? null,
      assignee: withAgent.assignee?.full_name?.trim() || withAgent.assignee?.email || "Unassigned",
      updatedAt: d.updated_at,
    });
  }
  return out;
}

/** Stage statuses for ONE client — loaded when a file is opened, not with the list. */
export async function fetchFundingDepartmentStatuses(
  clientId: string,
): Promise<FundingDepartmentStatus[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("funding_department_statuses")
    .select("*, assignee:profiles(full_name, email)")
    .eq("client_id", clientId);
  if (error) throw error;
  return (data ?? []).map((d) => {
    const withAgent = d as typeof d & {
      assignee: { full_name: string | null; email: string } | null;
    };
    return {
      department: d.department as FundingDepartmentStatus["department"],
      status: d.status,
      fileId: d.file_id ?? null,
      assigneeId: d.assignee_id ?? null,
      assignee:
        withAgent.assignee?.full_name?.trim() ||
        withAgent.assignee?.email ||
        "Unassigned",
      updatedAt: d.updated_at,
    };
  });
}

export async function fetchFundingBusinesses(
  clientId: string,
): Promise<FundingBusiness[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("funding_businesses")
    .select("*")
    .eq("client_id", clientId)
    .order("legal_name");
  if (error) throw error;
  return (data ?? []).map((b) => ({
    id: b.id,
    clientId: b.client_id,
    legalName: b.legal_name,
    dba: b.dba ?? undefined,
    industry: b.industry ?? "—",
    // Last 4 only — the full identifier is never stored or shown (rule 1).
    ein: b.ein_last4 ? `••-•••${b.ein_last4}` : undefined,
    annualRevenue: b.annual_revenue ? String(b.annual_revenue) : undefined,
    timeInBusiness:
      b.time_in_business_months != null
        ? `${b.time_in_business_months} months`
        : undefined,
  }));
}

/** Files for one client, with their business name and deal count embedded. */
export async function fetchFundingFiles(
  clientId: string,
): Promise<FundingFile[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("funding_files")
    .select(
      "*, funding_businesses(legal_name), funding_clients(name), funding_deals(count), assigned_agent:profiles!funding_files_assigned_agent_id_fkey(full_name, email)",
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((f) => {
    const r = f as typeof f & {
      funding_businesses: { legal_name: string } | null;
      funding_clients: { name: string } | null;
      funding_deals: { count: number }[] | null;
      assigned_agent: { full_name: string | null; email: string } | null;
    };
    return {
      id: f.id,
      publicId: f.public_id,
      clientId: f.client_id,
      clientName: r.funding_clients?.name ?? undefined,
      businessId: f.business_id,
      businessName: r.funding_businesses?.legal_name ?? "—",
      purpose: f.purpose,
      requestedAmount: Number(f.requested_amount),
      stage: f.stage as FundingFile["stage"],
      secondaryStatus: f.secondary_status as FundingFile["secondaryStatus"],
      waitingOn: f.waiting_on as FundingFile["waitingOn"],
      assignedAgent:
        r.assigned_agent?.full_name?.trim() || r.assigned_agent?.email,
      dealCount: r.funding_deals?.[0]?.count ?? 0,
      slaHoursRemaining: hoursUntil(f.due_at),
      lastActivity: relativeTime(f.last_activity_at),
      createdAt: f.created_at.slice(0, 10),
    };
  });
}

/**
 * Every funding file in the division, for the Deal List's business-name lookup
 * and the stage queues.
 *
 * One bounded request rather than a lookup per deal (rule 14). This table is
 * small by nature — one row per funding cycle — and the list screen needs the
 * whole set to group by stage.
 */
export async function fetchAllFundingFiles(): Promise<FundingFile[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("funding_files")
    .select("*, funding_businesses(legal_name), funding_clients(name), funding_deals(count)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((f) => {
    const r = f as typeof f & {
      funding_businesses: { legal_name: string } | null;
      funding_clients: { name: string } | null;
      funding_deals: { count: number }[] | null;
    };
    return {
      id: f.id,
      publicId: f.public_id,
      clientId: f.client_id,
      clientName: r.funding_clients?.name ?? undefined,
      businessId: f.business_id,
      businessName: r.funding_businesses?.legal_name ?? "—",
      purpose: f.purpose,
      requestedAmount: Number(f.requested_amount),
      stage: f.stage as FundingFile["stage"],
      secondaryStatus: f.secondary_status as FundingFile["secondaryStatus"],
      waitingOn: f.waiting_on as FundingFile["waitingOn"],
      dealCount: r.funding_deals?.[0]?.count ?? 0,
      slaHoursRemaining: hoursUntil(f.due_at),
      lastActivity: relativeTime(f.last_activity_at),
      createdAt: f.created_at.slice(0, 10),
    };
  });
}

const mapDealRow = (d: Tables<"funding_deals"> & { funding_files?: { public_id: string } | null }): FundingDeal => ({
  id: d.id,
  fileId: d.file_id,
  filePublicId: d.funding_files?.public_id,
  clientId: d.client_id,
  lender: d.lender,
  program: d.program ?? "—",
  amount: Number(d.amount),
  rate: d.rate ?? undefined,
  term: d.term ?? undefined,
  status: d.status as FundingDeal["status"],
  stipsOutstanding: d.stips_outstanding,
  submittedAt: d.submitted_at ?? d.created_at,
  fundedDate: d.funded_at ?? undefined,
});

/** Every deal in the division — what the global Deal List renders. */
export async function fetchAllFundingDeals(): Promise<FundingDeal[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("funding_deals")
    .select("*, funding_files(public_id)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapDealRow);
}

export async function fetchFundingDeals(
  fileId: string,
): Promise<FundingDeal[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("funding_deals")
    .select("*, funding_files(public_id)")
    .eq("file_id", fileId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapDealRow);
}

/* ------------------------------------------------------------------ */
/* Identity checks — report, never write                               */
/* ------------------------------------------------------------------ */

export async function checkFundingAddConflict(
  email: string,
  scopeId: string,
): Promise<ClientConflictResult<FundingClient>> {
  const sb = requireSupabase();
  const normalized = normalizeEmail(email);
  if (!normalized) return { crossScopeMatches: [] };

  const { data, error } = await sb
    .from("funding_clients")
    .select(CLIENT_SELECT)
    .ilike("email", normalized);
  if (error) throw error;

  const matches = ((data ?? []) as unknown as ClientRow[]).map(
    mapFundingClientRow,
  );
  const scopeOf = (c: FundingClient) =>
    c.organizationId ?? c.outsourcingGroupId ?? "";
  return {
    sameScopeDuplicate: matches.find((c) => scopeOf(c) === scopeId),
    crossScopeMatches: matches.filter((c) => scopeOf(c) !== scopeId),
  };
}

export interface CrossDivisionMatch {
  division: "creditops" | "fundingops";
  clientId: string;
  clientName: string;
  status: string;
}

/**
 * Does this person already exist in the OTHER division?
 *
 * Rule 2: a human should not silently become two unrelated records because two
 * divisions happened to intake them. This surfaces the other record so intake
 * can link rather than fork. RLS still applies inside the function, so it
 * cannot be used to discover clients outside the caller's scope.
 */
export async function findClientAcrossDivisions(
  email: string,
  scopeId?: string,
): Promise<CrossDivisionMatch[]> {
  const sb = requireSupabase();
  const normalized = normalizeEmail(email);
  if (!normalized) return [];
  // `undefined` is dropped from the JSON body, which makes PostgREST look for a
  // one-argument overload that does not exist. NULL is what "any partner" means
  // to the function, so it has to travel as an explicit null.
  const { data, error } = await sb.rpc("find_client_across_divisions", {
    p_email: normalized,
    p_scope: scopeId ?? null,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    division: r.division as CrossDivisionMatch["division"],
    clientId: r.client_id,
    clientName: r.client_name,
    status: r.status,
  }));
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

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

const withActivityStamp = <T extends object>(patch: T) => ({
  ...patch,
  last_activity_at: new Date().toISOString(),
});

/**
 * Writes return the updated row — see the note on the CreditOps equivalent.
 * One statement, one round trip, and the caller can patch the cached list
 * instead of refetching it whole.
 */
export async function updateFundingClientStatus(
  clientId: string,
  status: Enums<"funding_client_status">,
): Promise<FundingClient> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("funding_clients")
    .update(withActivityStamp({ status }))
    .eq("id", clientId)
    .select(CLIENT_SELECT)
    .single();
  if (error) throw error;
  return mapFundingClientRow(data as unknown as ClientRow);
}

export async function updateFundingClientContact(
  clientId: string,
  field: "email" | "phone",
  value: string,
): Promise<FundingClient> {
  const sb = requireSupabase();
  // Written out rather than computed so the column stays a known key.
  const patch =
    field === "email"
      ? withActivityStamp({ email: value })
      : withActivityStamp({ phone: value });
  const { data, error } = await sb
    .from("funding_clients")
    .update(patch)
    .eq("id", clientId)
    .select(CLIENT_SELECT)
    .single();
  if (error) throw error;
  return mapFundingClientRow(data as unknown as ClientRow);
}

export interface CreateFundingClientInput {
  agencyId: string;
  name: string;
  email: string;
  phone?: string;
  mode: Enums<"fulfillment_mode">;
  provenance: Enums<"funding_provenance">;
  organizationId?: string;
  outsourcingGroupId?: string;
  autoSync: boolean;
  status: Enums<"funding_client_status">;
  /** The same person's CreditOps record, when intake found one. */
  fulfillmentClientId?: string;
  /** Owning team; creation is a ceiling act (migration 0023). */
  teamId?: string | null;
}

/**
 * Create a funding client. The unique index still guards the same-partner
 * duplicate, so a collision that slips past the pre-check surfaces as a clear
 * message rather than a second file.
 */
/**
 * `client_id` is supplied by the database, not by us: a BEFORE INSERT trigger
 * (0094) resolves or creates the canonical client from this row's own partner
 * and email, so a caller never has to know about clients to record one. The
 * column is NOT NULL — a case with no person should not exist — which is why
 * the generated type asks for it and this one does not.
 */
type FundingClientsInsert = Omit<TablesInsert<"funding_clients">, "client_id">;
/* The cast at the insert says the same thing to the compiler: the column is
   required in the row and supplied by the trigger, not by this caller. */

export async function createFundingClient(
  input: CreateFundingClientInput,
): Promise<string> {
  const sb = requireSupabase();
  const row: FundingClientsInsert = {
    agency_id: input.agencyId,
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
    mode: input.mode,
    provenance: input.provenance,
    organization_id: input.organizationId ?? null,
    outsourcing_group_id: input.outsourcingGroupId ?? null,
    auto_sync: input.autoSync,
    status: input.status,
    fulfillment_client_id: input.fulfillmentClientId ?? null,
    team_id: input.teamId ?? null,
    created_by: await currentUserId(),
  };
  const { data, error } = await sb
    .from("funding_clients")
    .insert(row as TablesInsert<"funding_clients">)
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

export async function updateFundingDealStatus(
  dealId: string,
  status: Enums<"funding_deal_status">,
) {
  const sb = requireSupabase();
  // The table's check constraint ties Funded to a funded date, so the date is
  // set here rather than left to every caller to remember.
  const { error } = await sb
    .from("funding_deals")
    .update({
      status,
      funded_at: status === "Funded" ? new Date().toISOString() : null,
    })
    .eq("id", dealId);
  if (error) throw error;
}

/**
 * Set one department's work status on a FUNDING FILE (separation step 3). The
 * database function validates the vocabulary, upserts the file-keyed row and
 * writes the activity event in one transaction, as the caller.
 */
export async function setFundingDepartmentStatus(input: {
  fileId: string;
  department: Enums<"funding_department">;
  status: string;
  assigneeId?: string | null;
  note?: string | null;
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_funding_department_status", {
    p_file: input.fileId,
    p_department: input.department,
    p_status: input.status,
    p_assignee: input.assigneeId ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw error;
}
