# Authorize.Net — what exists, what works, and what I need from you

Inspection only, 2026-09-13. **Nothing here charges money, and nothing will
until you say so.**

---

## Your nine questions

### 1. Which credentials are configured

The function reads four environment secrets:

| Secret | Purpose |
|---|---|
| `AUTHNET_API_LOGIN_ID` | API Login ID |
| `AUTHNET_TRANSACTION_KEY` | Transaction Key — the server-side secret |
| `AUTHNET_PUBLIC_CLIENT_KEY` | Public Client Key, for Accept.js in the browser |
| `AUTHNET_ENV` | `sandbox` or `production` |

**I cannot read whether any of them are actually set.** Edge Function secrets
are not readable from the database or from this machine, by design. The
function answers honestly when they are missing rather than pretending — so
the fastest way to know is to open the payment screen and see what it says.

### 2. Sandbox or production

The code defaults to **sandbox** when `AUTHNET_ENV` is unset, and only talks to
`api.authorize.net` when it is exactly `production` or `live`. Anything else,
including a typo, goes to `apitest.authorize.net`. That default is the right
way round: a missing setting cannot accidentally charge a real card.

### 3. Customer Profiles / CIM

**Yes, in code.** `createCustomerProfileRequest` with a `paymentProfiles` entry.
**Zero profiles exist** — `payment_methods` has 0 rows.

### 4. Payment profiles

**None.** `payment_methods` and `payment_transactions` are both empty. Nothing
has ever been charged through this integration.

### 5. Recurring / ARB

**No.** There is no `ARBCreateSubscriptionRequest` anywhere in the codebase.
Recurring billing today is FullSuite generating invoices; collection is manual.

### 6. Accept.js / tokenization

**Yes, and correctly.** The browser loads Accept.js, the card goes straight to
Authorize.Net, and the server receives only a single-use `opaqueData` nonce.
**There is no code path that accepts a card number, an expiry or a CVV, and no
database column to put one in.** This is the part I would not want to rebuild.

### 7. Webhook endpoint

**None.** There is no Authorize.Net webhook function. `ghl-webhook` and
`lob-webhook` exist for other providers; nothing listens for payment events.
This is why reconciliation is manual today.

### 8. Webhook verification — what is required

Authorize.Net signs each webhook with **HMAC-SHA512** over the raw request body,
in the `X-ANET-Signature` header, formatted `sha512=<HEX>`.

To verify it, three things must be true:

1. A **Signature Key** generated in the Merchant Interface (this is a *different*
   secret from the Transaction Key).
2. The handler reads the **raw body bytes** — computing the HMAC over re-parsed
   JSON fails, because key order and whitespace change.
3. Comparison is **constant-time**, not `===`.

**Until that key exists I will not deploy the endpoint.** A webhook that skips
verification is a public URL that credits invoices — anyone who learns it could
mark any invoice paid.

### 9. What you need to do in Authorize.Net

**Sandbox first — nothing below touches real money.**

- [ ] Create a free sandbox account at `sandbox.authorize.net` if you do not have one
- [ ] Sandbox → Account → **Settings → API Credentials & Keys**: note the **API Login ID**, generate a **Transaction Key**, generate a **Public Client Key**
- [ ] Settings → **Business Information** → confirm the account is set to **Live mode OFF** (sandbox accounts are always test)
- [ ] Send me nothing. You set them yourself:
      `npx supabase secrets set AUTHNET_API_LOGIN_ID=… AUTHNET_TRANSACTION_KEY=… AUTHNET_PUBLIC_CLIENT_KEY=… AUTHNET_ENV=sandbox`
- [ ] Settings → **Webhooks** → add endpoint `https://<project>.supabase.co/functions/v1/authnet-webhook`,
      subscribe to `net.authorize.payment.authcapture.created`,
      `net.authorize.payment.refund.created`, `net.authorize.payment.void.created`,
      and the `net.authorize.customer.subscription.*` events
- [ ] Settings → **Webhooks** → copy the **Signature Key** and set it:
      `npx supabase secrets set AUTHNET_SIGNATURE_KEY=…`

**Then, and only when you say so, production:**

- [ ] The same four keys from your *live* Merchant Interface
- [ ] `AUTHNET_ENV=production`
- [ ] A separate live Signature Key and webhook endpoint
- [ ] Confirm your Authorize.Net account is enabled for **CIM** (customer profiles)
      and, if you want AutoPay, for **ARB** (recurring)

**I will never ask you for a card number or a CVV, and there is nowhere in this
platform to put one.**

---

## What I would build, once sandbox keys exist

In this order, each proven before the next:

1. **Partner ↔ customer profile.** Extend the existing profile code from
   organizations to partners. `payment_methods` gains a partner column;
   nothing about tokenization changes.
2. **Add a payment method** from the Partner Portal, through Accept.js. Stores
   `customer_profile_id`, `payment_profile_id`, `Visa •••• 4242`. No card data.
3. **Charge Now** against a stored profile, writing a canonical
   `partner_payments` row — so the invoice recomputes exactly as a Wise payment
   does. FullSuite stays the source of truth.
4. **Webhook**, with signature verification, idempotent on the Authorize.Net
   transaction id. A duplicate event finds the payment already recorded and
   does nothing.
5. **AutoPay.** The recurring sweep generates the invoice **first**, then a
   separate collection step attempts the charge. Invoice always exists;
   a failed charge records a failed transaction and leaves the invoice past
   due, so the reminder schedule takes over. No aggressive retry — the
   reminder engine is the V1 fallback, exactly as you specified.
6. **Refunds**, writing back to the same ledger.

## What I will prove in sandbox before asking you about production

- create / match a customer profile
- tokenize and store a payment method
- a one-time payment reconciling to the invoice
- recurring invoice + AutoPay attempt
- a failed payment leaving the balance due and reminders running
- a duplicate webhook event creating no second payment
- a refund reducing the invoice correctly
- the money boundary still holding for a non-owner admin

Then I stop and report, and you approve production separately.
