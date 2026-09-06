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
  organizationId: string;
  locationId: string;
  label: string | null;
  status: "connected" | "paused" | "error";
  lastEventAt: string | null;
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
    .select("id, organization_id, location_id, label, status, last_event_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    locationId: r.location_id,
    label: r.label,
    status: r.status as GhlConnection["status"],
    lastEventAt: r.last_event_at,
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
