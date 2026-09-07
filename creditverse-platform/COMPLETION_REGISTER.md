# BES Platform — Master Completion Register

**The single source of truth for what is done, what is not, and why.**
Created 2026-09-06 on Dee's instruction: *"I do not want unfinished items
silently abandoned because we moved to a newer conversation or milestone."*

Reconciled from: 119 migrations, the full git history, `BUILD_STATUS.md`,
`PLATFORM_COMPLETION_PLAN.md`, `WHAT_I_NEED_FROM_DEE.md`, the 19 architecture
proposals, the 42-phase RLS matrix, every route in `App.tsx`, and the screens
as they actually render.

## How to read this

| Status | Meaning |
|---|---|
| **DONE** | Implemented, tested, and the workflow can actually be completed end to end |
| **INTEGRATE** | Built and correct, but not yet wired into the surface that needs it |
| **PARTIAL** | Some of the approved requirement is built; the rest is named below |
| **PENDING** | Approved, not started |
| **SUPERSEDED** | A later approved decision replaced it — kept so it is not resurrected |
| **BLOCKED** | Correct and complete except for something only Dee can supply |
| **DEFERRED** | Explicit product decision to not do this now |

A green test does not make something DONE. The question is always: *can the
approved business workflow be completed?*

---

## 1. Platform foundation

| Item | Status | Notes |
|---|---|---|
| Tenancy model (agency → organizations → members) | **DONE** | Rule 16 doctrine; `organization_id` is the boundary |
| RLS on every table + `SECURITY DEFINER` helper set | **DONE** | 42-phase matrix, 611/611 |
| Permission keys as data (0064, 0065) | **DONE** | Role + permission + scope + assignment, enforced in DB writers |
| Configurable organization role access (0047) | **DONE** | |
| Fulfillment engagements (0034) | **DONE** | Replaced the `is_fulfillment_subscriber` boolean |
| Audit trail (`activity_events`, `audit_log`) | **DONE** | Append-only, trigger-written |
| Authorization map document | **DONE** | `AUTHORIZATION_MAP.md` |
| Organization switching (§29) | **DONE** | Invalidates every non-global query key, navigates to org Home |
| Performance doctrine (rule 14) | **DONE** | Auth resolves once; orgs in one nested read; shared query keys |

## 2. Agency HQ

| Item | Status | Notes |
|---|---|---|
| HQ Home, Organizations, Attention Center | **DONE** | |
| **BES Partners** | **DONE** | On `fulfillment_engagements`; both partner shapes; BES-staff guarded (A) |
| My Work · My Time · End of Day · Notifications | **DONE** | |
| Managed Operations: CreditOps · FundingOps · BES CRM · TalentOps | **DONE** | All four render from RLS-returned rows only |
| Workforce: People · Teams · Workforce | **DONE** | |
| Management: Reports · Billing & Revenue · Compliance & Legal | **PARTIAL** | Billing has no payment provider — see 12 |
| Company: Knowledge Base · Announcements · Calendar | **DONE** | |
| System: Agency Settings · Support | **DONE** | |
| "Portals & Apps" group (Partner Referral / Outsourcing / DIY) | **SUPERSEDED** | Removed in `cd526b0` as fabricated previews. DIY Credit is an organization module; partner/outsourcing portals are separate approved items (see 11) |
| Rename "Managed Operations" → "Service Operations" | **DEFERRED** | Dee: "do not rename blindly if it creates unnecessary churn" |

## 3. Organizations & entitlement

| Item | Status | Notes |
|---|---|---|
| Organization provisioning, branding, settings | **DONE** | |
| Product entitlements per organization | **DONE** | `product_entitlements`, 11 product keys |
| Three-layer control (entitled → enabled → authorized) | **DONE** | Rule 18, enforced in the DB writer |
| Public sign-up + 30-day trial (0086) | **DONE** | |
| Invitations + activation + branded email | **DONE** | Email delivery **BLOCKED** on A2 |
| Seat doctrine (§24: owner free, BES staff free, portal users free) | **PENDING** | Not encoded anywhere yet |

## 4. Canonical Clients

