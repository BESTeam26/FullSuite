/**
 * Paying a BES partner invoice by card, through Authorize.Net.
 *
 * ---------------------------------------------------------------------------
 * NO CARD NUMBER EVER REACHES THIS FUNCTION.
 *
 * The portal loads Accept.js, which sends the card straight to Authorize.Net
 * and gets back an opaque single-use nonce. That nonce is all that arrives
 * here. There is no code path that accepts a PAN, a CVV or an expiry date, and
 * the database has no column for one.
 * ---------------------------------------------------------------------------
 *
 * This is the PARTNER side. `payments` is the organization-subscription side —
 * different customer, different table, different money. They deliberately do
 * not share a function: one charges `organization_subscriptions` by
 * organization, this charges `partner_invoices` by partner.
 *
 * Dee's three options, which are one mechanism:
 *
 *   pay_now       a partner opens an invoice and pays it once. No card kept.
 *   save_card     a partner stores a card. Storing is not consent to charge.
 *   card_on_file  charge the stored card for an invoice, on request.
 *   autopay       the sweep charges due invoices. Its own switch, off by
 *                 default, and refused without a card.
 *
 * ── HOW IT CANNOT BILL SOMEBODY TWICE ─────────────────────────────────────
 *
 * Every charge is a two-step: `begin_partner_card_charge` writes a PENDING
 * attempt under an idempotency key and answers whether that key already
 * existed. Only a genuinely new attempt is sent to the processor. Then
 * `settle_partner_card_charge` records the outcome, once. If the network dies
 * between the two, the retry arrives with the same key, finds the attempt, and
 * is told what happened rather than charging again.
 *
 * The key is the CALLER's to supply for pay_now and card_on_file — the portal
 * makes one per checkout, so a double-clicked button sends the same key twice.
 * For autopay the key is derived from the invoice and its balance, so it does
 * not matter how many times the sweep runs.
 *
 * ── PRODUCTION CHARGING ───────────────────────────────────────────────────
 *
 * Off until Dee says otherwise. `AUTHNET_ENV` decides, and it is sandbox
 * unless explicitly set to production.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-api-version",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const env = (Deno.env.get("AUTHNET_ENV")?.trim() ?? "sandbox").toLowerCase();
const isProduction = env === "production" || env === "live";
const ENDPOINT = isProduction
  ? "https://api.authorize.net/xml/v1/request.api"
  : "https://apitest.authorize.net/xml/v1/request.api";

interface AuthNetResult {
  messages?: { resultCode?: string; message?: { code?: string; text?: string }[] };
  transactionResponse?: {
    responseCode?: string;
    transId?: string;
    messages?: { code?: string; description?: string }[];
    errors?: { errorCode?: string; errorText?: string }[];
    accountNumber?: string;
    accountType?: string;
  };
  customerProfileId?: string;
  customerPaymentProfileIdList?: string[];
}

/** Authorize.Net answers 200 with a BOM in front of the JSON. */
async function callAuthNet(payload: unknown): Promise<AuthNetResult> {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return JSON.parse((await r.text()).replace(/^﻿/, "")) as AuthNetResult;
}

const merchant = () => ({
  name: Deno.env.get("AUTHNET_API_LOGIN_ID")?.trim(),
  transactionKey: Deno.env.get("AUTHNET_TRANSACTION_KEY")?.trim(),
});

/** The first thing the processor said, verbatim. Never our paraphrase. */
const said = (r: AuthNetResult): string =>
  r.transactionResponse?.errors?.[0]?.errorText ??
  r.transactionResponse?.messages?.[0]?.description ??
  r.messages?.message?.[0]?.text ??
  "no reason given";

/** 1 approved · 2 declined · 3 error · 4 held for review. The envelope can say
 *  Ok while the transaction itself was declined, so the transaction's own code
 *  is what decides. */
const outcomeOf = (r: AuthNetResult) => {
  const code = r.transactionResponse?.responseCode;
  return {
    code: code ?? null,
    status: code === "1" ? "approved" : code === "2" ? "declined" : code === "4" ? "held_for_review" : "error",
  };
};

interface Body {
  action?: string;
  groupId?: string;
  invoiceId?: string | null;
  amountCents?: number;
  idempotencyKey?: string;
  opaqueData?: { dataDescriptor?: string; dataValue?: string };
  cardBrand?: string | null;
  last4?: string | null;
  expMonth?: number | null;
  expYear?: number | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json(500, { error: "Not configured" });

