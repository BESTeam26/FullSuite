/**
 * Post one approved dispute letter through Lob.
 *
 * This is the only place in the platform that spends money and puts paper in
 * the post, so the order of operations matters more than the code does:
 *
 *   1. the CALLER's own session decides whether they may post this letter —
 *      `begin_letter_mailing` runs as them, checks the permission key and the
 *      approval gate, freezes the addresses and writes a 'queued' row;
 *   2. only then does Lob get asked;
 *   3. whatever Lob says is written back through `complete_letter_mailing`,
 *      which is the only thing that marks the letter mailed and starts the
 *      statutory clocks.
 *
 * A crash between 2 and 3 leaves a 'queued' row, which is visible and
 * retryable. A crash before 2 leaves nothing. What cannot happen is a letter
 * posted with no record of it, or a record of a posting that never happened.
 *
 * A TEST Lob key simulates rather than posts, and the letter is deliberately
 * NOT marked mailed in that case: those clocks are the legal spine of a
 * dispute round and must not start on an envelope that does not exist.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-api-version",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

interface Address {
  name: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  zip: string;
}

interface Body {
  letterId?: string;
  to?: Address;
  from?: Address;
  /** The letter text as it was approved. Lob renders it. */
  body?: string;
  /** Certified mail costs more; the caller decides deliberately. */
  certified?: boolean;
  colour?: boolean;
}

const lobAddress = (a: Address) => ({
  name: a.name,
  address_line1: a.line1,
  address_line2: a.line2 || undefined,
  address_city: a.city,
  address_state: a.state,
  address_zip: a.zip,
  address_country: "US",
});

/** Lob renders HTML. The approved text is plain, so it is escaped, never trusted. */
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const asLetterHtml = (text: string) => `<html><head><meta charset="utf-8"><style>
  @page { margin: 0.5in; }
  body { font-family: Georgia, "Times New Roman", serif; font-size: 11pt; line-height: 1.5; color: #000; }
  .page { padding: 0.5in; white-space: pre-wrap; }
</style></head><body><div class="page">${escapeHtml(text)}</div></body></html>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const lobKey = Deno.env.get("LOB_API_KEY")?.trim();
  if (!url || !anon || !service) return json(500, { error: "Not configured" });
  if (!lobKey) return json(409, { error: "Letter posting is not connected yet — LOB_API_KEY is not set." });

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Sign in first" });

  let input: Body;
  try {
    input = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!input.letterId || !input.to || !input.from || !input.body?.trim()) {
    return json(400, { error: "letterId, to, from and body are all required" });
  }

  const asUser = createClient(url, anon, { global: { headers: { authorization: authHeader } } });

  /* Step 1. The caller's own permission, the approval gate, and the frozen
     addresses. If this refuses, nothing has been spent. */
  const { data: mailingId, error: beginError } = await asUser.rpc("begin_letter_mailing", {
    p_letter: input.letterId,
    p_to: input.to,
    p_from: input.from,
  });
  if (beginError) {
    /* 23505 is the one-in-flight index: somebody already pressed Post. */
    if (beginError.code === "23505") {
      return json(409, { error: "This letter is already being posted." });
    }
    return json(403, { error: beginError.message });
  }

  const mode = lobKey.startsWith("live_") ? "live" : "test";
  const sb = createClient(url, service);

  let response: Response;
  try {
    const form = {
      description: `BES dispute letter ${input.letterId}`,
      to: lobAddress(input.to),
      from: lobAddress(input.from),
      file: asLetterHtml(input.body),
      color: input.colour === true,
      double_sided: false,
      address_placement: "top_first_page",
      mail_type: input.certified ? "usps_first_class" : "usps_first_class",
      ...(input.certified ? { extra_service: "certified" } : {}),
    };
    response = await fetch("https://api.lob.com/v1/letters", {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${lobKey}:`)}`,
        "content-type": "application/json",
        /* Lob's own idempotency: a retried request with the same key returns
           the original letter instead of posting a second one. The mailing id
           is unique per attempt, which is exactly the right key. */
        "idempotency-key": mailingId as string,
      },
      body: JSON.stringify(form),
    });
  } catch (e) {
    await sb.rpc("complete_letter_mailing", {
      p_mailing: mailingId,
      p_status: "failed",
      p_mode: mode,
      p_error: `Could not reach Lob: ${String(e).slice(0, 200)}`,
    });
    return json(502, { error: "Could not reach Lob. Nothing was posted." });
  }

  const text = await response.text();
  if (!response.ok) {
    let reason = text.slice(0, 400);
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed.error?.message) reason = parsed.error.message;
    } catch { /* keep the raw text */ }
    await sb.rpc("complete_letter_mailing", {
      p_mailing: mailingId,
      p_status: "failed",
      p_mode: mode,
      p_error: reason,
    });
    return json(response.status === 401 ? 403 : 502, { error: `Lob refused it: ${reason}`, mailingId });
  }

  const letter = JSON.parse(text) as {
    id?: string;
    expected_delivery_date?: string;
    tracking_number?: string;
    price?: string | number;
  };
  const cents =
    letter.price === undefined || letter.price === null
      ? null
      : Math.round(Number(letter.price) * 100);

  const { error: completeError } = await sb.rpc("complete_letter_mailing", {
    p_mailing: mailingId,
    p_status: "submitted",
    p_provider_id: letter.id ?? null,
    p_mode: mode,
    p_expected: letter.expected_delivery_date ?? null,
    p_tracking: letter.tracking_number ?? null,
    p_cost_cents: Number.isFinite(cents) ? cents : null,
  });
  if (completeError) {
    /* The letter IS posted. Say so loudly rather than reporting a failure the
       provider did not have — the paper is real either way. */
    console.error("posted but not recorded", completeError.message, letter.id);
    return json(500, {
      error: "The letter was posted but recording it failed. Do not retry — check the mailing record.",
      providerId: letter.id,
      mailingId,
    });
  }

  return json(200, {
    mailingId,
    providerId: letter.id ?? null,
    mode,
    expectedDelivery: letter.expected_delivery_date ?? null,
    trackingNumber: letter.tracking_number ?? null,
    costCents: cents,
    /* Said plainly, because a test posting looks identical otherwise. */
    posted: mode === "live",
  });
});
