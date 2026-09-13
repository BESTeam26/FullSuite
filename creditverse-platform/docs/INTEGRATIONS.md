# Integrations

**The stack is locked** (Dee, 2026-09-06). Do not introduce an alternative and
do not re-suggest one that was dropped — the cost of a second way to do the same
job is paid forever.

| Job | Locked choice |
|---|---|
| Source | **GitHub** — `BESTeam26/FullSuite`, branch `main` |
| Hosting | **Vercel** — static build from `creditverse-platform/` |
| Backend | **Supabase** — project `wiojlgkzxlaiajwwrzuj` |
| Email | **Resend** |
| AI | **Anthropic**, through the `ai-gateway` Edge Function |
| Posted letters | **Lob** |
| Payments | **Authorize.Net** |
| Sales front end | **GoHighLevel** |

**Explicitly not used:** Render, Netlify, Heroku; Sender, Postmark, SendGrid,
Mailgun; any second database, ORM or auth SDK.

Where a key is missing, the feature **says it is not connected**. It does not
fall back to a stub, a sample, or a second provider.

## Edge Functions

14 Deno functions in `supabase/functions/`, plus `_shared/`, which holds the
email template and common helpers.

| Function | Does |
|---|---|
| `ai-gateway` | the **only** path from a browser to a model; the Anthropic key never leaves the server |
| `billing-email` | drains `billing_email_outbox` → Resend |
| `send-invitation` | agency and partner invitations |
| `send-welcome` | welcome mail |
| `send-signature-request` | document signing requests |
| `payments` | Authorize.Net — **see below** |
| `post-letter` | Lob dispute letters |
| `lob-webhook` | Lob delivery events |
| `ghl-push` / `ghl-sync` / `ghl-webhook` | GoHighLevel |
| `clickup-import` | one-time ClickUp migration |
| `fx-rate` | currency conversion |
| `integration-health` | connectivity reporting |

Secret **names** are listed in `docs/ENVIRONMENT.md`. Values are held in
Supabase Function secrets and are not readable from the database or the repo —
by design.

## Resend

Two distinct jobs, easy to confuse:

1. **Supabase Auth SMTP** — `smtp.resend.com`, username `resend`, password is an
   API key. Sign-in, confirmation and recovery mail.
2. **The transactional API** — `api.resend.com/emails`, used by the Edge
   Functions for application mail.

**The sender name must match in both places.** Supabase Auth's
`smtp_sender_name` was once "BES" while application mail said "Blessed Empire
Services"; both are now aligned to the agency record, and `billing-email` reads
the name from the database rather than a constant.

## Anthropic

All model calls go through `ai-gateway`. Usage is metered as credits
(`ai_credit_ledger`) and entitlement-gated. There is a spend cap.

**AI is never the source of truth for a deterministic decision.** Calculations,
permissions, lifecycle transitions, matching, production, EOD and compliance
rules are deterministic code in `src/lib/`.

## Lob

Posted dispute letters, with `lob-webhook` receiving delivery events. Letter
generation is deterministic (`src/lib/dispute/`, the Letter Library).

## GoHighLevel

One agency credential; locations are discovered, not configured per account.
**Never say "sub-account"** in this codebase — the vocabulary is "location".

Outbound calls are queued and dispatched by `ghl_outbound_dispatch()` every
minute via `pg_net`. That function failed **silently for four days** because it
used the three-part name `extensions.net.http_post`; see
`docs/KNOWN-ISSUES.md`.

## ClickUp

Historical migration source only. Partners were imported 2026-09-09; client
import is blocked on missing emails plus decisions from Dee.

**Never fetch ClickUp task descriptions through tooling** — a prior attempt
caused problems and the rule stands.

## Authorize.Net — PRODUCTION CHARGING IS OFF

**Do not enable live production card charging until Dee explicitly approves it,
separately and in writing.**

Full inspection: `AUTHORIZE_NET_READINESS.md` (repository root).

### What exists

| | |
|---|---|
| **Accept.js / tokenization** | **Yes, and correctly.** The browser loads Accept.js, the card goes straight to Authorize.Net, the server receives only a single-use `opaqueData` nonce. **There is no code path that accepts a card number, expiry or CVV, and no database column to put one in** |
| **Customer Profiles (CIM)** | In code — `createCustomerProfileRequest` with a `paymentProfiles` entry. **Zero profiles exist**; `payment_methods` has 0 rows |
| **Recurring / ARB** | **No.** No `ARBCreateSubscriptionRequest` anywhere. Recurring billing today is FullSuite generating invoices; collection is manual |
| **Transactions** | **None ever.** `payment_transactions` is empty |
| **Webhook endpoint** | **None.** Nothing listens for payment events, which is why reconciliation is manual |

### Sandbox vs production

The function reads `AUTHNET_ENV`. It talks to `api.authorize.net` **only** when
that value is exactly `production` or `live`; anything else — including unset,
and including a typo — goes to `apitest.authorize.net`.

**That default is the right way round: a missing setting cannot accidentally
charge a real card.** Keep it that way.

**Whether the secrets are currently set cannot be read from the database or the
repository.** The function answers honestly when they are missing rather than
pretending, so the way to find out is to open the payment screen and read what
it says.

### Before a webhook is ever deployed

Authorize.Net signs each webhook with **HMAC-SHA512** over the raw body, in the
`X-ANET-Signature` header, formatted `sha512=<HEX>`. Three things must be true:

1. A **Signature Key** from the Merchant Interface — a *different* secret from
   the Transaction Key.
2. The handler reads the **raw body bytes**. Computing the HMAC over re-parsed
   JSON fails, because key order and whitespace change.
3. The comparison is **constant-time**, not `===`.

**Do not deploy a webhook that can credit invoices until signature verification
is implemented.** An unverified endpoint is a public URL that marks invoices
paid, and anyone who learns it can use it.

### Standing rules

- **Never ask Dee, or anyone, for a raw card number or a CVV.**
- **Never store** a card number, CVV, PayPal password or Wise password.
- Sandbox first. Production charging requires Dee's separate written approval.
