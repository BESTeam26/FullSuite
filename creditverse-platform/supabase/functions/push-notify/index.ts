/**
 * Sends one notification to the recipient's subscribed devices as Web Push.
 *
 * Nudged by `notify_push()` (a trigger on `notifications`) with only an id,
 * authenticated by a shared secret from the Vault — the same door every
 * other dispatcher uses. Reads the row with the service role, builds the
 * same title/detail/link the bell shows (shared `push-payload.ts`), and
 * sends with VAPID. A device the push service reports gone (404/410) is
 * deleted so it is never retried.
 *
 * Cost scales with: one push message per notification per subscribed device.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { pushPayloadFor } from "../../../src/lib/notifications/push-payload.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const expected = Deno.env.get("PUSH_DISPATCH_SECRET")?.trim();
  const offered = req.headers.get("x-dispatch-secret")?.trim();
  if (!expected || !offered || !timingSafeEqual(expected, offered)) return json(401, { error: "not authorised" });

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")?.trim();
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")?.trim();
  const subject = Deno.env.get("VAPID_SUBJECT")?.trim() || "mailto:support@blessedempireservices.com";
  if (!publicKey || !privateKey) return json(503, { error: "Push is not configured", code: "not_connected" });
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { error: "Function is not configured" });
  const sb = createClient(url, serviceKey);

  let notificationId: number | null = null;
  try { notificationId = Number((await req.json())?.notification_id); } catch { /* fall through */ }
  if (!notificationId || !Number.isFinite(notificationId)) return json(400, { error: "notification_id required" });

  const { data: n, error } = await sb.from("notifications")
    .select("id, recipient_id, kind, title, detail, entity_type, entity_id, read_at")
    .eq("id", notificationId).maybeSingle();
  if (error) return json(500, { error: error.message });
  if (!n) return json(404, { error: "no such notification" });
  if (n.read_at) return json(200, { sent: 0, reason: "already_read" });

  const { data: subs, error: subsError } = await sb.from("push_subscriptions")
    .select("id, endpoint, p256dh, auth").eq("user_id", n.recipient_id).is("failed_at", null);
  if (subsError) return json(500, { error: subsError.message });

  const payload = JSON.stringify(pushPayloadFor(n as Parameters<typeof pushPayloadFor>[0]));
  let sent = 0; const gone: string[] = []; const failed: string[] = [];
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 6, urgency: "high" });
      sent += 1;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) gone.push(s.id); else failed.push(`${s.id}:${status ?? "?"}`);
    }
  }
  if (gone.length > 0) await sb.from("push_subscriptions").delete().in("id", gone);
  await sb.from("push_subscriptions").update({ last_seen_at: new Date().toISOString() }).in("id", (subs ?? []).map((s) => s.id).filter((id) => !gone.includes(id)));
  return json(200, { sent, gone: gone.length, failed });
});
