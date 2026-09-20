/**
 * Activate an invited account without a second email.
 *
 * Dee, 2026-09-20: "Let's NOT ask them to verify email — the link already came
 * from their actual email as verification. That's unnecessary friction."
 *
 * The invitation token was delivered to the address; presenting it IS the
 * proof of address. So this function, holding the service role, checks the
 * token, checks the email matches, and creates the auth user already
 * confirmed — or confirms and re-passwords an existing unconfirmed one (a
 * person may have been added before they ever signed in). The browser then
 * signs in with the password and accepts the invitation as itself, through
 * the same accept_agency_invitation every other path uses.
 *
 * Public sign-up is untouched: nothing there proves an address, so it keeps
 * Supabase Auth's confirmation.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json(500, { error: "Function is not configured" });

  const { token, email, password, fullName } = await req.json().catch(() => ({}));
  if (typeof token !== "string" || !/^[0-9a-f-]{36}$/i.test(token)) return json(400, { error: "That invitation link is not valid." });
  if (typeof email !== "string" || !email.includes("@")) return json(400, { error: "Use the email address your invitation was sent to." });
  if (typeof password !== "string" || password.length < 8) return json(400, { error: "Choose a password of at least 8 characters." });

  const sb = createClient(url, service, { auth: { persistSession: false } });
  const { data: inv, error: invErr } = await sb.from("invitations")
    .select("id, email, kind, full_name, accepted_at, expires_at")
    .eq("token", token).maybeSingle();
  if (invErr) return json(500, { error: invErr.message });
  if (!inv || inv.accepted_at || new Date(inv.expires_at) <= new Date()) {
    return json(410, { error: "This invitation link is not valid, or it has already been used. Ask whoever invited you to send a new one." });
  }
  if (String(inv.email).toLowerCase() !== email.trim().toLowerCase()) {
    return json(403, { error: "This invitation was sent to a different email address." });
  }
  const name = typeof fullName === "string" && fullName.trim() ? fullName.trim() : (inv.full_name ?? undefined);

  const { data: existingId, error: lookupErr } = await sb.rpc("auth_user_id_for_email", { p_email: inv.email });
  if (lookupErr) return json(500, { error: lookupErr.message });

  if (existingId) {
    /* Somebody added before they ever signed in: confirm them and set the
       password they just chose. Nothing about their profile is touched
       except a missing name. */
    const { error } = await sb.auth.admin.updateUserById(existingId as string, {
      password, email_confirm: true, ...(name ? { user_metadata: { full_name: name } } : {}),
    });
    if (error) return json(400, { error: error.message });
    return json(200, { ok: true, existed: true });
  }
  const { error } = await sb.auth.admin.createUser({
    email: inv.email, password, email_confirm: true, user_metadata: name ? { full_name: name } : {},
  });
  if (error) return json(400, { error: error.message });
  return json(200, { ok: true, existed: false });
});
