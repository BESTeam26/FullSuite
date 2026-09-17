/**
 * Authorize.Net webhooks.
 *
 * Dee's standing rule, carried from an earlier session: "Do not deploy a
 * webhook that can credit invoices until signature/authenticity verification
 * is implemented." So verification is the first thing that happens, it happens
 * on the RAW body, and an event that fails it is not logged as an event — it
 * is refused, because an unverified body is not evidence of anything.
 *
 * ── WHAT THIS IS FOR ──────────────────────────────────────────────────────
 *
 * One job above all others: resolving an UNKNOWN charge. When the network dies
 * after Authorize.Net accepted a transaction, FullSuite records the attempt as
 * unknown and stops. This is what tells it, minutes later, what actually
 * happened — without anybody having to open the Authorize.Net dashboard.
 *
 * ── WHAT IT REFUSES TO TRUST ──────────────────────────────────────────────
 *
 * "Never trust invoice amount/id solely from webhook metadata."
 *
 * The event supplies exactly one thing this function uses: a transaction id.
 * Everything else — which partner, which invoice, how much — is read from the
 * attempt WE created before we ever called the processor. An event naming a
 * transaction we never started is recorded as `unmatched` and does nothing.
 *
 * ── AND WHY A REPLAY IS HARMLESS ──────────────────────────────────────────
 *
 * `partner_payment_events` is unique on the provider's event id, and
 * `settle_partner_card_charge` is idempotent on the attempt. An event replayed
 * a hundred times inserts one row and settles one charge.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Authorize.Net signs the raw body: HMAC-SHA512, hex, in `X-ANET-Signature`
 *  as `sha512=ABC…`. The header's case varies; Headers.get is case-insensitive. */
async function signatureMatches(raw: string, header: string | null, key: string): Promise<boolean> {
  if (!header) return false;
  const given = header.includes("=") ? header.split("=").pop()!.trim() : header.trim();
  if (!/^[0-9a-fA-F]{128}$/.test(given)) return false;

  const mac = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", mac, new TextEncoder().encode(raw));
  const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");

  /* Constant time. A byte-at-a-time comparison that returns early leaks how
     much of a forged signature was right. */
  const a = expected.toLowerCase();
  const b = given.toLowerCase();
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Authorize.Net's event names, reduced to the three answers we act on. */
const outcomeFor = (eventType: string): "approved" | "declined" | "held_for_review" | null => {
  if (eventType.endsWith("authcapture.created") || eventType.endsWith("capture.created")
      || eventType.endsWith("priorAuthCapture.created")) return "approved";
  if (eventType.endsWith("void.created") || eventType.endsWith("refund.created")) return null;
  if (eventType.endsWith("fraud.approved")) return "approved";
  if (eventType.endsWith("fraud.declined")) return "declined";
  if (eventType.endsWith("fraud.held")) return "held_for_review";
  return null;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const signatureKey = Deno.env.get("AUTHNET_SIGNATURE_KEY")?.trim();
  if (!url || !service) return json(500, { error: "Not configured" });
  /* No key, no webhook. Refusing is the only safe answer: accepting unverified
     events would be exactly what Dee said not to deploy. */
  if (!signatureKey) return json(503, { error: "Webhook verification is not configured." });

  /* The RAW body, read once, before any parsing. Re-serialising parsed JSON
     changes the bytes and the signature would never match. */
  const raw = await req.text();
  if (!(await signatureMatches(raw, req.headers.get("x-anet-signature"), signatureKey))) {
    /* Deliberately not recorded. An unverified body is not an event. */
    console.warn("authnet-webhook: signature rejected");
    return json(401, { error: "Signature rejected" });
  }

  let event: { notificationId?: string; eventType?: string; payload?: Record<string, unknown> };
  try { event = JSON.parse(raw); } catch { return json(400, { error: "Invalid JSON" }); }

  const eventId = event.notificationId;
  const eventType = event.eventType ?? "";
  if (!eventId || !eventType) return json(400, { error: "Missing notificationId or eventType" });

  /* The one field taken from the event. Everything else is looked up. */
  const txnId = typeof event.payload?.id === "string" ? event.payload.id : null;

  const sb = createClient(url, service);

  /* The replay guard. Unique on (provider, provider_event_id): a second
     delivery of the same event inserts nothing and settles nothing. */
  const { data: recorded, error: insertError } = await sb
    .from("partner_payment_events")
    .insert({
      provider_event_id: eventId,
      event_type: eventType,
      provider_txn_id: txnId,
      status: "received",
      /* The event body without its payload's free-text fields — nothing
         sensitive should be in a webhook, and nothing sensitive is kept. */
      payload: { eventType, id: txnId, responseCode: event.payload?.responseCode ?? null },
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    if (insertError.code === "23505") return json(200, { duplicate: true });
    console.error("authnet-webhook: could not record event", insertError.message);
    return json(500, { error: "Could not record the event" });
  }

  const finish = (status: string, note: string) =>
    sb.from("partner_payment_events")
      .update({ status, note, processed_at: new Date().toISOString() })
      .eq("id", recorded!.id);

  const outcome = outcomeFor(eventType);
  if (!outcome) { await finish("ignored", "Not an event that settles a charge"); return json(200, { ignored: true }); }
  if (!txnId) { await finish("unmatched", "No transaction id in the event"); return json(200, { unmatched: true }); }

  /* Our own attempt, found by the processor's transaction id — which we wrote
     when we started the charge. Nothing about the money comes from the event. */
  const { data: charge } = await sb
    .from("partner_card_charges")
    .select("id, idempotency_key, status")
    .eq("provider_txn_id", txnId)
    .maybeSingle();

  if (!charge) {
    /* A transaction BES never started. Recorded so somebody can look, and
       deliberately not turned into a payment. */
    await finish("unmatched", "No FullSuite charge attempt has this transaction id");
    return json(200, { unmatched: true });
  }

  const { data: settled, error: settleError } = await sb.rpc("settle_partner_card_charge", {
    p_idempotency_key: charge.idempotency_key,
    p_status: outcome,
    p_provider_txn: txnId,
    p_response_code: String(event.payload?.responseCode ?? ""),
    p_response_text: `Resolved by Authorize.Net webhook (${eventType})`,
  });

  if (settleError) {
    await finish("failed", settleError.message);
    console.error("authnet-webhook: settle failed", settleError.message);
    return json(500, { error: "Could not settle the charge" });
  }

  await sb.from("partner_payment_events")
    .update({
      status: "processed",
      charge_id: charge.id,
      payment_id: settled?.payment_id ?? null,
      note: settled?.already_settled ? "Charge was already settled" : `Settled as ${outcome}`,
      processed_at: new Date().toISOString(),
    })
    .eq("id", recorded!.id);

  return json(200, { ok: true, alreadySettled: settled?.already_settled ?? false });
});