  const login = Deno.env.get("AUTHNET_API_LOGIN_ID")?.trim();
  const txnKey = Deno.env.get("AUTHNET_TRANSACTION_KEY")?.trim();
  const clientKey = Deno.env.get("AUTHNET_PUBLIC_CLIENT_KEY")?.trim();

  let input: Body;
  try { input = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }

  /* `config` answers before the keys are checked, because saying what is
     missing is its whole job. The portal uses it to decide whether to offer
     card payment at all, rather than showing a button that cannot work. */
  if (input.action === "config") {
    return json(200, {
      connected: !!(login && txnKey && clientKey),
      environment: isProduction ? "production" : "sandbox",
      apiLoginId: login ?? null,
      clientKey: clientKey ?? null,
      missing: [
        !login ? "AUTHNET_API_LOGIN_ID" : null,
        !txnKey ? "AUTHNET_TRANSACTION_KEY" : null,
        !clientKey ? "AUTHNET_PUBLIC_CLIENT_KEY" : null,
      ].filter(Boolean),
    });
  }

  if (!login || !txnKey) {
    return json(409, { error: "Card payment is not connected: the Authorize.Net keys are not set." });
  }

  /* Who is calling. The database decides what they may do — this only
     establishes WHO, and never trusts a body field for it. */
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Sign in first" });
  const asUser = createClient(url, anon, { global: { headers: { authorization: authHeader } } });
  const { data: userData } = await asUser.auth.getUser();
  const actorId = userData?.user?.id ?? null;
  if (!actorId) return json(401, { error: "Sign in first" });

  const groupId = input.groupId;
  if (!groupId) return json(400, { error: "groupId is required" });

  const sb = createClient(url, service);

  /* Every action below is authorized by the same database function, which
     answers for a NAMED person because the service role has no session. It
     checks an active portal contact with portal access on, or BES staff
     holding the owner-gated partners.payments.record. */
  const { data: mayAct, error: mayActError } = await sb.rpc("may_act_on_partner_billing", {
    p_group: groupId,
    p_actor: actorId,
  });
  if (mayActError) return json(500, { error: "Could not check permissions" });
  if (mayAct !== true) return json(403, { error: "You cannot pay for this partner." });

  /* ── Keeping a card ───────────────────────────────────────────────── */
  if (input.action === "save_card") {
    const opaque = input.opaqueData;
    if (!opaque?.dataDescriptor || !opaque?.dataValue) {
      return json(400, { error: "A tokenised card is required. The card itself never comes here." });
    }
    const { data: group } = await sb
      .from("outsourcing_groups").select("name, contact_email").eq("id", groupId).maybeSingle();

    let result: AuthNetResult;
    try {
      result = await callAuthNet({
        createCustomerProfileRequest: {
          merchantAuthentication: merchant(),
          profile: {
            merchantCustomerId: groupId.slice(0, 20),
            description: group?.name ?? "BES partner",
            email: group?.contact_email ?? undefined,
            paymentProfiles: [{ customerType: "business", payment: { opaqueData: opaque } }],
          },
          validationMode: isProduction ? "liveMode" : "testMode",
        },
      });
    } catch {
      return json(502, { error: "Could not reach Authorize.Net." });
    }

    const profileId = result.customerProfileId;
    const paymentProfileId = result.customerPaymentProfileIdList?.[0];
    if (result.messages?.resultCode !== "Ok" || !profileId || !paymentProfileId) {
      return json(400, { error: `Authorize.Net refused the card: ${said(result)}` });
    }

    const { error: saveError } = await sb.rpc("save_partner_card_profile", {
      p_group: groupId,
      p_customer_profile: profileId,
      p_payment_profile: paymentProfileId,
      p_brand: input.cardBrand ?? null,
      p_last4: input.last4 ?? null,
      p_exp_month: input.expMonth ?? null,
      p_exp_year: input.expYear ?? null,
      p_actor: actorId,
    });
    if (saveError) {
      console.error("card saved at processor but not recorded", saveError.message);
      return json(500, {
        error: "The card was saved with the processor but not recorded here. Do not retry — contact support.",
      });
    }
    return json(200, { saved: true, environment: isProduction ? "production" : "sandbox" });
  }

