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
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey" };
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

  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), providerKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!url || !anon || !service) return json(500, { error: "Gateway is not configured" });

  let body: GatewayRequest;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  if (!body.organizationId || !body.feature || !body.prompt) return json(400, { error: "organizationId, feature and prompt are required" });

  // As the caller: identity + the entitlement/balance gate the database owns.
  const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return json(401, { error: "Session not valid" });
  const { data: allowed, error: gateError } = await asUser.rpc("ai_can_use", { p_org: body.organizationId, p_feature: body.feature });
  if (gateError) return json(403, { error: gateError.message });
  if (!allowed) return json(402, { error: "AI features are paused for this organization: no credits or the feature is not included in the plan.", code: "no_credits" });

  if (!providerKey) return json(503, { error: "AI is not connected yet. BES has not added the provider key.", code: "not_connected" });

  const attachments = body.attachments ?? [];
  if (attachments.length > MAX_ATTACHMENTS) return json(400, { error: `Send at most ${MAX_ATTACHMENTS} files in one request.` });
  for (const a of attachments) {
    if (!ATTACHMENT_TYPES.includes(a.mediaType)) return json(400, { error: `${a.mediaType} cannot be read. Send a PDF, PNG, JPG or WEBP.` });
    if (!a.data || a.data.length > MAX_ATTACHMENT_CHARS) return json(413, { error: "That file is too large to read. Save a smaller export, or split it.", code: "too_large" });
  }

  const model = body.model ?? MODEL_DEFAULT;
  /* Attachments first, then the instruction: the model should read the
     document before it is told what to do with it. */
  const content = [
    ...attachments.map((a) =>
      a.mediaType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: a.mediaType, data: a.data } }
        : { type: "image", source: { type: "base64", media_type: a.mediaType, data: a.data } },
    ),
    { type: "text", text: body.prompt },
  ];
  const providerRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": providerKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: Math.min(body.maxTokens ?? 1024, 8192), system: body.system, messages: [{ role: "user", content }] }),
  });
  if (!providerRes.ok) {
    const detail = await providerRes.text().catch(() => "");
    console.error("provider error", providerRes.status, detail.slice(0, 500));
    return json(502, { error: `The reading service refused the request (${providerRes.status}).` });
  }
  const out = await providerRes.json();
  const text = (out.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
  const usage = out.usage ?? {};

  // Service role: meter and debit in one call; the browser never computes a charge.
  const asService = createClient(url, service);
  const { data: metered, error: meterError } = await asService.rpc("ai_record_usage", {
    p_org: body.organizationId, p_user: userData.user.id, p_feature: body.feature, p_model: model,
    p_input: usage.input_tokens ?? 0, p_output: usage.output_tokens ?? 0, p_cached: usage.cache_read_input_tokens ?? 0,
    p_request_id: out.id ?? crypto.randomUUID(), p_product: body.product ?? null,
  });
  if (meterError) return json(500, { error: `Metering failed: ${meterError.message}` });
  const row = Array.isArray(metered) ? metered[0] : metered;
  return json(200, { text, model, creditsCharged: row?.credits_charged ?? null, balance: row?.balance ?? null });
});
