/**
 * BES → GoHighLevel: work the outbound queue.
 *
 * Each pending row is a client whose BES status changed. This finds the
 * contact by EMAIL in the partner's mapped location, removes any previous
 * `bes-status-*` tag, adds the new one, and records exactly what happened on
 * the row. Dee's GHL workflows trigger on the tag — so the pipeline moves the
 * way she already builds automations, and BES never needs her stage ids.
 *
 * ── WHO MAY CALL THIS ──────────────────────────────────────────────────────
 *
 *   • the database cron, every minute, with the shared secret from Vault
 *     (header x-push-secret); or
 *   • a signed-in BES admin pressing "Send pending now" in the panel.
 *
 * Anybody else gets 401 and nothing moves. The GHL agency token never leaves
 * this function; the browser only ever sees the outcome rows.
 *
 * ── WHAT THIS REFUSES TO GUESS ─────────────────────────────────────────────
 *
 * No contact with that email in that location → `skipped`, with the reason.
 * It does not create a contact: a BES client who is not yet in the partner's
 * GHL is the partner's decision, not this function's. A provider refusal →
 * `failed`, with the provider's own words, retried up to five times.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const MAX_ATTEMPTS = 5;
const BATCH = 25;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-api-version, x-push-secret",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

function secretsMatch(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

interface QueueRow {
  id: number;
  location_id: string;
  contact_email: string;
  tag: string;
  attempts: number;
}

interface GhlContact { id: string; email?: string; tags?: string[] }

async function ghl(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${GHL_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      Version: GHL_VERSION,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(12000),
  });
}

/** The contact with this email in this location, or null. */
async function findContact(token: string, locationId: string, email: string): Promise<GhlContact | null> {
  const r = await ghl(`/contacts/?locationId=${encodeURIComponent(locationId)}&query=${encodeURIComponent(email)}&limit=5`, token);
  if (!r.ok) throw new Error(`GHL contact lookup refused (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const body = await r.json() as { contacts?: GhlContact[] };
  const wanted = email.toLowerCase();
  return (body.contacts ?? []).find((c) => (c.email ?? "").toLowerCase() === wanted) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const pushSecret = Deno.env.get("GHL_PUSH_SECRET") ?? "";
  if (!url || !service || !anon) return json(500, { error: "Not configured" });

  /* Two doors: the cron's shared secret, or an admin's own session. */
  const presented = req.headers.get("x-push-secret") ?? "";
  let authorized = pushSecret.length > 0 && secretsMatch(presented, pushSecret);
  if (!authorized) {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const asUser = createClient(url, anon, { global: { headers: { authorization: authHeader } } });
      const { data: isAdmin } = await asUser.rpc("agency_can", { p_key: "settings.manage" });
      authorized = isAdmin === true;
    }
  }
  if (!authorized) return json(401, { error: "Not permitted" });

  const sb = createClient(url, service);

  const { data: credential } = await sb
    .from("ghl_agency_credentials")
    .select("access_token")
    .maybeSingle();
  if (!credential?.access_token) {
    return json(200, { worked: 0, note: "No GHL agency credential; nothing can be pushed." });
  }
  const token = credential.access_token as string;

  const { data: rows, error } = await sb
    .from("ghl_outbound_events")
    .select("id, location_id, contact_email, tag, attempts")
    .eq("state", "pending")
    .order("created_at")
    .limit(BATCH);
  if (error) return json(500, { error: error.message });

  let sent = 0, skipped = 0, failed = 0;
  for (const row of (rows ?? []) as QueueRow[]) {
    const attempts = row.attempts + 1;
    try {
      const contact = await findContact(token, row.location_id, row.contact_email);
      if (!contact) {
        await sb.from("ghl_outbound_events").update({
          state: "skipped", attempts,
          last_error: `No contact with ${row.contact_email} in this GHL location. BES does not create contacts; add them in GHL and the next status change will land.`,
        }).eq("id", row.id);
        skipped++;
        continue;
      }

      /* One status tag at a time: shed the old bes-status-* before adding. */
      const stale = (contact.tags ?? []).filter((t) => t.startsWith("bes-status-") && t !== row.tag);
      if (stale.length > 0) {
        const r = await ghl(`/contacts/${contact.id}/tags`, token, { method: "DELETE", body: JSON.stringify({ tags: stale }) });
        if (!r.ok) throw new Error(`Removing old status tag refused (${r.status}): ${(await r.text()).slice(0, 200)}`);
      }
      const add = await ghl(`/contacts/${contact.id}/tags`, token, { method: "POST", body: JSON.stringify({ tags: [row.tag] }) });
      if (!add.ok) throw new Error(`Adding tag refused (${add.status}): ${(await add.text()).slice(0, 200)}`);

      await sb.from("ghl_outbound_events").update({
        state: "sent", attempts, ghl_contact_id: contact.id, sent_at: new Date().toISOString(), last_error: null,
      }).eq("id", row.id);
      sent++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await sb.from("ghl_outbound_events").update({
        state: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        attempts,
        last_error: attempts >= MAX_ATTEMPTS ? `Gave up after ${attempts} attempts: ${message}` : message,
      }).eq("id", row.id);
      failed++;
    }
  }

  return json(200, { worked: (rows ?? []).length, sent, skipped, failed });
});
