# BES Platform — Build Status & Codebase Audit

**Audit date:** 2026-09-02
**Source:** `BES CreditHub.zip` exported from GHL AI Studio ("vibe-template"), extracted to `creditverse-platform/`
**Audit scope:** inspection only. No redesign, no refactor, no production services connected, no files deleted.
**Verdict in one line:** this is a large, well-organized, *frontend-only demo*. Every screen renders from in-memory seed data. There is no backend, no auth, no database, no persistence, and no real integration.

---

## Progress log

### 2026-09-02 — Phase 0 (housekeeping) ✅ and Phase 1 (tenancy + auth + RBAC) 🟡 built, awaiting a Supabase project

**Phase 0 — done**
- Git repo initialised at `BES-Platform/` with an untouched baseline commit of the GHL export.
- `package-lock.json` committed; `.env`, `.env.*` (except `.env.example`) gitignored.
- GHL residue removed: `@leadconnector/vibe-tagger` plugin, `allowedHosts: [".modal.host"]`.
- All 12 ESLint errors fixed (0 errors, warnings only). `tsc` clean.
- Routes are lazy-loaded: the 2.0 MB single bundle is now 163 chunks; marketing visitors no longer download the ops app.
- The 10 unrouted pages moved to `src/_archive/pages/` (kept, not deleted, excluded from the bundle).
- **111 unit tests** added for the pure engines (`lib/dispute/*`, `eod-production-engine`, `bes-domain`, `fulfillment-client-domain`, `score-*`, `progress-report-logic`). All pass.
- Three latent engine bugs found by the tests and documented in-test with `// NOTE: possible bug` (not fixed yet, so behaviour is unchanged):
  1. `decision-engine.ts` — the Round 3+ "potential-compliance-failure" branch is unreachable; an earlier `round >= 2` branch always returns first.
  2. `eod-production-engine.ts` — `isEodMissing` cannot wrap past midnight (shift end 23:00 + 2h grace = hour 25, never matched).
  3. `metro2-taxonomy.ts` — `getFieldMetro2Context` matches on first word, so "Current Balance" resolves to "Current Status".

**Phase 1 — built, not yet exercised against a database**
- `supabase/migrations/20260902000100_tenancy_and_rbac.sql` (94 statements): `agencies`, `profiles` (auto-created from `auth.users`), `organizations`, `businesses`, `product_entitlements`, `agency_memberships`, `org_memberships`, `external_memberships` + `record_grants`, `invitations`, `user_preferences`, `audit_log`. RLS on every table; `SECURITY DEFINER` helpers (`is_agency_staff`, `is_org_member`, `is_org_admin`, `can_view_org`, …); `log_audit()`; service-role-only `bootstrap_agency_owner(email)`.
- `supabase/seed.sql` — the 5 demo organizations, idempotent. `supabase/README.md` — setup steps.
- Both SQL files parse with the real Postgres parser (libpg-query 17). **Semantics are untested** until applied to a project — no Docker on this machine, so the local stack can't run.
- Frontend: `lib/supabase/client.ts` (+ hand-written `database.types.ts`), `lib/auth/auth-context.tsx` (session, profile, memberships, sign-in/up/magic-link/reset/sign-out), `/login`, `/auth/callback`, `RequireAuth` guard on `/app/*`, `lib/data/organizations.ts` (RLS-scoped reads/writes + audit), `agency-context` now dual-source: **live** (TanStack Query over Supabase) when `.env.local` has Supabase keys, **demo** (seed) otherwise. Topbar/sidebar show the real identity and a Sign out; the role "Preview as" pill is hidden for non-admins in live mode.
- Demo mode verified in the browser. Live mode cannot be verified here.

**Blocked on the owner:** create a Supabase project and follow `supabase/README.md` (link, `db push`, seed, `.env.local`, sign up, `bootstrap_agency_owner`). Account creation must be done by a human.

**Next (Phase 2):** shared operations engine — `work_items`, `activity_events`, `files` + Storage, assignee scoping; My Work / Attention Center on real data.

### 2026-09-02 — Phase 2 (shared operations engine) 🟡 built, awaiting the same Supabase project

- `supabase/migrations/20260902000200_work_engine.sql` (48 statements):
  - `work_items` — enforces the domain boundary in the database: `scope='ORGANIZATION'` requires `organization_id`, `scope='AGENCY'` forbids it. `subject_organization_id` names the org that AGENCY fulfillment work is *about*, which fixes the lossy "map every work order to the first org" adapter noted in section E.
  - `activity_events` — append-only timeline (no delete policy). Stage, assignee and priority changes are written by a database trigger, so history cannot be skipped by a client.
  - `files` + a private `bes-files` Storage bucket. Object paths are `<org-id|agency>/<entity>/<file>`, and the storage policies read that first segment as the tenancy key.
  - `assignable_profiles(scope, org)` — the scoped assignee picker the EOD doctrine calls for: agency work lists BES staff, org work lists only that org's members. Never a company-wide dump.
  - `work_attention` view (`security_invoker`) — blocked / overdue / inside-4h, RLS-scoped per caller.
- Frontend: `lib/data/work-items.ts` (reads, writes, activity, assignee lookup) and `lib/data/use-work.ts` (`useMyWork`, `useAgencyWork`, `useAttention`) — all dual-mode, each returning a `source: "live" | "demo"`.
- **My Work** and **Attention Center** now render from the engine, with real empty states.
- Honesty pass on the HQ dashboard: a `DataSourceBadge` marks sample data; the attention panel shows real SLA-risk / overdue / blocked counts and dims the four signals that arrive in later phases; Executive Snapshot's "Needs Attention" is now the real count (it read 12 while the panel below said 2), fabricated trend percentages are gone, and stats with no data source render "—" instead of an invented number.
- Verified in demo mode: dashboard, My Work, Attention Center, login. No console errors. 111 tests pass, lint 0 errors, build clean, all three SQL files parse.
- Still unverified: every RLS policy and trigger in this migration. They need a real database.

### 2026-09-02 — Backend connected. Phases 1 and 2 verified against the live database ✅

Project `wiojlgkzxlaiajwwrzuj` ("FullSuite"). Applied migrations 0001–0004; **15 tables, 1 view, 34 RLS policies, 5 organizations, 7 work items**. Owner account `dee@blessedempireservices.com` promoted to `agency_owner`.

**A real security hole, found by running the smoke test against a live database.**
An *unauthenticated* caller could `POST /rest/v1/rpc/log_audit` and receive 204 — writing arbitrary rows into the audit log. Migration 0001 had done `revoke all ... from public` on that function and granted it to `authenticated`, which reads correctly. What it missed: Supabase separately grants EXECUTE to the `anon` role, and Postgres grants EXECUTE to `PUBLIC` on every new function, which `anon` inherits. Two independent grants, neither removed.

- **Migration 0003** revokes EXECUTE from `anon` on all public functions and re-grants only to `authenticated`.
- **Migration 0004** additionally revokes the inherited `PUBLIC` grant — without it, `is_agency_staff()` and `my_org_ids()` still answered anonymous callers (returning `false` / `[]`, so no data leaked, but they should not be reachable). Also revokes all table privileges from `anon`, so a future missing policy cannot become a leak, and sets default privileges so functions added later are locked by default.

The lesson worth keeping: the migration looked correct on paper and passed a Postgres parser. Only a live request proved otherwise. Every future phase gets the same treatment before it is called done.

**Verified, both directions:**

| Check | Anonymous | Owner session |
|---|---|---|
| organizations | 0 rows (401) | 5 |
| work_items | 0 rows (401) | 7 |
| work_attention | — | 4 |
| product_entitlements | 0 rows (401) | 25 |
| helper functions | not executable | `is_agency_staff() = true`, role `agency_owner` |
| anonymous INSERT | rejected (401) | n/a |
| `bootstrap_agency_owner` | not callable | service role only |

The owner-session figures come from impersonating the real JWT claims inside a rolled-back transaction, so RLS was genuinely exercised rather than bypassed by the service role.

**Smoke test corrected too:** it had probed RPCs with `{}`, and PostgREST matches on signature, so any function taking parameters looked missing. It now probes with real arguments and additionally asserts that no helper is anon-executable — the check that would have caught the hole above on the first run.

### 2026-09-02 — Rule 13/14 repair pass: CreditOps/FundingOps deduplication (in progress)

The audit found the codebase's real structural problem: CreditOps and FundingOps
were **copy-paste twins** — 159 clones, 5,393 duplicated lines (6.35%), almost
all of it `Something.tsx` beside `FundingSomething.tsx`. Every change to a client
list, queue or timeline had to be made twice or the divisions would silently
diverge.

**Done (5 commits, each independently verified):**

| Step | Result |
|---|---|
| Circular dependency | The codebase's only one, eliminated. `AttachmentFile` moved out of a UI component into `lib/fulfillment/attachment-domain.ts`; `isImageFile`/`isPdfFile` collapsed from five inline copies to one |
| Shared domain | `ops-client-domain.ts` — `OpsClient`, intake modes, grouping, the ONE EMAIL = ONE FILE conflict check (now generic), `formatCurrency`. Both division clients extend it |
| Shared activity domain | `ops-activity-domain.ts` — `OpsActivityEntry` and the comment-mark palette, previously declared identically in both store-type modules |
| List helpers | `ops-client-list-helpers.tsx` — avatar, mode badge, status pill, column defs, `createViewPrefsStore`. Division modules: 216+211 → 109+103 lines |
| Email conflict banner | One generic component; the duplicate deleted |
| Client card grid | `OpsClientListGrid`; division files 51+57 → 26+32 lines |
| Queue views | `OpsQueueView`; division files 215+228 → 146+153 lines |
| Activity timelines | `OpsActivityTimeline`; three files 362+362+371 → 31+32+38 lines |

**Measured:** 159 → 129 clones, 5,393 → 4,021 duplicated lines (6.35% → 4.81%).
1,372 duplicated lines removed. Zero circular dependencies.

**Two regressions caught before shipping:**

1. `formatCurrency` abbreviates (`$1.4M`, `$75K`). Reaching for `Intl.NumberFormat`
   in the shared version would have rewritten every money figure across 13 files
   with no test failing — a rule 8 violation. Original behaviour preserved and
   verified on screen.
2. Intake-mode *labels* differ by design ("SaaS-Pulled" in CreditOps reads as
   "SaaS Synced" in FundingOps). Nearly merged as duplication; kept separate.

**Verified beyond the build:** posted a real comment on a CreditOps client file
and watched it land in Activity History with author and timestamp; confirmed the
CreditOps queue still shows Round / Queue Status and FundingOps shows
Requested / Stage Status with abbreviated currency.

**Bug found and fixed during the dedup pass — cross-partner enrollment was not gated**

The add-client modal called `addClient` and *then* asked the agent to confirm a
cross-partner enrollment. The record therefore already existed when the prompt
appeared, and clicking Cancel or Go back did not remove it. Verified in the
pre-existing code (commit 9d4fc3d), so this predates the refactor.

Why it mattered: the warning is the control that stops an agent silently
enrolling someone already on another partner's list. It was decorative.

Fix: the store gained `checkAddConflict`, which reports collisions and performs
no write. The modal now checks first and calls `addClient` only after the add is
authorised. Confirmed in the browser on Apex Credit Co.:

| Path | Before | After |
|---|---|---|
| Cross-partner warning shown | record already added | nothing written |
| Decline (Cancel / Go back) | record remained | nothing written |
| Confirm | added | added exactly once |
| Same-partner duplicate | blocked | blocked |

Locked down by five new tests in `ops-client-store.test.tsx` asserting that
`checkAddConflict` never mutates the client list. Suite is now 116 tests.

**Remaining twin pairs (~2,900 duplicated lines), largest and most divergent:**

| Pair | Duplicated | Note |
|---|---|---|
| `ClientListTable` / `FundingClientListTable` | 560 | 442 + 458 lines |
| `CreditOpsManagementDashboard` / `FundingOpsManagementDashboard` | 548 | |
| `FulfillmentClientsPanel` / `FundingClientsPanel` | 528 | |
| `CreditOpsGlobalQueue` / `FundingGlobalQueue` | 307 | 256 of 354 lines differ — genuinely divergent |
| `creditops-client-store` / `fundingops-client-store` | 307 | |
| `AddClientModal` / `FundingAddClientModal` | 297 | ~50% shared; needs a form abstraction, not a copy |
| Tree sidebars | 198 | |
| Work workspaces | 189 | |

These diverge more than the ones already merged, so each needs its own
abstraction rather than a mechanical lift. Same discipline applies: one pair per
commit, verified on screen before moving on.

### 2026-09-03 — Cleanup pass

- **Self-duplication removed:** `ReImportItemTable` wrote the same bureau detail
  card three times (Equifax / Experian / TransUnion), differing only in accent
  colour and a footnote. Now one `BureauDetailCard` driven by a small config.
  429 → 368 lines; a field added there now appears on all three bureaus.
- **Eight orphaned components archived** to `src/_archive/components/`, following
  the existing convention rather than deleting: `NavLink`, `ItemsTab`,
  `CategoryLettersPanel`, `LetterPreview`, `SubAccountsBoardView`,
  `SubAccountsCardsView`, `DiySection`, `Features`. Checked first that the
  sub-account card/board views were not behind a broken toggle — only the list
  view is rendered and there is no toggle, so they are unbuilt alternatives.
- **Removed** the unused `lib/dispute/index.ts` barrel (every consumer imports
  the specific module) and a dead `CreditOpsWebhookPanel` import.
- **Three real warning fixes**, not suppressions:
  - `use-password-reveal` captured `timers.current` at cleanup time, so timeouts
    could survive unmount. Now captured inside the effect.
  - `agency-context` rebuilt `organizations` every render, forcing the derived
    sub-account list to recompute each time (rule 14). Now memoised.
  - Removed an `eslint-disable` in `CopilotPanel` that suppressed nothing.

**Left as visible warnings, deliberately:** two context value-memos
(`referral-context`, `diy-management-context`) list state in their dependency
arrays but not the callbacks that close over it. Checked each — every callback
only reads state that IS listed, so they are correct today, just fragile if
extended. A visible warning is safer than a suppression that hides the day
someone adds a callback reading something else.

**Two components remain built but not routed** — both product decisions, not
code problems:
- `CreditOpsWebhookPanel` — the GHL/DisputeFox signal log. This is the audit
  trail for what the platform pushed to an external CRM, and it currently has
  no screen (rule 10 gap).
- `FundingClientsPanel` — the FundingOps client list. CreditOps has the
  equivalent wired; FundingOps navigates by Deal List instead.

**Duplication, final:** 159 → 67 clones, 5,393 → 1,233 lines (6.35% → 1.55%).
77% of the original duplication removed. Zero circular dependencies, zero lint
errors, 116 tests passing.

### 2026-09-03 — Four outstanding items closed, plus one found while closing them

**1. EOD "missing" could not wrap past midnight.** `isEodMissing` computed
`shiftEnd + grace` without modulo, so a 23:00 shift produced a cutoff of 25 —
an hour no clock reaches — and a night-shift EOD was never flagged. Now wraps:
overdue from the small-hours cutoff until the shift-end hour. Non-wrapping
shifts (the 17:00 + 2h default) behave exactly as before. 3 new tests.

**2. The strongest dispute escalation was unreachable.** In
`decideDisputePath`, the "potential compliance failure" branch is a strict
subset of the broader "verified but evidence contradicts" branch — but sat
*below* it, so the broader branch always returned first. The only state that
sets `humanReviewRequired` could never be produced. Branches reordered
(specific before general) with a comment explaining why the order matters.
Tests now assert both that the escalation fires at round 3+ with 2+ priors and
evidence, and that it does NOT fire when any precondition is missing.

**3. The CRM signal log had no screen.** `CreditOpsWebhookPanel` records what
the platform pushed to GHL / DisputeFox and when — an audit trail with no way
to view it (rule 10 gap). Now a "CRM Signal Log" management view in CreditOps.

**4. FundingOps had no client list.** CreditOps has one; FundingOps navigated
only by Deal List, leaving `FundingClientsPanel` orphaned. Added a "Client
List" management view alongside Deal List, giving the divisions parity.

**5. Found by doing #3 — every status change posted to the CRM twice.** With
the signal log finally visible, a single transition logged two identical
emissions. Cause: `CreditOpsGlobalQueue.commitStatus` called
`webhooks.pushStatusChange` directly *and* `store.updateStatus`, which already
forwards to the same bridge via `WebhookBridge`. Pre-existing. In production
this would have double-posted every status change to GHL — duplicate pipeline
moves and duplicate automation triggers. The redundant push is removed;
verified one transition now records exactly one emission (was two).

**Orphans: zero.** Every component in `src/` outside `_archive/` and the
shadcn UI kit is now reachable.

119 tests, 0 lint errors, 0 circular dependencies, build clean.

**Next (Phase 3):** CreditOps Agency Fulfillment Workspace on live data — `fulfillment_enrollments` (both intake modes), outsourcing groups, department statuses, Complete Work writing `production_logs`, outbound webhook deliveries.

---

## Local run verification

| Check | Command | Result |
|---|---|---|
| Install | `npm install` (Node 24.19, npm 11.17) | OK — 455 packages |
| Typecheck | `npx tsc --noEmit -p tsconfig.app.json` | OK — 0 errors (note: `strict: false`) |
| Production build | `npm run build` | OK — 2.0 MB single JS chunk (505 KB gzip) |
| Unit tests | `npm test` | OK — 1 placeholder test (`expect(true).toBe(true)`) |
| Lint | `npm run lint` | 12 errors, 61 warnings — does **not** block build |
| Dev server | `npm run dev` → http://localhost:8080 | OK — all route families render, 404 fallback works |
| Browser console | dev mode | Only React "Function components cannot be given refs" warnings; no uncaught errors |

**Fixes required to run locally: none.** The project ran as exported. The only artifacts created by this audit are `package-lock.json` (generated by npm; README says it is intentionally untracked, but it is *not* in `.gitignore`), `dist/` (gitignored), and `src/tailwind.config.vibe.json` (written by the GHL dev plugin, gitignored).

---

## A. Current Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime / bundler | Vite 5.4 + `@vitejs/plugin-react-swc` | Dev server on port 8080, `allowedHosts: [".modal.host"]` (GHL preview host) |
| Language | TypeScript 5.8 | `strict: false`, `noImplicitAny: false` — types are advisory, not enforced |
| UI framework | React 18.3 | SPA, client-side only, no SSR |
| Routing | react-router-dom 6.30 | Single `<Routes>` tree in `src/App.tsx`, `BrowserRouter` |
| Styling | Tailwind CSS 3.4 + `tailwindcss-animate` + `@tailwindcss/typography` | Custom brand tokens (Imperial Charcoal / Empire Gold / Cloud Sand / Empire Green) as HSL CSS vars in `src/index.css` |
| Component kit | shadcn/ui (49 Radix-based primitives in `src/components/ui/`) | `components.json` present |
| Icons | lucide-react | |
| Charts | recharts 2.15 (deprecated line; v3 is current) | |
| Forms / validation | react-hook-form + zod + `@hookform/resolvers` | Installed; barely used |
| Data fetching | `@tanstack/react-query` 5 | `QueryClientProvider` is mounted but **zero queries exist** |
| Toasts | sonner + Radix toast | |
| Testing | Vitest 3 + jsdom + Testing Library | One placeholder test |
| Lint | ESLint 9 flat config + typescript-eslint | |
| Package manager | npm (no lockfile shipped) | No pnpm/yarn/bun config |
| GHL-specific | `@leadconnector/vibe-tagger` 0.4.1 (dev only) | Vite plugin that tags JSX with source locations for GHL's visual editor. Runs only in `mode === "development"`. No network calls found in its dist. Safe to keep for now; should be removed when leaving GHL. |

**Not present:** backend framework, ORM, database client, auth SDK, HTTP client, env files, Docker, CI, deployment config (no Vercel/Netlify/Cloudflare files despite `.wrangler/` in `.gitignore`).

---

## B. Repository Structure

```
creditverse-platform/
├── index.html                  SEO meta + JSON-LD, canonical → creditverse-platform.vibepreview.com
├── package.json                "vite_react_shadcn_ts" v0.0.0
├── vite.config.ts / vitest.config.ts / tailwind.config.ts / tsconfig*.json / eslint.config.js
├── components.json             shadcn config
├── BUILD_STATUS.md             (this file)
├── README.md                   generic vibe-template README
├── docs/                       4 architecture docs (product, DIY, journeys, permissions)
├── public/                     favicon, robots.txt, sitemap.xml, webmanifest (all point at vibepreview domain)
└── src/                        359 files, ~66,800 lines of TS/TSX
    ├── main.tsx / App.tsx      entry + provider stack + all routes
    ├── index.css               design tokens
    ├── pages/
    │   ├── Index.tsx           marketing landing
    │   ├── Portal.tsx          consumer portal mock (single page)
    │   ├── DiyPortal.tsx / DiyConsumerPortal.tsx
    │   ├── NotFound.tsx
    │   ├── app/  (26)          /app/* authenticated-area pages (10 are NOT routed — see E)
    │   ├── portals/ (2)        Affiliate, Outsourcing
    │   ├── products/ (5)       marketing product pages
    │   └── seo/ (7)            SEO keyword landing pages
    ├── components/
    │   ├── ui/ (49)            shadcn primitives
    │   ├── dashboard/ (15)     layout, sidebar, topbar, sub-account manager/switcher, whitelabel
    │   │   ├── agency/ (7)     HQ dashboard panels
    │   │   └── fulfillment/ (43 + timeline/3)   CreditOps + FundingOps workspaces
    │   ├── clients/ (25 + 17 in subfolders)     CreditOps client workspace tabs, dispute flow, re-import
    │   ├── diy/ (4 + 24)       DIY consumer + DIY management (B2B) shells and views
    │   ├── marketing/ (19)
    │   ├── settings/ (5 + 3)   Agency settings shell + sections
    │   ├── copilot/ (3)        "Ask Lisa" Q&A panel
    │   ├── portals/ (3), referral/ (1), NavLink.tsx
    ├── lib/                    ALL state + domain logic (26 root files + subfolders)
    │   ├── bes-domain.ts       canonical Organization / WorkItem / roles model
    │   ├── bes-seed-data.ts    5 seed orgs, work items, agency users
    │   ├── agency-context.tsx  HQ ↔ sub-account switching (in-memory)
    │   ├── role-context.tsx / roles.ts   3-role "preview as" switcher
    │   ├── eod-production-engine.ts      EOD derivation logic + seed logs
    │   ├── *-context.tsx       agreements, connectors, crm-automation, agency-settings, monitoring, copilot, client-workspace
    │   ├── fulfillment/ (15)   CreditOps + FundingOps stores, access control, seeds, webhooks
    │   ├── dispute/ (11)       Metro 2 / FCRA / legal-path decision engines (pure logic)
    │   ├── knowledge/ (5)      FCRA sections, Metro 2 fields, violations, QA entries
    │   ├── diy/ (4), referral/ (2)
    │   └── score-*.ts, build-credit.ts, progress-report-logic.ts, next-best-actions.ts, credit-classification.ts, sample-credit-report.ts
    ├── hooks/ (use-mobile, use-toast)
    └── test/ (setup + 1 placeholder test)
```

**Routing map (46 routes):** 17 public (marketing, 5 product pages, 6 SEO pages, consumer/DIY/affiliate/outsourcing portals) + 28 under `/app` behind `DashboardLayout` + `*` → 404. **No route guards of any kind.** `/app/*` is fully reachable without login.

---

## C. What Already Works (frontend-only, in-memory)

These are genuinely functional as *interactive demos* — state changes propagate across views within a session, then vanish on refresh.

- **Agency HQ ↔ Sub-Account switching** (`agency-context`): switch view mode, pin/unpin orgs, recent list, entitlement-driven sidebar (CreditOps/FundingOps sections hide when not enabled). Add sub-account and provision modal write to in-memory state.
- **CreditOps fulfillment workspace** (`/app/creditops`): ClickUp-style tree (Management → Partners → Clients), global queues, per-client work workspace, department-progress editing, "Complete Work" production logging, activity timeline with pinned comments and colored marks, add-client with the **one-email-one-file-per-partner** duplicate rule (hard block same scope, warn cross scope), role-scoped department permissions (`creditops-access`), status guide modal.
- **FundingOps fulfillment workspace** (`/app/fundingops`): same pattern with Person → Business → Funding File → Deal hierarchy, deal status lifecycle, deal field edits logged to activity, SOPs & Logins editor (company-level), queues, readiness/documents/submissions/stipulations/offers/funded views.
- **CreditOps client workspace** (`/app/clients/:id`): 9 tabs (overview, client info, import & analysis, dispute dashboard, letter builder, print, next steps, build credit, score simulator). Tab state, letter selection, and round progression live in `client-workspace-context`.
- **Dispute / Metro 2 intelligence engines** (`lib/dispute/*`, `lib/knowledge/*`): real pure-TypeScript logic — anomaly detection across bureaus, statute routing, TRAP strategy, 7-layer round escalation, package builder, CRA addresses/workflows, compliance guardrails. This is the most reusable code in the repo.
- **Score potential / simulator / build-credit / progress report** logic (`lib/score-*.ts`, etc.): deterministic calculators over the sample report.
- **EOD engine** (`eod-production-engine.ts`): `deriveEodTotals` correctly aggregates non-voided production logs per employee per day; EOD page shows auto-derived totals + editable context fields. Matches the stated doctrine ("employees never type totals").
- **DIY Credit** — consumer portal (`/diy-consumer`, `/diy`) and B2B management (`/app/diy-management`) with entitlement gating, white-label branding config, invitations, conversions state machine (Suggested → … → Completed), truth gate, action plan.
- **Referral / affiliate attribution** (`referral-context`): partner-scoped leads, commissions, conversion actions. Affiliate and Outsourcing portals render scoped views.
- **Agency Settings** (`/app/settings`): 18 sections (branding, sub-accounts, products, users, roles, structure, fulfillment, templates, automations, billing, usage, integrations, portals, notifications, security, audit, system controls, danger zone) — all edit in-memory state.
- **Webhook / CRM signal log** (`creditops-webhooks`, `crm-automation-context`): status changes build the exact payload a backend would POST and record it to an audit-style signal log. The `fetch()` is commented out — see D.
- **Marketing site + SEO pages**: complete, with per-route meta injection (`use-seo`) and JSON-LD.
- **Design system**: coherent brand tokens, dark sidebar, consistent shadcn usage.

