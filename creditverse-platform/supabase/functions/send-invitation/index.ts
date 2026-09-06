/**
 * Sends an invitation email for an open invitation the caller may see —
 * either an organization invitation or a BES team one.
 *
 * The provider is **Sender** (sender.net), Dee's email platform:
 * `POST https://api.sender.net/v2/message/send` with a bearer token. Sender
 * requires the `from` address to belong to a domain verified in the account
 * (SPF, DKIM and DMARC), so a mismatched MAIL_FROM is rejected by them, not
 * by us — the error is passed through rather than swallowed.
 *
 * Requires MAIL_PROVIDER_API_KEY and MAIL_FROM; without them it answers 503
 * "email not connected" and the administrator copies the link instead. The
 * token is read by the caller's own session (RLS decides), never listed.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", /* supabase-js sends x-client-info (and a version header) on every invoke.
   Leaving them out of this list makes the browser block the preflight, and
   the caller sees "Failed to send a request to the Edge Function" with no
   clue why — which is exactly what happened. */
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-api-version",
  "Access-Control-Max-Age": "86400" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Sign in first" });
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), mailKey = Deno.env.get("MAIL_PROVIDER_API_KEY"), from = Deno.env.get("MAIL_FROM") ?? "BES <no-reply@bes.example>";
  if (!url || !anon) return json(500, { error: "Function is not configured" });
  const { invitationId, appOrigin } = await req.json().catch(() => ({}));
  if (!invitationId || !appOrigin) return json(400, { error: "invitationId and appOrigin are required" });

  const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: inv, error } = await asUser.from("invitations").select("email, token, organization_id, organizations(name)").eq("id", invitationId).is("accepted_at", null).maybeSingle();
  if (error) return json(403, { error: error.message });
  if (!inv) return json(404, { error: "Invitation not found or not yours to send" });
  if (!mailKey) return json(503, { error: "Email is not connected yet. Copy the invite link instead.", code: "not_connected" });

  const link = `${appOrigin}/accept-invitation/${inv.token}`;
  const orgName = (inv.organizations as { name: string } | null)?.name ?? "your organization";
  /* MAIL_FROM may be "Name <address>" or a bare address; Sender wants the two
     apart. */
  const fromMatch = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  const fromEmail = fromMatch ? fromMatch[2] : from.trim();
  const fromName = fromMatch && fromMatch[1] ? fromMatch[1] : "BES";
  const res = await fetch("https://api.sender.net/v2/message/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${mailKey}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ from: { email: fromEmail, name: fromName }, to: [{ email: inv.email }], subject: `You're invited to ${orgName} on BES`, html: `<p>You have been invited to join <strong>${orgName}</strong>.</p><p><a href="${link}">Accept the invitation</a> and sign in with this email address. The link expires in seven days.</p>` }),
  });
  if (!res.ok) {
    /* Sender's own message says what is wrong — usually an unverified sending
       domain — so it is passed on instead of a bare status code. */
    const detail = await res.text().catch(() => "");
    console.error("sender error", res.status, detail.slice(0, 500));
    return json(502, { error: `The email provider refused the message (${res.status}). ${detail.slice(0, 200)}` });
  }
  return json(200, { sent: true });
});
