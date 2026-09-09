/**
 * The GoHighLevel bridge, from the browser's side.
 *
 * A connection ties one GHL location to one organization. The token and the
 * webhook secret are written once through a database function and are never
 * read back — there is no query here that could return them, because the
 * table they live in grants nothing to any browser role.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface GhlConnection {
  id: string;
  /** NULL = a location seen under the agency credential, not mapped yet. */
  organizationId: string | null;
  /** The BES Partner it belongs to — the usual owner (rule 16 model 3). */
  outsourcingGroupId: string | null;
  /** BES's own house account: its marketing, its leads, not a customer's. */
  agencyOwned: boolean;
  locationId: string;
  label: string | null;
  /** GHL's own name for the location, as the sync found it. */
  name: string | null;
  companyId: string | null;
  status: "connected" | "paused" | "error";
  lastEventAt: string | null;
  discoveredAt: string | null;
  createdAt: string;
}

export interface GhlEvent {
  id: number;
  locationId: string;
  organizationId: string | null;
  eventType: string;
  externalId: string | null;
  receivedAt: string;
  processedAt: string | null;
  outcome: string | null;
}

export async function fetchGhlConnections(): Promise<GhlConnection[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("ghl_connections")
    .select("id, organization_id, outsourcing_group_id, agency_owned, location_id, label, name, company_id, status, last_event_at, discovered_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    outsourcingGroupId: (r as { outsourcing_group_id?: string | null }).outsourcing_group_id ?? null,
    agencyOwned: Boolean((r as { agency_owned?: boolean }).agency_owned),
    locationId: r.location_id,
    label: r.label,
    name: r.name,
    companyId: r.company_id,
    status: r.status as GhlConnection["status"],
    lastEventAt: r.last_event_at,
    discoveredAt: r.discovered_at,
    createdAt: r.created_at,
  }));
}

/** The most recent events, for seeing that something is arriving at all. */
export async function fetchGhlEvents(limit = 20): Promise<GhlEvent[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("ghl_events")
    .select("id, location_id, organization_id, event_type, external_id, received_at, processed_at, outcome")
    .order("received_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: Number(r.id),
    locationId: r.location_id,
    organizationId: r.organization_id,
    eventType: r.event_type,
    externalId: r.external_id,
    receivedAt: r.received_at,
    processedAt: r.processed_at,
    outcome: r.outcome,
  }));
}

export interface ConnectGhlInput {
  organizationId: string;
  locationId: string;
  label: string;
  token: string;
  webhookSecret: string;
}

