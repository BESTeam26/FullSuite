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

## Phase 5 — Notification engine · PROPOSAL (not built)

Everything here is design; nothing exists yet. Facts it rests on: no
notification table (verified); `activity_events` is trigger-written, append-only,
with `previous_value`/`new_value` for assignee changes; `entity_visible()` now
answers "may this caller see this record" for every entity type; `work_items`
has `assigned_to`, `team_id`, `division`; `related_ref` is free text and null on
3 of 10 rows.

**One table.**

```
notifications (
  id bigint identity pk,
  recipient_id uuid → profiles           -- exactly one person per row
  actor_id uuid → profiles null,
  agency_id uuid → agencies, organization_id uuid → organizations null,
  kind text,                              -- 'assigned' | 'reassigned' | 'mention' | 'overdue' | 'sla_risk' | 'blocked' | 'note'
  entity_type text, entity_id text,       -- the canonical record; same vocabulary as activity_events
  activity_id bigint → activity_events null,
  created_at timestamptz, read_at timestamptz null
)
unique (recipient_id, activity_id, kind) where activity_id is not null   -- one notification per person per event
index (recipient_id, read_at) where read_at is null                      -- the badge
```

**Recipients are computed by the same triggers that write activity, in the
same transaction, deterministically:**
- `assigned` / `reassigned` → `new.assigned_to` (and `old.assigned_to` gets an
  `unassigned` note only if a business rule wants it — not by default).
- `note` on a record → the record's assignee, plus the lead(s) of its team; never
  anyone who fails `entity_visible` for that record at delivery time.
- `mention` → a `mention` node in the structured body (`@user` → `profiles.id`,
  never a name); recipient must pass `entity_visible` at delivery.
- `overdue` / `sla_risk` / `blocked` → assignee + the record's team leads +
  division managers of the record's division. Produced by a scheduled job
  (pg_cron) that scans `work_attention`, not by clients.
- Division events go only to people whose scope reaches that division;
  organization events never leave the organization; `bes_internal` never
  reaches a customer user — all of which falls out of routing through
  `entity_visible` + `can_view_activity` at write time.

**RLS:** `select using (recipient_id = auth.uid())`; `update (read_at only) using
(recipient_id = auth.uid())` via column grant; no client insert/delete. Badge =
`count(*) where recipient_id = me and read_at is null`; list = the same
predicate ordered by `created_at desc`, bounded. Same table, same predicate —
no second counter.

**Deep links (Phase 5b):** one resolver `hrefFor(entity_type, entity_id)` that
maps the activity vocabulary to a route; on click, re-read the record (RLS
decides), and render "no longer available" when it returns nothing. `related_ref`
is not used as an address until it becomes a typed FK.

**Explicitly out of scope until Team Scope is exercised in production:** email/SMS
delivery, digests, escalation ladders beyond lead + division manager.
