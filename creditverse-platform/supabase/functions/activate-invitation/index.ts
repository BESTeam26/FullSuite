/**
 * Activate an invited account without a second email.
 *
 * Dee, 2026-09-20: "the link already came from their actual email as
 * verification — that's unnecessary friction." So the invitation token IS the
 * proof of address, which makes it a credential; Dee again: "treat it like a
 * sensitive credential… single-use, expire, cannot be replayed after
 * acceptance, invalidated if revoked or superseded."
 *
 * Every one of those decisions is made in the database
 * (`activate_invitation_claim`), where it is audited and cannot be raced.
 * This function only carries out what it is told:
 *
 *   create           no account for that address → create it, confirmed
 *   confirm          an account exists that is NOT yet a team member (added
 *                    before they ever signed in) → confirm it, set the
 *                    password they just chose
 *   sign_in_instead  they already work here → never re-password; sign in
 *   already_*        used, accepted, expired, revoked, wrong address → no
 *
 * Public sign-up is untouched: nothing there proves an address, so it keeps
 * Supabase Auth's confirmation email.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

/* One message per refusal, saying what to do next rather than what failed. */
const REFUSALS: Record<string, { status: number; error: string; code: string }> = {
  invalid: { status: 410, code: "invalid", error: "This invitation link is not valid. Ask whoever invited you to send a new one." },
  expired: { status: 410, code: "expired", error: "This invitation has expired. Ask whoever invited you to send a new one." },
  already_accepted: { status: 409, code: "already_accepted", error: "This invitation has already been used. Sign in with your email and password." },
  already_activated: { status: 409, code: "already_activated", error: "This link has already set up an account. Sign in with your email and password." },
  sign_in_instead: { status: 409, code: "sign_in_instead", error: "You already have a BES account. Sign in with your password to accept this invitation." },
  wrong_email: { status: 403, code: "wrong_email", error: "This invitation was sent to a different email address." },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json(500, { error: "Function is not configured" });

  const { token, email, password, fullName } = await req.json().catch(() => ({}));
  if (typeof token !== "string" || !/^[0-9a-f-]{36}$/i.test(token)) return json(400, { error: REFUSALS.invalid.error, code: "invalid" });
  if (typeof email !== "string" || !email.includes("@")) return json(400, { error: "Use the email address your invitation was sent to.", code: "wrong_email" });
  if (typeof password !== "string" || password.length < 8) return json(400, { error: "Choose a password of at least 8 characters.", code: "weak_password" });

  const sb = createClient(url, service, { auth: { persistSession: false } });
  const { data, error: claimErr } = await sb.rpc("activate_invitation_claim", { p_token: token, p_email: email });
  if (claimErr) return json(500, { error: claimErr.message });
  const claim = (Array.isArray(data) ? data[0] : data) as
    | { outcome: string; invitation_id: string | null; email: string | null; full_name: string | null; existing_user: string | null }
    | undefined;
  if (!claim) return json(500, { error: "Activation could not be checked." });

  const refusal = REFUSALS[claim.outcome];
  if (refusal) return json(refusal.status, { error: refusal.error, code: refusal.code });

  const name = typeof fullName === "string" && fullName.trim() ? fullName.trim() : (claim.full_name ?? undefined);
  const address = claim.email!;

  if (claim.outcome === "confirm") {
    const { error } = await sb.auth.admin.updateUserById(claim.existing_user!, {
      password, email_confirm: true, ...(name ? { user_metadata: { full_name: name } } : {}),
    });
    if (error) return json(400, { error: error.message });
  } else {
    const { error } = await sb.auth.admin.createUser({
      email: address, password, email_confirm: true, user_metadata: name ? { full_name: name } : {},
    });
    if (error) return json(400, { error: error.message });
  }
  /* Used. A second attempt with the same link is refused from here on. */
  await sb.rpc("activate_invitation_stamp", { p_invitation: claim.invitation_id, p_outcome: claim.outcome });
  return json(200, { ok: true, outcome: claim.outcome });
});