| Item | Status | Notes |
|---|---|---|
| `clients` canonical record (0091) | **DONE** | |
| Backfill + duplicate `needs_review` (0092) | **DONE** | |
| Auto-link engine records to the client (0094/0095) | **DONE** | |
| Duplicate resolution by the importer (0098) | **DONE** | |
| All Clients as a directory, not a pipeline | **DONE** | 2026-09-06 |
| Client Profile as the 360° record | **DONE** | 2026-09-06 |
| Client Profile no longer renders CreditOps | **DONE** | Moved to `/app/creditops/cases/:id` |
| Goals | **PENDING** | No table. Panel says so rather than faking it |
| Client-level Notes | **PENDING** | Needs a visibility decision first |
| Client-level document store | **PENDING** | Files are engine-keyed today; `entity_visible()` has no `client` case |
| Tags | **PENDING** | No table |
| Per-client plans/subscriptions | **DEFERRED** | Subscriptions live on the organization; per-client plan is a commercial decision not yet made |

## 5. CreditOps — the credit-repair execution system

| Item | Status | Notes |
|---|---|---|
| Credit cases, lifecycle, rounds, assignment | **DONE** | |
| Canonical credit reports, append-only imports (0048) | **DONE** | |
| CSV import v1 | **DONE** | |
| PDF text-layer import (`pdf-text-1`) + review grid | **DONE** | Per-service accuracy needs B1 samples |
| Scanned/image PDF via AI gateway | **DONE** | **BLOCKED** on A1 key |
| Classifier, analysis engines, integrity findings | **DONE** | |
| Re-import comparison (what changed) | **DONE** | |
| Letter Library + Builder on real items | **DONE** | |
| Attestation → approval gate → mailed → statutory clocks | **DONE** | |
| Dispute Dashboard (12 queues) | **DONE** | |
| Rounds 1–12 escalation ladder | **DONE** | A round is earned by the record |
| Dispute reason library, voice axis, letter composer | **DONE** | |
| Regulator channels (FTC/CFPB) — recommend + explain only | **DONE** | Dee: never filed by the system |
| Round outcomes: manual + report-derived (0071) | **DONE** | |
| Score simulator on the client's own report | **DONE** | |
| Build Credit | **DONE** | Invented figures removed |
| Comparison grid + letter batching | **DONE** | |
| **Metro 2 Section A** (identity) | **DONE** | Pure rules + tests, unwired |
| **Metro 2 Sections B–P** | **PENDING** | ~293 defects. Largest single remaining CreditOps item |
| Metro 2 rules wired into the detector | **PENDING** | Section A exists but nothing calls it yet |
| Experian upload-only rule | **SUPERSEDED** | Removed 2026-09-06 — internal operating rule, not domain |
| Letters actually posted (Lob) | **DONE** | 0116 + `post-letter` + `lob-webhook`. Reserve-then-reconcile: the letter is only marked mailed when Lob accepted it, and a TEST key deliberately does not start the statutory clocks |
| CROA e-signature | **PENDING** | Dee chose GHL e-sign — needs A4 |
| Monitoring-service connectors | **DEFERRED** | No public APIs; PDF import is the path |

## 6. CreditOps Workspace

| Item | Status | Notes |
|---|---|---|
| Work items, departments, queues, assignments | **DONE** | |
| Hand-off CreditOps ⇄ FundingOps (0052/0053) | **DONE** | |
| Department statuses, SLA, escalation | **DONE** | |
| Organization-selectable department views | **PARTIAL** | `workspace_views` column exists; per-department enable UI not built |

## 7. FundingOps — the funding execution system

| Item | Status | Notes |
|---|---|---|
| Funding files, 17 stages, List ⇄ Pipeline | **DONE** | |
| Client → Business → Funding File → Deal chain | **DONE** | Real FKs; file stage and deal status are separate |
| Application, parties, financials | **DONE** | |
| Documents: requests, instances, dispositions, versioning | **DONE** | |
| Requirement rules — versioned, effective-dated, sourced | **DONE** | |
| Requirement resolver (pure, deterministic) | **DONE** | |
| Readiness engine | **DONE** | |
| Lender catalogue, programs, policy versions with provenance | **DONE** | |
| Program Fit / matching with honest labels (§15) | **DONE** | Apparent Fit · Conditional · Needs Review · Insufficient Information · Mismatch. No approval claims |
| Fit snapshot + policy version stored on submission | **DONE** | |
| Offers, closing, funded deals, renewals | **DONE** | |
| Lender scorecard (published vs observed) | **DONE** | |
| Commissions (C6) | **DONE** | Matrix phase 42 |
| Workspace route named `/app/metro2` | **DONE** | Renamed `/app/funding-workspace`, redirect kept (A) |
| FundingOps navigation per §13 | **DONE** | (A) |
| Funding File tabs: Business · Financials · Readiness · Deals · Activity | **DONE** | (B) |
| Deal as its own route with §13 tabs | **DONE** | `/app/funding-deals/:dealId` (B) |
| "Select lender" creating a Draft deal | **DONE** | Select → Draft; Submit → Submitted with its own timestamp (B) |
| Deal-level stipulations + §17 lifecycle | **DONE** | 0112/0113, matrix phase 43 (C) |
| Deal Communications tab | **PENDING** | No deal-scoped message table; Channels are not deal-scoped. Design decision not made |
| Lender submission by email package | **PENDING** | **BLOCKED** on A2 |

