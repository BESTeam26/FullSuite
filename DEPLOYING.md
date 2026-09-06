# Deploying BES

## What you actually need

| Piece | What it does | Status |
|---|---|---|
| **GitHub** (`BESTeam26/FullSuite`) | The source of truth. Vercel deploys from it. | In use |
| **Vercel** | Hosts the web app (the built front end). | To connect |
| **Supabase** (project `wiojlgkzxlaiajwwrzuj`) | The whole backend: database, sign-in, file storage, the Edge Functions and every security rule. | In use |
| **Resend** | Email — invitations and welcome now, client and lender email later. | Keys exist; needs wiring |
| **Anthropic** | Reading scanned reports, letter wording help, explanations. | Key needed |
| **Lob** | Posting dispute letters. | When you want letters actually mailed |
| **Authorize.Net** | Taking payment when trials convert. | Later |
| **GoHighLevel** | Sales front end feeding the platform. | Credentials needed |

**Render is not needed.** It would host a server; there is no server to host —
the front end is static files (Vercel) and everything dynamic runs in Supabase.
Keeping Render would mean paying twice for the same job.

**Supabase cannot be dropped.** It is not "a database" in this build: sign-in,
every permission rule, file storage, and the functions that hold your API keys
all live there. Vercel serves the screens; Supabase decides what those screens
are allowed to show.

## Connecting Vercel (once)

1. Vercel → Add New → Project → import `BESTeam26/FullSuite`.
2. Leave the build settings alone — `vercel.json` at the repository root
   already tells Vercel the app lives in `creditverse-platform/`, how to build
   it, and to send every path to `index.html` (without that last part, opening
   `/signup` directly would show a 404).
3. Add two environment variables, for Production **and** Preview:
   - `VITE_SUPABASE_URL` — `https://wiojlgkzxlaiajwwrzuj.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` — the anon/publishable key from Supabase →
     Settings → API. This key is public by design; row-level security is what
     protects the data, not the key.
4. Deploy. Every push to `main` deploys automatically after that.

## Email: two different jobs

**1. Sign-in emails** — confirming a new sign-up, resetting a password. These
are sent by **Supabase Auth**, not by our code. Out of the box Supabase's own
sender is rate-limited to a handful an hour, which is fine for a first look and
not fine for real testing.

To use Resend for these: Supabase → Authentication → Emails → SMTP Settings:

```
Host: smtp.resend.com
Port: 587
Username: resend          (literally the word "resend")
Password: a Resend API key
Sender email: an address on a domain verified in Resend → Domains
```

Those emails are the first thing a new person sees, so they are branded rather
than left as Supabase's defaults. The wording lives in
`creditverse-platform/supabase/templates/`:

| File | Sent when |
|---|---|
| `confirm-signup.html` | Somebody signs up and must confirm their address |
| `magic-link.html` | Signing in with a link instead of a password |
| `recovery.html` | Resetting a forgotten password |
| `email-change.html` | Changing the address on an account |
| `invite.html` | Supabase's own invite flow (we use our own; kept consistent) |

The local stack picks these up from `config.toml`. **The hosted project keeps
its own copies** — paste each file into Supabase → Authentication → Emails,
matching the subject lines in `config.toml`, so the two stay the same.

**2. Emails the app sends** — the invitation asking someone to activate, and
the one-time welcome when a new organization's workspace is ready. These go
through Edge Functions and use Resend's transactional API:

```bash
cd creditverse-platform
npx supabase secrets set MAIL_PROVIDER_API_KEY=<Resend sending key, re_...> MAIL_FROM="BES <no-reply@yourdomain.com>"
npx supabase functions deploy send-invitation --use-api
npx supabase functions deploy send-welcome --use-api
```

These two are branded as the **organization**, not as BES: their logo, their
colour, their name. A customer's staff should be invited by the company they
are joining. BES team invitations are the exception and carry BES's own brand.

Until the key is set, both answer honestly — the invitation is still recorded
and its link can be copied, and the screen says the email did not go rather
than implying it did.

**Before either works**, verify your sending domain in Resend → Domains (it
gives you the SPF and DKIM records to add). Resend rejects a `from` address
that is not on a verified domain, and that rejection is passed straight through
to the screen so you can see why.

**Two keys, two jobs.** Keep the full-access key for Supabase Auth SMTP and
give the Edge Functions a *sending-access* key — the functions only ever send,
and a key that can also read your audience and delete domains is more than they
need.

## Anything else Supabase needs

```bash
cd creditverse-platform
npx supabase secrets set ANTHROPIC_API_KEY=<key>
```

That switches on reading scanned reports, letter wording help and "explain this
fit". Until it is set, those features say they are not connected rather than
pretending.
