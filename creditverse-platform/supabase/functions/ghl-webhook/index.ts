/**
 * GoHighLevel → BES.
 *
 * GHL posts here when something happens in a location: a contact created, an
 * opportunity won, an appointment booked. This function does three things and
 * nothing else:
 *
 *   1. works out which location sent it, and refuses anything unrecognised;
 *   2. checks the shared secret for that location, in constant time;
 *   3. records the event exactly once, and answers 200 quickly.
 *
 * **It deliberately creates no clients and no funding files yet.** The client
 * record is moving to the organization level, and writing that mapping twice
 * would be waste. Capturing events from day one means nothing is lost: the
 * backlog is replayed once the mapping exists.
 *
 * A webhook has no user session, so this function is deployed with JWT
 * verification off; the shared secret is the authentication, which is why it
 * is compared properly and why an unknown location is refused before any work.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-ghl-signature, x-wh-signature",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

/** Constant-time comparison: a length check and an early return leak the secret. */
function secretsMatch(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

/** GHL nests the useful ids differently per event; take the first that exists. */
function firstString(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json(500, { error: "Not configured" });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const locationId = firstString(payload, ["locationId", "location_id", "companyId"]);
  if (!locationId) return json(400, { error: "No location id in the payload" });

  const sb = createClient(url, service);
  const { data: connection, error: connectionError } = await sb
    .from("ghl_connections")
    .select("organization_id, outsourcing_group_id, status, company_id")
    .eq("location_id", locationId)
    .maybeSingle();
  if (connectionError) return json(500, { error: "Lookup failed" });
  // A paused location stays refused: pausing is a decision, not a gap.
  if (connection?.status === "paused") return json(404, { error: "Unknown location" });

  /*
   * Two ways to authenticate an event, because there are two ways GHL can be
   * connected (0115):
   *
   *   • a per-location secret, from the days when each sub-account was
   *     connected by hand;
   *   • the AGENCY secret, when the webhook is configured once for the whole
   *     agency and every sub-account posts to the same endpoint.
   *
   * The location's own secret wins where it exists, so an existing
   * per-location setup keeps behaving exactly as it did.
   */
  const [{ data: credentials }, { data: agency }] = await Promise.all([
    sb.from("ghl_credentials").select("webhook_secret").eq("location_id", locationId).maybeSingle(),
    sb.from("ghl_agency_credentials").select("company_id, webhook_secret").maybeSingle(),
  ]);

  const presented = req.headers.get("x-ghl-signature") ?? req.headers.get("x-wh-signature") ?? "";
  const expected = credentials?.webhook_secret ?? agency?.webhook_secret ?? "";
  if (!expected) {
    // Configured without a secret: refuse. An open endpoint that writes rows
    // is worse than one that is switched off.
    return json(401, { error: "No webhook secret is set for this location or agency" });
  }
  if (!secretsMatch(presented, expected)) return json(401, { error: "Signature did not match" });

  /*
   * An authenticated event from a sub-account we have not synced yet is
   * recorded, not thrown away. Under an agency credential a new sub-account
   * can exist in GHL before anybody presses Sync here, and losing its events
   * until then would be losing real work. It is recorded UNMAPPED — no
   * organization is guessed — and `map_ghl_location` attributes the backlog
   * when someone maps it.
   */
  if (!connection) {
    if (!agency?.webhook_secret) return json(404, { error: "Unknown location" });
    const { error: discoverError } = await sb.from("ghl_connections").insert({
      location_id: locationId,
      company_id: agency.company_id,
      discovered_at: new Date().toISOString(),
    });
    if (discoverError && discoverError.code !== "23505") {
      console.error("ghl discovery insert failed", discoverError.message);
      return json(500, { error: "Could not record the location" });
    }
  }

  const eventType = firstString(payload, ["type", "event", "eventType"]) ?? "unknown";
  const externalId = firstString(payload, ["id", "eventId", "webhookId"]);

  const { error: insertError } = await sb.from("ghl_events").insert({
    location_id: locationId,
    organization_id: connection?.organization_id ?? null,
    outsourcing_group_id: connection?.outsourcing_group_id ?? null,
    event_type: eventType,
    external_id: externalId,
    payload,
  });
  // A duplicate is success: GHL retries, and a retry must change nothing.
  if (insertError && insertError.code !== "23505") {
    console.error("ghl event insert failed", insertError.message);
    return json(500, { error: "Could not record the event" });
  }

  await sb.from("ghl_connections").update({ last_event_at: new Date().toISOString() }).eq("location_id", locationId);
  return json(200, { received: true, duplicate: insertError?.code === "23505" });
});
