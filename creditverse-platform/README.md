# BES Platform

BES managed-operations platform: Agency HQ, sub-accounts, CreditOps / FundingOps fulfillment, CRM delivery, TalentOps, time tracking, EOD, workforce, reporting, billing.

Frontend: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui. Backend: Supabase (Postgres, Auth, RLS, Storage). See `BUILD_STATUS.md` for the current state and build plan.

## Requirements

- Node.js 18+ (LTS recommended)
- npm

## Getting started

**Run every command from this directory (`creditverse-platform/`), not from the
repository root.** The Supabase CLI resolves `supabase/migrations/` relative to
the working directory: from the root it finds no migrations and reports every
applied version as missing, which looks like migration drift but is not. The
root `/supabase/` path is git-ignored to stop a stray copy being created there.

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

## Available scripts

- `npm run dev` - start Vite in development mode
- `npm run build` - create a production build
- `npm run build:dev` - create a development-mode build
- `npm run preview` - preview the production build locally
- `npm run lint` - run ESLint checks
- `npm run test` - run Vitest tests once
- `npm run test:watch` - run Vitest in watch mode

## Verification commands

Use these to verify repository health:

```bash
npm run lint
npm run test
npm run build
npx tsc --noEmit
```

## Database

Migrations live in `supabase/migrations/` and are applied with the Supabase CLI
from this directory:

```bash
npx supabase migration list      # compare local and remote history
npx supabase db push --dry-run   # what would be applied
npx supabase db push             # apply pending migrations
```

`node supabase/scripts/verify-live.mjs` is a read-only smoke test: it proves the
schema landed and that RLS denies anonymous reads.

If `db push` reports *"Remote migration versions not found in local migrations
directory"*, check the working directory first. Do not run `supabase migration
repair` without evidence that a specific remote history row is genuinely wrong —
marking applied migrations as reverted falsifies a correct history.

## Lockfile policy

`package-lock.json` is committed. Use `npm ci` for reproducible installs.
