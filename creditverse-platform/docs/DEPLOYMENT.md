# Deployment

## How code reaches production

```
push to main (BESTeam26/FullSuite)
        ↓
Vercel builds from creditverse-platform/
        ↓
https://app.bescrm.net
```

There is no staging branch and no manual deploy step. **A push to `main` is a
production deploy.**

**Policy change, 2026-09-13: a human technical lead is the deployment
gatekeeper.** AI assistance may continue to write and test code; it is not the
final authority on whether production is safe. Nothing should reach `main`
without a human who can explain what changed and why.

## Build configuration

`vercel.json` at the **repository root** owns everything:

```jsonc
{
  "buildCommand":   "cd creditverse-platform && npm run build",
  "installCommand": "cd creditverse-platform && npm install",
  "outputDirectory":"creditverse-platform/dist",
  "framework": "vite",
  "rewrites": [ /* everything → index.html, so /signup does not 404 */ ],
  "headers":  [ /* immutable asset caching + security headers */ ]
}
```

Security headers in force: `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), microphone=(), geolocation=()`.

Vercel environment variables, for **Production and Preview**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The anon key is public by design. RLS protects the data, not the key.
**Never put the service-role key in Vercel.**

## The database deploys separately

Migrations are **not** applied by the Vercel build. They are pushed by hand:

```bash
cd creditverse-platform
npx supabase migration list      # confirm local and remote agree
npx supabase db push --dry-run
npx supabase db push
```

**Order matters.** A migration that a deployed frontend does not yet expect is
usually harmless; a frontend that expects a migration not yet applied is not.
**Push the migration first, then the code** — unless the migration removes
something the current frontend uses, in which case deploy the code first.

Edge Functions deploy separately too:

```bash
npx supabase functions deploy <name>
npx supabase functions deploy billing-email --no-verify-jwt   # called by pg_net
```

`--no-verify-jwt` is correct **only** for functions called by the database,
which carry no user token and authenticate with a Vault secret instead.

## Before you push

```bash
npm test && npm run build && npm run probe
```

For anything touching policies, definer functions, grants or money, add:

```bash
node supabase/scripts/billing-probe.mjs
node supabase/scripts/money-boundary-probe.mjs
node supabase/scripts/partner-messages-probe.mjs
node supabase/scripts/marketing-module-probe.mjs
node supabase/scripts/rls-matrix.mjs              # the full 70-phase gate
```

**Never push a migration while the RLS matrix is running.**

## Rolling back

**Frontend** — Vercel keeps every deployment. Promote the previous one from the
Vercel dashboard; it is immediate and needs no git operation. Then fix forward
in git rather than reverting blindly.

**Database** — migrations are **forward-only**. There is no down-migration and
you should not write one. To undo a schema change, write a new migration that
reverses it, with a comment saying what it reverses and why.

**Data** — Supabase point-in-time recovery is the last resort and is a Dee-level
decision. Before any destructive operation, take a snapshot and say so.

**Never run `supabase migration repair` to make an error go away.** It rewrites
history state. Diagnose first: confirm the working directory, compare
`migration list` against the live schema, and only repair with evidence that a
specific remote history row is genuinely wrong.

## Deploy discipline

- Batch related fixes. Never a deploy per cosmetic change, and never many
  unrelated fixes in one release.
- A small UI fix: targeted tests, `tsc`, eslint, build.
- Anything touching authorization, schema or RLS: the affected matrix phases,
  then the full matrix when the coherent batch is ready.
- Report a gate at its **actual** number. 1540/1559 is **not** a pass.
