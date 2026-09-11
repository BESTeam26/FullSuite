/**
 * Payments, through Authorize.Net.
 *
 * ---------------------------------------------------------------------------
 * NO CARD NUMBER EVER REACHES THIS FUNCTION.
 *
 * The browser loads Accept.js, which sends the card straight to Authorize.Net
 * and gets back an opaque nonce (`opaqueData`). That nonce is all this function
 * receives, and it is single-use. There is no code path here that accepts a
 * PAN, a CVV or an expiry, and the database has no column for one.
 * ---------------------------------------------------------------------------
 *
 * Three actions:
 *
 *   config      the public keys Accept.js needs in the browser. Public by
 *               design — Accept.js cannot work without them being in the page.
 *   save_card   exchange the nonce for a stored customer profile.
 *   charge      charge the stored profile for the organization's subscription.
 *
 * Every action checks the CALLER's own session against the database first. The
 * processor is only spoken to after the platform has already decided this
 * person may do this, for this organization.
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
  const text = (await r.text()).replace(/^\uFEFF/, "");
  return JSON.parse(text) as AuthNetResult;
}

const merchant = () => ({
  name: Deno.env.get("AUTHNET_API_LOGIN_ID")?.trim(),
  transactionKey: Deno.env.get("AUTHNET_TRANSACTION_KEY")?.trim(),
});

/** The first message the processor gave, verbatim. Never our paraphrase. */
const said = (r: AuthNetResult): string =>
  r.transactionResponse?.errors?.[0]?.errorText ??
  r.transactionResponse?.messages?.[0]?.description ??
  r.messages?.message?.[0]?.text ??
  "no reason given";

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

  let input: { action?: string; organizationId?: string; opaqueData?: { dataDescriptor?: string; dataValue?: string }; amountCents?: number; description?: string };
  try {
    input = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  /* `config` is the only action that answers before the merchant keys are
     checked, because its whole job is to say whether they are there. */
  if (input.action === "config") {
    return json(200, {
      connected: !!(login && txnKey && clientKey),
      environment: isProduction ? "production" : "sandbox",
      apiLoginId: login ?? null,
      clientKey: clientKey ?? null,
      /* Named so the screen can say what is missing rather than "not ready". */
      missing: [
        !login ? "AUTHNET_API_LOGIN_ID" : null,
        !txnKey ? "AUTHNET_TRANSACTION_KEY" : null,
        !clientKey ? "AUTHNET_PUBLIC_CLIENT_KEY" : null,
      ].filter(Boolean),
    });
  }

  if (!login || !txnKey) return json(409, { error: "Payments are not connected: the Authorize.Net keys are not set." });

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Sign in first" });
  const asUser = createClient(url, anon, { global: { headers: { authorization: authHeader } } });
  const { data: userData } = await asUser.auth.getUser();
  const actorId = userData?.user?.id ?? null;
  if (!actorId) return json(401, { error: "Sign in first" });

  const orgId = input.organizationId;
  if (!orgId) return json(400, { error: "organizationId is required" });

  /* The database decides, as this user. `is_org_admin` is a SECURITY DEFINER
     helper, but it reads auth.uid() — which is this caller, not the service
     role — so it cannot be tricked by a body field. */
  const { data: isAdmin, error: adminError } = await asUser.rpc("is_org_admin", { p_org: orgId });
  if (adminError) return json(500, { error: "Could not check permissions" });
  if (isAdmin !== true) return json(403, { error: "Only an organization administrator can manage payment." });

  const sb = createClient(url, service);

  /* ---------------------------------------------------------------- */
  if (input.action === "save_card") {
    const opaque = input.opaqueData;
    if (!opaque?.dataDescriptor || !opaque?.dataValue) {
      return json(400, { error: "A tokenised card is required. The card itself never comes here." });
    }
    const { data: org } = await sb.from("organizations").select("name, principal_email").eq("id", orgId).maybeSingle();

    let result: AuthNetResult;
    try {
      result = await callAuthNet({
        createCustomerProfileRequest: {
          merchantAuthentication: merchant(),
          profile: {
            merchantCustomerId: orgId.slice(0, 20),
            description: org?.name ?? "BES organization",
            email: org?.principal_email ?? undefined,
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

    const { error: recordError } = await sb.rpc("record_payment_method", {
      p_org: orgId,
      p_customer_profile: profileId,
      p_payment_profile: paymentProfileId,
      p_brand: null,
      p_last4: null,
      p_exp_month: null,
      p_exp_year: null,
      p_actor: actorId,
    });
    if (recordError) {
      console.error("card saved at processor but not recorded", recordError.message);
      return json(500, { error: "The card was saved with the processor but not recorded here. Do not retry — contact support." });
    }
    return json(200, { saved: true, environment: isProduction ? "production" : "sandbox" });
  }

  /* ---------------------------------------------------------------- */
  if (input.action === "charge") {
    const amount = input.amountCents;
    if (!Number.isInteger(amount) || (amount as number) <= 0) {
      return json(400, { error: "A positive amount in cents is required" });
    }
    const { data: method } = await sb
      .from("payment_methods")
      .select("customer_profile_id, payment_profile_id, last4")
      .eq("organization_id", orgId)
      .eq("is_default", true)
      .maybeSingle();
    if (!method) return json(409, { error: "No card on file for this organization." });

    const { data: subscription } = await sb
      .from("organization_subscriptions")
      .select("id")
      .eq("organization_id", orgId)
      .in("status", ["trialing", "active", "past_due"])
      .maybeSingle();

    let result: AuthNetResult;
    try {
      result = await callAuthNet({
        createTransactionRequest: {
          merchantAuthentication: merchant(),
          transactionRequest: {
            transactionType: "authCaptureTransaction",
            amount: ((amount as number) / 100).toFixed(2),
            profile: {
              customerProfileId: method.customer_profile_id,
              paymentProfile: { paymentProfileId: method.payment_profile_id },
            },
            order: { description: (input.description ?? "BES subscription").slice(0, 255) },
          },
        },
      });
    } catch {
      return json(502, { error: "Could not reach Authorize.Net. Nothing was charged." });
    }

    const tr = result.transactionResponse;
    /* responseCode: 1 approved, 2 declined, 3 error, 4 held for review. The
       envelope can say Ok while the transaction itself was declined, so the
       transaction's own code is what decides. */
    const code = tr?.responseCode;
    const status =
      code === "1" ? "approved" : code === "2" ? "declined" : code === "4" ? "held_for_review" : "error";

    const { error: recordError } = await sb.rpc("record_payment_transaction", {
      p_org: orgId,
      p_subscription: subscription?.id ?? null,
      p_provider_txn: tr?.transId ?? null,
      p_amount_cents: amount,
      p_status: status,
      p_code: code ?? null,
      p_text: said(result),
      p_last4: method.last4 ?? tr?.accountNumber?.slice(-4) ?? null,
      p_description: input.description ?? null,
      p_actor: actorId,
    });
    if (recordError) {
      console.error("charged but not recorded", recordError.message, tr?.transId);
      return json(500, {
        error: "The charge went through but recording it failed. Do not retry — check the transaction list.",
        providerTxnId: tr?.transId ?? null,
      });
    }

    return json(status === "approved" ? 200 : 402, {
      status,
      providerTxnId: tr?.transId ?? null,
      reason: said(result),
      environment: isProduction ? "production" : "sandbox",
    });
  }

  return json(400, { error: "Unknown action" });
});