export async function connectGhlLocation(input: ConnectGhlInput): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("connect_ghl_location", {
    p_org: input.organizationId,
    p_location_id: input.locationId.trim(),
    p_label: input.label.trim(),
    p_token: input.token,
    p_webhook_secret: input.webhookSecret,
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function disconnectGhlLocation(locationId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("disconnect_ghl_location", { p_location_id: locationId });
  if (error) throw error;
}


/* ------------------------------------------------------------------ */
/* The agency credential — one GHL agency, many locations           */
/* ------------------------------------------------------------------ */

export type GhlTokenKind = "private_integration" | "oauth";

/**
 * Connect the agency itself.
 *
 * The token goes straight into a table no browser role can select from, and
 * nothing here can read it back. What the interface may know afterwards is
 * that a credential exists and which company id it names — never its value.
 */
export async function connectGhlAgency(input: {
  companyId: string;
  token: string;
  tokenKind: GhlTokenKind;
  webhookSecret?: string;
  refreshToken?: string;
  expiresAt?: string;
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("connect_ghl_agency", {
    p_company_id: input.companyId,
    p_token: input.token,
    p_token_kind: input.tokenKind,
    p_webhook_secret: input.webhookSecret || undefined,
    p_refresh_token: input.refreshToken || undefined,
    p_expires_at: input.expiresAt || undefined,
  });
  if (error) throw error;
}

export async function disconnectGhlAgency(): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("disconnect_ghl_agency");
  if (error) throw error;
}

/** Attach a discovered GHL location to a BES organization, or detach it. */
/**
 * Attribute a location to the party BES serves — a PARTNER (the usual case)
 * or a SaaS organization. Exactly one; the database refuses both.
 */
export async function mapGhlLocation(
  locationId: string,
  owner: { organizationId?: string | null; partnerId?: string | null; agencyOwn?: boolean },
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("map_ghl_location", {
    p_location_id: locationId,
    p_org: owner.organizationId ?? undefined,
    p_partner: owner.partnerId ?? undefined,
    p_agency_own: owner.agencyOwn ?? false,
  });
  if (error) throw error;
}

export interface GhlSyncResult {
  companyId: string;
  found: number;
  recorded: number;
}

/**
 * Ask GHL what locations exist under the agency.
 *
 * The Edge Function holds the token and checks the caller is BES staff with
 * their own session — this call carries no secret and grants nothing on its
 * own.
 */
export async function syncGhlLocations(): Promise<GhlSyncResult> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke("ghl-sync", { body: {} });
  if (error) {
    /* The function answers with a readable reason — an expired token, a
       missing scope — and that reason is more useful than "failed". */
    const detail = (error as { context?: { body?: unknown } }).context?.body;
    const message = typeof detail === "string" ? detail : (error as Error).message;
    throw new Error(message);
  }
  return data as GhlSyncResult;
}

export interface GhlAgencyStatus {
  connected: boolean;
  companyId: string;
  tokenKind: string;
  hasWebhookSecret: boolean;
  expiresAt: string | null;
  rotatedAt: string;
}

/**
 * Is the agency connected, and to which company?
 *
 * Deliberately NOT a select on `ghl_agency_credentials` — that table has no
 * grants at all and must stay that way. `ghl_agency_status()` returns the
 * facts ABOUT the credential and never the credential, and answers nothing to
 * anyone who is not BES staff.
 *
 * The earlier version inferred this from whether any location had been synced,
 * which was only true after a sync and stayed true after a disconnect.
 */
export async function fetchGhlAgencyStatus(): Promise<GhlAgencyStatus | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("ghl_agency_status");
  if (error) throw error;
  /* A set-returning function comes back as an array of snake_case rows. */
  const row = (data as {
    connected: boolean;
    company_id: string;
    token_kind: string;
    has_webhook_secret: boolean;
    expires_at: string | null;
    rotated_at: string;
  }[] | null)?.[0];
  if (!row) return null;
  return {
    connected: row.connected,
    companyId: row.company_id,
    tokenKind: row.token_kind,
    hasWebhookSecret: row.has_webhook_secret,
    expiresAt: row.expires_at,
    rotatedAt: row.rotated_at,
  };
}



/* ── Outbound: BES status → GHL tag (0284) ─────────────────────────────── */

export interface GhlOutboundEvent {
  id: number;
  locationId: string;
  partnerGroupId: string | null;
  clientId: string | null;
  contactEmail: string;
  contactName: string | null;
  statusLabel: string;
  tag: string;
  state: "pending" | "sent" | "failed" | "skipped";
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
}

export async function fetchGhlOutbound(limit = 30): Promise<GhlOutboundEvent[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("ghl_outbound_events")
    .select("id, location_id, outsourcing_group_id, client_id, contact_email, contact_name, status_label, tag, state, attempts, last_error, created_at, sent_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as number,
    locationId: r.location_id as string,
    partnerGroupId: (r.outsourcing_group_id as string) ?? null,
    clientId: (r.client_id as string) ?? null,
    contactEmail: String(r.contact_email),
    contactName: (r.contact_name as string) ?? null,
    statusLabel: r.status_label as string,
    tag: r.tag as string,
    state: r.state as GhlOutboundEvent["state"],
    attempts: Number(r.attempts ?? 0),
    lastError: (r.last_error as string) ?? null,
    createdAt: r.created_at as string,
    sentAt: (r.sent_at as string) ?? null,
  }));
}

/** Work the queue now, with the caller's own session — for the panel's button. */
export async function pushGhlOutboundNow(): Promise<{ worked: number; sent: number; skipped: number; failed: number; note?: string }> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke("ghl-push", { body: {} });
  if (error) throw error;
  return data as { worked: number; sent: number; skipped: number; failed: number; note?: string };
}
