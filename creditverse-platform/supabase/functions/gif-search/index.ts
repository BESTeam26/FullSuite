/**
 * GIF search, so the key never reaches the browser.
 *
 * Dee, 2026-09-17: "I want to have the capability to send GIF too just like in
 * Slack."
 *
 * ── WHY A FUNCTION AND NOT A DIRECT CALL ──────────────────────────────────
 *
 * The provider wants an API key on every request. A key in the front end is a
 * key on a pastebin within a week — same reason `ai-gateway` exists and the
 * same rule as every other integration here: the key lives on the server and
 * the browser asks this.
 *
 * ── AND WHY THE GIF ITSELF DOES NOT COME THROUGH HERE ─────────────────────
 *
 * Only the SEARCH is proxied. When somebody picks one, the browser fetches
 * that GIF from the provider's CDN, wraps it in a File and hands it to the
 * composer's existing attachment path — so it is uploaded to BES storage like
 * any other image and rendered by the same code.
 *
 * That matters beyond tidiness: a message whose picture is a hotlink to
 * somebody else's CDN is a message that goes blank when they reorganise, and
 * BES conversations are kept for seven years.
 *
 * ── NOT CONNECTED IS AN ANSWER ────────────────────────────────────────────
 *
 * With no key this says so plainly and the button explains itself, rather than
 * returning an empty list that reads as "no GIFs match".
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, apikey, x-client-info, x-supabase-api-version",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

interface TenorResult {
  id: string;
  content_description?: string;
  media_formats?: Record<string, { url?: string; dims?: number[] }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const key = Deno.env.get("TENOR_API_KEY")?.trim();

  let input: { action?: string; query?: string; limit?: number };
  try { input = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }

  /* Asked before the picker draws a search box it cannot use. */
  if (input.action === "config") {
    return json(200, { connected: !!key, provider: "tenor" });
  }

  if (!key) {
    return json(409, {
      error: "GIF search is not connected: TENOR_API_KEY is not set.",
      connected: false,
    });
  }

  const query = (input.query ?? "").trim().slice(0, 100);
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 40);

  /* An empty box shows what is popular rather than nothing — the same thing
     Slack does, and the reason the picker is useful before you type. */
  const endpoint = query
    ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}`
    : "https://tenor.googleapis.com/v2/featured";

  let payload: { results?: TenorResult[] };
  try {
    const r = await fetch(
      `${endpoint}${query ? "&" : "?"}key=${encodeURIComponent(key)}` +
      `&client_key=bes_fullsuite&limit=${limit}&media_filter=tinygif,gif&contentfilter=high`,
    );
    if (!r.ok) return json(502, { error: `The GIF provider answered ${r.status}.` });
    payload = await r.json();
  } catch {
    return json(502, { error: "Could not reach the GIF provider." });
  }

  /* Trimmed to what the picker draws. Nothing else is passed through — a
     search result is untrusted data, and the less of it that crosses into the
     app the less there is to get wrong. */
  const results = (payload.results ?? []).flatMap((g) => {
    const full = g.media_formats?.gif;
    const preview = g.media_formats?.tinygif ?? full;
    if (!full?.url || !preview?.url) return [];
    return [{
      id: String(g.id),
      description: String(g.content_description ?? "GIF").slice(0, 120),
      previewUrl: preview.url,
      url: full.url,
      width: preview.dims?.[0] ?? null,
      height: preview.dims?.[1] ?? null,
    }];
  });

  return json(200, { connected: true, results });
});
