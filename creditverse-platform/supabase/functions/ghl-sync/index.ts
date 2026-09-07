/**
 * BES → GoHighLevel: discover the agency's sub-accounts.
 *
 * Dee runs one GHL agency with many sub-accounts. Rather than pasting a token
 * per location, BES holds ONE agency credential and asks GHL what exists under
 * it. This function is that question and nothing more:
 *
 *   1. checks the caller is BES staff — with their own JWT, not a shared key;
 *   2. reads the agency credential (service role; the token never leaves here);
 *   3. asks GHL for the locations under that company id;
 *   4. records them through `record_ghl_locations`, which will not overwrite a
 *      mapping somebody made.
 *
 * It creates no clients and maps nothing automatically. Which BES organization
 * a sub-account belongs to is a commercial fact only a person knows, and
 * guessing it from a name would be exactly the "never infer ownership from
 * display names" rule this project has (rule 4).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

/** GHL's REST base and the version header its v2 API requires. */
const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

interface GhlLocation {
  id?: string;
  name?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !service || !anon) return json(500, { error: "Not configured" });

  /* The caller's own token decides whether they may do this. A function that
     trusted a body field saying "I am staff" would be no protection at all. */
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Sign in first" });
  const asUser = createClient(url, anon, { global: { headers: { authorization: authHeader } } });
  const { data: staff, error: staffError } = await asUser.rpc("is_agency_staff");
  if (staffError) return json(500, { error: "Could not check permissions" });
  if (staff !== true) return json(403, { error: "BES staff only" });

  const sb = createClient(url, service);
  const { data: credential, error: credentialError } = await sb
    .from("ghl_agency_credentials")
    .select("company_id, access_token, token_kind, expires_at")
    .maybeSingle();
  if (credentialError) return json(500, { error: "Could not read the credential" });
  if (!credential) {
    return json(409, { error: "GoHighLevel is not connected yet", connected: false });
  }
  if (credential.expires_at && new Date(credential.expires_at) <= new Date()) {
    return json(409, { error: "The GoHighLevel token has expired. Reconnect the agency.", expired: true });
  }

  let response: Response;
  try {
    response = await fetch(
      `${GHL_BASE}/locations/search?companyId=${encodeURIComponent(credential.company_id)}&limit=500`,
      {
        headers: {
          authorization: `Bearer ${credential.access_token}`,
          version: GHL_VERSION,
          accept: "application/json",
        },
      },
    );
  } catch (e) {
    /* A network failure is reported as itself. It is not "no sub-accounts",
       and the sync must not be read as having found an empty agency. */
    console.error("ghl locations fetch failed", String(e));
    return json(502, { error: "Could not reach GoHighLevel" });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("ghl locations non-200", response.status, detail.slice(0, 300));
    /* 401/403 from GHL means the token is wrong or lacks the scope — say that
       rather than a generic failure, because it is the thing to act on. */
    if (response.status === 401 || response.status === 403) {
      return json(403, {
        error:
          "GoHighLevel refused the agency token. Check it is an AGENCY-level token with the locations.readonly scope.",
      });
    }
    return json(502, { error: `GoHighLevel returned ${response.status}` });
  }

  const body = (await response.json().catch(() => null)) as { locations?: GhlLocation[] } | null;
  const locations = Array.isArray(body?.locations) ? body!.locations! : [];
  const usable = locations
    .filter((l) => typeof l.id === "string" && l.id.trim())
    .map((l) => ({ id: l.id!.trim(), name: typeof l.name === "string" ? l.name : null }));

  const { data: recorded, error: recordError } = await sb.rpc("record_ghl_locations", {
    p_company_id: credential.company_id,
    p_locations: usable,
  });
  if (recordError) {
    console.error("record_ghl_locations failed", recordError.message);
    return json(500, { error: "Could not record the sub-accounts" });
  }

  return json(200, {
    companyId: credential.company_id,
    found: usable.length,
    recorded: recorded ?? 0,
  });
});
