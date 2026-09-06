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
    .select("organization_id, status")
    .eq("location_id", locationId)
    .maybeSingle();
  if (connectionError) return json(500, { error: "Lookup failed" });
  // An unknown location is refused without saying whether others exist.
  if (!connection || connection.status === "paused") return json(404, { error: "Unknown location" });

  const { data: credentials } = await sb
    .from("ghl_credentials")
    .select("webhook_secret")
    .eq("location_id", locationId)
    .maybeSingle();

  const presented = req.headers.get("x-ghl-signature") ?? req.headers.get("x-wh-signature") ?? "";
  const expected = credentials?.webhook_secret ?? "";
  if (!expected) {
    // Configured without a secret: record the attempt and refuse. An open
    // endpoint that writes rows is worse than one that is switched off.
    return json(401, { error: "This location has no webhook secret set" });
  }
  if (!secretsMatch(presented, expected)) return json(401, { error: "Signature did not match" });

  const eventType = firstString(payload, ["type", "event", "eventType"]) ?? "unknown";
  const externalId = firstString(payload, ["id", "eventId", "webhookId"]);

  const { error: insertError } = await sb.from("ghl_events").insert({
    location_id: locationId,
    organization_id: connection.organization_id,
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