  /* ── Charging ─────────────────────────────────────────────────────── */
  if (input.action === "pay_now" || input.action === "card_on_file") {
    const amount = input.amountCents;
    if (!Number.isInteger(amount) || (amount as number) <= 0) {
      return json(400, { error: "A positive amount in cents is required" });
    }
    const key = input.idempotencyKey?.trim();
    /* Required, not generated here. A key this function invented would be new
       on every retry, which is the same as having none. */
    if (!key || key.length < 8) {
      return json(400, { error: "An idempotency key is required, and must come from the caller." });
    }
    if (input.action === "pay_now" && !input.opaqueData?.dataValue) {
      return json(400, { error: "A tokenised card is required. The card itself never comes here." });
    }

    /* Step one: claim the attempt. This is where the invoice is checked, the
       amount is checked against the balance, and a retry is recognised. */
    const { data: begun, error: beginError } = await sb.rpc("begin_partner_card_charge", {
      p_group: groupId,
      p_invoice: input.invoiceId ?? null,
      p_amount_cents: amount,
      p_kind: input.action,
      p_idempotency_key: key,
      p_actor: actorId,
      p_environment: isProduction ? "production" : "sandbox",
    });
    if (beginError) return json(400, { error: beginError.message });

    /* A retry of a call that already ran. Answer with what happened then —
       under no circumstances send a second charge. */
    if (begun?.already === true) {
      return json(begun.status === "approved" || begun.status === "pending" ? 200 : 402, {
        status: begun.status,
        paymentId: begun.payment_id ?? null,
        providerTxnId: begun.provider_txn_id ?? null,
        alreadyHandled: true,
        environment: isProduction ? "production" : "sandbox",
      });
    }

    /* pay_now sends the one-time nonce; card_on_file names the stored profile
       that `begin_partner_card_charge` just confirmed exists. */
    const instrument = input.action === "pay_now"
      ? { payment: { opaqueData: input.opaqueData } }
      : {
          profile: {
            customerProfileId: begun.customer_profile_id,
            paymentProfile: { paymentProfileId: begun.payment_profile_id },
          },
        };

    let result: AuthNetResult;
    try {
      result = await callAuthNet({
        createTransactionRequest: {
          merchantAuthentication: merchant(),
          transactionRequest: {
            transactionType: "authCaptureTransaction",
            amount: ((amount as number) / 100).toFixed(2),
            ...instrument,
            order: {
              invoiceNumber: (begun.invoice_number ?? "").slice(0, 20) || undefined,
              description: `BES invoice ${begun.invoice_number ?? ""}`.trim().slice(0, 255),
            },
          },
        },
      });
    } catch (e) {
      /* Dee's exact scenario: "gateway charged successfully → network timed
         out → FullSuite assumes failure → FullSuite charges again."
         We cannot tell a connection that was refused from one that was
         answered after we stopped listening, and guessing "nothing was
         charged" is what bills somebody twice. So the attempt becomes
         UNKNOWN: never retried automatically, never credits the invoice,
         resolved by the webhook or by a person reading the transaction list. */
      await sb.rpc("mark_partner_card_charge_unknown", {
        p_idempotency_key: key,
        p_note: `No answer from Authorize.Net: ${e instanceof Error ? e.message : "request failed"}`,
      });
      return json(502, {
        status: "unknown",
        error: "We did not get an answer from the card processor. Do not try again — "
             + "we are confirming whether this payment went through.",
      });
    }

    const { status, code } = outcomeOf(result);

    /* Step two: record the outcome, once. */
    const { data: settled, error: settleError } = await sb.rpc("settle_partner_card_charge", {
      p_idempotency_key: key,
      p_status: status,
      p_provider_txn: result.transactionResponse?.transId ?? null,
      p_response_code: code,
      p_response_text: said(result),
    });
    if (settleError) {
      console.error("charged but not recorded", settleError.message, result.transactionResponse?.transId);
      return json(500, {
        error: "The charge went through but recording it failed. Do not retry — contact support.",
        providerTxnId: result.transactionResponse?.transId ?? null,
      });
    }

    return json(status === "approved" ? 200 : 402, {
      status,
      paymentId: settled?.payment_id ?? null,
      providerTxnId: settled?.provider_txn_id ?? null,
      reason: said(result),
      environment: isProduction ? "production" : "sandbox",
    });
  }

  return json(400, { error: "Unknown action" });
});
