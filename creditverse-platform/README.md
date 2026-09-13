# BES FullSuite

The internal and Partner-facing operating platform for **Blessed Empire
Services**: Agency HQ, CreditOps, FundingOps, BES CRM, TalentOps, Sales &
Marketing, Partner Portal, Communication, Billing / Finance, and Teams / Access
/ Assignments.

**Frontend:** React 18 · TypeScript · Vite · Tailwind · shadcn/ui
**Backend:** Supabase — Postgres, Auth, RLS, Storage, Edge Functions
**Hosting:** Vercel, from `main`

---

## New here? Start with `docs/ENGINEER-HANDOFF.md`

The full technical handoff package is in [`docs/`](docs/). Read
[`CLAUDE.md`](../CLAUDE.md) first — it is the permanent project rules, and it
explains why several things are shaped the way they are.

---

## The gate — read this before you ship anything

```bash
npm test && npm run build && npm run probe
```

**`npm test`, `tsc` and `npm run build` are NOT a sufficient gate for this
application.** All three can be green while production is broken.

This is not a UI codebase. It is RLS, PostgREST relationships, RPCs, cron jobs,
payment logic, portals and cross-module data — and none of that is TypeScript.
PostgREST query strings, SQL function signatures, `EXECUTE` grants,
`SECURITY DEFINER` search paths, cron targets and `pg_net` calls **all fail at
runtime while TypeScript stays clean.**

`npm run probe` is what covers them:

| | Checks | Current |
|---|---|---|
| `npm run probe:shapes` | every PostgREST embed in `src/`, parsed by the live API | **53 shapes, 0 refused** |
| `npm run probe:sql` | every `.rpc()` against `pg_proc` — one candidate, right arguments, right grants — plus cron targets, `search_path` pinning and three-part `net.` names | **205 contracts, 0 failing** |

Plus three live acceptance probes, run as **real authenticated users** inside
rolled-back transactions:

```bash
node supabase/scripts/partner-messages-probe.mjs   # 14/14
node supabase/scripts/billing-probe.mjs            # 85/85
node supabase/scripts/marketing-module-probe.mjs   # 48/48
```

Why each of these exists: [`docs/KNOWN-ISSUES.md`](docs/KNOWN-ISSUES.md).

---

## Getting started

**Run every command from this directory (`creditverse-platform/`), never from
the repository root.** The Supabase CLI resolves `supabase/migrations/` relative
to the working directory; from the root it finds no migrations and reports every
applied version as missing, which looks exactly like drift and invites a
`migration repair` that would falsify a correct history.

```bash
cp .env.example .env.local     # fill in the two Supabase values
npm install
npm run dev                    # http://localhost:8080
```

Requires Node 18+.

## Scripts

| | |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | production build |
| `npm test` / `npm run test:watch` | Vitest — 1787 tests |
| `npm run lint` | ESLint |
| **`npm run probe`** | **both runtime probes — part of the gate** |
| `npm run probe:shapes` / `npm run probe:sql` | either one alone |
| `npm run db:push` | apply migrations |
| `npm run db:types` | regenerate `database.types.ts` |
| `npm run db:authmap` | regenerate the authorization map |

## Database

393 forward-only migrations in `supabase/migrations/`.

```bash
npx supabase migration list      # compare local and remote
npx supabase db push --dry-run   # what would be applied
npx supabase db push
```

**Diagnose before repairing.** See [`docs/DATABASE.md`](docs/DATABASE.md) for
the Postgres traps this codebase has already paid for — enum values in their own
migration, defaulted parameters creating overloads, `create or replace view`
appending only, `now()` being transaction-constant, and the three-part `net.`
name that failed silently for four days.

---

## The documentation

| Document | |
|---|---|
| [`docs/ENGINEER-HANDOFF.md`](docs/ENGINEER-HANDOFF.md) | **start here** — what this is, canonical sources, the gate |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | the shape of the system |
| [`docs/DATABASE.md`](docs/DATABASE.md) | canonical records, migration rules |
| [`docs/AUTHORIZATION.md`](docs/AUTHORIZATION.md) | who may do what, and where that is decided |
| [`docs/SECURITY.md`](docs/SECURITY.md) | the security model and current posture |
| [`docs/MODULES.md`](docs/MODULES.md) | what each module is, who owns execution |
| [`docs/CREDITOPS.md`](docs/CREDITOPS.md) | queues, statuses, routing, SLA |
| [`docs/SALES-MARKETING.md`](docs/SALES-MARKETING.md) | content lifecycle, campaigns, approvals |
| [`docs/PARTNER-PORTAL.md`](docs/PARTNER-PORTAL.md) | pages, partner-safe projections, what must never leak |
| [`docs/BILLING.md`](docs/BILLING.md) | invoice → payment → balance → reminder → suspension |
| [`docs/COMMUNICATION.md`](docs/COMMUNICATION.md) | channels, DMs, threads, `visible_channels()` |
| [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) | the locked stack; **Authorize.Net charging is OFF** |
| [`docs/BACKGROUND-JOBS.md`](docs/BACKGROUND-JOBS.md) | every scheduled job and its failure mode |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | how code ships, and how to roll back |
| [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) | every variable and secret **name** |
| [`docs/TESTING.md`](docs/TESTING.md) | the gate, and what each layer can and cannot catch |
| [`docs/KNOWN-ISSUES.md`](docs/KNOWN-ISSUES.md) | incidents, fixes, regression coverage |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | settled product and architecture decisions |
| [`docs/ACCESS-CHECKLIST.md`](docs/ACCESS-CHECKLIST.md) | accounts a new engineer needs, at what level |
| [`docs/FIRST-WEEK.md`](docs/FIRST-WEEK.md) | a five-day onboarding plan |

Deeper history, kept as archives rather than reading material:
`BUILD_STATUS.md`, `AUTHORIZATION_MAP.md`, `COMPLETION_REGISTER.md`,
`ARCHITECTURE_DECISIONS.md`, `DEFERRED_AGENCY_WORK.md`, `PILOT_ISSUES.md`,
`LIVE_VALIDATION_CHECKLIST.md`.

---

## Current policy

- **Feature development is stopped.** The platform is in live validation.
- **Authorize.Net production charging is OFF** and stays off until it is
  approved separately, in writing.
- **A human technical lead is the deployment gatekeeper.**
