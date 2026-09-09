/**
 * A market reference rate, plus your PayPal spread.
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
 *
 * It is not PayPal's rate. PayPal publishes no public rate API — its currency
 * conversion happens inside a merchant transaction, and the rate it applies is
 * a market rate plus PayPal's own margin (commonly 3–4%). So this function
 * fetches a public market rate, applies the spread YOU state in basis points,
 * and returns the result labelled `market_reference`. It is an estimate, and
 * it says so; when you know what PayPal actually gave you, enter that instead
 * and it is stored as `paypal_actual`.
 *
 * Nothing here writes a rate. It proposes one, and a person with payroll
 * permission decides — money is deliberate (rule 9).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-api-version",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const CURRENCY = /^[A-Z]{3}$/;

/**
 * Two public sources, tried in order — a rate is useless if the one feed is
 * down, and neither needs an API key. Both are market/reference rates.
 */
async function marketRate(base: string, quote: string): Promise<{ rate: number; source: string } | null> {
  const attempts: { url: string; read: (j: Record<string, unknown>) => number | undefined; name: string }[] = [
    {
      name: "open.er-api.com",
      url: `https://open.er-api.com/v6/latest/${base}`,
      read: (j) => (j.rates as Record<string, number> | undefined)?.[quote],
    },
    {
      name: "frankfurter.app",
      url: `https://api.frankfurter.app/latest?from=${base}&to=${quote}`,
      read: (j) => (j.rates as Record<string, number> | undefined)?.[quote],
    },
  ];
  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) continue;
      const body = await response.json() as Record<string, unknown>;
      const value = attempt.read(body);
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return { rate: value, source: attempt.name };
      }
    } catch {
      /* Try the next source; a failed fetch is not an error worth surfacing
         until every source has failed. */
    }
  }
  return null;
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

  /* The caller's own token decides. Reading a market rate is harmless, but
     this is a payroll surface and it answers only to payroll. */
  const { data: allowed, error: permissionError } = await asUser.rpc("agency_can", { p_key: "payroll.manage" });
  if (permissionError) return json(500, { error: "Could not check permissions" });
  if (allowed !== true) return json(403, { error: "Payroll permission required" });

  let body: { base?: string; quote?: string; spreadBps?: number };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const base = String(body.base ?? "").toUpperCase();
  const quote = String(body.quote ?? "").toUpperCase();
  if (!CURRENCY.test(base) || !CURRENCY.test(quote)) {
    return json(400, { error: "Give two three-letter currency codes, for example USD and PHP" });
  }
  if (base === quote) return json(400, { error: "Those are the same currency" });
  const spreadBps = Math.min(2000, Math.max(0, Math.round(Number(body.spreadBps ?? 350))));

  const found = await marketRate(base, quote);
  if (!found) {
    return json(502, {
      error: "No market rate could be fetched just now. Enter the rate by hand — that is the more accurate number anyway.",
      code: "fetch_failed",
    });
  }

  /* PayPal converts at less than the market rate: the spread is subtracted,
     so the estimate errs toward what actually lands. */
  const adjusted = found.rate * (1 - spreadBps / 10000);
  return json(200, {
    base,
    quote,
    marketRate: Number(found.rate.toFixed(8)),
    spreadBps,
    /* What to store: the market rate less the stated spread. */
    rate: Number(adjusted.toFixed(8)),
    marketSource: found.source,
    note: `Market reference from ${found.source} less ${(spreadBps / 100).toFixed(2)}% — an estimate of a PayPal-style rate, not PayPal's own published figure.`,
  });
});
