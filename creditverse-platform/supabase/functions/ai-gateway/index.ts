/**
 * BES AI gateway — the ONLY path from the browser to a model provider.
 *
 *   browser (user JWT) → this function
 *     → who is calling, for which organization and feature
 *     → ai_can_use(org, feature) as the caller (entitlement × balance, RLS-true)
 *     → provider call with the server-held key (never in the browser)
 *     → ai_record_usage(...) with the service role: prices tokens from the
 *       policy in force, writes the usage event + ledger debit, returns balance
 *     → the text and the remaining credits
 *
 * Requires secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 * ANTHROPIC_API_KEY. Without the provider key it answers 503 "AI not connected"
 * and nothing is charged. Deterministic decisions stay in the database; the
 * model only drafts and explains (rule 9).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL_DEFAULT = "claude-sonnet-5";
const cors = { "Access-Control-Allow-Origin": "*", /* supabase-js sends x-client-info (and a version header) on every invoke.
   Leaving them out of this list makes the browser block the preflight, and
   the caller sees "Failed to send a request to the Edge Function" with no
   clue why — which is exactly what happened. */
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-api-version",
  "Access-Control-Max-Age": "86400" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

/**
 * An attachment is a document or an image the model must read — a credit
 * report saved as a PDF, or a photograph of one. It is passed straight
 * through; nothing is stored here. The caps below are deliberate: a scan
 * larger than this belongs in a smaller export, not in a bigger request.
 */
interface GatewayAttachment { mediaType: string; data: string }
interface GatewayRequest {
  organizationId: string; feature: string;
  product?: "creditOps" | "fundingOps" | "diyCredit" | "oi" | "crm";
  system?: string; prompt: string; model?: string; maxTokens?: number;
  attachments?: GatewayAttachment[];
}