---

## D. What Is Mock / Demo Only

Everything below has UI and looks live but is backed by hardcoded literals or seed arrays:

| Area | Reality |
|---|---|
| **All data** | 5 orgs, ~30 fulfillment clients, ~20 funding deals, sample credit report, production logs — all literal arrays in `lib/*seed*.ts` and inline `const rows = [...]` inside pages |
| **Dashboard KPIs** (HQ home, Reporting, Billing, Attention Center, Notifications, My Time, TalentOps, BES CRM, People, Teams, Workforce, Calendar, Announcements, Support) | Hardcoded numbers and table rows. No derivation from state. |
| **Time Tracking** (`/app/my-time`) | "Clock In" / "Clock Out" buttons have **no onClick**. Entries are literals. |
| **EOD** | Totals are derived, but from `seedProductionLogs` for a hardcoded `emp-1` / "Carlos Mendoza". Submit just flips a local boolean. |
| **Authentication** | None. `RoleProvider` defaults to `"owner"`; a visible "Preview as" pill lets anyone switch to Affiliate/Processor. CreditOps/FundingOps access providers default to `"admin"`. |
| **Provider connectors** (SmartCredit, IDIQ, MyFreeScoreNow) | `connectors-context` flips a status string; "SC-KEY-••••8421" is a literal. No API calls. |
| **PDF import / OCR** | `PdfDropZone` accepts a file object and stores name/size only; "Run OCR" is a timed phase transition to seeded results. |
| **Webhooks (GHL / DisputeFox / generic)** and **CRM automation bridge** | Payload built, `fetch()` commented out, `void payload`. Signal log only. |
| **AI Copilot "Ask Lisa"** | Keyword match against `lib/knowledge/qa-entries.ts`. No LLM. |
| **Billing / invoicing / metering** | Static revenue mix and per-sub-account invoice cards. `MgmtPlans` literally says "Billing & payments not implemented". |
| **USPS tracking, LetterStream mailing** | Static panels. |
| **Topbar** | Search input has no handler; "Add Sub-Account" / "New Client" button has no onClick; notification bell is decorative. |
| **Portals** (`/portal`, `/affiliate`, `/outsourcing`) | Nav links all point to the same route (`/affiliate`, `/outsourcing`); content is one scrolling page. |
| **Persistence** | The only `localStorage` use is two list-view preference keys (`client-list-helpers`, `funding-client-list-helpers`). Everything else resets on reload. |
| **SEO assets** | `robots.txt`, `sitemap.xml`, canonical, OG image all point at `creditverse-platform.vibepreview.com` and a `vibe.filesafe.space` image. |

---

## E. What Is Broken or Missing

**Broken / dead (nothing crashes, but these are inconsistencies):**

- **10 page files are never routed or imported:** `Cases`, `Disputes`, `Issues`, `QA`, `Evidence`, `Strategy`, `Results`, `Inspector`, `DigitalTwin`, `ProgressReport` (all in `src/pages/app/`). They compile and represent ~2,900 lines of earlier-generation CreditOps UI (QA checklists, results/outcomes, evidence vault, strategy engine, Metro 2 inspector). Decide: route them, fold them into the client workspace, or archive.
- **11 more components are orphaned:** `ItemsTab`, `LetterPreview`, `CategoryLettersPanel`, `FundingClientsPanel`, `SubAccountsBoardView`, `SubAccountsCardsView`, `DiySection`, `Features`, `NavLink`, `lib/dispute/index.ts`, `lib/knowledge/index.ts`.
- **Sub-account sidebar** maps "FundingOps → Pipeline" to `/app/metro2` (a CreditOps Metro 2 demo page). Placeholder wiring.
- **Two parallel client models:** `pages/app/Clients.tsx` has its own inline `Client[]` (Maria Gonzalez etc.) unrelated to `FulfillmentClient` in the CreditOps store, and `ClientDetail` reads `sample-credit-report`. Same person appears under different IDs/shapes across modules.
- **`agency-context.workOrders`** is a lossy adapter: maps every AGENCY work item to the *first* org and hardcodes `type: "Round 1 Processing"`.
- **`FulfillmentWorkspace`** (`/app/fulfillment`) is a legacy work-order board superseded by `/app/creditops`; both exist.
- **Lint errors (12):** 9× `no-explicit-any`, 2× `prefer-const`, 1× `no-unused-expressions` (`FundingGlobalQueue.tsx:345`). Cosmetic, but `strict:false` means the compiler hides much more.
- **React ref warnings** in dev (function components given refs, surfacing in `App`, `DashboardLayout`, `MyTimePage`, `Topbar`, `CopilotPanel`, `Sidebar`, `SubAccountSwitcher`, `Toaster`). Very likely from the vibe-tagger dev plugin's instrumentation and/or Radix `asChild` on non-forwardRef components; not present in the production build. Verify after the tagger is removed.
- **Bundle:** one 2.0 MB chunk, no code-splitting, no lazy routes.

**Missing entirely (required for the target platform):**

- Authentication, sessions, password reset, MFA, invitations
- Any backend / API layer / server-side validation
- Database, migrations, multi-tenant row isolation
- Real RBAC enforcement (today all "permissions" are client-side booleans a user can toggle)
- Persistence of *any* business record
- File storage (reports, evidence, letters, attachments — `ClientWorkAttachments` keeps `File` objects in memory)
- Real time-tracking (clock events, timers, timesheets, approvals)
- Real production logs feeding EOD (the engine exists; the writers do not)
- Billing (Stripe or similar), invoicing, usage metering
- Notifications (email/SMS/in-app)
- Audit log (there is a seeded audit *table* in settings, not an audit *system*)
- Background jobs (SLA timers, report re-imports, webhook retries)
- Provider integrations (SmartCredit, IDIQ, MFSN), OCR, mail (LetterStream), USPS tracking
- CRM sync (GHL) — inbound and outbound
- Tests beyond one placeholder; no E2E
- CI/CD, environment configuration, secrets management, error monitoring
- Compliance review (CROA, TSR, state CSO) before any consumer-facing launch

---

## F. Current Data Architecture

**Pattern:** React Context + `useState` per domain, seeded from literal arrays, no persistence, no normalization across contexts.

**Provider stack** (from `App.tsx`, outermost first): `QueryClientProvider` (unused) → `TooltipProvider` → `ReferralProvider` → `RoleProvider` → `AgencyProvider` → `MonitoringStatusProvider` → `AgencySettingsProvider` → `BrowserRouter` → `AgreementsProvider` → `ConnectorsProvider` → `CrmAutomationProvider` → routes. Page-scoped providers are added inside CreditOps (`Store`, `Access`, `Webhook`), FundingOps (`Store`, `DealStore`, `Access`), ClientDetail (`ClientWorkspace`), DIY (`DiyManagement`), and DashboardLayout (`Copilot`).

**Canonical model worth keeping** (`lib/bes-domain.ts`) — this is the strongest design artifact in the repo and aligns with the target platform:

- `Organization` (Sub-Account) with `principal`, `entitlements: ProductEntitlement[]` (`creditOps | fundingOps | diyCredit | oi | crm`), `isFulfillmentSubscriber`, `businesses[]`, `orgUsers[]` (15 `OrgRole`s), `externalUsers[]` (6 `ExternalRole`s, record-scoped via `scopedRecordIds`), `branding`
- `AgencyUser` with 5 `AgencyRole`s (BES employees only)
- `WorkItem` with hard `scope: "AGENCY" | "ORGANIZATION"` boundary and `relatedType` (`credit_case | funding_deal | project | support | fulfillment`) — encodes the rule "sub-account activity does NOT automatically become BES agency work"

**Fulfillment model** (`lib/fulfillment/*`) — also aligned with the target:

- `FulfillmentClient.mode: "saas_pulled" | "outsourcing_only"` with `organizationId` vs `outsourcingGroupId`, `autoSync` flag, `provenance` — this *is* the "sync from BES SaaS subscriber OR manually managed for external-system companies" requirement, already modeled
- Email-based identity with `checkClientConflict` (same-scope hard block, cross-scope warn)
- FundingOps: `FundingClient → FundingBusiness → FundingFile → FundingDeal`
- Department statuses (Onboarding / Dispute / Support / Complaints / Bureau Calling) with a rich status vocabulary
- `ActivityEntry` with actor, field, previous/new value, pin, mark

**EOD / production model** (`eod-production-engine.ts`): `ProductionLog` (employee, partner, division, department, team, project, workItem, creditCase, fundingDeal, unit type/qty, workDate, isVoided) → `EodSubmission` (context fields + auto-derived totals, 5-state workflow). Directly reusable as a schema.

**Weaknesses:** IDs are strings like `"sub-1"`, `"WO-9xxx"` (random), `act-<timestamp>-<rand>`; dates are display strings ("Jan 15, 2026", "Just now") not ISO in the domain model; `Clients.tsx` / `ClientDetail` / `sample-credit-report` use a *different* client shape than the fulfillment store; `SubAccount` is a legacy adapter over `Organization`; `Reporting`/`Billing` don't read any store.

---

## G. Current Authentication / Permissions

- **No authentication.** No login page, no session, no token, no guard. `/app`, `/affiliate`, `/outsourcing`, `/diy-consumer` are all public URLs.
- **Three separate, unconnected "role" systems**, all client-side and user-switchable:
  1. `lib/roles.ts` + `role-context`: `owner | affiliate | outsourcing` with granted/blocked scope *labels* (display only). A "Preview as" switcher in portal headers.
  2. `lib/fulfillment/creditops-access.tsx`: 7 CreditOps roles (admin, manager, processor, QA, support, complaints, bureau caller) with `allowedDepartments`, `canEditDepartmentProgress`, `canAccessManagement`. Defaults to `admin`. Actually gates UI (Complete Work department checkboxes, management tree). Comment says "same rules must be enforced server-side".
  3. `lib/fulfillment/fundingops-access.tsx`: 8 FundingOps roles, same shape.
- `bes-domain.ts` defines a **fourth** vocabulary (`AgencyRole`, `OrgRole`, `ExternalRole`) that is used for seed data display but never for gating.
- `agency-settings-context` has a seeded `permissions` matrix table, read-only, decorative.
- **Entitlement gating works** (`isProductEnabled`, `isDiyEntitled`) and is the one access concept that is actually consistent across modules.
- `docs/PERMISSIONS_AND_ENTITLEMENTS.md` states the intended rules (partner isolation, consumer portal never exposes internal CreditOps data). None are enforceable today because there is no server.

---

## H. Backend / Database Status

**None.** Verified by grep: no `import.meta.env`, no `process.env`, no `VITE_*`, no `.env*` files, no Supabase/Firebase/Prisma/Drizzle/axios, no live `fetch()` (two commented out), no WebSocket. The docs and the original BUILD_STATUS repeatedly name **Supabase (Auth + RLS + Storage)** as the intended backend; nothing has been started.

**Secrets:** none found in source or public assets (scanned for key/token/JWT patterns). Placeholder credential labels (`SC-KEY-••••8421`) are literals. The `.gitignore` covers `.env`-style `*.local` and `.dev.vars` but not `.env` itself — add before any backend work.

---

## I. Integration Status

| Integration | UI exists | Real | Notes |
|---|---|---|---|
| GoHighLevel (GHL) CRM webhooks | Yes (endpoint config, mapping table, signal log) | No | Payload schema designed (`locationId`, `pipelineStage`, `tag`, `workflowTrigger`); `fetch` commented out |
| DisputeFox status sync | Yes | No | Same bridge |
| Generic webhook | Yes | No | Same bridge |
| SmartCredit / ConsumerDirect | Connector card | No | Auth method noted: Client Key + Secret via Partner Hub |
| IdentityIQ / MyScoreIQ (IDIQ) | Connector card | No | Partner API |
| MyFreeScoreNow | Connector card | No | Per-consumer client token |
| PDF OCR / extraction | Upload UI | No | Timed fake phase |
| LetterStream (mailing) | Static link/panel | No | |
| USPS tracking | Static panel | No | |
| Email / SMS | None | No | |
| Payments | None | No | |
| AI (copilot) | Yes | No | Keyword lookup over static Q&A |
| GHL vibe-tagger (dev tooling) | n/a | Yes | Only integration that actually runs; dev-only, local file write |

---

## J. Risks and Technical Debt

1. **Everything is a facade.** The single biggest risk is stakeholders believing the platform is closer to done than it is. ~67k lines of UI, ~0 lines of backend. Budget the rebuild as a backend-first project that *reuses* this UI, not as "wiring up" a finished app.
2. **`strict: false` TypeScript.** Types exist but the compiler isn't enforcing them; `any` and implicit-any are permitted. Turning strict on later will surface hundreds of errors. Do it early, module by module.
3. **Fragmented client identity.** Three client shapes (`Clients.tsx` inline, `FulfillmentClient`, `FundingClient`) plus `Person` in DIY/referral. The docs' "one client, one identity, one history" (Client 360) is not modeled once.
4. **Four role vocabularies, zero enforcement.** Must collapse into one RBAC model with server-side checks before any real data is loaded.
5. **Context-per-domain state** will not scale to server data (no caching, invalidation, optimistic updates, pagination). React Query is installed and idle — good, that is the migration path.
6. **Hardcoded pages** (Reporting, Billing, TalentOps, BES CRM, People, Teams, Workforce, My Time, Notifications, Calendar, Announcements, Support) have no data layer to swap; they are wireframes, not features.
7. **Display-string dates and random IDs** in domain objects will fight any database schema.
8. **No tests.** Pure-logic modules (`lib/dispute`, `lib/score-*`, `eod-production-engine`) are ideal unit-test targets and currently untested. Behavior may silently regress when refactoring.
9. **Bundle size / no code-splitting.** 2 MB initial load; marketing visitors download the entire operations app.
10. **GHL residue:** vibe-tagger plugin, `allowedHosts: [".modal.host"]`, vibepreview canonical/sitemap/OG URLs, `msgsndr` image URLs. Harmless locally; wrong for production.
11. **Dead code** (10 pages, 11 components, legacy `FulfillmentWorkspace`) increases the surface to maintain and confuses "what is the real CreditOps flow".
12. **Compliance exposure.** CROA/TSR-sensitive language, "deletion rate" KPIs, and consumer-facing dispute prep exist in UI. Docs flag this; it must be reviewed before any public surface goes live.
13. **No lockfile policy** (README says untracked). Non-reproducible installs; recommend committing `package-lock.json`.
14. **Deprecated deps:** recharts 2.x, eslint 9.39 flagged as unsupported by npm. Minor.

---

## K. Recommended Production Architecture

*Recommendation only — nothing below has been started. Approve before build.*

**Guiding decision:** keep the existing React/Vite/Tailwind/shadcn frontend and its domain logic; put a real, tenant-aware backend under it. Do not rewrite the UI.

### Backend & data
- **Supabase (Postgres + Auth + RLS + Storage + Edge Functions)** — matches the intent already in the docs, gives multi-tenant isolation via RLS, auth, file storage, and realtime in one managed service. Alternative if you want a conventional API layer: **NestJS/Fastify + Postgres + Prisma** on Fly/Render. Supabase is the faster path for a small team; recommend it.
- **Schema core (tenancy first):**
  `agencies` (BES HQ, one row) → `organizations` (sub-accounts) → `memberships` (user × org × role) → `product_entitlements`.
  `people` (one identity per human, email-keyed) → `service_enrollments` (creditOps / fundingOps / diy per org) → `credit_cases`, `funding_files`, `funding_deals`, `projects`.
  `work_items` (scope agency|organization, related_type, related_id), `production_logs`, `time_entries`, `eod_submissions`, `activity_events` (append-only), `audit_log`.
  `fulfillment_enrollments` with `mode: saas_pulled | outsourcing_only` and `outsourcing_groups` — lifts the existing model directly.
  `files` (storage refs + hash), `documents`, `letters`, `report_snapshots`.
  `invoices`, `subscriptions`, `usage_events`.
- **RLS policies** keyed on `organization_id` + membership role; agency staff get cross-org read via a `agency_staff` claim. Consumer-portal users see only their `person_id` rows.
- **Server-side authorization service** (Edge Function or Postgres functions) implementing one RBAC model: `agency_role`, `org_role`, `external_role`, plus department/assignment scoping from `creditops-access`. Replace the four client-side role systems with claims from this.

### Frontend integration
- **TanStack Query** for all server reads/writes (already installed). Replace each `*-context` seed with query hooks incrementally; keep contexts for pure UI state.
- **Zod schemas** shared between DB types (generated by Supabase CLI) and forms.
- **Route guards** + auth layout; lazy-load `/app/*`, portals, and marketing separately.
- Turn on `strict: true` per directory as it's migrated.

### Integrations layer
- **Outbound webhooks** (GHL, DisputeFox, generic): move `pushStatusChange` into an Edge Function with a `webhook_deliveries` table, signed payloads, retries. The existing payload schema is a good v1 contract.
- **Inbound GHL sync** (contacts/pipeline → CreditOps SaaS clients): webhook receiver + idempotent upsert on email.
- **Report providers** (SmartCredit / IDIQ / MFSN): adapter interface `ReportProvider { connect, pull, normalize }`; credentials stored server-side only (Supabase Vault), never in the browser.
- **OCR:** queue job (Supabase queue or Inngest/Trigger.dev) → extraction service → `report_snapshots`.
- **Billing:** Stripe (subscriptions per org, metered usage for fulfillment units, Connect for affiliate payouts).
- **Notifications:** Resend/Postmark (email), Twilio (SMS), in-app via `notifications` table + realtime.
- **AI copilot:** Anthropic API behind an Edge Function, grounded on `lib/knowledge` + tenant data with retrieval; never returns legal conclusions (per docs).

