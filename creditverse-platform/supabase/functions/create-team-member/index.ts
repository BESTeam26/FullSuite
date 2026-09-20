/**
 * Create the Team Member, then invite them.
 *
 * Dee, 2026-09-20: "A Team Member is a workforce record. A login is just
 * access to that record." So pressing Send Invitation creates the canonical
 * person FIRST — Agent ID, start date, position, placement — and the
 * invitation second. Nobody vanishes from the directory because an email
 * bounced or a token expired.
 *
 * Why a function rather than a plain RPC: `profiles.id` references
 * `auth.users(id)`, so the person needs an auth row before they can be a
 * Team Member. Only the service role may make one. It is a SHELL — no
 * password, unconfirmed, cannot sign in — and activation later sets the
 * password on that very row, so the account is LINKED to the Team Member by
 * being the same record from the start. No merge, no id change.
 *
 * Authorization is the caller's, not the service role's: the invitation
 * itself is written by `create_team_member_with_invitation` running as the
 * signed-in administrator, which refuses anybody else.
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
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Sign in first" });
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json(500, { error: "Function is not configured" });

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email.includes("@")) return json(400, { error: "A work email address is required." });
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  if (fullName.length < 2) return json(400, { error: "Their full name is required." });

  const admin = createClient(url, service, { auth: { persistSession: false } });

  /* The shell account, or the one they already have. Never a password here:
     an invited person cannot sign in until they activate. */
  const { data: found, error: lookupErr } = await admin.rpc("auth_user_by_email", { p_email: email });
  if (lookupErr) return json(500, { error: lookupErr.message });
  let userId = (found as string | null) ?? null;
  if (!userId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email, email_confirm: false, user_metadata: { full_name: fullName },
    });
    if (error) return json(400, { error: error.message });
    userId = created.user?.id ?? null;
    if (!userId) return json(500, { error: "The account could not be created." });
  }

  /* Everything canonical, as the CALLER — so an ordinary user cannot use this
     function to mint a team member. */
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data, error } = await asCaller.rpc("create_team_member_with_invitation", {
    p_user: userId,
    p_full_name: fullName,
    p_role: body.role ?? "agency_user",
    p_profile: body.profile ?? null,
    p_team: body.teamId ?? null,
    p_lead_team: body.leadTeamId ?? null,
    p_modules: Array.isArray(body.moduleKeys) ? body.moduleKeys : [],
    p_hired_on: body.hiredOn ?? null,
    p_job_title: body.jobTitle ?? null,
    p_engagement: body.engagementType ?? null,
    p_manager: body.managerId ?? null,
    p_phone: body.phone ?? null,
    p_seat: body.seat ?? null,
    p_division: body.divisionId ?? null,
    p_department: body.departmentId ?? null,
  });
  if (error) return json(error.code === "42501" ? 403 : 400, { error: error.message });
  const row = Array.isArray(data) ? data[0] : data;
  return json(200, { ok: true, ...row });
});
