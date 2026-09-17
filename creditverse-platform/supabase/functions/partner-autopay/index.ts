/**
 * Autopay: charging due invoices against saved cards, unattended.
 *
 * Called once a day by `partner_autopay_dispatch()` in cron, with a shared
 * secret. It is the only unattended charging path in FullSuite, and every
 * decision here is made on the assumption that it will one day run twice, run
 * while another copy is running, or die halfway through.
 *
 * ── THREE THINGS MUST BE TRUE BEFORE IT CHARGES ANYTHING ──────────────────
 *
 *   1. The dispatch secret matches. Nothing else can start it.
 *   2. AUTHNET_ENV is production. A sandbox approves without moving money, so
 *      a sandbox sweep would mark real invoices paid and email real receipts.
 *   3. `partner_autopay_is_armed()` — Dee's approval, in the vault.
 *
 * The database enforces 2 and 3 as well, in `begin_partner_card_charge` and
 * `partner_autopay_dispatch`. Checked in both places on purpose: this one
 * gives a clear answer when somebody invokes the function by hand, and the
 * database one cannot be bypassed at all.
 *
 * ── ONE INVOICE AT A TIME, AND NEVER THE SAME ONE TWICE ───────────────────
 *
 * `partner_autopay_due()` already excludes anything with an attempt in the air
 * — pending, unknown or held for review. The key it returns is derived from
 * the invoice and its balance, so two copies of this function racing produce
 * one attempt and the loser is told so.
 *
 * A failure on one invoice never stops the others. Each is its own attempt,
 * its own charge and its own outcome.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const env = (Deno.env.get("AUTHNET_ENV")?.trim() ?? "sandbox").toLowerCase();
const isProduction = env === "production" || env === "live";
const ENDPOINT = isProduction
  ? "https://api.authorize.net/xml/v1/request.api"
  : "https://apitest.authorize.net/xml/v1/request.api";

interface AuthNetResult {
  messages?: { resultCode?: string; message?: { code?: string; text?: string }[] };
  transactionResponse?: {
    responseCode?: string; transId?: string;
    messages?: { code?: string; description?: string }[];
    errors?: { errorCode?: string; errorText?: string }[];
  };
}

const said = (r: AuthNetResult): string =>
  r.transactionResponse?.errors?.[0]?.errorText ??
  r.transactionResponse?.messages?.[0]?.description ??
  r.messages?.message?.[0]?.text ?? "no reason given";

interface Due {
  group_id: string; invoice_id: string; invoice_number: string;
  amount_cents: number; currency: string; idempotency_key: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("AUTOPAY_DISPATCH_SECRET")?.trim();
  const login = Deno.env.get("AUTHNET_API_LOGIN_ID")?.trim();
  const txnKey = Deno.env.get("AUTHNET_TRANSACTION_KEY")?.trim();
  if (!url || !service || !secret) return json(500, { error: "Not configured" });
  if (req.headers.get("x-dispatch-secret") !== secret) return json(401, { error: "Not authorised" });
  if (!login || !txnKey) return json(409, { error: "Authorize.Net keys are not set" });

  /* Gate 2. Stated plainly, because somebody running this by hand in sandbox
     deserves to be told why nothing happened. */
  if (!isProduction) {
    return json(409, {
      error: "Autopay does not run outside production: a sandbox charge is approved without moving money, "
           + "and would mark real invoices paid.",
      environment: env,
    });
  }

  const sb = createClient(url, service);

  /* Gate 3. Dee's approval, read from the vault rather than remembered. */
  const { data: armed } = await sb.rpc("partner_autopay_is_armed");
  if (armed !== true) {
    return json(409, { error: "Autopay is not armed. Nothing was charged." });
  }

  const { data: due, error: dueError } = await sb.rpc("partner_autopay_due");
  if (dueError) return json(500, { error: "Could not read what is due" });

  const results: { invoice: string; status: string; reason?: string }[] = [];

  for (const invoice of (due ?? []) as Due[]) {
    /* Claim the attempt first. If another copy of the sweep already has it,
       `already` comes back true and this one moves on without charging. */
    const { data: begun, error: beginError } = await sb.rpc("begin_partner_card_charge", {
      p_group: invoice.group_id,
      p_invoice: invoice.invoice_id,
      p_amount_cents: invoice.amount_cents,
      p_kind: "autopay",
      p_idempotency_key: invoice.idempotency_key,
      p_actor: null,
      p_environment: "production",
    });
    if (beginError) { results.push({ invoice: invoice.invoice_number, status: "skipped", reason: beginError.message }); continue; }
    if (begun?.already === true) { results.push({ invoice: invoice.invoice_number, status: "already handled" }); continue; }

    let result: AuthNetResult;
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          createTransactionRequest: {
            merchantAuthentication: { name: login, transactionKey: txnKey },
            transactionRequest: {
              transactionType: "authCaptureTransaction",
              amount: (invoice.amount_cents / 100).toFixed(2),
              profile: {
                customerProfileId: begun.customer_profile_id,
                paymentProfile: { paymentProfileId: begun.payment_profile_id },
              },
              order: {
                invoiceNumber: invoice.invoice_number.slice(0, 20),
                description: `BES invoice ${invoice.invoice_number} (autopay)`.slice(0, 255),
              },
            },
          },
        }),
      });
      result = JSON.parse((await r.text()).replace(/^﻿/, "")) as AuthNetResult;
    } catch (e) {
      /* The answer never arrived. It may have charged. This invoice is now
         UNKNOWN, which takes it out of tomorrow's sweep as well — resolved by
         the webhook or by a person, never by charging again. */
      await sb.rpc("mark_partner_card_charge_unknown", {
        p_idempotency_key: invoice.idempotency_key,
        p_note: `Autopay: no answer from Authorize.Net (${e instanceof Error ? e.message : "request failed"})`,
      });
      results.push({ invoice: invoice.invoice_number, status: "unknown", reason: "no answer from the processor" });
      continue;
    }

    const code = result.transactionResponse?.responseCode;
    const status = code === "1" ? "approved" : code === "2" ? "declined" : code === "4" ? "held_for_review" : "error";

    const { error: settleError } = await sb.rpc("settle_partner_card_charge", {
      p_idempotency_key: invoice.idempotency_key,
      p_status: status,
      p_provider_txn: result.transactionResponse?.transId ?? null,
      p_response_code: code ?? null,
      p_response_text: said(result),
    });
    if (settleError) {
      console.error("autopay charged but not recorded", invoice.invoice_number, settleError.message);
      results.push({ invoice: invoice.invoice_number, status: "charged but not recorded", reason: settleError.message });
      continue;
    }
    results.push({ invoice: invoice.invoice_number, status, reason: status === "approved" ? undefined : said(result) });
  }

  return json(200, { swept: results.length, results });
});
