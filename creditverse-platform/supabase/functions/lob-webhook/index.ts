/**
 * Lob → BES: what happened to a letter after it was posted.
 *
 * Lob sends tracking events — the letter was processed, it is in transit, it
 * was delivered, it was returned. Each one updates the mailing that carries
 * that provider id, and nothing else.
 *
 * A webhook has no user session, so this is deployed with JWT verification off
 * and Lob's own signature is the authentication. Lob signs with HMAC-SHA256
 * over "<timestamp>.<raw body>" using the endpoint's secret, which is why the
 * body is read as text ONCE and verified before it is parsed — re-serialising
 * JSON changes the bytes and would break the comparison.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, lob-signature, lob-signature-timestamp" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

/** Lob's event types → the mailing states we keep. */
const STATE_FOR: Record<string, string> = {
  "letter.created": "submitted",
  "letter.rendered_pdf": "submitted",
  "letter.mailed": "in_transit",
  "letter.in_transit": "in_transit",
  "letter.in_local_area": "in_transit",
  "letter.processed_for_delivery": "in_transit",
  "letter.delivered": "delivered",
  "letter.re-routed": "in_transit",
  "letter.returned_to_sender": "returned",
  "letter.deleted": "cancelled",
};

/** Constant-time comparison: an early return leaks the signature a byte at a time. */
function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("LOB_WEBHOOK_SECRET");
  if (!url || !service) return json(500, { error: "Not configured" });
  if (!secret) {
    /* An endpoint with no secret that writes rows is worse than one switched
       off, so this refuses rather than accepting anything that arrives. */
    return json(401, { error: "LOB_WEBHOOK_SECRET is not set" });
  }

  const raw = await req.text();
  const presented = req.headers.get("lob-signature") ?? "";
  const timestamp = req.headers.get("lob-signature-timestamp") ?? "";
  if (!presented || !timestamp) return json(401, { error: "Unsigned" });

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${raw}`));
  const expected = hex(mac);
  if (!equal(new TextEncoder().encode(expected), new TextEncoder().encode(presented))) {
    return json(401, { error: "Signature did not match" });
  }

  let payload: { event_type?: { id?: string }; body?: { id?: string; tracking_number?: string } };
  try {
    payload = JSON.parse(raw);
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const eventType = payload.event_type?.id ?? "";
  const providerId = payload.body?.id;
  const state = STATE_FOR[eventType];
  if (!providerId) return json(400, { error: "No letter id in the payload" });
  /* An event we do not model is acknowledged, not recorded. Answering 4xx
     would make Lob retry something we will never act on. */
  if (!state) return json(200, { ignored: eventType });

  const sb = createClient(url, service);
  const { error } = await sb.rpc("record_mailing_event", {
    p_provider_id: providerId,
    p_status: state,
    p_tracking: payload.body?.tracking_number ?? null,
  });
  if (error) {
    console.error("record_mailing_event failed", error.message);
    return json(500, { error: "Could not record the event" });
  }
  return json(200, { recorded: eventType });
});
