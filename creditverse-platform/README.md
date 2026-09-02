# BES Platform

BES managed-operations platform: Agency HQ, sub-accounts, CreditOps / FundingOps fulfillment, CRM delivery, TalentOps, time tracking, EOD, workforce, reporting, billing.

Frontend: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui. Backend: Supabase (Postgres, Auth, RLS, Storage). See `BUILD_STATUS.md` for the current state and build plan.

## Requirements

- Node.js 18+ (LTS recommended)
- npm

## Getting started

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

## Lockfile policy

`package-lock.json` is committed. Use `npm ci` for reproducible installs.
