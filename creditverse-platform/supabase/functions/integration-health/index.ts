/**
 * Are the integrations actually connected?
 *
 * Every provider key lives in Supabase secrets, which means the app can tell
 * you a key EXISTS but never whether it WORKS. A stored key and a working key
 * are different things, and the gap between them is where "it's configured"
 * quietly means "it fails on first use".
 *
 * So this asks each provider a read-only question with the real credential:
 *
 *   Anthropic       GET /v1/models            free, changes nothing
 *   Resend          GET /domains              also returns whether the sending
 *                                             domain is verified, which is the
 *                                             thing that actually blocks mail
 *   Lob             GET /addresses?limit=1    read-only
 *   Authorize.Net   authenticateTestRequest   the provider's own auth probe
 *
 * Nothing here sends an email, posts a letter, charges a card or spends a
 * token. And no secret is returned: the answers are a status, a reason, and
 * for Resend the domain names, which are not secret.
 *
 * BES staff only, checked with the caller's own session.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-api-version",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

type State = "working" | "rejected" | "not_configured" | "unreachable";

interface Check {
  provider: string;
  state: State;
  /** Plain language, aimed at the person who has to fix it. */
  detail: string;
  /** What this unblocks, so a red row means something. */
  powers: string;
}

const TIMEOUT_MS = 10_000;

