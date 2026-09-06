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
| My Work · My Time · End of Day · Notifications | **DONE** | |
| Managed Operations: CreditOps · FundingOps · BES CRM · TalentOps | **DONE** | All four render from RLS-returned rows only |
| Workforce: People · Teams · Workforce | **DONE** | |
| Management: Reports · Billing & Revenue · Compliance & Legal | **PARTIAL** | Billing has no payment provider — see 12 |
| Company: Knowledge Base · Announcements · Calendar | **DONE** | |
| System: Agency Settings · Support | **DONE** | |
| **BES Partners surface** | **PENDING** | §5 of the 2026-09-06 doctrine. Data exists (`fulfillment_engagements` + organizations + outsourcing groups); no screen. **In progress — FundingOps correction A** |
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
| Letters actually posted (Lob) | **PENDING** | **BLOCKED** on a Lob account + key |
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
| **Workspace route named `/app/metro2`** | **PENDING** | Destination is correct, the name is wrong. **Correction A** |
| **FundingOps navigation per §13** | **PENDING** | **Correction A** |
| **Funding File tabs: Business · Financials · Readiness · Deals · Activity** | **PENDING** | Data exists. **Correction B** |
| **Deal as its own route with §13 tabs** | **PENDING** | `FundingDealWorkspace` exists, unrouted. **Correction B** |
| **"Select lender" creating a Draft deal** | **PENDING** | Today only *submit* creates a deal. **Correction B** — no migration needed |
| **Deal-level stipulations + §17 lifecycle** | **PENDING** | Real schema gap. **Correction C** — one additive migration |
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
| AI provider pricing | **PARTIAL** | Three provisional prices marked unconfirmed — needs Dee |
| GHL bridge (0084) | **PARTIAL** | Scaffold + webhook; **BLOCKED** on A4 |

## 12. Billing & money

| Item | Status | Notes |
|---|---|---|
| Pricing as data (0049) | **DONE** | |
| Plans, add-ons, AI allowances, credit packs | **DONE** | |
| Trials (0086) | **DONE** | |
| **Authorize.Net integration** | **PENDING** | No code exists. **BLOCKED** on A3 |
| Customer-facing pricing UI | **DEFERRED** | Until Dee confirms public prices |
| Invoicing / bookkeeping ledger | **DEFERRED** | Dee: GHL invoices today; record revenue/expenses later |

## 13. Quality gates

| Item | Status | Notes |
|---|---|---|
| RLS matrix — 42 phases, 611 checks | **DONE** | Green 2026-09-06 |
| Unit tests — 690 | **DONE** | |
| TypeScript + build | **DONE** | |
| Theme/contrast regression test | **DONE** | 2026-09-06 |
| Mobile / responsive pass | **PARTIAL** | Pass 1 done (top bar, Clients, Funding Files) |
| Staging test coverage doc | **PARTIAL** | `STAGING_TEST_COVERAGE.md` |

---

## External blockers — the whole list, one place

| # | What Dee must do | What it unblocks |
|---|---|---|
| **A1** | `ANTHROPIC_API_KEY` into Supabase secrets | Scanned-report reading, letter wording help, fit explanations, Hub AI assistant |
| **A2** | Resend API key with sending access + verified domain; and Resend SMTP into Supabase Auth | Activation/welcome email, lender submission packages, sign-up confirmation at volume |
| **A3** | Authorize.Net public client key + confirmed plan prices | Paid sign-up, plan changes, DIY consumer billing |
| **A4** | GHL private integration token per location | CRM bridge both ways, GHL e-signature |
| **A5** | Lob account + API key | Letters actually posted |
| **A6** | 3–5 real credit report PDFs per monitoring service | Per-service parser accuracy |
| **A7** | Real lender list with programs and last-verified policy | Program Fit against real criteria |
| **A8** | Confirm the three provisional AI provider prices; set a console spend cap | AI economics reporting |

**These do not stop other work.** Each is recorded against its item above.

---

## Working order (priority: security → data integrity → authorization → business logic → approved requirements → performance → maintainability → UX)

1. **FundingOps A** — workspace route name, BES Partners, navigation
2. **FundingOps B** — funding file tabs, deal route, lender selection
3. **FundingOps C** — deal-level stipulations (migration + matrix phase)
4. **Seat doctrine** (§24) — authorization-adjacent, currently unencoded
5. **Client-level documents / `entity_visible()` gap** — a security-shaped hole
6. **Metro 2 Sections B–P** + wiring Section A into the detector
7. **Lender portal** (tenancy change — proposal first)
8. **DIY Referrals**
9. **Authorize.Net** (build against sandbox; go-live blocked on A3)
10. **Hub Operations / Hub Performance packages**
11. **Reporting drill-through**
12. **Goals / Notes / Tags on the canonical client**
13. **Mobile pass 2**, final UX consistency