const ATTACHMENT_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
/** Base64 characters, not bytes: about 7 MB of file. */
const MAX_ATTACHMENT_CHARS = 9_500_000;
const MAX_ATTACHMENTS = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Sign in first" });

  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), providerKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
  if (!url || !anon || !service) return json(500, { error: "Gateway is not configured" });

  let body: GatewayRequest;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  if (!body.organizationId || !body.feature || !body.prompt) return json(400, { error: "organizationId, feature and prompt are required" });

  // As the caller: identity + the entitlement/balance gate the database owns.
  const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return json(401, { error: "Session not valid" });
  /* Entitlement and consumption are separate questions (requirement 6). This
     is the first: may this organization use this feature at all. */
  const { data: allowed, error: gateError } = await asUser.rpc("ai_can_use", { p_org: body.organizationId, p_feature: body.feature });
  if (gateError) return json(403, { error: gateError.message });
  if (!allowed) return json(402, { error: "AI features are paused for this organization: no credits or the feature is not included in the plan.", code: "no_credits" });

  if (!providerKey) return json(503, { error: "AI is not connected yet. BES has not added the provider key.", code: "not_connected" });

  /* Upload ceilings are the organization's configured ones, not constants. */
  const { data: limitRow } = await asUser.rpc("ai_limits_for", { p_org: body.organizationId });
  const limits = (Array.isArray(limitRow) ? limitRow[0] : limitRow) ?? {};
  const maxUploadBytes = ((limits.max_upload_mb as number) ?? 25) * 1024 * 1024;
  const maxOutput = (limits.max_output_tokens as number) ?? 4096;

  const attachments = body.attachments ?? [];
  if (attachments.length > MAX_ATTACHMENTS) return json(400, { error: `Send at most ${MAX_ATTACHMENTS} files in one request.` });
  for (const a of attachments) {
    if (!ATTACHMENT_TYPES.includes(a.mediaType)) return json(400, { error: `${a.mediaType} cannot be read. Send a PDF, PNG, JPG or WEBP.` });
    /* base64 carries about 3 bytes per 4 characters. */
    const bytes = Math.floor(((a.data ?? "").length * 3) / 4);
    if (!a.data || bytes > maxUploadBytes || a.data.length > MAX_ATTACHMENT_CHARS) {
      return json(413, { error: `That file is over the ${limits.max_upload_mb ?? 25} MB limit. Save a smaller export, or split it.`, code: "too_large" });
    }
  }

  const model = body.model ?? MODEL_DEFAULT;
  const wantOutput = Math.min(body.maxTokens ?? 1024, maxOutput);

  /*
   * RESERVE BEFORE THE CALL (requirement 10).
   *
   * A positive balance before a request is not permission to overshoot on it.
   * The estimate is held against the organization the moment it is made, so
   * two requests in flight cannot both spend the last credit, and every other
   * ceiling — per-request, daily, hourly, attribution — is checked inside this
   * one call. If it raises, nothing was sent and nothing was charged.
   *
   * Input tokens are estimated from characters. Roughly four characters to a
   * token, and rounded UP, because an estimate that is too low is the one that
   * lets a request through it should not have.
   */
  const promptChars = (body.system ?? "").length + body.prompt.length
    + attachments.reduce((n, a) => n + (a.data ?? "").length, 0);
  const estInput = Math.ceil(promptChars / 4);

  const { data: reservation, error: reserveError } = await asUser.rpc("ai_reserve", {
    p_org: body.organizationId, p_feature: body.feature, p_model: model,
    p_est_input: estInput, p_est_output: wantOutput,
  });
  if (reserveError) {
    /* The database's own sentence is the useful one: which ceiling, and by how
       much. It never mentions provider cost or the markup (requirement 11). */
    return json(402, { error: reserveError.message, code: "over_limit" });
  }
  const held = Array.isArray(reservation) ? reservation[0] : reservation;
  const reservationId = held?.reservation_id as string | undefined;
  if (!reservationId) return json(500, { error: "Could not reserve credits for this request." });

  const asService = createClient(url, service);
  /* Any exit from here on must settle the reservation, or the credits stay
     held until they expire and the customer is short for ten minutes. */
  const release = async () => { await asService.rpc("ai_release", { p_reservation: reservationId }); };

  const content = [
    ...attachments.map((a) =>
      a.mediaType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: a.mediaType, data: a.data } }
        : { type: "image", source: { type: "base64", media_type: a.mediaType, data: a.data } },
    ),
    { type: "text", text: body.prompt },
  ];

  let providerRes: Response;
  try {
    providerRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": providerKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: wantOutput, system: body.system, messages: [{ role: "user", content }] }),
    });
  } catch (e) {
    await release();
    console.error("provider unreachable", String(e).slice(0, 200));
    return json(502, { error: "The reading service could not be reached. Nothing was charged." });
  }
  if (!providerRes.ok) {
    await release();
    const detail = await providerRes.text().catch(() => "");
    console.error("provider error", providerRes.status, detail.slice(0, 500));
    return json(502, { error: `The reading service refused the request (${providerRes.status}). Nothing was charged.` });
  }

  const out = await providerRes.json();
  const text = (out.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
  const usage = out.usage ?? {};

  /* RECONCILE against what it actually cost. Service role only — a browser
     that could settle its own usage could settle it at zero. */
  const { data: metered, error: meterError } = await asService.rpc("ai_reconcile", {
    p_reservation: reservationId,
    p_input: usage.input_tokens ?? 0,
    p_output: usage.output_tokens ?? 0,
    p_cached: usage.cache_read_input_tokens ?? 0,
    p_request_id: out.id ?? crypto.randomUUID(),
  });
  if (meterError) {
    /* The work was done and the answer exists, but it could not be billed.
       Loud, because unbilled usage is a bill BES pays and cannot recover. */
    console.error("reconcile failed", meterError.message);
    await release();
    return json(500, { error: "The answer could not be metered, so it is not being returned. Nothing was charged." });
  }
  const row = Array.isArray(metered) ? metered[0] : metered;
  /* Credits and balance only. Never provider cost, never the markup. */
  return json(200, { text, model, creditsCharged: row?.credits_charged ?? null, balance: row?.balance ?? null });
});