async function ask(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkAnthropic(): Promise<Check> {
  const base = { provider: "Anthropic", powers: "Reading scanned credit reports, letter wording help, fit explanations" };
  const key = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
  if (!key) return { ...base, state: "not_configured", detail: "ANTHROPIC_API_KEY is not set." };
  try {
    const r = await ask("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    if (r.status === 401 || r.status === 403) {
      return { ...base, state: "rejected", detail: "Anthropic refused the key. Check it was copied whole and has not been revoked." };
    }
    if (!r.ok) return { ...base, state: "unreachable", detail: `Anthropic answered ${r.status}.` };
    return { ...base, state: "working", detail: "The key is valid. Spend is capped in the Anthropic console, not here." };
  } catch {
    return { ...base, state: "unreachable", detail: "Could not reach Anthropic." };
  }
}

async function checkResend(): Promise<Check> {
  const base = { provider: "Resend", powers: "Activation and welcome email, and anything else the app sends itself" };
  const key = Deno.env.get("MAIL_PROVIDER_API_KEY")?.trim();
  const from = Deno.env.get("MAIL_FROM")?.trim();
  if (!key) return { ...base, state: "not_configured", detail: "MAIL_PROVIDER_API_KEY is not set." };
  try {
    const r = await ask("https://api.resend.com/domains", { headers: { authorization: `Bearer ${key}` } });
    if (r.status === 401 || r.status === 403) {
      return { ...base, state: "rejected", detail: "Resend refused the key. It may be a restricted key without sending access." };
    }
    if (!r.ok) return { ...base, state: "unreachable", detail: `Resend answered ${r.status}.` };
    const body = (await r.json().catch(() => null)) as { data?: { name?: string; status?: string }[] } | null;
    const domains = Array.isArray(body?.data) ? body!.data! : [];
    const verified = domains.filter((d) => d.status === "verified").map((d) => d.name).filter(Boolean);
    /* A valid key with no verified domain still cannot send. That distinction
       is the whole reason this check reads domains rather than just pinging. */
    if (verified.length === 0) {
      return {
        ...base,
        state: "rejected",
        detail:
          domains.length === 0
            ? "The key works, but no sending domain is added in Resend. Mail will be refused."
            : `The key works, but no domain is verified yet (${domains.map((d) => `${d.name}: ${d.status}`).join(", ")}).`,
      };
    }
    const fromDomain = from?.match(/@([^>\s]+)/)?.[1]?.toLowerCase();
    const fromOk = !fromDomain || verified.some((v) => v!.toLowerCase() === fromDomain);
    return {
      ...base,
      state: fromOk ? "working" : "rejected",
      detail: fromOk
        ? `Verified: ${verified.join(", ")}. Sending as ${from ?? "(MAIL_FROM not set)"}.`
        : `MAIL_FROM uses ${fromDomain}, which is not one of the verified domains (${verified.join(", ")}).`,
    };
  } catch {
    return { ...base, state: "unreachable", detail: "Could not reach Resend." };
  }
}

async function checkLob(): Promise<Check> {
  const base = { provider: "Lob", powers: "Posting dispute letters and tracking them" };
  const key = Deno.env.get("LOB_API_KEY")?.trim();
  if (!key) return { ...base, state: "not_configured", detail: "LOB_API_KEY is not set." };
  try {
    /* Lob uses HTTP Basic with the key as the username and an empty password. */
    const auth = btoa(`${key}:`);
    const r = await ask("https://api.lob.com/v1/addresses?limit=1", { headers: { authorization: `Basic ${auth}` } });
    if (r.status === 401 || r.status === 403) {
      return { ...base, state: "rejected", detail: "Lob refused the key." };
    }
    if (!r.ok) return { ...base, state: "unreachable", detail: `Lob answered ${r.status}.` };
    const live = key.startsWith("live_");
    return {
      ...base,
      state: "working",
      detail: live
        ? "The key is valid and it is a LIVE key — letters sent with it are really posted and really billed."
        : "The key is valid and it is a TEST key. Letters will be simulated, not posted.",
    };
  } catch {
    return { ...base, state: "unreachable", detail: "Could not reach Lob." };
  }
}

async function checkAuthorizeNet(): Promise<Check> {
  const base = { provider: "Authorize.Net", powers: "Paid sign-up, plan changes, consumer billing" };
  const login = Deno.env.get("AUTHNET_API_LOGIN_ID")?.trim();
  const key = Deno.env.get("AUTHNET_TRANSACTION_KEY")?.trim();
  const env = (Deno.env.get("AUTHNET_ENV")?.trim() ?? "sandbox").toLowerCase();
  if (!login || !key) {
    return { ...base, state: "not_configured", detail: "AUTHNET_API_LOGIN_ID or AUTHNET_TRANSACTION_KEY is not set." };
  }
  const endpoint =
    env === "production" || env === "live"
      ? "https://api.authorize.net/xml/v1/request.api"
      : "https://apitest.authorize.net/xml/v1/request.api";
  try {
    const r = await ask(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        authenticateTestRequest: { merchantAuthentication: { name: login, transactionKey: key } },
      }),
    });
    if (!r.ok) return { ...base, state: "unreachable", detail: `Authorize.Net answered ${r.status}.` };
    /* Authorize.Net answers 200 with a BOM and a resultCode inside. A 200 here
       does not mean the credentials were accepted — that is what resultCode
       says, and reading only the HTTP status would report a rejection as a
       success. */
    const text = (await r.text()).replace(/^﻿/, "");
    const body = JSON.parse(text) as { messages?: { resultCode?: string; message?: { text?: string }[] } };
    const ok = body.messages?.resultCode === "Ok";
    const said = body.messages?.message?.[0]?.text ?? "no reason given";
    return {
      ...base,
      state: ok ? "working" : "rejected",
      detail: ok
        ? `Credentials accepted against the ${env === "production" || env === "live" ? "PRODUCTION" : "sandbox"} endpoint.`
        : `Authorize.Net refused them: ${said}`,
    };
  } catch {
    return { ...base, state: "unreachable", detail: "Could not reach Authorize.Net." };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return json(500, { error: "Not configured" });

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Sign in first" });
  const asUser = createClient(url, anon, { global: { headers: { authorization: authHeader } } });
  const { data: staff, error: staffError } = await asUser.rpc("is_agency_staff");
  if (staffError) return json(500, { error: "Could not check permissions" });
  if (staff !== true) return json(403, { error: "BES staff only" });

  /* All four in parallel: they are independent and one slow provider should
     not decide how long the screen takes (rule 14). */
  const checks = await Promise.all([checkAnthropic(), checkResend(), checkLob(), checkAuthorizeNet()]);
  return json(200, { checkedAt: new Date().toISOString(), checks });
});