## 8. DIY Credit

| Item | Status | Notes |
|---|---|---|
| DIY journeys, consents, enrolment, advance (0102/0103) | **DONE** | |
| Enrolment reuses the canonical client, never a second person | **DONE** | Matrix phase 40 proves it |
| Upgrade DIY → managed CreditOps | **DONE** | One credit case, reports and consents survive |
| Consumer portal surface | **DONE** | |
| **DIY Referrals** (partner attribution + commission ledger) | **PENDING** | Reference supplied 2026-09-06 |
| DIY consumer billing | **PENDING** | **BLOCKED** on A3 |

## 9. Client & partner portals

| Item | Status | Notes |
|---|---|---|
| Client Portal (C3) | **DONE** | No new identity model — a view on the canonical client |
| Borrower portal | **DONE** | |
| Lender portal | **PENDING** | Dee approved a full lender portal; `lender_users` exists |
| Partner / outsourcing portal | **PENDING** | |

## 10. Organization Hub

| Item | Status | Notes |
|---|---|---|
| Module registry + organization choices (0074–0078) | **DONE** | |
| Home · People · Departments · Tools | **DONE** | |
| Knowledge · Announcements | **DONE** | |
| My Work | **DONE** | |
| Calendar · Requests & Approvals · Forms | **PENDING** | Hub Operations package |
| KPIs · Scorecards · Goals · Training · Coaching | **PENDING** | Hub Performance package |
| Company AI assistant | **PARTIAL** | Gateway exists; **BLOCKED** on A1 |

## 11. Cross-cutting systems

| Item | Status | Notes |
|---|---|---|
| My Work (personal, cross-service) | **DONE** | |
| My Time, stale-timer cap | **DONE** | 10-hour cap (C8) |
| Production (from completed work) | **DONE** | |
| End of Day | **DONE** | |
| Attention Center | **DONE** | |
| Notifications + mentions | **DONE** | |
| Channels (C4) | **DONE** | Author BES-ness stamped at write time |
| Files / documents | **DONE** | |
| Reporting engine, KPIs as data (0069) | **DONE** | |
| Report pivot + drill | **PARTIAL** | `report_pivot()` works; full Organization → Division → … → Evidence drill not built |
| AI gateway + credits ledger (0070) | **DONE** | **BLOCKED** on A1 |
| AI safeguards: reserve → reconcile → fail closed (0100) | **DONE** | |
| AI provider pricing | **DONE** | 0114: confirmed against Anthropic's published list 2026-09-06. Two of three provisionals were wrong — Opus 5 was 3× too high, Sonnet 5 1.5× — which fed the customer charge through the markup |
| Anthropic $100/month spend cap | **BLOCKED** | Dee sets it in the Anthropic console |
| First controlled live AI request | **BLOCKED** | Dee's plan: Lakeside test client → Suggest wording. Needs A1 |
| GHL bridge (0084) | **PARTIAL** | Scaffold + webhook; **BLOCKED** on A4 |

## 12. Billing & money

| Item | Status | Notes |
|---|---|---|
| Pricing as data (0049) | **DONE** | |
| Plans, add-ons, AI allowances, credit packs | **DONE** | |
| Trials (0086) | **DONE** | |
| **Authorize.Net integration** | **DONE (needs one key)** | 0117 + `payments` function + Accept.js card field + Settings › Plans & Billing. The card never reaches BES — Accept.js tokenises it in the browser and the schema has no column for a PAN. Needs `AUTHNET_PUBLIC_CLIENT_KEY` set before the card field will load |
| Subscriptions (`organization_subscriptions`) | **DONE** | Price copied at purchase; a charge is what makes a subscription active, not a browser claim |
| Recurring billing / dunning | **PENDING** | Charging is manual today. A scheduled renewal run is the next payment item |
| Customer-facing pricing UI | **DEFERRED** | Until Dee confirms public prices |
| Invoicing / bookkeeping ledger | **DEFERRED** | Dee: GHL invoices today; record revenue/expenses later |

