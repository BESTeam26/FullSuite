# Deploying BES

## What you actually need

| Piece | What it does | Status |
|---|---|---|
| **GitHub** (`BESTeam26/FullSuite`) | The source of truth. Vercel deploys from it. | In use |
| **Vercel** | Hosts the web app (the built front end). | To connect |
| **Supabase** (project `wiojlgkzxlaiajwwrzuj`) | The whole backend: database, sign-in, file storage, the Edge Functions and every security rule. | In use |
| **Sender** | Email — invitations now, client and lender email later. | Key needed |
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

To use Sender for these: Supabase → Authentication → Emails → SMTP Settings:

```
Host: smtp.sender.net
Port: 587
Username / password: from Sender → Settings → SMTP
Sender email: an address on a domain you verified in Sender
```

**2. Emails the app sends** — team invitations today. These go through the
`send-invitation` Edge Function, which now calls Sender's transactional API:

```bash
cd creditverse-platform
npx supabase secrets set MAIL_PROVIDER_API_KEY=<Sender API token> MAIL_FROM="BES <no-reply@yourdomain.com>"
npx supabase functions deploy send-invitation --use-api
```

**Before either works**, verify your sending domain in Sender (SPF, DKIM,
DMARC). Sender rejects a `from` address that is not on a verified domain, and
that rejection is passed straight through to the screen so you can see why.

## Anything else Supabase needs

```bash
cd creditverse-platform
npx supabase secrets set ANTHROPIC_API_KEY=<key>
```

That switches on reading scanned reports, letter wording help and "explain this
fit". Until it is set, those features say they are not connected rather than
pretending.
