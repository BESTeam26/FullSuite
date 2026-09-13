# Environment

**Names only. No values appear in this repository or in this document.**

## Local development

```bash
cd creditverse-platform
cp .env.example .env.local
npm install
npm run dev              # http://localhost:8080
```

`.env*` is git-ignored; only `.env.example` is tracked, and it holds
placeholders.

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | The Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Anon/publishable key. **Public by design** — RLS protects the data, not the key |
| `VITE_SITE_URL` | Canonical site URL for links and auth redirects |
| `VITE_AUTH_MODE` | `live` or `demo`. Optional — defaults to `live` when the Supabase vars are set, `demo` when they are absent |

**`VITE_*` variables are compiled into the browser bundle. Never put a secret in
one.** In particular, **never** put the Supabase service-role key in `.env.local`
or in Vercel — `.env.example` says so explicitly and it is not a style
preference.

`demo` mode boots a fake agency-owner session over seed data with no backend.
Useful for UI work; useless for anything involving authorization, because the
authorization lives in the database.

## Vercel

Set for **Production and Preview**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

That is all. Everything else is server-side.

## Supabase Function secrets

Set in Supabase → Edge Functions → Secrets. **Not readable from the database,
the repository, or a developer machine — by design.**

| Secret | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL` | all | injected by the platform |
| `SUPABASE_ANON_KEY` | several | injected by the platform |
| `SUPABASE_SERVICE_ROLE_KEY` | several | **server-side only, never in a browser** |
| `MAIL_PROVIDER_API_KEY` | mail functions | Resend API key |
| `MAIL_FROM` | mail functions | verified sender address |
| `MAIL_REPLY_TO` | mail functions | optional reply-to |
| `APP_ORIGINS` | mail functions | comma-separated; the first is used for links |
| `ANTHROPIC_API_KEY` | `ai-gateway` | **the only place a model key exists** |
| `BILLING_DISPATCH_SECRET` | `billing-email` | shared secret for `pg_net` calls; compared in constant time |
| `LOB_API_KEY` | `post-letter` | posted letters |
| `LOB_WEBHOOK_SECRET` | `lob-webhook` | delivery-event verification |
| `GHL_PUSH_SECRET` | `ghl-push` | GoHighLevel outbound |
| `CLICKUP_API_TOKEN` | `clickup-import` | migration only |
| `AUTHNET_API_LOGIN_ID` | `payments` | Authorize.Net API Login ID |
| `AUTHNET_TRANSACTION_KEY` | `payments` | **server-side secret** |
| `AUTHNET_PUBLIC_CLIENT_KEY` | `payments` | Accept.js, browser-safe |
| `AUTHNET_ENV` | `payments` | `sandbox` (default) or `production`/`live` |

**`AUTHNET_ENV` is the live-charging switch.** Anything other than exactly
`production` or `live` — including unset, and including a typo — routes to
`apitest.authorize.net`. That default is correct: a missing setting cannot
accidentally charge a real card. **Do not change it without Dee's explicit
approval.**

Not yet set, and deliberately: the Authorize.Net **Signature Key**. No webhook
will be deployed before it exists — see `docs/INTEGRATIONS.md`.

## Supabase Vault

The database's own secret store, used by `pg_net` dispatch functions so a
scheduled job can authenticate to an Edge Function without a user session. The
billing dispatch secret lives here as well as in Function secrets; the two must
match.

## Auth SMTP

Supabase → Authentication → Emails → SMTP Settings:

```
Host:     smtp.resend.com
Port:     587
Username: resend
Password: a Resend API key
```

The **sender name here must match the agency record**, or sign-in email and
application email will introduce themselves differently.

## Probe credentials

The probe scripts talk to the live database through the Supabase management API
and read:

- the project ref, from the linked Supabase project
- an access token, from the Supabase CLI login

`npm run probe:shapes` additionally reads `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` from `.env.local` — it asks the public API to *parse*
query shapes, which needs no session.

If a probe cannot authenticate, run `npx supabase login` and confirm the project
is linked.