### Platform
- **Environments:** `.env.local` (gitignored), Supabase projects for dev/staging/prod, GitHub Actions (lint, typecheck, test, build, migrations), Vercel or Cloudflare Pages for the SPA, Sentry for errors.
- **Testing:** Vitest for `lib/*` engines (start now, they're pure), Playwright for critical flows (login → switch org → CreditOps status change → webhook delivery row).

---

## L. Recommended Build Order

Each phase leaves the app runnable and demo-able.

0. **Housekeeping (½ day):** commit lockfile, add `.env*` to `.gitignore`, remove vibe-tagger + `.modal.host`, fix 12 lint errors, add unit tests for `lib/dispute`, `eod-production-engine`, `score-*`. Decide fate of the 10 unrouted pages.
1. **Foundation — tenancy + auth + RBAC (Phase 1):** Supabase project; `organizations`, `memberships`, `product_entitlements`, `people`; auth pages + route guards; one RBAC model with RLS; replace `agency-context` and `role-context` with real session/org data. *Outcome: real login, real org switching, real entitlement gating.*
2. **Shared operations engine (Phase 2):** `work_items`, `activity_events`, `audit_log`, `files` + Storage; assignee scoping. Migrate `WorkItem`/`ActivityEntry` UI to queries. *Outcome: My Work and Attention Center are real.*
3. **CreditOps Agency Fulfillment Workspace (Phase 3):** `fulfillment_enrollments` (both modes), `outsourcing_groups`, department statuses, Complete Work → `production_logs`. Port the existing CreditOps store 1:1. Outbound webhook deliveries. *Outcome: the flagship workspace runs on real data; this is BES's own daily tool, so it de-risks everything after it.*
4. **Time Tracking + auto-derived EOD (Phase 4):** `time_entries` (clock events), `eod_submissions`, missing-EOD job. Wire the existing engine. *Outcome: My Time / EOD real; Workforce reporting has data.*
5. **FundingOps Agency Fulfillment Workspace (Phase 5):** clients/businesses/files/deals; port the existing store. 
6. **CreditOps SaaS (sub-account product) + GHL inbound sync (Phase 6):** client workspace (`/app/clients/:id`) on `credit_cases` + `report_snapshots`; provider adapters; OCR queue; `saas_pulled` sync into Phase 3 workspace.
7. **FundingOps SaaS (Phase 7):** same pattern for sub-account funding pipelines.
8. **BES CRM project delivery + TalentOps (Phase 8):** `projects`, milestones, placements; both feed `production_logs`.
9. **Workforce + Reporting (Phase 9):** views/materialized views over production, time, EOD, SLA; replace hardcoded dashboards.
10. **Billing (Phase 10):** Stripe subscriptions, metered fulfillment usage, invoices, affiliate payouts.
11. **DIY Credit consumer portal + referral (Phase 11):** consumer auth, white-label domains, conversions; **compliance review gate** before launch.
12. **Agency Settings hardening, notifications, AI copilot (Phase 12).**

---

## Appendix — Original GHL AI Studio self-report (as shipped in the zip, preserved verbatim)

> Note: the ✅ marks below mean "UI exists", not "works end-to-end". Read them against sections C–E above.

# BES Build Status

> Frontend shell for Claude Code to connect to Supabase, Auth, RLS, Storage,
> real report providers, AI, payments, CRM, audit, notifications, and
> background jobs.

## Status markers

- ✅ Frontend Complete
- 🟡 Demo Only
- 🔴 Backend Required
- 🔴 Provider Integration Required
- 🔴 Billing Required
- 🔴 Compliance Review Required

## Modules

### BES DIY Credit (B2B2C white-label)

| Area | Status |
|------|--------|
| Domain logic & state architecture | ✅ |
| Organization DIY management (B2B) | ✅ |
| Consumer portal shell & navigation | ✅ |
| Guided DIY journey (import → review → truth gate → action plan → dispute prep → progress) | ✅ |
| Conversions, entitlement gating, white-label config | ✅ |
| Route wiring + hide module when not entitled | ✅ |
| Documentation | ✅ |
| Auth & RLS | 🔴 |
| Provider integrations (SmartCredit, IDIQ, MyFreeScoreNow, MyScoreIQ) | 🔴 |
| PDF OCR / data extraction | 🔴 |
| Billing & payments | 🔴 |
| Storage (reports, evidence, documents) | 🔴 |
| Notifications (email/SMS) | 🔴 |
| AI (grounded, never legal conclusions) | 🔴 |
| Audit | 🔴 |
| Compliance review (CROA, state CSO laws) | 🔴 |

### BES CreditOps

| Area | Status |
|------|--------|
| Client workspace (overview, account, import/analysis, dispute dashboard, letters, print, next steps) | ✅ |
| Dispute strategy engine (TRAP, 7-layer, factual/Metro2/hybrid) | ✅ |
| Credit Intelligence Engine (import, normalize, compare, re-import, progress) | ✅ |
| Metro 2 Intelligence Engine (compliance-correct) | ✅ |
| Score potential / next best action / build credit / score simulator / radar charts | ✅ |
| QA system | ✅ |
| Operations / fulfillment | ✅ |
| Backend (Supabase, RLS, real providers, AI, mailing) | 🔴 |

### BES FundingOps

| Area | Status |
|------|--------|
| Funding operations frontend | ✅ |
| Backend (lender intelligence, submissions, deals) | 🔴 |

### BES Platform / Agency HQ

| Area | Status |
|------|--------|
| Master Agency / Sub-account workspace switcher | ✅ |
| Sub-account search, pin, card/list/board views | ✅ |
| Whitelabel configurator | ✅ |
| Fulfillment live chat & activity stream | ✅ |
| Sub-account invoicing & usage metering | ✅ |
| Backend (multi-tenant, RLS, real billing) | 🔴 |

### Marketing site

| Area | Status |
|------|--------|
| Hero, problem, product selector, ecosystem, journeys, standalone/connected | ✅ |
| AI positioning, pricing, trust, FAQ, CTA | ✅ |
| SEO product pages + keyword pages | ✅ |
| Rebranded to Imperial Charcoal / Empire Gold / Cloud Sand / Empire Green | ✅ |

### 2026-09-03 — Dropdowns and document viewing

**Every native `<select>` is gone.** 23 dropdowns across 17 files rendered with
the operating system's own menu — a different font, palette and highlight than
the rest of the app, and different again on every machine. They are now one
component, `components/ui/ops-select.tsx`, wrapping the Radix `Select` that was
already in the shadcn kit but unused. It keeps a native-shaped API (`value`,
`onValueChange`, `options`) so no screen grows a five-component nest just to
show a dropdown (rule 13), with three size variants matching the densities
already in use: `inline` (in-cell editors), `sm` (toolbars/filters), `field`
(labelled form fields).

Two behaviour improvements fell out of it:

- **Inline editors open on one click.** The native element needed a second
  click to reveal its options; `openOnMount` opens the menu with the editor.
- **Dismissing an inline editor now closes it.** The old `onBlur` commit was
  the only exit; `onDismiss` handles Escape and click-away explicitly.

**The PDF viewer was unusable for real documents.** `FileViewer` capped the
iframe at `max-w-4xl` (896px). A frame that narrow makes the browser's built-in
PDF viewer choose a fit-*page* zoom — 53% on a laptop — which cannot be widened
from inside the frame, so a reviewer saw a quarter of a page of illegible text.
Fixed three ways: the document gets the viewport (91% × 92% measured, capped at
a 1400px reading column with a full-width toggle), `#view=FitH&navpanes=0` asks
the viewer to fit page *width* and drop its thumbnail sidebar, and the viewer's
own chrome collapsed from two bars to one. Verified with a real multi-page PDF:
**134% instead of 53%**. Navigation arrows now sit in a gutter beside the page
rather than on top of it, and a zoomed image can be panned instead of clipped.

The dispute-letter editor got the same treatment — `max-w-3xl` → `max-w-5xl`,
18 → 26 rows, since it holds a full page of prose.

**Two real bugs found while working there.**

- `ClientWorkAttachments` nested the remove-file `<button>` inside the card
  `<button>`. That is invalid HTML; browsers hoist the inner button out of its
  parent, which silently breaks both click targets. The remove control is now a
  sibling positioned over the card.
- `DEAL_STATUSES` was a module-local const in `FundingDealWorkspace` while
  `FundingDealListPanel` maintained its own inline copy of the same eight
  statuses. Moved beside the `DealStatus` type in `fundingops-domain.ts` so the
  status picker and the status filter cannot drift apart (rule 13).

Also removed 11 dead imports (most pre-existing) found by scanning the touched
files. Verified: tsc clean, 0 lint errors, 119/119 tests, build clean, no
circular dependencies, no orphans, duplicated lines 1,233 → 1,146.

### 2026-09-03 — Live verification, and the security work it turned up

**Signed in against the live database as an agency owner and drove the app.**
Phases 1–3 confirmed working on real data: profile and agency membership
resolve, 5 organizations readable under RLS, and the CreditOps client list
renders database rows — proven by the record ids being real UUIDs, not the
seed's `fc-101`. A status change written through the interface landed in
Postgres and was set back. The list *looked* like demo data only because the
database was seeded with the same ten sample people; nothing distinguished
them on screen, which is itself worth remembering.

Also confirmed **nothing is sent to GHL or DisputeFox** — the outbound `fetch`
is still commented out, so no traffic leaves the machine.

**🔴 Personal data and credentials were hardcoded in the frontend.**
`ClientWorkWorkspace` used an SSN, date of birth, home address and a consumer's
plaintext portal password as the DEFAULT description for *every* client, so it
rendered on every client screen. `AccountTab` held a full SSN behind a reveal
toggle, and `AdditionalLoginsCard` held three bureau passwords. All present
since the original GHL export (`8ca3c99`). Replaced with unambiguously fake
placeholders and labelled as sample data. **The values remain in git history**
until the rewrite below is run, and the exposed password should be treated as
compromised regardless of what happens to the code.

**Status changes were completely unaudited.** Changing a client's status — the
most common daily action in CreditOps — wrote no activity row and no audit row;
the client's Activity History read "No system activity logged yet". The
`activity_events` triggers had been built on `work_items` only. Migration 0007
adds the same pattern to `fulfillment_clients` and `client_department_statuses`,
in the database so it cannot be skipped by a caller that forgets. Contact edits
record *that* a field changed, never the value — an append-only timeline that
quotes an email address becomes a second, unerasable copy of personal data.

**The timeline was not actually append-only.** DELETE was correctly refused, but
UPDATE succeeded: the policy meant to let an author pin their own comment also
allowed rewriting `action`, `previous_value` and `new_value` on system rows.
Demonstrated by rewriting a live row and restoring it. RLS cannot restrict
columns, so migration 0008 revokes table-wide UPDATE and grants it back for
`(pinned, mark)` only. Verified live: tampering is now "permission denied",
deleting still fails, pinning still works.

**`webhook_deliveries` had never held a row.** `recordWebhookDelivery` existed
and nothing called it, so the CRM signal log vanished on refresh. Both the
emitted and skipped paths now go through one `commit()` helper; the panel reads
the recent log back on load. Skipped signals are recorded too — "we did not tell
the CRM, and why" is the question the log exists to answer. "Clear log" now only
clears the view, and says so.

**Three older violations closed.** `updateOrganizationBranding` did
read-merge-write across the network — not just two round trips (rule 14) but a
lost update, where two people editing different fields lose one of the changes.
Now one server-side `jsonb` merge under the row's lock, plus the audit row
branding edits never wrote; verified with two concurrent patches, both survived.
`pages/app/Clients.tsx` no longer carries its own client array: the data moved
to a clearly-named seed module and the page wears the "Sample data" badge, since
it was linked from the sidebar and showed invented credit scores as if real.
Assignment stopped offering a control that always failed — `updateAssignee` is
now *absent* from the CreditOps backend rather than a throwing stub, the store
reports `canAssign: false`, and the cell renders as text with an explanation.

**Outstanding.**

- **Git history still contains the SSN and password.** The rewrite is prepared
  (`~/bes-scrub-history.py`, backups at `~/*.bundle`) but is blocked from
  running automatically because it rewrites all 33 commits. Dee runs it.
- **Assignment needs the Workforce directory (Phase 4).** Names are not
  identities (rule 4), so this stays read-only until profiles carry ids.
- **The hardcoded `AGENCY_ID`** in `creditops-client-store` is still a constant.
  `auth-context` now exposes `agencyId` from the user's own membership; the
  store should be threaded onto it before white-label resale.
- **FundingOps has no backend at all** (Phase 5).

### 2026-09-03 — History scrub completed, and the damage it caused

**The sensitive values are gone from every commit.** Confirmed with
`git grep` across all 35 revisions — not with `git log -S`, which only reads
commit diffs and misses a value sitting unchanged in a file. Zero hits for the
SSN, the date of birth, the address, the phone number, the note's author name,
and the password. The only SSN-shaped string left anywhere in history is the
`000-00-0000` placeholder.

Two passes were needed. The first left a bare `(408) …` phone number in
`supabase/seed_creditops.sql` because the pattern only matched the `+1 (408) …`
form. That number was also live in the database on a seeded client row and has
been replaced there too.

**The scrub damaged `auth-context.tsx`, and that damage is permanent in
history.** The `Password:` pattern is a substring of `signInWithPassword:` and
`resetPassword:`, so it matched both signatures in `AuthContextValue` and
deleted the rest of each line. HEAD is repaired and compiles; **the historical
commits do not**.

This is **accepted, not fixed**, and the reasoning matters. A repair pass cannot
reconstruct what was deleted: the signature was a single line in earlier commits
and prettier-wrapped across four lines in later ones, so the correct replacement
differs per commit and the original text no longer exists anywhere to copy from.
Weighed against that: the security objective is fully met, HEAD builds and
tests clean, and a third full-history rewrite carries its own risk — the first
one is what caused this. The cost of older commits not compiling is that
`git bisect` across them would fail. That is the whole impact.

**Updated once the remote existed.** Part of the original reasoning was that
there was no remote and no other clone, so a rewrite would have been cheap to
coordinate. The repository is now published to
[BESTeam26/FullSuite](https://github.com/BESTeam26/FullSuite), which means those
older non-compiling commits are on `origin` too. The decision still stands — the
defect is in history, not in HEAD, and rewriting published history is worse than
the `git bisect` limitation it would remove — but it is now a shared fact rather
than a local one, and anyone cloning the repo inherits it.

**Lesson recorded for anyone scripting a scrub here:** anchor patterns to a word
boundary, and diff the result against the original before rewriting history. A
substring match inside an identifier is exactly how this happened.

**Verified after all of it:** tsc clean, 0 lint errors, 119/119 tests, build
clean, no circular dependencies, no orphans, duplication 1.60%. `verify:live`
passes all checks, now including the three functions added this session and the
append-only assertions on `activity_events`. Driving the live app end-to-end
through the interface: a status change writes the row, produces exactly one
audit event and one webhook delivery record, and the test data was restored.

Backups of every stage are at `~/BES-Platform-backup-*.bundle`,
`~/pre-rewrite-*.bundle` and `~/post-pass1-*.bundle`.

### 2026-09-03 — Phase 4: Time Tracking and auto-derived EOD ✅ live

The engine was already written and unit-tested, and `production_logs` was
already being written by Complete Work, so EOD had a real source from the first
day. What was missing was where clock events live and where shift context is
kept.

**Schema (migration 0010).** `time_entries` and `eod_submissions`, with the
engine's rules enforced in the database rather than the interface:

- *One EOD per employee per work date* — a unique index, not a UI check.
- *Employees never enter production totals* — there is no totals column to
  write. Totals are derived at read time from the logs, so a stored figure can
  never drift from the rows it claims to summarise.
- *One running clock per person* — a partial unique index on the open entry. A
  double-click on Clock In now returns a clear message instead of two
  overlapping entries that quietly corrupt every total after them.
- `duration_minutes` is a generated column, so no caller repeats the arithmetic.
- No DELETE policy on either table: time and EOD are operational history
  (rule 11). Corrections are status transitions.
- EOD state changes write to `activity_events`, the same treatment CreditOps
  status changes got.

**Layers.** `time-domain.ts` holds the deterministic rules (14 new tests);
`data/time-entries.ts` and `data/eod.ts` are the repositories;
`data/use-time.ts` is the dual-mode application layer; the pages render and
compute nothing. My Time and EOD were extracted out of `HqPages.tsx` while
being wired — that file already carried six unrelated pages, and it dropped
from 520 to 303 lines.

**Verified against the live database by driving the interface**, not by calling
the API:

| Check | Result |
|---|---|
| Clock In writes a row with division and note | ✅ |
| Second Clock In refused by the index | ✅ `23505` |
| Clock Out closes it, database computes the duration | ✅ |
| EOD derives totals from real production logs | ✅ 2 units from 2 logs |
| Save draft, then Submit, sets state and timestamp | ✅ |
| Second EOD for the same day refused | ✅ `23505` |
| Audit trail records both transitions with the actor | ✅ |
| **Voiding a log drops the total and keeps the log visible** | ✅ 2 → 1 |

Test data was restored: the voided log un-voided, the EOD returned to draft with
its test text cleared. One 0-minute time entry remains — it is a real record of
a real action and the table is append-only by design.

`verify:live` now covers 24 tables and asserts both new tables deny anonymous
reads. tsc clean, 0 lint errors, 133/133 tests, build clean, no circular
dependencies.

**Not done in this phase:** assignment still needs the Workforce people
directory before `canAssign` can be true, and the hardcoded `AGENCY_ID` in
`creditops-client-store` should move to `auth.agencyId` now that it exists.

### 2026-09-03 — Rule 15 added, and the interaction-state audit it triggered

Rule 15 (visual contrast, hover, focus, active, disabled, loading, both themes)
added to CLAUDE.md. The audit behind it was **measured in the browser**, not
eyeballed: a WCAG relative-luminance probe walked every text node on 19 routes,
composited every semi-transparent layer down to the first solid background, and
compared against the 4.5:1 floor (3:1 for large text).

**Three bugs that a screenshot of the default state could not show.**

1. **`bg-gradient-emerald` was never defined.** 32 components used it; it
   computed to `background-image: none`. Those elements pair it with
   `text-white`, so they were rendering **white text on the page background** —
   invisible. Nothing looked broken precisely because the content had vanished.
   Aliased to Empire Green in one line, which repaired all 32.
2. **The active sidebar item hid its own count.** The selected row's background
   is Empire Gold, and the badge on it is amber — measured **1.24:1**. The badge
   now inverts on the active row. It was only ever wrong on the row you were
   looking at.
3. **Chart legends inherited the series colour.** Recharts paints legend labels
   in the line's colour: fine for a thick stroke at 3:1, unreadable for 11px
   text at 2.15:1. `ChartLegend` keeps the coloured swatch and switches the
   label to the foreground token.

**Systemic fixes.**

- **Focus.** ~175 controls relied on the browser default, which is tuned for a
  white page and is hard to see on the dark sidebar. One `:focus-visible`
  baseline now paints a 2px `--ring` outline — an outline, not a box-shadow, so
  focus can never shift layout. Deliberately NOT wrapped in `:where()`: that
  would give it zero specificity and Tailwind's `focus:outline-none` would win.
  Three places that opted out and supplied nothing were fixed.
- **Status colours are now tokens.** `--status-success/warning/info/danger`,
  defined per theme. The raw Tailwind 400–700 shades measured **2.15–4.06:1** on
  the tinted chips they sat in — even `amber-700` failed at 3.82 on
  `bg-amber-500/10`. 671 utilities across 111 files migrated; dark-surface
  usages (the sidebar, the `bg-emerald-950` banners) were detected and left
  alone, since light ink is correct there.
- **Disabled** was four different opacities from 40 to 70; now one value (60)
  plus `cursor-not-allowed`, so the state does not rest on contrast alone.
- Sidebar muted labels were at 3.07:1 and 4.17:1; `text-muted-foreground/70`
  at 3.39. Both raised.

**Result, measured:** every route audited reports **0 contrast failures in both
light and dark**. Focus verified with real Tab presses (2px gold,
`:focus-visible` true). Hover pairings checked for light-on-light and
dark-on-dark — none. Loading states preserve layout. Note this does change
appearance slightly: status text is darker in light theme than the original GHL
export, which is the point.

tsc clean, 0 lint errors, 133/133 tests, build clean, no circular dependencies.

Also refreshed two stale notes in CLAUDE.md: rule 14's branding violation is
fixed, and rule 2's duplicate-client note now records what was done and what
still remains.

### 2026-09-03 — Phase 5: FundingOps backend 🟡 data layer live, some screens still on seeds

Five tables, live and verified: `funding_clients`, `funding_businesses`,
`funding_files`, `funding_deals`, `funding_department_statuses`. Deliberately
shaped like CreditOps — same partner scoping, same one-email-per-partner index,
same append-only audit, same grant lockdown — so a reader who knows migration
0005 recognises all of it.

**On rule 2, stated rather than dodged.** A funding client is not a copy of a
CreditOps client, and this is not a second people table. `fulfillment_clients`
today carries CreditOps-specific columns (round, dispute counts), so it is
really the CreditOps *engagement*, not a canonical person. Rather than duplicate
quietly, this migration: enforces the same one-email-per-partner rule inside
FundingOps; carries `fulfillment_client_id`, an explicit link to the same
human's CreditOps record; and ships `find_client_across_divisions()` so intake
can SEE the other division's record and link instead of forking. Verified: a
FundingOps lookup for a CreditOps client's email returns
`creditops / Tanya Brooks / In Processing`. Full unification of the person
record belongs with the Phase 6 SaaS client workspace.

**A permissive policy I shipped and then fixed.** Migration 0011 used one
`FOR ALL` policy per table gated on "agency staff OR org member". Correct for
SELECT, badly wrong for the rest: any member of a customer organization could
insert, update and *delete* funding clients, files and deals — deleting
operational history, which rule 11 forbids. Migration 0012 splits them to match
CreditOps: select scoped, insert agency-staff, update assigned-agent-or-manager,
delete agency-admin only.

**Verified against the live database**, driving the data layer the UI calls:

| Check | Result |
|---|---|
| Create client → business → file → deal | ✅ |
| Duplicate email on the same partner refused | ✅ index `23505` |
| Deal cannot be Funded without a funded date | ✅ check `23514` |
| Client and deal transitions both audited with the actor | ✅ |
| Cross-division identity lookup finds the CreditOps record | ✅ |
| Reads resolve partner name, open-file count, deal count | ✅ |
| EIN stored and shown as last-4 only | ✅ `••-•••0001` |
| All 29 tables deny anonymous reads | ✅ `verify:live` |

Test records were deleted afterwards; their `activity_events` rows remain, which
is the append-only guarantee working as intended.

**What is NOT done, and why it matters.** Six components still import
`fundingops-seed` directly — `FundingClientWorkspace`,
`FundingClientWorkWorkspace`, `FundingClientsPanel`, `FundingDealWorkspace`,
`FundingOpsDashboardView` and `FundingOps.tsx`. That is a pre-existing rule 5
leak: a component reaching past the data layer is exactly how a screen shows
sample data while the database is live. The client list, the Deal List and the
deal store are converted; the rest are not.

The visible consequence: the **FundingOps partner tree still reads seed
partners**, so its scope ids do not match live organizations and the Add Client
modal cannot yet attach a client to a real partner through the interface. The
data layer accepts it (proven above); the tree has to be pointed at
`organizations` and `outsourcing_groups` first. That is the next task in this
phase, not a separate one.

Also fixed: `findClientAcrossDivisions` passed `undefined` for the optional
scope, which PostgREST drops from the body, making it look for a one-argument
overload that does not exist. NULL now travels explicitly.

tsc clean, 0 lint errors, 133/133 tests, build clean, no circular dependencies.

### 2026-09-03 — Partner trees go live, and the intake bug that hid behind them

**Both divisions hardcoded their partner lists.** `creditops-partners.ts` and
`fundingops-partners.ts` carry invented scope ids. Seeded clients already had
real organization ids, so navigation looked fine — but a client created through
the interface was attached to a partner that does not exist. New shared source:
`lib/data/partners.ts` + `use-partners.ts`, reading `organizations` and
`outsourcing_groups` once and serving both divisions (rules 2 and 5). The
constants remain only as the demo fallback.

**The bug that exposed it.** Adding a client from the management-level list sent
`organization_id: "all"` — a UI filter sentinel — into a `uuid` column, and
Postgres rejected it with `22P02`. The modal swallowed the failure and closed as
if it had saved. Present in **both** divisions, unnoticed because the seeded
rows were inserted directly.

Fixed three ways: the sentinel is gone; the modal now offers a **partner picker**
when opened without a partner in context (previously there was no way to add a
client at all from that screen, since the partner workspace has no client tab by
design); and submit is disabled with a stated reason until a partner is chosen
(rules 3 and 15).

**Verified end-to-end through the interface**, not the API: management Client
List → Add Client → picker lists the five live partners → choose Vantage Funding
Group → save → the row lands with the correct `organization_id`,
`partner_scope_id` and derived `provenance`, and the list renders it. Test rows
deleted afterwards.

**Still outstanding in Phase 5.** Six components read `fundingops-seed`
directly for businesses, files, deals and groups:
`FundingClientWorkspace`, `FundingClientWorkWorkspace`, `FundingClientsPanel`,
`FundingDealWorkspace`, `FundingOpsDashboardView`, `FundingOps.tsx`. The client
list, Deal List, deal store, partner tree, management dashboard and global queue
are converted; the client-detail workspaces are not. The hooks they need
(`useFundingFiles`, `useFundingDeals`, `useFundingBusinesses`) already exist —
this is call-site conversion, not new plumbing.

tsc clean, 0 lint errors, 133/133 tests, build clean, no circular dependencies.

### 2026-09-03 — 🔴 The append-only audit trail had a back door

Asked whether anything needed fixing before continuing, I audited rather than
guessed. Row policies came back clean — every `FOR ALL` policy outside the one I
shipped in migration 0011 (already fixed by 0012) is properly gated, and agency
membership cannot be self-granted. But the foreign keys were not.

**`activity_events.organization_id` was `ON DELETE CASCADE`.** Migration 0008
made the timeline append-only — no DELETE policy, column-level grants so values
cannot be rewritten — and that was verified at the time. A cascade is not a
DELETE statement the caller issues, so no policy is consulted. Deleting one
organization deleted its entire audit history.

Demonstrated against the live database before fixing: a throwaway organization
with one client and one status change produced 2 audit events; deleting the
organization removed the client **and both events**, with no error and no
warning. Any agency admin could erase the record of everything done for a
customer by deleting the customer. The same cascade destroyed
`fulfillment_clients` and `funding_clients` rows — operational history that
rule 11 says is archived, never deleted.

Migration 0013 fixes it in two directions:

- **History outlives its parent.** `activity_events` and `audit_log` now
  `SET NULL` on the organization. The row stays; the scope pointer clears, which
  the existing RLS reads as agency scope — correct, since once a customer is
  gone only BES staff should see what happened. `production_logs` and
  `webhook_deliveries` get the same treatment: they are the ledger this business
  bills from.
- **Client records block the delete.** `fulfillment_clients` and
  `funding_clients` now `RESTRICT` against both organizations and outsourcing
  groups. An organization holding clients cannot be deleted at all; it is
  archived through its status, which both tables already support.

Re-ran the identical probe afterwards: the delete is **refused** by the
constraint, the client **survives** the attempt, the organization becomes
deletable only once deliberately emptied, and **all three audit events survived
everything**. No probe rows left behind.

Configuration children (businesses, entitlements, memberships, preferences)
still cascade — those are settings, not history.

**Lesson worth keeping:** "append-only" is a property of the whole graph, not of
one table's policies. Checking the policies proved nothing about the foreign
keys pointing at it.

tsc clean, 133/133 tests, build clean, `verify:live` green.

### 2026-09-03 — Hardcoded agency id removed, and the enforcement gap behind it

The constant was the smaller half. Tracing the write paths first turned up the
real problem: **`is_agency_staff()` takes no agency argument.** It answers "is
this user staff of ANY agency", and 104 policy clauses across 85 policies were
gated on it. Sending the correct `agency_id` from the app would have meant
nothing — the database was not checking it. "Agency A cannot read Agency B" was
not enforced anywhere.

Three things were missing, all now closed (migration 0014):

1. **Agency-scoped helpers.** `is_staff_of(agency)`, `is_manager_of(agency)`,
   `is_admin_of(agency)` test membership of *that* agency. EXISTS checks, not a
   scalar "my agency", because `agency_memberships` allows a user to belong to
   more than one.
2. **Missing tenant anchors.** `activity_events`, `work_items` and `files` had
   no `agency_id` at all — their only anchor was `organization_id`. Each now
   carries one, NOT NULL, backfilled from the owning organization. A trigger
   stamps it on every audit insert, so a writer cannot mis-attribute it.
3. **Write-side policies.** A correct SELECT is no use if another agency can
   INSERT. Every write policy on a tenant-owned table now tests the row's
   agency too.

**App side.** The two `AGENCY_ID` constants are gone. `LiveProvider` resolves
`agencyId` once from the authenticated context and passes it to the backend;
the payload type has no agency field, so a component cannot choose one. Writes
default-deny with a stated error when no agency resolved. Two `agencyId!`
non-null assertions in the time/EOD hooks were replaced with explicit
rejections.

**Verified live, both layers.**

| Check | Result |
|---|---|
| Write into another agency | ✅ refused — "new row violates row-level security policy" |
| Write into own agency | ✅ still works |
| Read another agency's rows (10 tables) | ✅ 0 visible, 0 foreign rows in any result |
| CreditOps status change → audit row | ✅ still written, agency-stamped |
| Time, EOD, production, webhooks | ✅ readable and agency-scoped |
| Store-level isolation | ✅ 6 new tests |

139 tests (up from 133), tsc clean, 0 lint errors, build clean, 32 live checks.

#### Attribution on delete and archive — the integrity answer

Measured, not assumed:

- **Archive loses nothing.** It is a status transition; every row and both
  attributions stay intact.
- **Agency attribution now survives deletion.** Before migration 0014 an audit
  row whose organization was deleted had *no* tenant left, which under the old
  agency-blind policy made it readable by staff of any agency. It is now
  NOT NULL and preserved.
- **Organization attribution is still lost on organization deletion.**
  `activity_events.organization_id` and `audit_log.organization_id` go NULL
  (migration 0013, which stopped the row being deleted outright).

That last one is a **forensic limitation, not a security hole** — the row stays,
the agency stays, and `entity_id` still names the client the event was about, so
the trail is followable. It is also hard to reach: since 0013, an organization
holding client records cannot be deleted at all. Left as-is deliberately;
recording it here rather than redesigning, since the task asked for a report and
nothing about it is unsafe. If full provenance is wanted later, the fix is a
denormalised `organization_name` snapshot on the event, not a foreign key.

### 2026-09-03 — Tenancy doctrine locked in (rule 16), and the two gates it exposed

Doctrine recorded in CLAUDE.md as rule 16: one BES Agency HQ, unlimited customer
organizations, entitlement-driven modules, canonical shared records with scoped
access, customer-vs-BES KPI ownership, and `organization_id` as the primary
tenant boundary. **BES is not a multi-agency or reseller platform**, and no work
should go toward supporting a second agency.

On last session's agency work: `agency_id` and `is_staff_of(agency)` stay, but
they are recorded as a **safety net, not a reseller feature**. A blanket "is
staff anywhere" check was the weaker default; keeping the scoped version costs
nothing. The boundary that matters is the organization.

**Reviewed the architecture against the doctrine. Two real conflicts.**

**1. Fulfillment was not distinguished from subscription.**
`organizations.is_fulfillment_subscriber` existed as a column no policy read.
BES staff could read and write every organization's operational records whether
or not BES was engaged to work them. The doctrine is explicit that HQ access
depends on the authorized service relationship. Live data made it concrete: of
five organizations, **Empire Capital & Credit** and **Vantage Funding Group**
are SaaS-only, and BES had full access to both.

**2. Entitlement was interface-only.** `product_entitlements` gated nothing but
itself, so an organization entitled to FundingOps only still had its CreditOps
tables readable. Rule 1: enforced in data access, not only in the interface.

Migration 0015 adds `bes_may_fulfil(org)` and `org_has_product(org, product)`
and applies both to the CreditOps and FundingOps client tables and their
department-status children, so the gate cannot be side-stepped by reading the
child directly. What deliberately does **not** change: BES always sees the
organization *record* (it is BES's customer — billing, settings, support) and
always sees outsourcing-only clients, which have no organization and are BES's
own contract work.

**Verified live:**

| | Result |
|---|---|
| Apex (fulfillment + entitled) | ✅ BES may fulfil |
| Vantage / Empire (SaaS-only) | ✅ BES may **not** fulfil |
| Vantage / creditOps | ✅ not entitled |
| Write to a fulfillment org | ✅ allowed |
| Write to a SaaS-only org | ✅ refused by RLS |
| Write to a non-entitled module | ✅ refused by RLS |
| BES's existing visibility | ✅ all 10 clients still visible — nothing lost |

**3. Route-level entitlement was missing.** The sidebar already gated the
customer view (`show: isProductOn(...)`), and the database now refuses the
records, but typing `/app/fundingops` still rendered the module. Rule 3 wants
both layers. Added `RequireEntitlement`, a small centralized guard — BES HQ is
deliberately exempt, since its division screens are the fulfillment workspace,
gated by the relationship in the database rather than an entitlement on BES.

**Checked and found already compliant:** no duplicate-record synchronization
logic exists; organization context is never read from URL or localStorage and
trusted; the frontend can narrow a query by `organization_id` but RLS decides
what comes back, so it can never widen one.

**Not built, because nothing exists to correct yet:** customer-defined KPIs and
BES-owned fulfillment KPIs. The doctrine is recorded; when KPIs are built they
derive from canonical operational data and BES-owned definitions are not
customer-editable.

144 tests (11 new), tsc clean, 0 lint errors, build clean, 32 live checks green.

### 2026-09-03 — Relationship model corrected in doctrine; one structural conflict proposed, not built

Rule 16 rewritten around the three relationship models: **SaaS only**,
**SaaS + BES fulfillment**, and **BES fulfillment without SaaS**. The load-bearing
correction is that a SaaS organization and a BES fulfillment partner are
different things, and model 3 means BES Agency must stay operationally
independent of organizations — a partner is not a subclass of an organization.

**Reviewed against the code. What already complies:**

- **SaaS subscription alone does not grant BES access.** `bes_may_fulfil()`
  requires `is_fulfillment_subscriber`, which is separate from subscribing.
  Verified live last session: BES may not fulfil for Empire Capital & Credit or
  Vantage Funding Group.
- **Customers cannot reach BES internal data.** `production_logs`,
  `time_entries`, `eod_submissions`, `webhook_endpoints`, `webhook_deliveries`
  and `outsourcing_groups` are all gated on agency staff; an organization member
  is not staff. Read directly from the policies.
- **Model 3 works independently.** Outsourcing partners are `outsourcing_groups`
  with `mode = 'outsourcing_only'` and no organization, so BES can serve a
  company that has no BES SaaS tenant.
- **Provenance already separates the models** — `saas_pulled` vs
  `outsourcing_only` on every client record.

**🟡 Structural conflict — proposed, deliberately NOT built.**

The fulfillment relationship is a single boolean. The doctrine requires an
explicit relationship defining partner, organization (when applicable),
service/module, authorized data scope, effective status and dates, and BES team
scope. `organizations.is_fulfillment_subscriber` carries **none** of those:

- no module scope — one flag authorizes BES for every module at once;
- no dates — an ended engagement looks identical to an active one;
- no data scope or team scope;
- cannot express model 3 at all, which is why outsourcing partners live on a
  separate path rather than as partners with an engagement.

The shape of the fix is a first-class `fulfillment_engagements` table
(partner → optional organization → service → scope → effective dates → BES team),
with `bes_may_fulfil(org, product)` reading it instead of the boolean, and
`partners` becoming a real concept rather than "organization or outsourcing
group". That touches ~20 call sites of `isFulfillmentSubscriber` plus the
partner tree, so it is reported rather than done — the task said to propose
before a large structural change.

**Two zero-risk guardrails added instead**, so the next person does not make the
mistake the doctrine warns about:

- `addActivity` is a no-op in live mode, meaning internal notes are not
  persisted. Wiring it naively would put BES internal notes into
  `activity_events`, which the organization's own members can read. A comment at
  the no-op says so and states what is needed (a visibility flag plus a policy
  that respects it).
- The `isFulfillmentSubscriber` domain field now documents what it is and is
  not, and that it must not be read as "is a BES Partner".

144 tests, tsc clean, 0 lint errors, build clean.

### 2026-09-03 — `fulfillment_engagements`: the relationship becomes a record

`organizations.is_fulfillment_subscriber` is no longer an authorization concept.
A boolean could answer "does BES fulfil for this company"; it could not answer
"what exactly, from when, and for which BES team" — and it could not represent a
partner with no BES SaaS tenant at all.

**Schema (migration 0016).** `fulfillment_engagements`: partner (organization
*or* outsourcing group, exactly one), `service`, `status`, `effective_from`,
`effective_to`, `authorized_team`, timestamps. A partial unique index allows one
**active** engagement per partner per service, because two overlapping actives
would make authorization ambiguous and ambiguity resolves as "allowed" — the
wrong direction.

**Service is not entitlement.** `product_key` is what the customer bought as
software; `fulfillment_service` is what BES was hired to perform. Apex is
entitled to FundingOps *software* while BES fulfils only CreditOps for them, so
the two vocabularies stay separate on purpose.

**`bes_may_fulfil(org, group, service)`** replaces the one-argument form, which
was dropped so no policy could keep using the coarse check by accident. Default
deny: no live engagement, no access. It never reads entitlements — a
subscription is not an authorization.

**Migration of existing relationships.** Three fulfillment-subscriber
organizations and both outsourcing groups received active **CreditOps**
engagements. Deliberately not FundingOps: CreditOps is the only service BES
actually performs today, and granting more would widen access, which is the bug
this table exists to prevent. All 10 clients stayed visible — nothing lost.

**Verified live, all three models:**

| | Result |
|---|---|
| Model 2 — Apex, CreditOps | ✅ allowed |
| Model 2 — Apex, **FundingOps** | ✅ **denied** (the example that motivated this) |
| Model 1 — Vantage / Empire (SaaS only) | ✅ denied, both services |
| Model 3 — CRC (no SaaS tenant), CreditOps | ✅ allowed |
| Model 3 — CRC, FundingOps (not engaged) | ✅ denied |
| Unknown partner | ✅ denied |
| Engagement **paused** | ✅ denied — Apex's 2 clients vanished from BES |
| Engagement **expired yesterday** | ✅ denied while still marked active |
| Restored | ✅ 2 clients visible again |

That paused/restored pair is the important one: RLS genuinely follows the
engagement, so this is enforced in data, not decoration.

**Performance.** One query, one cache key, one resolver: `use-fulfillment.ts`
answers `mayFulfil(scope, service)` from a single cached fetch instead of each
panel asking about its own partner. `partners.ts` now derives the managed/direct
split from engagements and fetches them in the same parallel batch as
organizations and groups — no extra round trip, no N+1.

**A latent break found and fixed.** Regenerating types after migration 0014
surfaced that `work_items` inserts never supplied the now-required `agency_id`.
Not wired to any screen yet, so nothing had failed in practice, but it would
have thrown on first use. Both it and the `activity_events` insert now carry the
agency from the authenticated context.

**Left alone deliberately.** `is_fulfillment_subscriber` remains as a
presentation and billing flag, with a database comment saying it must never gate
access again. Activity/comment visibility is the next isolated task and was not
touched.

161 tests (17 new covering all three models, the engagement window and default
deny), tsc clean, 0 lint errors, build clean, 33 live checks green.

### 2026-09-03 — Activity visibility, and live notes turned on behind it

One canonical timeline, four audiences, visibility on every row. The rule
enforced is **association is not publication**: an event hanging off an
organization, client, case or deal says nothing about who may read it.

**Model (migration 0017).** `activity_visibility` enum —
`bes_internal`, `organization_internal`, `shared_with_partner`,
`client_visible` — as a NOT NULL column defaulting to **`bes_internal`**, the
most restrictive level. An event whose classification someone forgot is
BES-only rather than published: default deny lives in the column default.

One table, not four. Splitting per audience would write the same status change
twice and force every consumer to join across tables to rebuild a timeline
(rule 2).

**`can_view_activity(agency, org, visibility, entity_type)`** decides, and RLS
calls it. Customer staff are checked first, because an organization member is
never BES staff and the two branches answer differently for the same row:

- **Customer staff** see everything except `bes_internal`, on their own
  organization only.
- **BES** always sees `bes_internal` (its own notes about its own work) and
  agency-owned records; for anything belonging to a customer it needs an
  **active engagement for the governing service**. The service is derived from
  `entity_type` rather than stored, so it cannot drift from the record.

**System events are classified too**, which was the gap. Every trigger now
writes an explicit level: status, round, contact and deal movements are
`shared_with_partner`; assignee changes, per-department workflow, work items
and EOD are `bes_internal` — who at BES works a file, and BES workforce data,
are not the customer's business.

**Verified live:**

| | Result |
|---|---|
| BES posts `bes_internal` / `shared` / `client_visible` | ✅ allowed |
| BES posts `organization_internal` | ✅ **refused** — BES cannot speak as the customer's internal voice |
| BES reads a client timeline, engagement active | ✅ 13 entries |
| Same timeline, engagement **paused** | ✅ **1 entry** — only BES's own internal row survives |
| Restored | ✅ 13 again |
| Timeline distinguishes system events from notes | ✅ via `isSystem` |

That paused case is the proof: with the engagement off, everything belonging to
the customer relationship disappears and BES keeps only what is genuinely its
own.

**Live persistence turned on, at the safe level.** `addActivity` was a no-op, so
internal notes vanished on refresh. It now writes through `postNote` — always
`bes_internal`, because the composer has no audience control yet and publishing
is a decision. A note therefore cannot reach a customer by accident. The
visibility picker is the natural next task; the timeline itself was not
redesigned, as instructed.

**One correction to my own work.** The backfill's second pass used
`action like '% status changed'` to catch per-department rows and also matched
"Deal status changed", demoting it to `bes_internal` after the first pass had
correctly shared it. Fixed in migration 0018.

**Housekeeping note:** four `activity_events` rows labelled "probe" remain from
the insert-policy test. The table is append-only by design and has no DELETE
policy, so they cannot be removed — verified. They are BES-internal or
client-visible notes on Tanya Brooks and carry no real content.

176 tests (15 new covering all four levels, both audiences, agency-owned records
and default deny), tsc clean, 0 lint errors, build clean, 33 live checks green.

### 2026-09-03 — Timeline visibility picker, badges, and the live timeline read

The backend model existed; this makes it usable and visible.

**Picker.** A reusable `VisibilityPicker` in the existing composer, defaulting
to **BES Internal** and reset to it after every post — a composer that remembers
the last audience is how a one-off client-visible note becomes the accidental
default. The chosen level and a plain-English consequence ("Only BES staff.
Never the customer or the client.") sit beside the control, so the decision is
readable *before* the click rather than discoverable after it.

**Badges.** Every persisted entry carries its level, with tone rising as reach
widens: grey for BES Internal, blue for Shared with Partner, amber for Client
Visible. The timeline mixes internal notes with partner-shared events, and they
must not be indistinguishable at a glance.

**One rule, one place (rule 13).** `allowedVisibilities(author, hasEngagement)`
in the activity model is the only definition of who may publish what;
`useActivityVisibility` resolves the two inputs from the authenticated context
and the cached engagement list. No component decides anything — verified by
grep: outside `VisibilityControls`, no component names a visibility level.

**The read was missing.** Notes persisted but the panel showed
"ACTIVITY HISTORY (0)", because the live store's `getActivity` still returned an
empty array — writes were wired last session, reads were not. `useTimeline`
loads a record's permitted timeline when the record is opened, not with the
list, so a fifty-client list does not fetch fifty timelines (rule 14).

**Verified live:**

| | Result |
|---|---|
| BES posts BES Internal / Shared / Client Visible | ✅ all three persist |
| BES posts Organization Internal | ✅ **rejected** |
| All three survive a fresh read | ✅ levels intact |
| Engagement **paused** | ✅ 3 entries → **1**, only BES Internal |
| Restored | ✅ 3 again |
| `can_view_activity` from a foreign agency context | ✅ false |
| Apex org-internal via a *funding* entity (no funding engagement) | ✅ false |
| Composer default | ✅ BES Internal |
| Paste tip, attach button, previews | ✅ preserved |

**A circular dependency I introduced and fixed.** Adding `visibility` to
`OpsActivityEntry` made the domain import from `lib/data/activity`, which
already imported the domain. `madge` caught it. `ActivityVisibility` now lives
in the domain and the data layer re-exports it — dependencies point downward
only (rule 13).

**Staging coverage documented.** `STAGING_TEST_COVERAGE.md` specifies the seed
accounts and relationships staging needs — including a **second customer
organization**, without which tenant isolation is untested however many unit
tests pass — and 30 scenarios across visibility, the three fulfillment models,
tenant isolation, entitlement and audit. It also records what still cannot be
tested: no end-client account exists, so `CLIENT_VISIBLE` is enforced but
unverifiable from a client session until the borrower portal has auth.

190 tests (14 new), tsc clean, 0 lint errors, build clean, no circular
dependencies, 33 live checks green.

### 2026-09-03 — Development test data: 13 real sign-in accounts on the real stack

The application can now be driven as different real users, through actual Auth,
RLS, permissions, entitlements and fulfillment engagements — not frontend
placeholder arrays. Documented in `DEV_TEST_DATA.md`.

**Real accounts, not fixtures.** `dev_seed_user()` creates sign-in-able
`@bes.test` users. Two problems had to be solved: the function refuses any email
outside that reserved domain, so it cannot touch a real account; and GoTrue
returned "Database error querying schema" on the first attempt because it scans
`confirmation_token`, `recovery_token` and friends into non-nullable Go strings
and they defaulted to NULL. Empty string is what GoTrue writes itself. All 13
accounts verified signing in.

**Marked three ways** so nothing can be mistaken for real: names begin `[TEST]`,
accounts use `@bes.test`, ids begin `dddddddd-`.

**Idempotent and non-destructive.** Ids come from `dev_uuid('stable key')` with
`ON CONFLICT DO UPDATE`, so a re-run updates the same rows. There is no reset
and no delete — a seed that removes rows is one bad predicate away from
destroying real work (rule 11). Verified: 7 test clients, zero duplicates.

**The six relationship shapes** all exist as real records, including the two
that matter most: **Cedar Financial** is entitled to both divisions while BES is
engaged for CreditOps only, and **Ironwood Self-Serve** subscribes with no
engagement at all, so BES has no operational access to it.

**Verified with real signed-in sessions**, which is the first time tenant
isolation has been observable rather than argued:

| | Result |
|---|---|
| BES agent | 17 credit clients, 3 funding, 10 organizations |
| Lakeside admin | 2 credit, 1 funding, **only Lakeside** |
| Northgate admin | 2 credit, 0 funding, **only Northgate** |
| Customer reading BES internal notes | ✅ **cannot** — sees shared + client-visible only |
| Unrelated organization reading another's activity | ✅ 0 rows |

**Two fixes this turned up.**

1. The activity triggers derived the agency from `auth.uid()`, which is NULL for
   a migration or any service-role job, and from the organization, which an
   outsourcing-only client does not have. Every trigger now takes the agency
   from the record it fires on, which always knows it.
2. **The CreditOps partner tree was still hardcoded.** Only FundingOps had been
   converted in Phase 5; I had wrongly recorded CreditOps as live. Its tree,
   page, global queue and management dashboard now read the database, so the
   new partners actually appear.

**Not seeded, because the feature does not exist**, recorded rather than faked:
there is no `teams` table (only a free-text `team_scope`), no `org_owner` role,
no org-level team lead, no role above `agency_owner`, and no `assigned_only`
column on agency memberships — so a BES agent still *reads* agency-wide and
assignment restricts updates only.

`DEV_TEST_DATA.md` also inventories the **11 files still rendering GHL
placeholder arrays**, so a figure on screen is never mistaken for a real record
and the conversion order is obvious.

190 tests, tsc clean, 0 lint errors, build clean, no circular dependencies,
33 live checks green.

## Next steps for Claude Code

1. Connect Supabase Auth + RLS for organization isolation
2. Implement provider adapters (SmartCredit Partner Hub keys, IDIQ CRM, MFSN tokens)
3. Build PDF OCR / data extraction pipeline
4. Wire billing (subscriptions, invoicing, commission payouts)
5. Add storage for reports, evidence, documents
6. Implement notifications (email/SMS)
7. Add grounded AI (report summary, plain-language, draft prep)
8. Audit logging
9. Compliance review before any public launch


---

## Phase — Team + Assignment Scope (migration 0021) · DONE

**Problem, measured:** a BES agent assigned nothing read all 10 work items and
all 6 attention rows. Tenant isolation held; there was no person-level boundary
on operational records.

**Built:** `access_scope` enum (`agency | division | department | team |
assigned | self`); `departments` (FK-addressable department identity — the two
department enums could not serve as one stable id); `teams` (one table, agency
xor organization owner, archive not delete); `team_memberships` (join table →
multi-team, `is_lead` on the membership); `agency_memberships.scope /
scope_division / scope_department_id`; `work_items.division + team_id`,
`fulfillment_clients.team_id`, `funding_clients.team_id` — all nullable.

**One evaluation point:** `in_scope(agency, division, team, assignee, creator)`
— responsibility first, ceiling second, supervision third, default deny —
composed into the BES branch of `work_items`, `fulfillment_clients` and
`funding_clients` SELECT/UPDATE. `org_scope_allows` enforces the org side's
existing `assigned_only`. `work_attention` recreated (security_invoker) so it
inherits the scoped policy and carries `division`/`team_id`.

**Decisions made explicitly, not by query breadth:** roster ≠ ceiling; a lead
supervises their team regardless of ceiling; the unassigned team queue is
visible to `team` and above, never to `assigned`; managers backfilled to
`agency` for parity with today's `is_manager_of` (narrowing a real role is
policy — the fixture manager demonstrates division scope).

**Audit:** trigger on `team_memberships` (insert/update/delete) and on
`agency_memberships` scope/role changes → `audit_log` with before/after.

**Verified:** `supabase/scripts/rls-matrix.mjs` — 77/77 as real users via JWT
impersonation inside rolled-back transactions; `bes.restricted` reads 0 of
everything; org users unchanged; positive controls prove each record class is
reachable by the right user. `verify-live.mjs` extended to the three new tables.
Frontend: team roster joins the single identity batch (5 parallel reads, no
waterfall); `agencyScope / teamIds / ledTeamIds` exposed; `lib/auth/scope.ts` is
a pure mirror for labelling only, with 9 unit tests.

**Not yet person-scoped (carried to Phase 2/3):** `activity_events`
(`bes_internal`) and non-activity `files` are still agency-wide for BES staff;
`client_department_statuses_write` still uses agency-blind `is_agency_staff()`.


---

## Phase 3 — Work Engine integrity (migration 0022) · APPLIED, VERIFIED

**Reproduced first, as real users inside rolled-back transactions:**

| Defect | Probe | Result |
|---|---|---|
| Org admin cannot create own-org work | `insert work_items (scope=ORGANIZATION, org=Lakeside)` as `org.owner` | **42501** — `work_items_insert` was `is_staff_of AND can_write_work`, making the `is_org_member` branch unreachable |
| Production not idempotent | two identical `production_logs` inserts in one txn as `bes.credit` | **2 rows**; `pg_constraint` shows **0** unique/exclusion constraints |
| FundingOps production is a stub | `fundingops-client-store.logProduction = async () => {}` | "Complete Work" on a deal resolved successfully and recorded nothing |
| FundingOps production is *structurally* unsupported | `production_logs.department` is `fulfillment_department` (CreditOps enum); `division_id` text default `'creditops'` | funding departments have no storable representation |
| Agency-blind writes | 7 operational policies still `is_agency_staff()` | on tables with no `agency_id` of their own |

**Fixes written (migration `20260904000200_work_engine_integrity.sql`):**
- `work_items_derive_tenancy` BEFORE INSERT trigger sets `agency_id` from the
  organization for ORGANIZATION-scope work and stamps `created_by = auth.uid()`.
  Org users cannot read `agencies` (verified: 0 rows), so the agency is
  derived server-side, never trusted from the client. The rewritten
  `work_items_insert` re-proves the derivation.
- BES may create ORGANIZATION-scope work only with `division` set and a live
  engagement for that service — no division, no way to know the service, deny.
- `production_logs.request_id uuid` + partial unique index
  `(agency_id, request_id) where request_id is not null`. Legacy rows untouched.
- The seven agency-blind policies now resolve `is_staff_of` through the parent
  client, so person-level scope on the client flows down to statuses, deals and
  businesses via the caller's own RLS on the EXISTS.

**Frontend:** one request id per submission intent (`CompleteWorkSection`),
threaded through the store to `logProduction`, which treats 23505 as "already
recorded". FundingOps "Log Production" is disabled with the reason stated, and
the store rejects with the same reason instead of resolving silently.

Because client creation is now a ceiling act (0023 §E), both intake modals gain
a **Team** field fed by `useTeams()` — one bounded read of the caller's live
agency teams, cached five minutes — pre-selected from the user's own teams and
required when their scope is `team` or `department`. `teamId` threads through
`CreateFulfillmentClientInput` / `CreateFundingClientInput` and both row
mappers. The frontend offers; `in_scope` decides.

**Tests written before push:** `rls-matrix.mjs --phase=3` (9 checks: org
insert allowed / spoofed agency overridden / AGENCY denied / other org denied /
assigned-only agent allowed / BES allowed / probe denied / same request id → 1
row / distinct ids → 2 rows) and `log-production.test.ts` (request id sent;
23505 = success; other errors surface).

**Verified after push (real browser, real database):**
- Triple-click on Complete Work → **1** `POST production_logs` on the wire, and
  **1** row in the database for that client in the window, `request_id` set,
  one distinct id. The UI guard and the unique index agree; the index is what
  enforces it.
- Assignee names still resolve for the owner after `shares_scope_with` was
  tightened: 4 assigned clients, 4 resolvable names, 13 profiles visible (the
  no-membership probe is correctly no longer among them).
- Both intake modals render the Team field: "Team (optional)" for the
  agency-scoped owner, listing "No team" plus the three fixture teams — proof
  `useTeams` reads under RLS.
- Migrations 27 local = 27 remote, 0 pending. Regression gate green: 229 tests,
  0 lint errors, build, live security, no circular dependencies.

**Deferred, recorded:** FundingOps production needs the production engine to
accept funding departments — a schema decision, not a stub fix.


---

## Phase 9 inventory — Settings honesty (FACTS gathered; fixes not yet applied)

Every control classified by reading the code, not the labels.

| Control | File:line | Classification |
|---|---|---|
| In-app / Email / SMS notifications (3) | PlatformSections 175–185 | **DISABLED / FUTURE** — inside a disabled fieldset with a "Not active yet" note (done earlier) |
| Require MFA for all agency users | PlatformSections:211 | **PLACEHOLDER DEFECT — security-implying** |
| Step-up auth for sensitive admin actions | PlatformSections:216 | **PLACEHOLDER DEFECT — security-implying** |
| Restrict SSN/report exports (DLP) | PlatformSections:221 | **PLACEHOLDER DEFECT — security-implying** |
| Fail closed on missing authorization context | PlatformSections:226 | **PLACEHOLDER DEFECT — security-implying** (the database already fails closed; the toggle implies it is optional) |
| Require consumer attestation before dispute | OperationsSections:99 | PLACEHOLDER DEFECT — compliance-implying |
| Block advance-fee billing (CROA) | OperationsSections:105 | PLACEHOLDER DEFECT — compliance-implying |
| Experian upload-only (no mail) | OperationsSections:111 | PLACEHOLDER DEFECT |
| BRM sees assigned deals only | OperationsSections:161 | PLACEHOLDER DEFECT — authorization-implying |
| Sales Partner sees own referrals only | OperationsSections:166 | PLACEHOLDER DEFECT — authorization-implying |
| Lender sees submissions sent to them only | OperationsSections:171 | PLACEHOLDER DEFECT — authorization-implying |
| Professional-help requests route to referring partner | OperationsSections:204 | PLACEHOLDER DEFECT |
| Funding-interest requests route to eligible FundingOps org | OperationsSections:209 | PLACEHOLDER DEFECT |
| Direct BES leads never auto-assigned to a partner | OperationsSections:214 | PLACEHOLDER DEFECT |
| 14 `defaultValue` inputs (recipients, thresholds, endpoints) | Operations 8, Platform 6 | PLACEHOLDER DEFECT — pre-filled values nothing reads |
| "Save brand settings" | GeneralSections:74 → `markSaved` | **PLACEHOLDER DEFECT** — sets a 2-second "Saved" flag; persists nothing |
| Toggle fulfillment subscription (per sub-account) | GeneralSections:124 → `updateOrganization` | **FUNCTIONAL BUT INERT** — persists `is_fulfillment_subscriber`, which **no policy and no function reads** (verified against `pg_policies` and `pg_proc`) since `fulfillment_engagements` replaced it. Saving it changes nothing about access |
| "HQ DFY Subscriber" / "Self-Managed" pills, DFY filters, plan labels | 30 frontend references to `isFulfillmentSubscriber` | **MISLEADING DISPLAY** — fulfillment status shown from the dead flag, not from the engagement that actually authorizes. A partner with an active engagement and the flag off reads "Self-Managed"; the reverse reads "Subscriber" with no access |
| Sub-account branding | `updateOrganizationBranding` (jsonb merge) | FUNCTIONAL |
| Agency-level users' `assignedOnly` switch | GeneralSections:248 → `agency-settings-context` local state | PLACEHOLDER DEFECT — the real flag is `agency_memberships.scope` |

**Highest risk:** the four security toggles and three authorization toggles.
A switch labelled *Require MFA* or *BRM sees assigned deals only* that renders
ON while enforcing nothing is worse than no switch. Phase 9 will disable and
label each, and point the fulfillment-subscription toggle at
`fulfillment_engagements` or remove it.


---

## Phase 2 — Independent adversarial review · FAILED, THEN REMEDIATED (migration 0023)

An independent reviewer (separate agent, read-only, every probe rolled back,
outputs quoted) attacked migration 0021 as all 13 test users across 14 tables.

**Verdict:** the `in_scope` model **passed on the three tables it was applied
to** — every positive and negative control, plus constructed cases the author's
matrix lacked (unassigned Team A record, Ironwood no-engagement record,
department and self scopes) — and **failed as a system boundary.**

| # | Sev | Finding (quoted counts) | Closed by |
|---|---|---|---|
| 1 | CRIT | `client_department_statuses_write` FOR ALL `is_agency_staff()`: restricted reads **53**, blind-updates **53/53**, deletes **53** | 0022: split to insert+update via parent; no DELETE |
| 2 | CRIT | Blind UPDATE with no WHERE reaches rows the user cannot SELECT: restricted updated **3/3** deals, **3/3** funding files | 0022/0023: every UPDATE now via a scoped parent; `funding_files` follows its client |
| 3 | HIGH | `activity_events_select` not person-scoped: restricted reads **94** events | 0023: `entity_visible()` — an event is readable only if its record is |
| 4 | HIGH | `businesses_select` = `is_agency_staff()`: staff read SaaS-only orgs' revenue | 0023: `bes_engaged_with(org)` required |
| 5 | HIGH | `work_items` BES branch had no engagement conjunct; owner read Vantage's org work with **0** engagements | 0023: `scope='AGENCY' or bes_engaged_with(org)` |
| 6 | HIGH | Staff INSERT into records they cannot read (notes, production, files, agency work assigned to others, self-assigned new clients) | 0023: `entity_visible` on insert; production requires visible client; assignment is a supervisor act; client creation is a ceiling act |
| 7 | HIGH | `funding_files_select` = `is_staff_of` | 0023: follows client, or own assignment |
| 8 | MED | Org admin adds a BES agent to an org team → agent gains work via lead clause | 0023: lead clause requires the agency's own live team; roster writes require the person to belong to the team's owner |
| 9 | MED | `org_manager` self-promotes to `org_admin` | 0023: membership/role writes strictly `org_admin` (or engaged agency manager) and never one's own row |
| 10 | MED | Any staffer enumerates all profiles / rosters; `assignable_profiles` lists any org | 0023: `shares_scope_with` and `assignable_profiles` rewritten — same agency, shared org, or engaged manager |
| 11 | MED | Division scope did not constrain manager writes | 0023: production select/update by managers within `to_service(division_id)`; admin tables recorded (see below) |
| 12 | LOW | `log_audit()` callable by a no-membership probe → audit pollution | 0023: EXECUTE revoked from clients on all trigger/seed functions |
| 13 | LOW | `team_id` unowned; archived teams still granted lead reach; leads could not see their roster | 0023: team must be a live team of the record's agency; members see their team's roster |
| 14 | INFO | org `assigned_only` agent saw events on clients they cannot see | 0023: `entity_visible` on the org branch too |
| 15 | INFO | 30 policies still on agency-blind helpers | operational ones closed above; membership/admin tables recorded below |

**Not changed, recorded:** `organizations`, `product_entitlements`,
`fulfillment_engagements`, `invitations`, `record_grants`, `agencies`,
`external_memberships` remain readable by BES staff agency-wide. These are the
platform operator's own customer and commercial records, not a customer's
operational data; the doctrine gates *operational* access on engagement.
Division-scoped **writes** to those admin tables by managers (finding 11)
remain role-gated; narrowing a manager's administrative role is policy.

**Follow-up from the extended matrix (migration 0024):** businesses were
engagement-gated but not person-scoped (restricted still read 3); they now
follow the caller's reach into the organization — visible only if the caller can
already see one of that org's clients or work items. And a design rule surfaced
by Postgres itself: `INSERT … RETURNING` evaluates the SELECT policy, so an
assigned-only agent could create unassigned work and immediately lose sight of
it. **Creation must land inside the creator's own reach** — a scope-limited
creator self-assigns; ceiling holders may queue unassigned work. Stated in
`work_items_insert` so it fails clearly at insert, with positive and negative
probes for both sides.

**Matrix extended** (`rls-matrix.mjs --phase=2`, 29 checks) to cover every gap
the reviewer named: satellites, blind UPDATE/DELETE with no WHERE, INSERT into
unseen records, the unassigned Team A queue (`[TEST] Dana Doyle`, now
unassigned), an Ironwood no-engagement client (`[TEST] Ivan Ironwood`),
org.agent / org.manager, escalation paths, cross-service reads.


---

## Phase 4 — My Work + Attention, person-level · DONE (pending commit)

With `in_scope` applied to `work_items` (0021/0023) and `work_attention`
recreated as `security_invoker`, both surfaces are person-scoped **by the
database**, not by the hooks: `useMyWork` (`assigned_to = me`) and
`useAttention` (the view) return only rows the caller may see, and the sidebar
badges read the same hooks, so `COUNT(scope) = LIST(scope)` holds by
construction. Matrix: restricted attention **0**, lead **1**, manager **5**
(division ∪ assigned), owner **6**. The Attention Center header now states the
caller's actual reach (`describeScope`) instead of "across the BES ecosystem",
which stopped being true the moment scope existed. Verified in the browser for
the owner: "your reach: Agency-wide", badge 6 = page 6, My Work 0 = 0.

---

## Phase 5 — Notification engine · DONE (migrations 0025, 0026)

**What exists now (verified live, not from docs):**

- `notifications` — one row per recipient per event: recipient, actor, agency,
  organization, kind (`assigned` · `unassigned` · `note` · `status`), entity
  type/id/label, the `activity_events.id` it came from, the event's visibility,
  title, detail, `created_at`, `read_at`. Unique on
  `(recipient_id, activity_id, kind)`, so a person is told once.
- `notify_from_activity()` — an AFTER INSERT trigger on `activity_events`, the
  single choke point every logger already writes through. Four deterministic
  rules, never the actor:
  1. `Assignee changed` → the new assignee (`assigned`) and the previous one
     (`unassigned`), read from the UUIDs the loggers already store.
  2. `Work item created` / `Client added` → the assignee, if created assigned.
  3. `Note` / `Comment posted` → the record's current assignee and the leads of
     its team.
  4. A `stage` / `status` / `department_status` / `deal_status` change → the
     assignee.
  `record_owner()` resolves assignee, team and label for work items and both
  client types; it and `as_uuid()` are not executable by API roles.
- **Authorization at read time.** `notifications_select` is
  `recipient_id = auth.uid() AND can_view_activity(...) AND entity_visible(...)`.
  Both helpers are SECURITY INVOKER, so they answer as the reader. A note
  notification about a client you were later moved off disappears — the row is
  kept, the read is denied. Badge and list use the same predicate. The one
  exemption (migration 0026, found by the matrix) is `unassigned`: its whole
  meaning is that you lost the record, so it stays readable and carries no
  detail — you learn you were moved off, not who received the work.
- Clients may `SELECT` and `UPDATE (read_at)` only. No INSERT, no DELETE.
- **Hardening found on the way:** Supabase's default grants gave `anon` and
  `authenticated` TRUNCATE, TRIGGER and REFERENCES on all 33 tables. None of
  the three is governed by RLS. Revoked table-wide and in default privileges.

**Frontend:** `lib/data/notifications.ts` (fetch, unread head-count, mark
read/all, `hrefForEntity`), `use-notifications.ts` (list + unread count on one
key; sidebar badge and topbar bell share the unread query), NotificationsPage
rewritten (unread styling, Open, Mark read, Mark all read, honest "No page
opens this record yet" when an entity has no addressable surface). Deep links:
`/app/my-work?item=` highlights the row if RLS returns it; `/app/creditops?
client=` resolves the client through the RLS-scoped store, selects its Partner
and opens the client workspace; `/app/fundingops?client=` opens the client
workspace. All three drop the parameter after use and claim nothing on a miss.

**Not built, on purpose:** mentions (the composer has no mention node — nothing
real to derive them from), overdue/SLA notifications (would need pg_cron, which
is available but not installed; `work_attention` already surfaces these live),
email/SMS delivery, digests.

**Verified:** typecheck clean, 233 tests, 0 lint errors, build, no circular
deps, verify-live (anon denied on `notifications`), migrations 30/30.
RLS matrix **131/131** (`--phase=5`, 12 new checks: recipient rules, actor
exclusion, read-time revocation, mark-read ownership, grant hardening).
Browser, as the owner: two real rows from a manager's assign/unassign of the
Dana Doyle fixture; Mark read moved header, topbar and sidebar from 2 to 1
together; Open landed on Dana's CreditOps client workspace with the parameter
dropped.


---

## Phase 6 — Custom Workspaces foundation · DONE (migrations 0027, 0028, 0028b)

Built from `ARCHITECTURE_PROPOSAL_WORKSPACES.md`, smallest form. One engine
underneath: every workspace item is a `work_items` row.

**Schema (verified live):** `product_key` + `workspaces`, `talentOps`;
`workspaces`, `workspace_boards`, `workspace_statuses` (key, label, colour,
position, `canonical_stage`, `is_terminal`, with `check (is_terminal =
(canonical_stage = 'Completed'))`), `workspace_item_types`, `workspace_fields`,
`work_item_field_values`; `work_items` + `workspace_id`, `board_id`,
`status_id`, `item_type_id`, all nullable — CreditOps/FundingOps rows untouched.

**The stage bridge:** `work_items_workspace_consistency` (BEFORE INSERT/UPDATE)
enforces that a workspace item belongs to the workspace's organization at
ORGANIZATION scope, that board/status/type belong to that workspace, defaults
the status to the workspace's first, copies `canonical_stage` onto `stage` and
stamps `completed_at` from it. Attention, EOD, completion and My Work never
learn that custom statuses exist. `log_work_activity` logs the workspace status
change (field `status`, labels in detail) and suppresses the derived stage
event so nothing is logged twice; the notification engine picks it up through
its existing status rule. Visibility of those events (migration
`20260904000810`, found by the matrix): workspace items log at
`shared_with_partner` — the organization's own work, acted on by both sides
under a share; other ORGANIZATION-scope events by an organization member log at
`organization_internal`; everything else stays `bes_internal`.

**Authorization:** `workspaces_select` = `is_org_member AND org_entitled(org,
'workspaces')`. Boards, statuses, types and fields follow the workspace under
the caller's RLS; only an org admin writes them. `work_items` select/insert/
update gained one conjunct — `workspace_id is null OR the workspace is visible
to me` — so items follow the workspace and **BES staff see none of it until a
TalentOps share exists** (Phase 7 adds that branch to `workspaces_select` and
nowhere else). No delete policy on workspaces: archive only. Config changes are
audited with actor, before and after (`audit_workspace_config`).

**Assumptions taken (proposal's open questions), recorded:** statuses are a
list, not a workflow; workspace items reach Attention only the way any work
item does; `crm` means BES CRM delivery visibility (it already gates
`/app/bes-crm`).

**Fixtures:** Lakeside entitled, with `[TEST] Business Acquisition` (board
Pipeline; Backlog→Queued, In Progress→In Processing, Review→QA Review,
Done→Completed; types Task, Deal Review; one date field; two items, one
assigned to org.owner). Northgate has an explicit `workspaces=false` row as the
negative control.

**Frontend:** `lib/workspaces/workspace-domain.ts` (grouping, default status,
open count; 3 tests), `lib/data/workspaces.ts` (one nested select per
organization; bounded item query; create/move), `use-workspaces.ts`,
`/app/workspaces` gated by `RequireEntitlement product="workspaces"`, sidebar
entry in the sub-account navigation gated by entitlement. In agency view the
page states that nothing is shared with BES yet rather than rendering an empty
board.

**Deferred, recorded:** workspace/status/type/field configuration UI (schema,
RLS and audit exist; fixtures prove the path), custom field editing UI, list
view kind, assignee picker with names (no profile hook exists yet; avoiding an
N+1), the TalentOps share (Phase 7).

**Verified:** typecheck clean, 236 tests, 0 lint errors, build, no circular
deps, verify-live (anon denied on all six new tables), migrations 33/33.
RLS matrix **148/148** (`--phase=6`, 17 new checks).


---

## Phase 7 — TalentOps bridge · DONE (migrations 0029, 0030)

**One new table, one helper, zero copies.** `workspace_shares (workspace,
engagement, board?, access view|work, revoked_at)` is the organization's
authorization for BES to reach one workspace or one board under a live
`fulfillment_engagements` row with `service = 'talentops'`. A trigger requires
the engagement to be TalentOps *for the workspace's own organization* and the
board to belong to the workspace.

`workspace_reach(workspace, board, need_work)` is now the single place
workspace visibility is decided: member of an entitled organization → full
reach; BES staff → only through a live, unrevoked share, within BES TalentOps
scope (`in_scope(agency, 'talentops', …)` — a CreditOps-division manager is
outside it), only the shared board, and only with `access = 'work'` for writes.
`workspaces_select`, `workspace_boards_select` and the three `work_items`
policies were re-pointed at it; `work_items_insert` gained the branch "BES
working a shared workspace item". Shares: org admins create and revoke (never
delete); BES may read the shares it benefits from and cannot create one for
itself. Share changes are audited with actor, before and after.

**Found by the matrix (migration 0030):** the first `workspace_reach` required
TalentOps scope even for an item's own assignee, breaking "assignment always
counts" for the very agents TalentOps places. The assignee is now passed into
`in_scope`, so an assigned agent reaches their item while — and only while —
a live share covers it; the container (workspace name, statuses) follows an
item the caller can see. Verified: assigned agent sees item + container;
revoke the share and both disappear.

**Frontend:** `components/workspaces/WorkspaceBoard.tsx` (shared by both
sides; `readOnly` mirrors a `view` share), `SharePanel` (org admins: pick
engagement, whole workspace or one board, access; revoke), the Workspaces page
in agency view lists shared workspaces with the owning organization, the
TalentOps division page rebuilt on real data — shared workspaces, open items,
distinct assignees, partners with live engagements — with the invented agent
roster, ratings and placements removed and those areas stating they are not
recorded. My Work labels workspace items "Workspace" (they were falling into
"BES CRM" via `related_type = 'project'`). All BES reads are single bounded
requests (`fetchSharedWorkspaces`, `fetchAllWorkspaceItems`), never one per
workspace.

**Fixtures:** Lakeside TalentOps engagement (active since 2026-06-01) and a
whole-workspace `work` share of `[TEST] Business Acquisition`. Northgate: none.

**Browser (BES owner, agency view):** `/app/workspaces` shows the shared
workspace with both items on Lakeside's statuses; `/app/talentops` shows 1 / 2
/ 1 / 1 from live rows.

**Deferred, recorded:** BES team scope on the share (engagement
`authorized_team` is free text — the rule-16 gap), assignee picker with names,
board-level share UI polish, notifications for shares.

**Verified:** typecheck clean, 236 tests, 0 lint errors, build, no circular
deps, verify-live (anon denied on `workspace_shares`), migrations 35/35.
RLS matrix **165/165** (`--phase=7`, 17 new checks).


---

## Phase 8 — BES CRM · DONE (migrations 0031, 0032)

**No new module, one narrowed policy.** A BES CRM project is an AGENCY-scope
`work_items` row with `division = 'bes_crm'` and the customer as
`subject_organization_id`. The published/internal split is the existing
activity visibility: `shared_with_partner` / `client_visible` is what BES
publishes; `bes_internal` never reaches the customer (`can_view_activity`).

**Association is not publication (rule 16), now enforced:** the org-admin
branch of `work_items_select` let a customer read *any* AGENCY item about them,
including BES's internal support tasks. It now reads
`division = 'bes_crm' AND is_org_admin(subject) AND org_entitled(subject, 'crm')`.
The `[TEST] Partner onboarding call` support task is no longer visible to
Lakeside's admin; the CRM project is. Customer writes were already governed:
comments and files on a visible record at organization / shared / client
visibility; no customer update branch exists for AGENCY items (deny by
absence).

**Found in the browser (migration 0032):** BES could not read its own
published note. `can_view_activity` gated staff reads of non-internal events
through `bes_may_fulfil(org, activity_service(type))`, and `activity_service`
returns null for `work_item`, so every published or client-visible work-item
event — including an organization's status changes on a TalentOps-shared item
— was hidden from BES. For entity types without a governing client service the
record's reach (`entity_visible`, already ANDed on the same policy) is the gate;
staff read `bes_internal` / `shared_with_partner` / `client_visible`, never
`organization_internal`.

**Frontend:** `WorkItem` carries `agencyId`, `division`,
`subjectOrganizationId`, `description`, `dueAt` (mapper, no extra query).
`use-work-timeline.ts` reads a work item's activity under RLS and posts
comments through the canonical `postNote`. `components/bes-crm/ProjectUpdates`
shows published activity and a comment box — BES chooses internal or published,
the customer can only write at the shared level. `/app/bes-crm` rebuilt on real
rows for both sides: BES sees every project with customer, stage, due,
assigned; a `crm`-entitled customer sees its own projects and BES's published
updates. Invented projects, percentages and assignee initials removed.
Monitoring, resources and reports tabs say they are not built.

**Fixtures:** Lakeside `crm = true`; `[TEST] GHL CRM build — Lakeside`
(In Processing, due in 21 days) with one published and one internal note;
Northgate `crm = false` with `[TEST] Funnel build — Northgate` as the negative
control.

**Deferred, recorded:** document upload UI on a project (DB allows it; the
attachment composer is client-workspace-specific today), customer-facing
milestone objects (a project's stage is the milestone for now), notifications
for published updates to org admins (rule 3 of the notification engine covers
the assignee; publication fan-out is a business-policy question).

**Verified:** typecheck clean, 236 tests, 0 lint errors, build, no circular
deps, verify-live, migrations 37/37. RLS matrix **182/182** (`--phase=8`, 17 new checks).


---

## Phase 9 — Settings honesty · DONE (frontend; no schema change)

Rule applied: **a placeholder control must never look like it persists or
governs behaviour.** Every control in the Phase 9 inventory above was
reclassified by reading the code, then made to say what it is.

**`ToggleRow` gained a `state`:** `live` (bound to a value and a handler),
`enforced` (the rule is unconditional in code or the database — shown on,
locked, "Enforced — not configurable"), `unbuilt` (nothing behind it — shown
off, locked, "Not built — no effect"). `PlaceholderNote` sits above inputs
nothing reads.

| Control | Was | Now |
|---|---|---|
| Fail closed on missing authorization context | ON, no-op | `enforced` — RLS denies by default |
| Require MFA · Step-up auth · SSN/report DLP | ON, no-op (security-implying) | `unbuilt`, off, locked |
| In-app notifications | off, no-op | `enforced` — the notification engine delivers; per-user opt-out not built |
| Email · SMS notifications | off, no-op | `unbuilt` |
| Require consumer attestation (Truth Gate) | ON, no-op | `enforced` — `lib/dispute/metro2-guardrails` runs unconditionally |
| Experian upload-only | ON, no-op | `enforced` — fixed in `cra-addresses-and-workflows` / `package-builder` |
| Block advance-fee billing (CROA) | ON, no-op (compliance-implying) | `unbuilt` — no billing-eligibility engine exists |
| BRM / Sales Partner / Lender access defaults (3) | ON, no-op (authorization-implying) | `unbuilt` — access is decided per record by policy |
| DIY routing rules (3) | ON, no-op | `unbuilt` |
| 14 pre-filled inputs (thresholds, endpoints, recipients) | `defaultValue` nothing read | disabled placeholders under a `PlaceholderNote` |
| Fulfillment subscription toggle (Settings, sub-account list menu, provisioning modal) | wrote `is_fulfillment_subscriber`, which no policy reads | **removed**; status is derived from live `fulfillment_engagements` in one place (`agency-context`), so the 30 "Subscribed / Self-managed" displays are now true; the modal states that access comes from an engagement |
| Agency Users "Assigned only" / "Active" switches | local state on sample rows | locked, labelled sample; reach is `agency_memberships.scope` |
| "Save brand settings" | 2-second "Saved" flag, persisted nothing | **real**: `merge_agency_branding` (migration 0033) writes `agencies.name` + `branding` in one audited UPDATE; the form hydrates from the row; only agency admins can save and the button says so |

`organizations.is_fulfillment_subscriber` is no longer written by any frontend
path; the mapper returns `false` so a raw row can never claim access on its
own. The column stays (rule 11: nothing destructive) and is recorded as dead.
Archived views under `src/_archive/` still reference the toggle prop; they are
unrouted and excluded from the bundle. The global "Save changes" bar on the
Settings page, which only flipped a flag, is removed.

**Regression found on the way (migration 0034):** migration 0023 revoked
EXECUTE on `log_audit()` from API roles; both branding merges ran as the caller
and called it, so **every branding save had failed with 42501 since Phase 2**
(verified live as bes.owner). Both merges now run as owner with an explicit
authorization check mirroring their table policy — organizations: manager of
the agency or admin of the organization; agencies: agency admin — and a
phase-9 matrix block guards them.

**Verified:** typecheck clean, 236 tests, 0 lint errors, build, no circular
deps, verify-live, migrations 39/39. Browser, as the owner: Save brand settings
wrote the agency row (colour and tagline preserved by the merge) and one
`agency.branding_updated` audit entry with the owner as actor. RLS matrix:
**188/188** (`--phase=9`, 6 new checks).

---

## Phase 10 — Platform-wide regression · DONE

Run on the tree at commit `12604b2` (all nine phases):

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `vitest run` | 27 files, **236** tests passing |
| `eslint .` | 0 errors (77 pre-existing warnings) |
| `vite build` | ✓ |
| `madge --circular` | no circular dependencies |
| `verify-live.mjs` | all anon/RPC surface checks pass (39 tables/views) |
| `supabase migration list` | **39/39** local = remote |
| `rls-matrix.mjs --phase=9` | **188/188** as 14 impersonated users, every probe rolled back |
| Browser (owner) | Notifications, Workspaces (shared board), TalentOps, BES CRM (published + internal notes), Settings (locked toggles, real brand save) render in the light workspace with the dark branded sidebar |

Defects found by the gates during this pass and fixed before the phase's
commit: 0024 (creation inside reach), 0026 (unassigned notification readable),
0028b (workspace activity visibility), 0030 (assignment always counts through
a share), 0032 (BES could not read its own published work-item activity), 0034
(both branding merges broken since 0023). One test expectation corrected
(fixture's trigger-written creation event), with the reasoning recorded.


---

## Service-aware production · DONE (migration 0035)

Designed in `ARCHITECTURE_PROPOSAL_PRODUCTION.md` after checking every consumer
of `production_logs` (no DB function or view read it; the frontend readers and
writers are listed there with the change each took).

**Model:** `production_logs.service fulfillment_service NOT NULL` is the
canonical dimension; `department_key` references `production_departments
(service, key)` — taxonomy as data, seeded only from the two existing enums
(CreditOps 5, FundingOps 7); the subject is service-specific — `client_id`
(creditops), `funding_client_id` + optional `funding_deal_id` (fundingops),
`work_item_id` (bes_crm, talentops, workspaces) — enforced by a CHECK.
`division_id` lost its `creditops` default and is written only by the derive
trigger from `service`; legacy `department` is set by the trigger for CreditOps
and never by clients. Subject FKs are `ON DELETE RESTRICT` (history keeps its
subject). One engine, no fork.

**Derivation:** `production_logs_derive_context` (BEFORE) derives agency,
organization and outsourcing group from the subject record; a payload cannot
place production under a tenant it did not work (matrix: wrong org in payload →
stored org is the client's).

**Authorization:** insert = `employee_id = auth.uid() AND is_staff_of AND
entity_visible(<subject>)` per service; read/void = self or manager within
`in_scope(agency, service, …)`. A CreditOps-division manager sees no
FundingOps production.

**Completion → production:** `work_items_completion_production` (AFTER UPDATE,
first `completed_at`) inserts one row for `bes_crm`, `talentops` or Custom
Workspace items completed by BES staff, `request_id = md5('work_item_completion:'
|| id)::uuid` — reopen and complete again: still one. Organization completers
produce no BES production. CreditOps/FundingOps items are excluded (their
production is logged from their own surfaces; including them would double
count).

**Frontend:** `lib/data/production.ts` is the one write path (service-
discriminated input, 23505 = success); both store backends call it; the
FundingOps deal panel logs real production with the deal and a funding
department mapped from its work group (Document / Processing → Document Review,
Underwriting / Readiness → Readiness Review, Lender / Submission → Submissions,
Client Support → none); `unavailableReason` removed; EOD maps `service` onto
the engine's `DivisionId` (`bes_crm → bes-crm`) and carries deal and work item
ids. `fulfillment-clients.logProduction` retired.

**Tests:** `production.test.ts` (5: shapes per service, idempotent 23505,
errors), `eod.test.ts` (2: service→division mapping; totals reconcile with the
row sum, voided excluded). Concurrency: three parallel committed inserts with
one request id → **1** row stored, two 23505 (probe rows removed by the probe).

**QA where applicable:** the work item's stage. Production rows carry no QA
state until a consumer exists.

**Verified:** typecheck clean, 240 tests, 0 lint errors, build, no circular
deps, verify-live (taxonomy denied to anon), migrations 40/40. RLS matrix:
**206/206** (`--phase=10`, 18 new probes; first run had three probe faults —
same-statement visibility, `ON CONFLICT` after `RETURNING`, a count that saw
the browser's real row — and one contention error from a concurrent read;
all corrected on the probe side, none in the model). FundingOps browser workflow, as the owner: FundingOps → Lakeside → Deal
List → the Juno Logistics deal → one completion item → Log Production. The
stored row: `service = fundingops`, `department_key = Readiness Review` (mapped
from the "Underwriting / Readiness" group), deal attached, organization derived
as Lakeside by the trigger, work date today. The row was then voided as a
verification artifact (void reason recorded), which is the canonical
correction path.


---

## Custom Workspaces — owner experience · DONE (migrations 0036, 0037)

**What an entitled organization admin (or manager — `is_org_admin()` includes
`org_manager`, a pre-existing rule the UI now mirrors) can do, all on the
canonical engine:** create a workspace (name, description, fixed icon and
colour sets), configure boards (add, reorder, archive; the last board stays),
statuses (label, colour, reorder, delete when unused, **each mapped to a
canonical work stage**; Completed is terminal by constraint), work types,
custom fields (text, number, date, choice, checkbox; archived, never deleted),
organization teams and their members (server-resolved membership list), share
the workspace with BES under the existing TalentOps model (whole or one board,
work or view, revoke), create items from a one-row quick-add (title, type,
assignee, priority, due date), open an item drawer to edit title, description,
status, assignee, team, priority, due date and typed field values, comment
through the canonical composer with attachments, read the canonical activity
stream, and mark work complete. Nothing here is a second store: items are
`work_items`, comments and status history are `activity_events`, files are
`files` rows linked to notes, notifications fan out from the same triggers.

**Data-level rules added (0036):** `workspace_fields.archived_at`; a
validation trigger typing every field value against its field (text ≤ 2000,
number, YYYY-MM-DD date, one of the choices, boolean) and refusing archived or
cross-workspace fields; `options` must be `{choices: [...]}`; **assignee
legitimacy** — for ORGANIZATION work the assignee must be an active member of
that organization or, in a workspace under a live `work` share, agency staff;
for AGENCY work, agency staff. A guessed id the frontend happens to know can no
longer be assigned.

**Found in the browser (0037):** organization admins could never create a
workspace — `INSERT … RETURNING` evaluated `workspaces_select`, whose member
branch read the row through `workspace_reach()`, and a row being inserted is
invisible to a subquery in the same statement. Latent since 0028 (the phase-6
probes inserted as postgres). The member branch now evaluates on the row's own
`organization_id`.

**Browser proof, as an organization admin.** I never type credentials (the
fixture users do carry a dev password in the seed migration, marked remove-
before-production), so the signed-in owner was given a **temporary
`org_admin` membership in Lakeside** for the run and it was removed afterwards
(the caveats this dual identity caused are listed below). In Lakeside's
sub-account view: created `[TEST] Verification Ops` (target icon, purple) →
statuses To do → Queued, Doing → In Processing, Done → Completed (terminal
badge shown) → board Main → type Task → number field Budget → item `[TEST]
Prepare Q3 acquisition memo` assigned to Rae Agent, High, due Sep 10 → drawer:
Budget 1500 (stored as a typed number), comment posted, status → Doing, Mark
complete → header "Completed 9/4/2026 · Engine stage: Completed". Sharing tab:
Not shared → Share (whole, work) → Revoke → Not shared.

**Canonical consequences verified in the database:** activity `Work item
created`, `Status changed To do → Doing`, `Comment posted`, `Status changed
Doing → Done`, all `shared_with_partner`; notifications to the assignee:
`assigned`, `status`, `note`, `status`; `stage = Completed`, `completed_at`
set; the assignee's My Work excludes it (open stages only); Attention empty
(not blocked, not near due); Budget value `1500`. While shared, the
TalentOps-authorized BES owner saw the workspace, its item and all four
activity rows; the CreditOps-scoped manager, the restricted agent and another
organization's admin saw nothing; after revoke the owner saw nothing either.

**Caveats from the dual identity, not the product:** the composer defaulted to
`bes_internal` because the tester is also staff, and the server refused it
(`can_view_activity` treats an organization member as the customer first) — a
real organization admin defaults to `organization_internal`, which the matrix
proves accepted; and completion created one TalentOps production row because
the completer is staff — voided with a recorded reason; the matrix proves a pure
organization completer produces none. File upload through the composer could
not be exercised by the automation (no file chooser); the `files` insert path
for an organization agent is proven by the phase-11 matrix.

**Artifacts left in the Lakeside fixture, labelled `[TEST]`:** the Verification
Ops workspace and its completed item (its voided production row keeps the item
by design); an item titled "ada" created from the other browser tab during the
run, not by this work. The truth oracle for the org owner now derives from live
rows instead of a hard-coded count.

**Matrix triage, recorded:** the first phase-11 run reported twelve misses;
all twelve were stale expectations, none a model defect. Nine were count drift
from the real rows the browser run left in Lakeside (the verification
workspace and its item, its revoked share, and the "ada" item due today, which
correctly puts the org owner's Attention at 1 and gives the assigned agent four
readable activity rows). Two probes used the wrong subject: the org agent
cannot see the unassigned fixture item, so commenting and attaching there are
rightly refused; the probes now assign it to her first. One had a wrong premise:
the fixture workspace carries a live whole-workspace `work` share, under which
agency staff are legitimately assignable (that is how BES routes agents), so
the guessed-staff denial is probed with the share revoked, and the allow case
under the live share is asserted explicitly. Hard-coded Lakeside counts in the
truth oracle now derive from live rows.

**Verified:** typecheck clean, 244 tests, 0 lint errors, build, no
circular deps, verify-live, migrations 42/42. RLS matrix: **235/235** (`--phase=11`, 28 probes).


---

## Organization Experience · DONE (migrations 0038–0040, dev fixture 0039)

**Organization ID.** `organizations.public_id` — `BES-` + six characters from
an alphabet without 0/O/1/I/L — generated by the database (column default plus
a trigger that redraws on collision), unique by index, format-checked,
immutable by trigger, backfilled for every organization. Display and support
reference only; it is never an authorization key. Shown in the topbar pill
("Organization ID: BES-XYEGDG") and the organization header.

**One canonical active organization.** `agency-context` holds the single
active-organization state; it is restored from sessionStorage as a convenience
and re-validated on every render against the organizations RLS returned to the
user, so a stale or forged id resolves to nothing. Organization users are never
in agency view: their view is their organization (first membership by default).
BES staff with a stale id fall back to the agency view.

**Switching is a context boundary.** `switchToSubAccount(id)` accepts only an
organization the user can see, marks the switch, invalidates every
organization-scoped query (everything except organizations, engagements,
agency, notifications, agency teams, outsourcing groups, preferences), and
navigates to `/app/org/<BES-ID>`. Measured in the browser: 68 ms first switch,
6 ms second.

**Organization dashboard** at `/app/org/:orgPublicId` — the route resolves the
organization through the context (membership or staff), renders "not available
to you" for an unknown or unauthorized id, and shows only derived figures: open
organization work, items assigned to you, overdue, workspaces, enabled modules
with links. The sample figures (42 needing review, 98.4% QA pass rate, static
compliance status) are gone. `/app` redirects to it while an organization is
active.

**Language.** Every hyphenated "Sub-Account" wording in source and UI became
"Organization"; identifiers and database names are untouched. A regression test
(`customer-language.test.ts`) fails the build if the wording returns.

**DIY light workspace.** The cause was a hard-coded charcoal gradient shell in
`DiyShell`/`DiyConsumerShell` (and `bg-white/5` cards in the views), not the
theme system or the OS preference. All DIY surfaces now use the semantic light
tokens; gradient buttons keep their contrasting text.

**Two-organization fixture.** `org.multi@bes.test` (dev password via
`dev_seed_user`, remove-before-production) is a manager of Lakeside and an
admin of Northgate, whose entitlements differ, for switching tests as a
legitimate identity.

**Browser (BES owner):** Organizations hub → Enter Lakeside → landed on
`/app/org/BES-XYEGDG`, real figures, ID pill; switcher → Northgate → landed on
`/app/org/BES-AFSKS6`, Workspaces and FundingOps links disappeared (Northgate
lacks them), Northgate's own item shown. Reload on `/app/org/BES-AFSKS6` kept the
organization view (Northgate header and pill, no agency navigation); a bogus
`/app/org/BES-ZZZZZZ` rendered "This organization is not available to you";
`/diy` renders on the light palette (body background rgb(242,238,232), text
rgb(17,18,19)) with the content readable.

**Verified:** typecheck clean, 245 tests, 0 lint errors, build, no circular
deps, verify-live, migrations 45/45. RLS matrix: **243/243** (`--phase=12`, 8 new checks).


---

## Data purge (authorized by Dee, 2026-09-04) · DONE

Removed, in one transaction with counts before/after: the five sample
organizations (Apex Credit Co., CreditFix Solutions, Pioneer Credit Solutions,
Vantage Funding Group, Empire Capital & Credit), the two sample outsourcing
groups (CRC Outsourcing — Q3 Cohort, Metro Dispute Partners), and everything
hanging off them — 10 clients, 7 work items, 39 activity rows, 4 rows of test
production logged on fake clients, engagements, businesses, entitlements. The
five `[TEST]` organizations, `[TEST] Summit Outsourcing`, all `@bes.test`
fixtures and everything we created together remain. Demo-mode seed arrays in
the frontend are unchanged (they render only without a backend and carry the
demo badge).

---

## Self-serve sign-up · DONE (migrations 0041–0043)

Design in `ARCHITECTURE_PROPOSAL_SIGNUP.md`. Built so far: `plans` (data, 4
provisional bundles, no prices yet), `organization_trials`,
`organization_identity`, public and blocked mail-domain tables, normalisers,
and `provision_self_serve_organization()` — fired AFTER UPDATE OF
`email_confirmed_at` on `auth.users`, idempotent per user, creating the
organization (BES- ID), the `org_admin` membership, the plan's entitlements and
a 30-day trial; an exact identifier match (email, phone, non-public email
domain) blocks the trial and disables entitlements, a business-name-only match
flags the trial for BES review; identities are recorded for the next signer;
disposable-mail domains and unknown plans are refused. Frontend: the
Create-account panel collects business name, phone and plan (PlanPicker from
the `plans` table); `signUp` carries them in the user metadata; the organization
dashboard shows the trial state (active until, blocked, expired). Payment
activation (Authorize.Net) waits for credentials in the environment.

**Found by the matrix, fixed before commit:** (0042) `text[] || 'literal'` made
Postgres parse the literal as an array, so any identifier match crashed the
provisioning trigger and the trial-abuse check never blocked or flagged
anything; `array_append` is unambiguous. (0043) the derived organization code
(business prefix + first four characters of the user id) collided for similar
business names whose signers' ids share a prefix; the suffix is now redrawn
until the `(agency, code)` pair is unused. Direct re-runs: a known phone blocks
the second business's trial and disables its entitlements; a name-only match
gets an active trial flagged `name_match_review` with distinct codes.

**Probed (phase 13, 13 checks):** creation only on confirmation; BES- ID; the
plan's products; a 30-day trial; four identities recorded; public mail domains
not treated as business identity; disposable domains and unknown plans refused
with their exact messages; another organization's admin cannot read the trial;
the public form can list plans.

**Verified:** typecheck clean, 246 tests, 0 lint errors, build, no circular
deps, verify-live (trial and domain tables denied to anon), migrations 48/48.
RLS matrix: 256/256 (phase ≤ 13; rerun after the harness capture fix).


## Organization workspace parity · one Home · real roles · view toggles · DONE (migrations 0044–0046)

**Organization pages mount the real workspaces.** `/app/operations` and
`/app/metro2` for an organization now render the SAME CreditOps and FundingOps
Partner workspaces the agency uses (`CreditOpsPartnerWorkspace`,
`FundingOpsPartnerWorkspace`, extracted from the division pages), scoped to the
active organization's own rows. Same components, same canonical records, no
copies; RLS decides what each side receives. The former sample-data screens
(`Operations.tsx`, `Metro2.tsx`, hard-coded work ids and invented KPIs) are
parked in `src/_archive/pages/`. `partnerForOrganization` is the single
mapping from an organization to the Partner shape, reused by the agency tree.

**Roles come from membership, not browser state.** `CreditOpsAccessProvider`
and `FundingOpsAccessProvider` resolved to `"admin"` by default with a header
switcher. In a live session the role is now resolved once from
`agency_memberships.role` / `org_memberships.role` (active organization) by
`lib/fulfillment/ops-role-resolver.ts` (unit-tested; "none" = deny). The
switcher exists only in demo mode. Outside a provider the fallback is "none".
The database was always the enforcement; the surface stops over-promising.

**Completion by author.** An organization member's Complete Work writes a
`Work completed` activity (department, actions, notes) plus the status change —
never BES production (rule 16). BES staff path unchanged.

**Partner dashboards read the store.** `CreditOpsDashboardView` and
`FundingOpsDashboardView` computed from the seed arrays with invented floors
(`|| 5`, hard-coded `5`s), so a live Partner's overview described sample
clients. Both now derive every figure from the store's RLS-scoped rows (and
department statuses / funding files), with the Status Guide as the one status
vocabulary. Division page header counts likewise.

**One Home, sidebar restructure, collapse.** Organization view: Home (the ID
route) · My Work · Workspaces; CREDITOPS: Clients · Workspace · Reports;
FUNDINGOPS: Workspace · Reports; PRODUCTION; ORGANIZATION. The main menu
collapses to an icon rail on large screens (preference remembered per browser)
and becomes a drawer on small screens (Topbar button; closes on navigation).
Browser-verified on the two-organization fixture: rail 64px / expanded 256px,
drawer opens fixed and closes on navigation.

**Workspace views are organization data (0045).** `organizations.workspace_views`
jsonb, written only through `merge_organization_workspace_views` (SECURITY
DEFINER; organization owner/admin or BES manager; refuses to hide the dashboard
or the record list; refuses unknown products and malformed patches; audited).
Interpreted by `lib/fulfillment/workspace-views.ts` (unit-tested). Settings in
organization view shows only the organization's own settings — "Workspace
views" with real switches — instead of the agency control center.

**Found by the browser, fixed (0044):** every sign-in's membership batch got a
500 on `team_memberships`: the 0027 SELECT policy read its own table
(`exists (select 1 from team_memberships me …)`) → 42P17 infinite recursion,
confirmed live as the two-organization fixture. Replaced by the SECURITY DEFINER
helper `is_member_of_team`, same question, no recursion. Re-probed: the read
succeeds.

**Probed (phase 14, 15 checks):** rosters read without recursion; owner/admin
and BES manager may hide a queue; organization manager, agent, another
organization's owner and a BES agent may not; dashboard / record list / unknown
product / malformed patch refused; members read the setting; a person saves
only their own Home layout.

**Verified:** typecheck clean, tests 258, 0 lint errors, build, migrations
51/51, verify-live. RLS matrix: 271/271 (phase ≤ 14).

**One Home, personalizable (0046).** The organization Home shows cards per
enabled module — work (open, mine, overdue), workspaces, CreditOps (active, in
processing, awaiting response, attention), FundingOps (active, funded,
overdue) — each linking into its module and each computed from the SAME
queries the module workspaces use (identical query keys, so Home then
Workspace costs one request). "Customize Home" lets the person show/hide and
reorder cards; the layout is saved to `user_preferences.dashboard_cards`
(whole list, one column, no read-modify-write; null = default). Unknown or
unentitled keys are dropped on resolve (`lib/dashboard/home-cards.ts`,
unit-tested).

**Not done (recorded):** per-user column widths; the Clients page for
organizations still reads the labelled sample seed; Reports links point at the
existing reporting page pending the Reporting milestone.

## Top bar: inline whole-organization search, clean chrome, logo from branding · DONE

`GlobalSearch` is an inline field (no modal) whose results drop under it:
CreditOps clients, FundingOps clients and deals, work items (module and
workspace), workspaces, team members and files — organizations too in agency
view. Same query keys as the screens, fetched only while a query exists and
only for entitled products; RLS-scoped rows, organization id narrows only.
Deep links: `?client=<id>` on the organization module pages,
`?workspace=<id>&item=<id>` on Workspaces. Matching is client-side over bounded
lists; a server-side search function is the next step for large organizations
(rule 14, recorded). The Organization ID pill left the top bar (Settings shows
it); agency-return controls render only for BES staff. `BrandLogo` resolves the
logo from branding data (organization → agency → `/bes-logo.png` → text mark);
no third-party image URL remains in code.


## Configurable organization role access · DONE (migration 0047)

```
Product Entitlement → Organization Settings → Role/Permission → Team/Department → Assignment → Individual User
```

**The Permission layer is data.** `organization_role_access` — one row per
(organization, role, product): departments (work or read), workspace views
(empty = every view the organization shows), can log work, can edit progress,
management layer. No row = platform default (`default_role_access()` in SQL,
`role-access-defaults.ts` in the interface; the matrix asserts a sample
agrees). Written only through `set_organization_role_access` /
`reset_organization_role_access` (SECURITY DEFINER, audited): organization
owner/admin or BES manager; only a product the organization is entitled to;
only departments in `production_departments` and views in the catalogue; a
role must belong to the product; `org_admin` / `org_manager` can never be
narrowed. Read by the organization's members and BES managers.

**No existing policy changed.** Row visibility stays
`entitlement → membership → scope → assignment → record`; a role row only
narrows what the interface offers on rows the person already sees. BES staff
run under BES's own rules, never an organization's configuration.

**Interface.** `resolveOpsAccess` (agency rules → configured row → default →
none) feeds both access providers; Complete Work is read-only when the role
cannot log; the organization workspace offers the organization's views ∩ the
role's views (dashboard always). Settings → Roles & access: a card per role
per entitled product with department and view checkboxes, three switches,
"Default"/"Configured" badge, Save and Reset — every control a real write.
Browser-verified: Credit Processor + Support → Configured; Reset → Default.

**Probed (phase 15, 14 checks):** owner/admin and BES manager may set; manager,
agent, another organization's owner, BES agent may not; unentitled product,
unknown department, unknown view, wrong-product role, narrowing `org_admin`
refused; members read their organization's rows only; reset deletes; SQL
defaults match the documented sample.

**Verified:** typecheck clean, 261 tests, 0 lint errors, migrations 52/52,
verify-live. RLS matrix: 285/285 (phase ≤ 15).

**Recorded, not built:** a database trigger that also refuses an organization
author's "Work completed" activity for a department outside their resolved
access (today the interface enforces it; RLS still bounds the rows).


## Canonical credit reports · DONE (migration 0048) — import v1 (CSV)

**One source of truth for a client's credit data.** `credit_reports` (one row
per import: subject = fulfillment client OR DIY consumer, bureaus, pulled_at,
source, file, parser_version, imported_by), `report_items` (one row per
tradeline / inquiry / public record / personal item, with a stable
`account_ref` for matching across imports) and `report_scores` (bureau, model,
score exactly as the source states — never computed). Append-only: no update
or delete policies; a re-import is a new report. Visibility = the client's own
visibility (`credit_report_visible` → `entity_visible('fulfillment_client')`,
SECURITY INVOKER so the client policy decides); consumers see their own;
imports go through `create_credit_report` (SECURITY INVOKER, atomic; policies
decide, the function only guarantees all-or-nothing).

**Import v1 is a structured CSV**, parsed deterministically in the browser
(`lib/credit-report/import-parser.ts`, unit-tested): required columns
name/kind/status/bureaus, optional subtype/balance/dofd/open_date/
linked_creditor/remarks/account_ref; every unreadable row is reported by line
and the import does not proceed — nothing is guessed. Scores are entered as
stated (250–900, model text). PDF text-layer parsing, OCR and evidence
extraction are specified in the proposal addendum and need Edge Functions plus
a document-AI provider (none exists yet); the interface says so.

**Where it lives — the client profile, not the Workspace.** CreditOps →
Clients lists the organization's real clients in a live session (same RLS-
scoped query as the Workspace's Main Client List; the sample list is demo-only)
and opens the client profile (`/app/clients/<id>`), which now resolves the real
client (name, email, status, round). Its "Import & Analysis" tab carries the
"Credit report" section: latest report, bureaus' reported scores, import
history, the CSV import, and the factor analysis only when a report exists. The
Workspace (ClickUp-style tracking and production) links to the profile and
holds no report tooling — actual client work happens in the profile, as in
DisputeFox / CRC / CDM. The client workspace context reads the client's latest
report in live mode (`reportSource` = live | none | sample); the bundled sample
exists only in demo mode and the sample page says so in a live session.

**Analysis presentation.** The Score Potential card shows the three bureaus as
three side-by-side columns (no toggle), each with the bureau's *reported* score
when a report states one, then the engine's estimate index and factor bars;
all headline figures are labelled as an index, not a score. The Score
Simulator does the same and states the index is not a FICO score, prediction
or guarantee; with no report there is no analysis.

**Browser-verified** on the Northgate fixture client: CSV → 3 items parsed →
imported with stated scores 689/691/679 → Clients list → profile shows the real
client, three bureau columns with the reported scores, Import & Analysis shows
the report; no sample text present; the Workspace carries no report tooling.

**Probed (phase 16, 8 checks):** the client's organization owner imports;
another organization cannot; BES staff only within engagement and scope; empty
report refused; items and scores travel with the report and are visible to the
organization, invisible to another; no update policy; a consumer's report is
theirs alone.

**Verified:** typecheck clean, 267 tests, 0 lint errors, migrations 53/53,
verify-live. RLS matrix: 293/293 (phase ≤ 16; first run had one transient CLI miss and one wrong expectation — no update policy means 0 rows touched, not an error).


## Pricing as data · organization client writes · comment visibility · separation steps 1–2 · lifecycle (migrations 0049–0055)

**Pricing as data (0049).** `plans` now carries Dee's proposed ladder as
editable rows — BES CRM $99 · Empire Build $149 (choose CreditOps or
FundingOps) · Empire Grow $249 ★ · Empire Scale $399 (Full Suite + CRM) ·
Empire Enterprise $599+ (by agreement) — with monthly/annual cents, seats
included (the Organization Owner is free), active records included, choose-one,
includes-CRM, recommended, public-trial flags; `plan_addons` (CRM +$75, +10
seats $50, +1,000 records $75). **Every eligible trial grants Empire Grow
capabilities** (CreditOps + FundingOps + Workspaces) for 30 days whatever plan
was picked; the pick and Build's choice are kept on the trial for conversion;
CRM is never provisioned on a trial; Enterprise sign-up is refused as
by-agreement. `organizations.owner_user_id` records the signer.
`organization_seat_usage()` / `organization_active_records()` measure seats
(excluding owner, BES personnel, portal users) and worked clients (never
history) — measurements only; nothing bills or enforces yet. Analysis and open
questions: `PRICING_AND_BILLING_MODEL.md` (CRC and HighLevel figures verified
by fetch; DisputeBee unverified). AI credits: `ARCHITECTURE_PROPOSAL_AI_CREDITS.md`.
**Customer-facing pricing UI is deliberately not built until Dee confirms the
open questions.**

**Organization client writes (0050, approved).** Organization admins/managers
create clients in their own organization for entitled products; members update
within the reach the select policy already grants; outsourcing-group clients
stay BES-only. Permissive OR beside the BES policies; nothing about BES data
changed.

**Comment visibility by surface.** The organization view never offers "BES
Internal": BES staff there may post shared or client-visible only; organization
members post organization-only, shared (when BES fulfils for them — the default,
one record both sides see) or client-visible. One rule
(`allowedVisibilities` / `defaultVisibility` in `lib/data/activity.ts`),
unit-tested; the composer starts on the rule's default. Labels: "Organization
only", "Shared (BES + organization)".

**Separation step 1 — department / work status is data (0051).** Department
Progress writes `client_department_statuses` through
`set_client_department_status` (validates the department's Status Guide
vocabulary, upserts the row, writes the activity event in one transaction, as
the caller); organization members may write their own clients' rows within
reach (`*_org_insert/update` policies on both status tables); assignee per
department; "Hand off" opens the next department on its first open status
(`lib/fulfillment/department-domain.ts`, unit-tested). Credit status and round
stay on the client record and are shown separately. The store re-reads the
rows after a write.

**Client lifecycle (0055).** `lifecycle` ∈ active · program_completed ·
graduated · archived on both client tables, separate from processing status and
department status; only `active` counts (plan usage, active lists, dashboards,
Home). Archive / reactivate through `set_client_lifecycle` (activity event,
never a delete). Workspace Main Client List and the Clients page filter by
lifecycle (Active by default); the work file carries the lifecycle control; the
Clients page gains "New client" (same canonical table as the Workspace — no
sync). Organization-customizable statuses (DisputeFox Field Setup analogue) are
proposed in the separation document's addendum.

**Funding-readiness hand-off (0052–0053, approved).** `Credit Readiness`
funding status; hand-off cards on both client files (Send to CreditOps for
readiness / Return to FundingOps — qualified); `handoff_to_creditops` (links or creates the CreditOps client,
sets Credit Readiness, activity on both records) and `handoff_to_fundingops`
(qualified → Readiness Review). SECURITY INVOKER; UI cards follow in step 3.

**Separation step 2.** The Workspace Main Client List is operational: Client ·
Credit Stage · Status · Current Department · Work Status · Assigned To · Open
Work · SLA · Last Activity, the department columns from ONE batched query for
the visible clients (`fetchDepartmentStatusesForClients`). FundingOps
department status is keyed on the funding file (0054, `set_funding_department_status`,
vocabulary mirrored in `funding-department-domain.ts`); the FundingOps work file
shows per-file Department Progress (status, assignee, hand-off) and reads
businesses and files from the live hooks instead of the seed. The FundingOps Company workspace gains an operational **Client List** view
(current department, work status, assignee, open work, open files, requested,
SLA — one batched query) that opens the operational funding file; the view
catalogue mirror is migration 0056. Funding queues are keyed on the funding
FILE stage (a client with no file yet falls back to its own status so intake is
not invisible).

**Separation step 4 — My Work.** My Work shows, beside work items, the
department files assigned to the person across CreditOps and FundingOps (two
bounded RLS-scoped queries; open statuses of active clients only), each linking
into the client's operational file. "Available in my queues" lists open, unassigned department rows in the
departments the person's resolved role access allows (configured by the
organization, else default; BES staff in agency view see every department across
the clients RLS returns), each linking into the client's operational file.

**Probed:** phase 17 (12) pricing/provisioning/usage; phase 18 (7) organization
client writes; phase 19 department status + hand-off; phase 20 file-keyed
funding status; phase 21 lifecycle. **Verified:** typecheck,
283 tests, 0 lint errors, migrations 62/62, verify-live, browser
(organization view composer: "Post Comment", default "Shared (BES + organization)";
CreditOps Department Progress: a status change on the Northgate fixture wrote the
row, the Main Client List showed Support / BILLING ISSUE / Open Work 1 and the
timeline gained the entry; FundingOps Client List on Lakeside opened Juno
Logistics' operational file with per-file Department Progress and the hand-off
card; Clients page lists real clients with lifecycle and New client).
RLS matrix: 324/324 (phase ≤ 21, after the harness correction below).

**Matrix harness correction (2026-09-05).** The first full run at phase ≤ 21
reported two misses. Both were the harness measuring wrongly, verified by
replaying the writes live: the funding department-status probe counted an
activity event persisted by an earlier browser verification alongside its own
(the function inserts exactly one row), and the lifecycle probe took its
"active records before" baseline through `organization_active_records()`,
which answers **null** to a caller who is neither an organization member nor
agency management — the CLI's service session is neither, by design. Fix:
event counts use `created_at >= now()` (transaction start, so only rows the
probe itself wrote count) and the baseline is a raw count. No database change.

**Funding domain: design superseded before build (2026-09-05).** Dee supplied
three FundingOS research documents (document qualification and verification,
GHL integration, lender lookup/matching) and two Metro 2 / FCRA framework
documents. Their doctrine is now recorded as Addendum B of
`ARCHITECTURE_PROPOSAL_FUNDING_DOMAIN.md` and the Credit Reporting Integrity
addendum of `ARCHITECTURE_PROPOSAL_LETTER_LIBRARY.md`. Consequences: the
funding-domain migration draft (0058) is **parked outside
`supabase/migrations/`** and will be rebuilt — document *requests* separate
from uploaded *instances*, a controlled flag taxonomy, versioned and
effective-dated requirement rules, lender programs with policy versions and
last-verified dates, lender decisions as their own object, a consumer-report
permissible-purpose gate, a GHL broker with idempotent inbound events and an
outbox. The readiness/matching engines are committed as pure modules (no
screen imports them yet); the matching vocabulary is already `potential_match
| not_matched | policy_verification_required` with `matched / failed /
unconfirmed` criteria, every criteria set names its policy version and
last-verified date, and a policy outside the review window (90 days by
default) cannot produce a match — a failed criterion is still decisive.
Metro 2 in CreditOps becomes context inside a fact → duty → responsible party
→ route → remedy engine; nothing in the product counts "violations", and the
imported reports are consumer-facing displays, so findings can never claim a
raw Metro 2 field value. Legal citations in both addenda are Dee's research,
carried for counsel to confirm, not verified by this codebase.

---

## FundingOps domain, first-class (migration 0058) · deal detail tabs · Addendum B built (2026-09-05)

**Applied.** `20260904003800_funding_domain.sql` (ledger 63/63) creates the
domain half of a funding file exactly as Addendum B of
`ARCHITECTURE_PROPOSAL_FUNDING_DOMAIN.md` describes: `lenders` (with registry
identifiers) → `lender_programs` → `lender_policy_versions` (criteria, source,
effective dates, last verified); `funding_parties`; versioned
`funding_applications`; effective-dated `requirement_rules`;
`document_requests` (what must exist) separate from `document_instances` (what
was uploaded — immutable, hashed, superseded by a new row); `document_flags`
(26-code enum with evidence, never free text); `lender_decisions` (their own
object, append-only); `verification_results`; `consumer_report_requests` (the
permissible-purpose gate); `commissions`; `lender_file_shares`; `lender_id` /
`program_id` on deals, `portal_user_id` on clients, referral link on files.
Two SECURITY INVOKER functions carry the transitions with their activity
event: `record_document_disposition` (accepting an upload is the only thing
that satisfies a request; a disposition never returns to pending) and
`record_lender_decision` (decision → deal status by a fixed mapping; a lender
user may record on their own lender's deal, source `lender_portal`). GHL
broker tables and `funding_leads` are deferred to the Edge Function step.

**Verified live** (rolled-back replays as `bes.owner`): request opened →
instance uploaded → accepted ⇒ request `satisfied`, instance `accepted`, one
`Document disposition` event on the funding client with visibility
`shared_with_partner`. Anonymous role: no execute on the new functions, no
select on `document_instances`; 19 new policies present. A scope fact
surfaced while probing: only the agency owner fixture is in scope for the
Lakeside funding file (the other BES fixtures see zero rows of it), so the
phase-22 probes run BES writes as `bes.owner`.

**Types** are now generated from the live schema (`supabase gen types`), a
drop-in for the hand-edited file: typecheck 0, tests green, lint clean.

**Engines** (`src/lib/funding/`, pure, unit-tested): readiness (document
vocabulary now `bank_statement · government_id · voided_check`), matching
(`potential_match | not_matched | policy_verification_required`, 90-day policy
review window, a failed criterion always decisive), `lender-catalogue.ts`
(the policy version in force on the matching day, not the newest row),
`document-vocabulary.ts` (labels, client-safe flag meanings, period shape).

**Deal detail** (`components/dashboard/fulfillment/funding-domain/`), rendered
per funding file inside the FundingOps work file under Department Progress:
Overview (application version, request counts, readiness factors with the
sentence "not a lender decision and not an approval") · Application (save =
new version, nothing overwritten) · Documents (request a document with an
optional period; upload against a request; dispositions through the function;
waive with a reason; flags with their client-safe meaning for reviewers;
duplicate-hash uploads get a DUPLICATE_DOCUMENT flag with evidence, still kept
for the reviewer) · Lenders & Offers (potential matches with policy version
and verified date, submit = a deal in Submitted, record a lender decision).
History is the activity timeline beside it. Data access:
`lib/data/funding-domain.ts` (one parallel batch per file, one nested select
for the catalogue) and `use-funding-domain.ts`.

**Browser-verified** on Lakeside → FundingOps → Client List → Juno Logistics:
Overview rendered with "Needs work"; Application saved as v1 and the readiness
factors recomputed from it (four pass, documents missing); a June 2026 bank
statement request added (Open · Upload · Waive); a PDF uploaded through the
request → storage object, `files` row, instance "Pending review"; Lenders tab
reports honestly that no program with a policy in force is in the catalogue
and lists the existing Summit Lending deal. Dispositions and decisions are
verified at the database (replay + matrix), not through the Select control in
the background tab.

**Fixed in passing:** `OrganizationDashboard` activated the organization
during render (a state update on `AgencyProvider` mid-render; React warned on
every organization switch). Resolution is now pure during render
(`resolveOrganizationByPublicId`) and activation runs in an effect.

**Requirement resolver** (`requirement-resolver.ts`, pure, 6 tests): rules in
force on the day, matching the application's product family/subtype, platform
or the named lender/program, whose `condition` holds (amount band, states,
entity types, owner ownership %, scenario flags) become requests — one per
party for party-scoped kinds, one per complete lookback month for periodic
documents; "required" wins over "conditional" for the same need;
`missingRequests` subtracts what the file already asks for. The Documents
tab reads all active rules in the file's batch and offers "Open required
documents" (one insert) when the rules require something not yet requested;
it says plainly when no rule targets the product yet. No rule rows exist
until BES/organizations author them — the interface never invents a checklist.

**Not built yet (in order):** rule authoring screen (rows are inserted by
SQL today); deterministic document checks beyond duplicate hashing; cross-document comparisons;
verification adapters (interfaces only in the proposal); client portal
uploads; GHL broker (Edge Function); marketplace adapters. Seed rows for
lenders/programs/policies wait on Dee naming the real programs (Addendum B8).

**Matrix phase 22, first run: 6 misses, 1 defect.** Five probes assumed an
empty fixture file; the interface verification above had persisted an
application version and a June 2026 request on it, so inserts hit the unique
constraints (23505). Probes now take the next application version, request a
period nobody would (2031-01) and count only rows they wrote. The sixth was
real: `lender_users` had a select policy only, so no one could link a user to
a lender (42501). Migration `20260904003810_lender_users_write.sql` adds
insert/delete for whoever may edit the lender; replayed live as `bes.owner`
(link created; the lender user still sees nothing before a share). The second
full run found the next link in the same chain: a lender user with a share
could not read the `funding_files` row, so a deal insert selected nothing and
the decision function saw no deal. `20260904003820_lender_reads_shared_file.
sql` lets a lender read the shared FILE (purpose, amount, stage — never the
funding client), adds `funding_file_tenancy()` (definer) and makes
`record_lender_decision()` SECURITY DEFINER with its authorization spelled
out, because a lender cannot see the client record the activity event is
written against and a decision without its audit row is worse than none.
Replayed live as the shared lender user: sees the file (1) and no clients
(0), deal → Offer Received, source `lender_portal`, activity event under the
organization with the lender as actor. Ledger 65/65.

Verified: typecheck, 300 tests, 0 lint errors, migrations 65/65,
verify-live, browser. RLS matrix 337/337 (phase ≤ 22) at the time; the full run after 0063 is recorded below.

---

## Credit Reporting Integrity engine · findings panel · report-hook loop fix (2026-09-05)

**Built** (Letter Library proposal, Credit-Reporting-Integrity addendum, steps
1 and 4): `lib/dispute/reporting-integrity-rules.ts` — the rule catalogue as
data (id, version, effective date, the one-sentence test, classification,
verdict, route, remedy, authorities with their level: statute > regulation >
appellate > agency guidance > industry format; citations carried from Dee's
research for counsel, none added from memory) and `ROUTE_GUIDANCE` (which
party, which citations a letter may use, and the caution — § 1681e(b) never
to a furnisher; § 1681s-2(b) only after CRA notice; Reg V § 1022.43's
credit-repair-organization exception; FDCPA only for a collector; identity
theft only on the consumer's own attestation).
`lib/dispute/reporting-integrity-engine.ts` — deterministic, 12 tests:
tolerant readers for display dates and money (never invents a value);
item rules (DOFD before open date on a non-collection tradeline → potential
legal issue for review; DOFD on a clean current $0 account → review first;
paid with a balance → potential inaccuracy; charge-off with a balance and
current-with-late-history → *possible*, no action; fewer than three bureaus →
discrepancy only) and chronology across every stored import keyed by
`account_ref` (DOFD moved later with no new delinquency → potential legal
issue; present → absent → present → potential reinsertion event). The
strongest classification the engine can emit is "potential legal issue";
"established violation" is not a value it has. Every finding carries the rule
id and version, the catalogue version and `rawMetro2Verified: false`.
`ReportIntegrityPanel` sits under the import section of the client profile:
three labels only (Data discrepancy · Potential inaccuracy · Potential legal
issue), discrepancies folded away by default, the M1 sentence at the foot.
`fetchReportItemsForReports` reads every snapshot's items in one query.
Nothing is persisted yet (`report_findings` arrives with the Letter Library
migration); the same inputs always give the same findings.

**Letter merge** (`lib/dispute/letter-merge.ts`, pure, 5 tests): fills
`{{placeholders}}` from facts the platform holds or names exactly what is
missing (never an empty string); `approvalReadiness` mirrors the database
approval gate in the drafted Letter Library migration — prohibited phrases,
§ 1681e(b) never to a furnisher, § 1022.43 never for a CRO-prepared direct
dispute, FDCPA only to a collector — so the interface explains a refusal
before the database repeats it. The SQL gate is the one that decides.

**Fixed in passing (real defect since 0048):** `useClientReports` /
`useReportItems` returned a fresh `[]` every render when a client had no
report; the client workspace provider's effect keyed on it re-set state
forever ("Maximum update depth exceeded", hundreds of times, on any client
without an import). The hooks now return stable empty references. Verified in
the browser: zero depth warnings on Evan Ellis after the fix; the panel
renders its empty state ("Import a credit report to run the checks").
Browser checks stopped there because the preview tab shares Dee's live
session and Dee was navigating from the phone.

Verified: typecheck, 317 tests, 0 lint errors, build. No database change.

**Realigned to Dee's FundingOS design (Addendum C, same day).** Dee supplied
the complete FundingOS logic (17-stage pipeline in five phases; three state
axes — primary stage, secondary status, waiting on; Program Fit vocabulary;
readiness statuses; Lender Network Intelligence with source tiers, rule
strength and a policy-update feed; offers, closing, funded deals, renewals;
action-queue dashboard; bounded AI layer). The reconciliation is Addendum C
of `ARCHITECTURE_PROPOSAL_FUNDING_DOMAIN.md`. Applied today, no database
change: readiness speaks *Ready for Placement · Potential Fit · Conditional /
Needs Improvement · Not Currently Funding Ready · Insufficient Information*;
matching speaks Program Fit — per criterion *Meets · Does Not Meet · Needs
Review · Missing Information · Not Applicable*, overall *Apparent Fit ·
Conditional Fit · Needs Review · Insufficient Information · Current Criteria
Mismatch · Policy Unavailable* — and honours rule strength from the policy
(`criteria.strength`: a Preferred criterion below guidance is Needs Review,
never Does Not Meet; Informational never affects fit; Manual Review makes the
fit Needs Review). Results are shown in operational order with no ranking
label. **Dee's decision:** FundingOps proper is the engine (Funding Files,
Program Fit, lenders, the roles around them), the Workspace is the
operational add-on. New in-frame surface: **Funding Files** (`/app/
funding-files`, `/app/funding-files/:fileId`) under the FundingOps nav, apart
from the Workspace exactly as Clients is apart from the CreditOps Workspace;
the engine panel left the work file (kept inline only for outsourcing-only
clients, who have no organization surface). Browser-verified in the active
organization: list scoped by RLS, file page renders the tabs, no console
errors. Schema changes for the 17 stages, secondary status, waiting-on,
criteria rows, policy lifecycle, contacts/relationships, policy updates,
submissions snapshots, offers, closing, funded deals and renewals are
proposed in C2 and wait on the three decisions in C3.

**Engine surfaces, continued (2026-09-05, Dee: departments stay; streamlined,
no redundant views).** `Funding Files` now has two views of the same records:
List and **Pipeline** — the 17 stages grouped by the five phases (Intake ·
Preparation · Submission · Decision · Closing), each phase expandable to its
stages with the files on them, and an off-pipeline section for dispositions
(Lender Declined, Withdrawn — the only two stored today). The spine is data in
`lib/funding/pipeline-stages.ts` (3 tests) with a deterministic map from the
nine stored stage values until the schema carries the 17 stages, secondary
status and waiting-on; moving a file between stages arrives with that schema
and its function. **Lenders** (`/app/lenders`) is the first slice of Lender
Network Intelligence: directory with data-confidence panel (identity,
programs, criteria last verified, relationship and outcome evidence stated
honestly as not yet recorded), programs, policy versions with source and
verification, "Record policy version" (criteria + per-criterion strength +
source + effective date + verified-today) and "Verified with the lender
today"; organization catalogue entries resolve their agency from the
organization record, never from the browser. Layout of every FundingOS
surface in BES is Addendum C5.

**Lender Scorecard and Workspace view order (2026-09-05).** The Lenders page
gains a Scorecard tab — descriptive historical outcomes per lender computed
deterministically from recorded submissions and lender decisions
(`lib/funding/lender-scorecard.ts`, 3 tests): submissions (a deal that left
Draft), offers (a deal with an approved/conditional decision or in Offer
Received/Funded), funded, declined, offer rate and funding rate each shown as
"n/N" and never out of nothing, median calendar days from submission to the
first decision with its own sample, funded volume (the submission amount until
the funded-deal record carries gross and net). Rows with fewer than 5
submissions say "Limited sample", fewer than 15 "Small sample"; the sort is a
display order with name as the stable tie-break; the page carries the
design's cautions verbatim (descriptive only, not predictive, the lender
decides). One query feeds it. **Workspace view order:** SOPs & Logins is
reference material and now always comes last in both Workspace view
catalogues (Dee's instruction); the SQL view-id catalogue is a set for
validation and needs no change.

---

## Team Members settings, GHL-style, on today's authorization model (2026-09-05)

Dee's ask: Roles & Permissions like GHL's "My Staff" — a place to add team
members, each with User Info and Roles & Permissions (role dropdown, "Restrict
data visibility to only assigned data", a per-module permission tree, Copy
Permission), and BES HQ able to see and manage every organization's team for
control and support. **Built now, no schema change:** Settings › **Team
Members** (organization view, first item) — roster from `org_memberships` +
`profiles` (name, email, role, data visibility, primary product, since),
search, member page with User Info, role dropdown over the 15 organization
roles, the assigned-only switch (this IS `org_memberships.assigned_only`,
already enforced by `org_scope_allows`; admins/managers always see the whole
organization), and a read-only tree of what the role may do in each entitled
product from Roles & access (0047 rows or platform defaults); remove from
organization; pending invitations (recorded against seats) with "Record
invitation" (the `invitations` table existed unused; delivery and acceptance
do not exist yet and the interface says so). The membership policies judge
every write (owner/admin or agency manager, never one's own row) and the data
layer refuses silently-ignored updates. **BES HQ:** Settings › People & Access
› **Organization Teams** renders the same section for any organization.
Verified live: the Lakeside roster renders with its four fixture members and
correct visibility labels. **Proposed, not built:**
`ARCHITECTURE_PROPOSAL_TEAM_PERMISSIONS.md` — permission keys as data, role
defaults, per-member overrides, `member_can()` evaluated once and used by the
security-relevant policies, Copy Permission, `invite_team_member()` /
`accept_invitation()` and a `send-invitation` Edge Function. Decisions for
Dee are in its §5. The customer-language test caught a "sub-account" in a
comment and it was reworded — that test earns its keep.

---

## Letter Library (0059) · pipeline axes (0060) · offers, closing, funded deals, renewals (0061) · CN-/FND-/LDR- ids (0062) — applied 2026-09-05

Dee: "Proceed with the full build." Four migrations applied in one push
(ledger 69/69), verified live and covered by matrix phases 23–24.

- **0059 Letter Library**: `letter_templates` (6 BES defaults seeded from the
  Credit Reporting Integrity addendum: factual CRA dispute, internally
  inconsistent reporting, DOFD, description-of-procedure request scoped to
  § 1681i(a)(7), post-reinvestigation escalation, secondary-bureau security
  freeze), `dispute_rounds` (opened only through `open_dispute_round()` — reset
  the cycle or keep the counter, the client's round label follows),
  `dispute_letters`, `dispute_attestations` (the truth gate, insert-only),
  `dispute_timers`, `report_findings` (persisted only when a person acts; can
  never claim raw Metro 2). `approve_dispute_letter()` is the QA gate in the
  database; `mark_letter_mailed()` starts the statutory timers as data.
- **0060 Pipeline axes**: `funding_files.stage` is the 17-step spine; new
  `secondary_status` (13 dispositions) and `waiting_on` (7 owners); the old
  nine-value stage mapped, not guessed (live: Lender Selection 1, Offer
  Received 1, Additional Requirements 1; all Active Funding). Only
  `move_funding_file()` moves an axis, one audit row per axis, and it refuses
  Funded.
- **0061 Records**: `offers` (raw lender terms with their pricing type; a
  factor rate is never an APR), `closings`, immutable `funded_deals` (requested
  · accepted · gross · net kept apart), `renewal_opportunities`, submission
  snapshot (`policy_version_id`, `fit_snapshot`) and verbatim + normalised
  decline reasons on decisions, `lender_contacts`, partner status,
  `policy_updates` with acknowledgement. `set_offer_status()` is a state
  machine (accepting moves the file to Offer Accepted and funds nothing);
  `start_closing()` only on an accepted offer; `advance_closing()` cannot set
  funded; **`confirm_funding()` is the only writer of a funded deal**, from
  Funding Pending, with gross/net/date, and opens renewal monitoring;
  `create_renewal_file()` makes a NEW file with lineage.
- **0062 Public ids**: CN- on clients in both products (a funding client
  linked to a CreditOps client adopts its CN-), FND- on funding files, LDR- on
  lenders; generated by the database, unique, immutable, display-only. Live:
  8 CN- credit clients, 3 CN- funding clients, 3 FND- files. The interface's
  deal reference is now the file's FND- (the "FD-DDDDDDDD-…" label Dee saw was
  a made-up label from the deal uuid; it survives only for seed deals).
- **Interface**: Funding Files list, Pipeline cards and the file page show
  the borrower first, then the business, with the FND- id; stage vocabulary,
  queue views and dashboard breakdown read the spine through
  `DEPARTMENT_STAGES` (every stage belongs to exactly one department queue,
  tested). Types regenerated from the live schema. Letter data layer and hooks
  in place (`lib/data/letters.ts`, `use-letters.ts`); the builder screens come
  next.

**Letter Builder, live (2026-09-05).** The client profile's Letter Builder tab
runs on real rounds and templates for a live client (the sample builder stays
for the sample walkthrough): choose the letter kind and a Library template
(BES default or the organization's own), the recipient (bureau, furnisher,
collector, secondary registry), and the report item disputed; facts the
platform holds fill their placeholders (consumer, furnisher, masked account,
reported status, DOFD) and every remaining placeholder is asked for by name —
never guessed — with a live preview. If a round is open the build asks
**keep round N (additional letters)** or **reset the cycle**; the first build
opens Round 1. Each letter then walks the gate: **consumer attestation** (in
the consumer's words; identity-theft certification required when the account
is not theirs) → **approval** (the interface lists the database's reasons
before the button is enabled; the database decides) → **mark mailed**, which
starts the statutory clocks shown as data. Settings › **Letter Library** lists
BES defaults and the organization's templates, adds new ones (prohibited
phrases refused on entry), deactivates instead of deleting. Data access in
`lib/data/letters.ts`; hooks in `use-letters.ts`.

**Funding File page: three axes and the full decision → funding → renewal
path (2026-09-05).** The file header shows stage · secondary status · waiting
on from the live row; a **Move** control changes any axis through
`move_funding_file()` (Funded is not offered — only confirming funding sets
it). New tabs beside Overview · Application · Documents · Matches &
Submissions: **Offers** (record the lender's raw terms with their pricing type;
the platform's calculated total payback, financing cost and net proceeds
labelled as calculated, with the reason when something cannot be computed; a
factor rate is never an APR; state buttons follow the machine, and Client
accepted moves the file to Offer Accepted without funding anything),
**Closing** (Start closing from an accepted offer; requirements → signatures →
Funding Pending; **Confirm funding** with gross, net, date and reference, the
accepted-versus-actual difference shown before and after; immutable funded
deals with the four amounts apart), **Renewal** (monitoring from the funding
date, status and follow-up dates, "Create new funding file" when the client is
interested — a new file with lineage, never a reuse of the prior fit).
`lib/funding/offer-math.ts` (2 tests) holds the arithmetic.

**FundingOps Dashboard (2026-09-05).** `/app/funding-dashboard`, first item of
the FundingOps group: the design's fourteen action queues as deterministic
predicates over the live rows (`lib/funding/action-queues.ts`, 4 tests) —
needs client action, documents missing (open requests), ready for file review,
ready for submission, lender requirements outstanding, offer requires review
(offers received / in internal review), no movement > 48 hours, overdue
tasks, closing stipulations outstanding, awaiting client signature, funding
confirmation pending, renewal review due, renewal follow-up due, client
interested / new file needed — each card listing the files it holds with a
link; plus active/needs-action/waiting-on stat tiles, files by phase,
waiting-on distribution and team workload (files and files needing action per
assignee). Signals come from five bounded, RLS-scoped queries in parallel
(`fetchFundingQueueSignals`), never per file. Counts, never forecasts.

**Deals: the cross-file record pages (2026-09-05).** `/app/funding-deals`
("Deals" in the FundingOps group, after Lenders) — Submissions · Offers ·
Funded · Commissions · Renewals as one surface with one search, instead of
five sidebar items (Dee: "avoid too redundant view"). Each tab is one bounded,
RLS-scoped query over its canonical table (`lib/data/funding-records.ts`),
fetched only while the tab is open; the Workspace's queue views read the same
rows and add "who does what next". Every row leads with the borrower, then
the business and the FND- id. **Submissions** show the policy version the
submission was judged against and the Program Fit *at that moment* — closing
a gap found on the way: migration 0061 added `policy_version_id` and
`fit_snapshot` to submissions but the writer never filled them; `submitToLender`
now stores both (`buildFitSnapshot`, tested), so a later decline reads against
the policy in force then, not today's. **Offers** put the lender's stated
terms beside the calculated figures (or the reason none can be computed).
**Funded** keeps requested / accepted / gross / net apart and flags a gross
that differs from the accepted offer and the amount withheld. **Commissions**
per deal and party with basis, computed amount and state. **Renewals** with
the follow-up dates and a link to the new file when one exists. Renewal status
labels moved to `document-vocabulary.ts` (one copy). `lib/format-money.ts`
formats exact amounts; the compact "$45K" stays for grids.
Sweep on the way: every remaining `toLocaleDateString` / `toLocaleString` on a
date in `src/components` and `src/pages` now goes through `formatDate` /
`formatDateTime` (22 files) — Dee's rule that user-facing screens show a
simple date, with ISO timestamps kept for audit logs.

**0063 — grant hygiene and organization-operated submissions (2026-09-05).**
The first full matrix through phase 24 came back 352/358. Six misses, two
causes, both real: (1) `funding_deals` insert/update still admitted only BES
staff (0044) while stage moves, offers, closings and funding already let the
organization operate its own file — so the phase-24 probes, run as the
Lakeside owner, were refused at the submission step, and inside
`set_offer_status()`/`confirm_funding()` the deal-status writes matched 0 rows
silently for organization users; (2) "an attestation is never edited" did not
error because Supabase's default privileges grant `authenticated` UPDATE and
DELETE on every new table and the migrations only revoked from `public`/`anon`
— RLS kept the grants inert, but append-only must mean no grant. Inspection
of the same catalogue found a third: `open_dispute_round()` (invoker rights)
closes the previous round on reset with no update policy on `dispute_rounds`,
so resets never closed the prior round. Migration
`20260904004300_grant_hygiene_and_organization_submissions.sql` adds the
rounds update policy, moves submissions to `file_reviewer()`, revokes every
UPDATE/DELETE grant with no policy (60 across 47 tables, by catalogue query),
revokes TRUNCATE/REFERENCES/TRIGGER/MAINTAIN, and changes the `postgres`
default privileges so new tables start at SELECT+INSERT. Verified live: zero
orphan grants; new tables default `authenticated=ar`; ledger 70/70. Two probes
added. Full matrix reruns after 0063 are recorded below.

**CreditOps Dispute Dashboard (2026-09-05).** Dee: "I also needs Dispute
Dashboard for CreditOps." `/app/dispute-dashboard`, first item of the
CreditOps group — the same shape as the FundingOps dashboard: twelve action
queues as deterministic predicates over live rows (`lib/dispute/dispute-
queues.ts`, 5 tests) — drafts awaiting attestation, ready for QA approval,
approved not mailed, reinvestigation due within 7 days, response overdue,
responses to review, findings needing human review, round complete, no credit
report on file, no movement > 14 days, Awaiting Response with no clock, and
the reinsertion watch (informational, kept out of "needs action") — each card
listing the clients it holds with a link; stat tiles (active clients, needs
action, letters awaiting response, reinvestigation clocks running), active
clients by round, open letters by status, team workload. Signals come from six
bounded, RLS-scoped queries in parallel (`fetchDisputeSignals`), never per
client. The clocks are the statutory timers `mark_letter_mailed()` recorded;
the dashboard reads them and invents none. Browser-verified on live data.

**Lenders: relationship and the policy-update feed (2026-09-05).** The two
Lender Network Intelligence pieces whose tables arrived in 0061 now have their
surface. **Relationship** (on the selected lender): partner status (none ·
prospect · active · preferred · paused), last contact with "We spoke today",
named contacts with role, email, phone, notes and a person's verification
stamp ("Mark verified" — only the stamp changes). Facts an operator recorded;
no score. **Policy updates** (top of the Lenders page): recording policy
version v2+ asks what changed (tightened · relaxed · paused · resumed ·
clarified) and a summary; the feed row carries the files that had an open
submission on that program at that moment — computed from `funding_deals`
rows, never inferred — each linked; Acknowledge records that a person saw it
and moves nothing. Data access in `lib/data/lender-relationship.ts`
(policies `lender_visible`/`lender_editable` decide); hooks in
`use-lender-relationship.ts`. Rendered live; the Lakeside catalogue holds no
lender yet, so the panel and feed were verified by typecheck and empty-state
render only.

Matrix probe tightened on the way: "restricted blind DELETE" now requires a
refusal (no delete grant since 0063) instead of accepting a silent 0 rows.

**Pipeline board: drag a file to a stage (2026-09-05).** Cards on the Funding
Files Pipeline view are draggable for users who may edit stage progress; a
drop on another stage column calls `move_funding_file()` — the same function
as the file page's Move control, so the audit row per axis and the refusal of
Funded are the database's, not the board's. The Funded column is never a drop
target (dimmed while dragging; only confirming funding sets it). Secondary
status and waiting-on stay on the file page. Every list reading funding files
refreshes after a move. Keyboard users move a file from its page.
Found while verifying the board: `FundingOpsAccessProvider` was mounted only
inside the Workspace pages, so every engine surface (Funding Files, the file
page, Lenders, Deals, Dashboard) read the hook's deny fallback and rendered
view-only — the "View only" badge on the file page was this, not the person's
role. The provider now wraps those routes in `App.tsx`; RLS was never
involved (the interface over-hid; the database decided correctly throughout).

**Credit Reporting Integrity: findings on the record (2026-09-05).** The
engine's output stays re-derivable; what is now persisted is that a person saw
a finding and what they decided. On the client profile, **Save findings to the
client record** writes the current review-class findings to `report_findings`
(0059) against the latest stored report — rows that already exist for the same
report, account and rule version are left exactly as they are, so a decision
already given is never overwritten. Each saved finding then takes a
**disposition** — confirmed (fact established with evidence), dismissed
(explained, not an inaccuracy), needs evidence, escalated — with the
reviewer's reason, who and when. Nothing here creates a dispute; a letter
cites a finding only after the disposition and the consumer's attestation.
The Dispute Dashboard's "Findings needing human review" queue reads these
rows. `evaluateReports()` now stamps every finding with the report it was read
against (tested). Data access in `lib/data/report-findings.ts`; controls
follow the letter builder's pattern on this page (shown to a signed-in person;
`credit_client_writable()` decides and a refusal is shown, never hidden).
Verification note: no live client currently yields a review-class finding
(Brian Blake's report gives one data discrepancy only), so the save and
disposition path is verified by typecheck and unit tests; the panel's live
render was checked in that empty state.
Second full run after 0063: 357/360. The three misses were all probes, not
policies: two append-only checks ("reports", "lender decisions") asserted a
silent 0-row update and now receive the permission error 0063 intends — their
expectations were tightened to require the refusal; the new "organization
agent cannot record a submission" probe used an insert-select over a file the
agent cannot see, which inserts nothing and proves nothing — it now inserts
literal values so the row-level check actually fires. Third run, all probes corrected: 360/360 (phase ≤ 24).

**Dashboards made visual (2026-09-05).** Dee: "fully VISUAL ENHANCED and
modern … not pure text" and the FundingOS Operations Dashboard as the
reference. Both module dashboards rebuilt to that shape with shared pieces in
`components/dashboard/ops/` (KPI tile with icon badge, chart card, stage bar
chart, donut with legend counts, horizontal bars, workload list with avatar
initials, queue card with icon and count chip; recharts, theme tokens for
every fill). **FundingOps Operations Dashboard:** Total Requested (active
files), Total Approved (open or accepted lender offers, as stated), Active
Files, Needs Action, Funded This Month (gross, from funded deals), Active
Lenders (with an open submission), Team Members; Files by Pipeline Stage (all
17), Waiting On donut, Team Workload, Lender Distribution (open submissions
per lender — load, never a ranking), Action Needed cards. **Dispute
Dashboard:** Active Clients, Needs Action, Letters Mailed This Month, Awaiting
Response, Clocks Due in 7 Days, Findings to Review, Rounds in Progress; Active
Clients by Round, Open Letters by Status donut, Team Workload, Open Letters by
Recipient (bureau), Action Needed cards. Metrics are pure functions
(`lib/funding/dashboard-metrics.ts`, 4 tests); the signals queries gained
amounts, offers, funded deals, submissions and the assignee's name (a profiles
join on the row — the members lookup serves organization admins only, which
had left "Team member" on the workload). Browser-verified on Cedar Financial.
The Lender Scorecard tab gained a stacked "Submissions by outcome" chart
(funded · offer not funded · declined · pending, per lender) above its table —
the same observed counts, drawn; still a description, never a recommendation.

**Visibility taxonomy is BES-only (2026-09-05).** Dee: internal labels such
as "Shared (BES + organization)" and "BES Internal" must never appear to
organization users or clients. The activity badge and the composer's picker
now read the viewer: BES staff keep the internal taxonomy; an organization
user sees a badge only when an entry is visible to their client, and a picker
worded for them ("Your team only" · "Your team + BES" · "Visible to your
client") only when they actually have a choice. Labels live in
`lib/data/activity.ts` beside the internal ones (tested: no organization-facing
label mentions BES-internal wording). BES CRM project updates already hid the
taxonomy from customers. Presentation only — who may post which level is still
`allowedVisibilities()` plus the insert policy. Not browser-verified as an
organization user (this session is BES staff).

**0064 — Team permissions (2026-09-05).** `20260904004400_team_permissions.sql`
per `ARCHITECTURE_PROPOSAL_TEAM_PERMISSIONS.md`: `permission_keys` (22, as
data), `role_permissions` (platform defaults for the 13 non-admin roles — 286
rows — plus an organization's own overrides per role), `member_permissions`
(per-member overrides), `member_can()` (admins always; override → organization
role row → platform default → deny), `my_permissions()` (one call per session),
`set_member_permission()` (never on yourself; audited with previous/new),
`copy_member_permissions()` (GHL "Copy Permission"), `invite_team_member()`,
`accept_invitation()` (caller's email must match). The writers run with
definer rights and check authorization explicitly — the API role has no write
grant on `member_permissions` at all. **0064.1** applies the 0063 rule to
INSERT: revoked wherever no insert policy exists (catalogue query; caught
`permission_keys` and `member_permissions` carrying the default grant) and new
tables now default to SELECT only. Verified live: 22 keys, 286 defaults, 6
functions, zero orphan grants of any kind, ledger 72/72; types regenerated.
Matrix phase 25 written (20 probes); full run 380/380 (phase ≤ 25).

**Team permissions in the interface (2026-09-05).** The member page under
Settings › Team Members now carries the GHL-style tree: every permission key
grouped by module, the member's effective answer with its source (by role ·
set for this member · your organization's default · platform default), a
switch per key that records a per-member override through
`set_member_permission()`, "Reset to role default", and **Copy Permission**
from another member (`copy_member_permissions()`). Admins and managers show
"every permission by role" with nothing to toggle; nobody can edit their own
row. Invitations now go through `invite_team_member()` (one open invitation
per email, audited); Pending invitations gained **Copy invite link**
(`/accept-invitation/<token>`) so an administrator can send the link
themselves until email sending is connected — the invitee must sign in with
the invited email, and `accept_invitation()` refuses any other. New page
`pages/auth/AcceptInvitation.tsx`: signed out → login and back; signed in →
accept, refresh memberships, land in the app. Data access in
`lib/data/team-permissions.ts` (+ `effectivePermission()` mirrors
`member_can()` for display); hooks in `use-team-permissions.ts`;
`useMyPermissions()` bundles the caller's answers once per organization for
later interface gating. Still needed from Dee for automatic emails: a mail
provider API key (send-invitation Edge Function is designed in the proposal).

**0065 — permission keys enforced where the action happens (2026-09-05).**
`20260904004500_permission_enforcement.sql`: `require_permission(org, key)`
added to the ten security-relevant functions (approve letter · build/mail
letters · move file · renewal file · document disposition · offers/closing ·
confirm funding) right after their existing visibility and reviewer checks.
Bodies were generated from the live definitions (`pg_get_functiondef`) with
the one line inserted, so nothing else changed and grants are preserved. BES
staff are gated by engagement and scope, not by an organization's keys;
outsourcing-only records have no keys. Matrix phase 26 added; full run after 0065: see the phase-27 run below.
Interface gating on the same keys: `usePermission(key)` (`lib/auth/
use-permission.ts`) reads the caller's `my_permissions()` once per
organization — BES staff and demo mode answer yes. The file page passes
per-tab answers (files.edit → Move control, Application, Renewal;
documents.review → Documents; submissions.create → Matches & Submissions;
offers.manage → Offers and Closing; funding.confirm → the Confirm funding
form, with a note when the person lacks it); the Pipeline board's drag needs
files.edit; the Letter Builder disables Approve without letters.approve and
Mark mailed without letters.build, saying why. Hiding is presentation; the
function refuses regardless (0065).

**Commissions recorded on funded deals (2026-09-05).** The Deals › Commissions
record page had readers but no writer. The Closing tab now carries
**Commissions** under the funded deals (shown to holders of "View
commissions"): record one per party — BES, a team member, a partner or a
lender referral — on a percentage of gross funded or a flat amount; the amount
is computed by `lib/funding/commission-math.ts` (3 tests) from the funded
gross and shown before saving, never typed as a conclusion; states move
pending → approved → paid, or void, with the machine checked before every
write. Policy: reviewers of the file (0058). The funding-file domain fetch
gained the file's commissions (inner join through its deals, still one
parallel batch). Verified by typecheck and tests; no live file is funded yet,
so the panel's populated state was not browser-checked.

**Borrower portal (2026-09-05).** Addendum D proposed, then built as its
smallest correction. `20260904004600_borrower_portal.sql`: a borrower-only
select policy on `funding_files` plus the narrow `borrower_funding_files`
view (security invoker; stage, purpose, amount, FND-, waiting on, ids —
nothing about lenders, offers, flags or notes); `files` select/insert branches
for organization members and for the borrower's own funding-file uploads;
storage branches for `<organization>/activity/funding_file/<file>/…`; a dev
fixture (`client.portal@bes.test`, borrower of Juno Logistics). Surface
`/portal/funding` (`pages/portals/BorrowerPortal.tsx`, for holders of an
external `client` membership): each file with its step of 17, what is being
waited on, the documents still needed with an Upload button per request
(`uploadDocumentInstance` with `uploadSource: 'portal'` — the policy then
requires pending review), and what has been sent with the reviewer's
disposition. Uploads land in the reviewers' Documents tab and the "documents
missing" queue exactly as staff uploads do. Data access
`lib/data/borrower-portal.ts` (three bounded queries); matrix phase 27
written (10 probes); full run 391/391 (phase ≤ 27).
A borrower-only account (external `client` membership and nothing else) is
sent from any `/app` path to `/portal/funding` by `RequireAuth`; staff and
organization users are untouched. `effectivePermission()` gained 3 tests
(admin by role; override → organization row → platform default; deny).

**Reports, first live slice (2026-09-05).** `pages/app/Reporting.tsx` no
longer shows sample constants. Six KPI tiles and five charts over the last six
calendar months, all deterministic counts over rows the caller may see:
letters mailed and responses by month (line), response rate, funded volume by
month (bars, gross), submissions by month and by outcome (donut), and — for
BES staff only, since production rows are staff-scoped by policy — top agents
by production units. Month bucketing is `lib/reporting/month-series.ts` (3
tests; zero-filled gaps; a rate with no denominator is "—", never 0%). Data
access `lib/data/reporting.ts`: four bounded queries in parallel from the
window start. Outcomes are engine-derived; the page says so, and the pivot
builder, KPI catalogue and manual outcomes follow the reporting proposal.

**0067 — the 0065 alias defect (2026-09-05).** The full matrix through phase
26 came back 373/381: every phase-24 funding probe failed with 55000 "record t
is not assigned yet". The permission line 0065 inserted aliased its tenancy
subquery `t`, and the seven funding functions already declare `t record`;
PL/pgSQL substituted the variable. The letter functions have no such variable
and passed. `20260904004610_permission_enforcement_alias_fix.sql` regenerates
the seven bodies from the live definitions with alias `ten`. Caught by the
matrix before commit — nothing shipped in the broken state.
The borrower routing has 4 tests (`require-auth-borrower.test.tsx`): borrower
only → portal; organization member, BES staff, or a lender/partner external
membership → the shell.

**0068 — 0066 corrections (2026-09-05).** Full matrix through phase 27:
388/391. Two regressions and one gap, all mine in 0066: (1) `files_select` and
`files_insert` were rewritten from the 0035 text instead of the live 0044
text, dropping `entity_visible()` — a restricted BES user saw 5 files and an
organization owner could record a file on another organization's item; (2)
the borrower view ran with invoker rights and joined `funding_clients`, which
the borrower cannot read, so it returned nothing. 0068 restores the 0044
policy bodies verbatim plus the borrower branch only, and defines the view
with owner rights filtered by `auth.uid()` (only the listed columns, only the
caller's own files). Lesson recorded in AUTHORIZATION_MAP: regenerate a policy
from the live catalogue, never from an older migration.

**0069 — Reporting engine (2026-09-05).** Per `ARCHITECTURE_PROPOSAL_REPORTING.md`, order step 1:
`kpi_definitions` (14 KPIs as data across production, time, status changes,
letters, manual outcomes, submissions, funded deals; three marked
BES-internal), `organization_kpi_settings` (enabled · target · order per
organization), `client_round_outcomes` (manual bureau outcomes per round for
clients worked in an outside CRM — provenance `manual`), the `report_facts`
security-invoker view (one common shape; RLS of every source applies) and
`report_pivot()` (rows = a whitelisted dimension, columns = KPIs assembled
from catalogue rows, filters, period). Date indexes added for the window.
Matrix phase 28 written (13 probes); full run 404/404 (phase ≤ 28).
Interface for 0069 (2026-09-05): **Settings › KPIs** (organization view —
switch a KPI on, set its target; BES-internal figures never appear because
the database does not return them) and **BES HQ › KPI Catalogue** (the whole
catalogue, read-only, internal figures marked); **Reports** gains the
organization's KPI cards with targets ("reached" / "to go") and the **Pivot
report** (rows: month · team member · department · service · client ·
organization; KPI chips from the catalogue; period; layout remembered per
browser; totals only where a total means something); the client profile's
Import & Analysis tab gains **Round outcomes (manual)** for clients worked in
an outside CRM, shown as manual in the pivot. Data access
`lib/data/reporting-engine.ts`; hooks `use-reporting-engine.ts`; shaping
`lib/reporting/pivot-shape.ts` (3 tests). Verified live: 14 KPIs, 22 facts,
both functions; browser on the Reports page and the HQ catalogue.
Housekeeping: the rule-16 "known gap" note in `CLAUDE.md` still described the
fulfillment relationship as a boolean; `fulfillment_engagements` (0034) closed
that months of work ago. The note now records the engagement record and the
helpers that read it, and keeps the reminder that widening an engagement's
grant is a proposal-first change.
Matrix maintenance: the phase-2 probe "org2.owner attention = 0" was a
hard-coded expectation; Northgate's fixture work item (seeded "due in 2 days"
on 2026-09-03) is now overdue, so its owner correctly sees one attention row.
The expectation is now derived from the data, like the Lakeside one.

**Organization Home, visual pass (2026-09-05).** The saved Home cards now
render as KPI tiles (icon badges, tone per module, overdue flagged), and two
charts read the same open-work rows: open work by stage (bars) and how urgent
it is (overdue · due this week · due later · no due date, donut). The
customizable card layout, the open-work table and the module links are
unchanged; nothing new is fetched.

**0070 — BES AI Credits (2026-09-05).** Per `ARCHITECTURE_PROPOSAL_AI_CREDITS.md`: `ai_features`,
effective-dated `ai_pricing_policy` (provider cost × markup × credits per
USD), `ai_usage_events` (gateway-only writes), `ai_credit_ledger`
(balance = sum), `ai_recharge_settings`; `ai_credit_balance()`,
`ai_can_use()` (entitlement × balance), `grant_ai_credits()` (BES, audited).
`lib/ai/credit-charge.ts` (4 tests) is the only place a charge is computed —
rounded up to the cent. Interface staged: Settings › AI usage (balance, used
this month by feature, ledger, auto-recharge) and BES HQ › AI Credits (same
plus provider cost, margin and Grant credits). The gateway Edge Function
waits for the Anthropic API key; until then AI features are paused at zero
balance by design. Matrix phase 29 written (11 probes); full run 416/416 (phase ≤ 29).
Edge Functions written, not yet deployed (they wait for secrets):
`supabase/functions/ai-gateway` — the only path from the browser to a model
provider: verifies the session, asks `ai_can_use()` as the caller, calls the
provider with the server-held key, then `ai_record_usage()` with the service
role prices the tokens from the policy in force and writes the usage event and
ledger debit together (the browser never meters itself). Without
`ANTHROPIC_API_KEY` it answers "AI is not connected yet" and charges nothing.
`supabase/functions/send-invitation` — emails an open invitation's accept link
through the mail provider; without `MAIL_PROVIDER_API_KEY` it says so and the
administrator copies the link. Deploy with `npx supabase functions deploy
<name>` from `creditverse-platform/` once the secrets are set with
`npx supabase secrets set`.
First AI-assisted action behind the gateway: **Wording help (AI)** on a draft
letter in the Letter Builder (`AiWordingAssist`). The model may only rephrase
what the letter already says, in the consumer's voice — no added facts, no
citations, no asserted violations, none of the prohibited phrases (the system
prompt names them). The suggestion is checked deterministically for
prohibited phrases before it can be applied, the person chooses to use it or
not, and approval still passes the QA gate. Until the provider key exists the
button answers "AI is not connected yet"; at zero balance, "AI features are
paused"; both come from the gateway, not the browser. Browser client:
`lib/data/ai-gateway.ts`.
Second AI-assisted action: **Explain this fit (AI)** under each Program Fit
match (`AiExplainFit`): the model receives only the engine's per-criterion
results and reasons and puts them into two or three plain sentences — no
odds, no ranking, no "pre-approval", nothing invented about lender policy.
0070 applied and verified live (5 features, 3 functions, `ai_usage_events`
grants SELECT only for the API role; ledger 78/78; types regenerated).
Browser: Settings › AI usage on Cedar Financial renders balance (0, "AI
features paused"), monthly use, auto-recharge, and — for BES staff — provider
cost and the Grant credits form. No ledger row was written in verification;
the matrix probes exercise grants and roll back.

**Edge Functions deployed (2026-09-05).** `ai-gateway` and `send-invitation`
are ACTIVE on the project (deployed with `--use-api`, JWT verification on).
They hold no provider keys yet, so the gateway answers "AI is not connected
yet" and the mailer "Email is not connected yet" — both surfaced verbatim in
the interface — and nothing is charged or sent. When Dee sets
`ANTHROPIC_API_KEY`, `MAIL_PROVIDER_API_KEY` and `MAIL_FROM` with
`npx supabase secrets set`, the same deployments start working; no code
change is needed.

**0071 — Report-derived outcomes (2026-09-05; reporting step 2).**
`report_item_changes` compares each client's consecutive imports by account:
present then absent = deletion observed on the later import; status or
balance changed = update. Observations of the consumer-facing display, never
a statement about the furnisher's record; provenance `engine`, beside the
manual outcomes an outside-CRM team types. `report_facts` gains the source and
the KPI catalogue two definitions ("from reports"). Matrix phase 30 written
(5 probes); full run 421/421 (phase ≤ 30).
Interface for 0071: the client profile's Import & Analysis tab gains
**Changes between imports** (`ReportChangesPanel`) — accounts no longer
reported or changed since the previous import, grouped by the date observed,
with the caution that a disappearance is not proof of a bureau deletion until
confirmed. Hidden when a client has fewer than two imports.
`npm run verify:live` replayed after 0071: all anonymous-caller checks pass
(reads denied, writes rejected, audit trail append-only).
Gateway check: a POST to the deployed `ai-gateway` with only the anonymous key
answers 401 "Session not valid" — the function runs, verifies the caller, and
refuses before any provider or metering step. The interface path (Wording
help → gateway → "AI is not connected yet") completes once a draft letter
exists; no fixture rows were fabricated to force it.

**Sample content labelled (2026-09-05).** Three surfaces still run on bundled
examples with no live model behind them: Compliance (billing events,
registrations, linter flags, eligibility checks), Education (courses,
progress) and DIY Credit management (in-memory example organization). Each now
opens with a "Sample content" notice saying so (`SampleContentNotice`), per
rule 12; every sidebar link was checked against the router (all routed).

**Polish pass 1 — every control does something honest (2026-09-05).** Dee:
"double check all the logic and functions of all tabs and buttons and links
and pages … premium feel." A multi-line-aware scan found 61 buttons with no
behaviour. Now: **wired** — the top bar's New Client (a real New Client dialog
creating a CreditOps client of the active organization through
`createFulfillmentClient`, then opening the profile) and Add Organization;
Agency dashboard "Ask Lina" opens the copilot; partner referral "Copy link";
billing ledger CSV export (`lib/export-csv.ts`, tested); Print / Download PDF
on the client tabs through the browser's print-to-PDF; "Mark Dispute Ready"
and "Approve & Queue" move the item through the workspace context; the
re-import step buttons drive the workflow tabs; DIY shells sign out for real.
**Honest disabled states** with a reason on hover — messaging (no mail/SMS
connection), Danger Zone Execute (needs its confirmation flow), 32
sample-walkthrough controls on sample surfaces. **Live data instead of
fixtures** — the Calendar now lists real deadlines for the next two weeks
(work items due for me and for the active organization, statutory letter
clocks, renewal follow-ups); Billing & Revenue carries a sample notice and its
Export waits for the payment connection. The six remaining scanner hits are
dropdown triggers whose handler lives on the parent. Every sidebar link has a
route; no console errors on the pages walked (My Work, Workspace, My Time,
EOD, Notifications, Calendar, Billing, Reports, Home, Settings).
Client intake has two surfaces on purpose, both calling
`createFulfillmentClient`: `AddClientModal` (BES fulfillment intake — partner
scope, team, assignee, conflict check, from the Workspace and the Clients page
when a BES partner relationship exists) and `NewClientDialog` (an
organization's own admin adding a client of their organization, from the top
bar and the Clients page when no BES partner is involved — the case that had
no entry point at all). The store behind the first requires a BES agency
membership; the second resolves the organization's agency from its row.

**Polish pass 2 — BES Workforce pages live (2026-09-05).** People, Teams and
Workforce showed fictitious staff (Carlos Mendoza, Keila Betancourt…) in a
live session. They now read the real agency roster (`agency_memberships` +
profiles), BES teams with department, division, lead and members, and this
week's time entries — clocked-in now, logged this week, utilization of a
40-hour week, time by division (`lib/data/agency-workforce.ts`, one batch;
staff-scoped by policy). Support reads the support email and phone from Agency
Settings (and says so when unset), links Contact Support and Report a Bug to
mail, and marks System Status and Video Tutorials as not connected instead of
dead links. Announcements labelled sample until an announcements model exists.
Organization admins without a BES partner can now add a client (New Client
dialog on the top bar and the Clients page).