## 13. Quality gates

| Item | Status | Notes |
|---|---|---|
| RLS matrix — 47 phases, 714 checks | **DONE** | Green 2026-09-07, **10m 43s** (was hours) |
| Matrix harness performance | **DONE** | Transport 5.65s → 780ms per call; collect/flush/replay batching proven byte-identical to serial; per-phase timing printed every run |
| Targeted verification (`--phases`, `--from`, `--serial`) | **DONE** | One phase ≈ 34s, so a small fix no longer costs a full gate |
| DEFINER/INVOKER structural invariant | **DONE** | Phase 47 asserts no DEFINER function calls an RLS-dependent helper |
| Integration health check | **DONE** | Settings › Integrations tests all four providers read-only |
| Unit tests — 690 | **DONE** | |
| TypeScript + build | **DONE** | |
| Theme/contrast regression test | **DONE** | 2026-09-06 |
| Mobile / responsive pass | **PARTIAL** | Pass 1 done (top bar, Clients, Funding Files) |
| Staging test coverage doc | **PARTIAL** | `STAGING_TEST_COVERAGE.md` |

---

## External blockers — the whole list, one place

| # | What Dee must do | What it unblocks |
|---|---|---|
| ~~A1~~ | **DONE 2026-09-06 19:27** — `ANTHROPIC_API_KEY` is set. Validity proven by Dee's first live request (Lakeside → Suggest wording). $100/month cap SET by Dee 2026-09-06. Still needed: the first live request (Lakeside → Suggest wording) as proof the key works | Scanned-report reading, letter wording help, fit explanations, Hub AI assistant |
| **A2** | `MAIL_PROVIDER_API_KEY` + `MAIL_FROM` SET 2026-09-06. Sending domain and the Supabase Auth SMTP block both DONE by Dee 2026-09-06. Verify with Settings → Integrations → Check connections | Activation/welcome email, lender submission packages, sign-up confirmation at volume |
| **A3** | Server secrets SET. Still needed: `npx supabase secrets set AUTHNET_PUBLIC_CLIENT_KEY=…` — the Accept.js public key from the Authorize.Net console (API Credentials & Keys → Public Client Key). Also `AUTHNET_ENV=production` when going live | Paid sign-up, plan changes, DIY consumer billing |
| **A9** | `npx supabase secrets set LOB_WEBHOOK_SECRET=…` and point a Lob webhook at `/functions/v1/lob-webhook` | Delivery tracking on posted letters |
| **A4** | GHL **agency** token + Company ID, entered at Settings → GoHighLevel | Location discovery, CRM bridge both ways, GHL e-signature |
| ~~A5~~ | `LOB_API_KEY` SET 2026-09-06. Nothing reads it yet — the mailing integration is the next build | Letters actually posted |
| **A6** | 3–5 real credit report PDFs per monitoring service | Per-service parser accuracy |
| **A7** | Real lender list with programs and last-verified policy | Program Fit against real criteria |
| ~~A8~~ | ~~Confirm the provisional AI provider prices~~ **ANSWERED 2026-09-06** — use current official API pricing for the exact models used; provider cost and BES customer price stay separate. Read from Anthropic's published list and applied in 0114. Still needed from Dee: **set the $100/month spend cap in the Anthropic console** (only Dee can) | AI economics reporting |

**These do not stop other work.** Each is recorded against its item above.

---

## Verification strategy (2026-09-07)

**During development:** targeted unit tests → the affected matrix phases
(`node supabase/scripts/rls-matrix.mjs --phases=45,46,47`) → tsc/lint/build.

**At a milestone:** one full gate (`--phase=47`), ~11 minutes.

`--serial` disables batching and is how the batched path is proven equivalent.

## Working order (priority: security → data integrity → authorization → business logic → approved requirements → performance → maintainability → UX)

1. ~~FundingOps A / B / C~~ — **done 2026-09-06**
2. **Seat doctrine** (§24) — authorization-adjacent, currently unencoded
5. **Client-level documents / `entity_visible()` gap** — a security-shaped hole
6. **Metro 2 Sections B–P** + wiring Section A into the detector
7. **Lender portal** (tenancy change — proposal first)
8. **DIY Referrals**
9. **Authorize.Net** (build against sandbox; go-live blocked on A3)
10. **Hub Operations / Hub Performance packages**
11. **Reporting drill-through**
12. **Goals / Notes / Tags on the canonical client**
13. **Mobile pass 2**, final UX consistency
