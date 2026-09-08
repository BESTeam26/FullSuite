# BES Platform — Master Completion Register

**The single source of truth for what is done, what is not, and why.**
Created 2026-09-06 on Dee's instruction: *"I do not want unfinished items
silently abandoned because we moved to a newer conversation or milestone."*

Reconciled from: 119 migrations, the full git history, `BUILD_STATUS.md`,
`PLATFORM_COMPLETION_PLAN.md`, `WHAT_I_NEED_FROM_DEE.md`, the 19 architecture
proposals, the 42-phase RLS matrix, every route in `App.tsx`, and the screens
as they actually render.

## Historical milestone labels → current product capability

Old internal names are tracking labels, not architecture. Both are kept so no
approved request disappears, while the product stops being organised around
obsolete milestone numbers.

| Historical milestone | Current product capability | Status |
|---|---|---|
| C1 | Canonical Client record + directory + 360° profile | DONE |
| C2 | DIY Credit consumer journey | DONE |
| C3 | Client Portal | DONE |
| C4 | Channels (internal messaging) | DONE |
| C6 | Commissions on funded deals | DONE |
| DIY referral programme | Referral attribution + the same commission ledger | DONE |
| C7 | Letters actually posted (Lob) | DONE |
| C10 | Duplicate-client resolution by the importer | DONE |
| AP / pricing work | Plans, trials, subscriptions, Authorize.Net | DONE (needs the browser client key) |
| §24 | Seats and membership lifecycle | DONE |
| **Metro 2 Sections A–P** | **CreditOps dispute defect catalogue** — a credit-REPORTING format. Not FundingOps lender matching; the two are unrelated systems | Section A done (8 rules, transcribed ids); **B–P: SOURCE NOT YET RECONCILED** |
| FundingOps A/B/C | FundingOps navigation, funding file, deal, stipulations | DONE |

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
| Seat doctrine (§24) | **DONE** | 0127/0128 + phase 48 (20 probes). One definition read by the screen, the invite, the accept and the reactivation |
| Membership lifecycle (deactivate / reactivate) | **DONE** | `archived_at` + `set_member_archived`. Never a delete, never a role change; attribution preserved, seat freed |
| Over-capacity handling | **DONE** | A downgrade is never blocked and never removes access; the organization is flagged and new/reactivated seats are refused until resolved |

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
| Client-level document store | **DONE** | 0129/0130 + phase 49 (16 probes). Same `files` table and bucket — no second document engine |
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
| **Metro 2 Section A** (identity) | **DONE** | 8 rules, 28 tests, and wired into the canonical findings flow 2026-09-07 |
| **Metro 2 Sections B–P** | **SOURCE NOT YET RECONCILED** | The "~293 defects" figure was a **generated register estimate**, not a traced source — it appears once in this repository and nowhere in its history, `CLAUDE.md`, `BUILD_STATUS.md`, any commit message, migration or archive. **Withdrawn 2026-09-07 on Dee's instruction.** The real source is a defect catalogue **uploaded in an earlier chat session and never committed** — proven by commit `258b086` ("Appendix 1 of the uploaded defect catalogue"), by `metro2-status-rules.ts:17` ("Section Q of the catalogue"), and by Section A's transcribed ids A1/A2/A4/A6/A12/A14/A16/A20, whose gaps could not be generated. **Blocked on Dee re-supplying that document.** Full trace and the engine inventory it must be reconciled against: `src/lib/dispute/ENGINE_INVENTORY.md`. **Superseded as the product's organising idea 2026-09-07** — the canonical capability is now the BES Credit Reporting Intelligence & Compliance Engine (see the workstream below). This row stays open because the legacy catalogue is still missing, not because the product is waiting on it |
| Metro 2 rules wired into the detector | **DONE** | 2026-09-07. `metro2/to-integrity-finding.ts` maps a Section A finding onto the `IntegrityFinding` the rest of CreditOps speaks, and `useReportIntegrityFindings` folds it into the same list the integrity engine produces — one queue, one review gate, one table. UNKNOWN and NOT_AN_ERROR never cross; `remedy` is never derived as `delete` or `block`; every finding lands with `human_review_required: true` and a null disposition, so a **person** still decides before anything is disputed. No extra request: the identity row is fetched under the key `Metro2IdentitySection` already uses, in parallel with the items query. 20 tests |
| `metro2-guardrails.ts` test coverage | **DONE** | 2026-09-07. Was untested — four compliance decision functions including the § 1681b permissible-purpose tree. 38 tests, written to prove the refusals: UNKNOWN never becomes a violation, a permissible purpose always wins, nothing is ever classified `established-violation`, and the identity-theft pathway needs all three facts (asserted exhaustively). **No guardrail behaviour changed**; two judgment calls documented in `ENGINE_INVENTORY.md` §4 for Dee |
| Missing DOFD, where it is relevant | **DONE** | 2026-09-07. `dofd` deliberately NOT added to `EXPECTED_FIELDS` — an account that was never late has no delinquency to date. Relevance comes from the account's own reporting (collection, derogatory wording, or any late mark in the grid). Raised as **apparent**, never confirmed: "the bureau omits it" and "our import missed it" look identical from here, so it is a review task, not a violation. No obsolescence rule added — that needs the report's pull date and an approved rule. 7 tests |
| `current_but_late_mark` | **REMOVED** | 2026-09-07. A dead enum member that duplicated `paid_status_but_late_marks` (which already matches "current" and "pays as agreed"). Checked before removing: no catalogue reason required it, no selector read it, no database enum or constraint carried it |
| `BUREAU.VALUE_DIFFERS` | **MODEL GAP — declared, not faked** | 2026-09-07. Catalogued with authorities and unreachable: `report_items` stores one value per field plus a list of bureau names. The PDF parser DOES read the tri-merge columns and knows they differ (`firstColumn()`), then keeps only the first — so which bureau said what is lost before storage. The rule now carries `blockedBy`; `RULES_IN_USE` (which travels onto compliance output) excludes it; a structural test asserts every unblocked rule is reached by running code. **Same gap makes `detectConditions` unreachable in production — 31 conditions with no caller.** Smallest change written up as a proposal in `ENGINE_INVENTORY.md` §5: keep the parser's columns (pairing to bureaus only where a header proves the order), one child table, engines read it |
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
| Deal Communications | **DONE** | 0131 + phase 50. An append-only log of contact with a third party — not a messaging system and not a sender |
| Deal Documents | **DONE** | Stipulation answers plus documents explicitly marked shareable — nothing else on the file |
| FundingOps record surfaces in navigation | **DONE** | Submissions · Offers · Funded Deals · Commissions · Renewals, view in the URL, one page |
| Lender submission by email package | **PENDING** | **BLOCKED** on A2 |

## 8. DIY Credit

| Item | Status | Notes |
|---|---|---|
| DIY journeys, consents, enrolment, advance (0102/0103) | **DONE** | |
| Enrolment reuses the canonical client, never a second person | **DONE** | Matrix phase 40 proves it |
| Upgrade DIY → managed CreditOps | **DONE** | One credit case, reports and consents survive |
| Consumer portal surface | **DONE** | |
| **DIY Referrals** | **DONE** | 0132–0134 + phase 51 (25 probes). Attribution, events, and the SAME commission ledger — not a second one |
| Referral link click counting | **PENDING** | Needs a public endpoint recording clicks; the page says so rather than showing a number it does not have |
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
| **A6** | 3–5 real credit report PDFs per monitoring service | Per-service parser accuracy — and now **per-bureau attribution**: CR-2's header rule is exercised only against synthetic fixtures, and real tri-merge layouts are the only way to know how often a real header proves the column order |
| **A7** | Real lender list with programs and last-verified policy | Program Fit against real criteria |
| ~~A8~~ | ~~Confirm the provisional AI provider prices~~ **ANSWERED 2026-09-06** — use current official API pricing for the exact models used; provider cost and BES customer price stay separate. Read from Anthropic's published list and applied in 0114. Still needed from Dee: **set the $100/month spend cap in the Anthropic console** (only Dee can) | AI economics reporting |

| **A10** | **Resend acceptable-use confirmation, in writing, for funding-offer, lender-outreach, affiliate and referral messaging.** Dee's competitor research raised this against *Sender*; BES does not use Sender (rule 19 — the name was a misheard "Resend", corrected 2026-09-06), so flagging Sender protects nothing. The concern itself is real and is redirected to the provider we actually use. A transactional endpoint does not create an exception to a content policy | Any funding, lender, affiliate or referral email. Transactional auth and app mail are unaffected |

**These do not stop other work.** Each is recorded against its item above.

---

## BES Credit Reporting Intelligence & Compliance Engine (workstream opened 2026-09-07)

Dee's Metro 2 / FCRA research of 2026-09-07 is the **authoritative legal and
product doctrine for CreditOps**. The product is no longer conceptually a
"Metro 2 Violation Detector".

Documentation milestone **DONE**; implementation not started, awaiting review.

| Document | What it settles |
|---|---|
| `docs/creditops/CREDIT_REPORTING_INTELLIGENCE_RULEBOOK.md` | 20 locked truths, authority hierarchy, CDIA boundary, 8-level finding taxonomy, 6-level evidence model + 6 confidence axes, rule schema with stable `BES-CRA-*` ids, party/duty routing, `DISPUTE_ORIGIN`, cross-bureau and chronology models, remedy engine, inquiry rewrite, FCBA gate, identity-theft truth gate, letter truth gate, e-OSCAR doctrine, forensic review, QA checklist, testing doctrine, V1/V2 product boundary |
| `docs/creditops/CREDIT_REPORTING_SOURCE_REGISTER.md` | Every citation with authority level and verification state. **Every row is `IN_USE_UNVERIFIED` or weaker** — no primary-source pass has run |
| `docs/creditops/CREDIT_REPORTING_LEGACY_CROSSWALK.md` | 25 legacy items audited: 4 REJECT, 2 SUPERSEDED, 3 REWRITE, 5 KEEP_WITH_QUALIFICATION, 10 KEEP, 1 SOURCE_UNVERIFIED |
| `docs/creditops/CREDIT_REPORTING_GAP_MAP.md` | 12 capability gaps; what is fixable without schema, what needs schema (S-1…S-8), what needs CDIA access, what needs counsel |
| `ARCHITECTURE_PROPOSAL_PER_BUREAU_OBSERVATIONS.md` | Proposal — the prerequisite for cross-bureau intelligence |
| `ARCHITECTURE_PROPOSAL_CHRONOLOGY.md` | Proposal — cure reconstruction, snapshot coverage, timeline events |

**Highest-severity finding — FIXED 2026-09-07 in CR-4a.** `TRAP_CHANNELS.FTC`
(`letters-and-channels.ts:19`) tells staff an IdentityTheft.gov report is
*"Required for third-party collections"*, reachable through
`ClientDetail → LettersTab → TrapStrategyPanel`. A collection is not evidence of
identity theft, and the FTC warns specifically against false identity-theft
reports as a credit-repair tactic. Fixed ahead of every architectural delta, as
planned.

**Doctrine revised 2026-09-07 (Dee).** BES guides; the Organization decides its
SOP; the operator remains responsible for the facts. Rulebook §0.5 now splits
every rule into a **platform safety rule** (hard and global — BES never
fabricates a fact or asserts a conclusion nobody established) and an
**Organization SOP rule** (configurable, default off — evidence, attestations,
approvals). **Evidence upload is optional by default**; evidence legitimately
lives outside BES. The L-01 fix is therefore neutral education plus four
recorded operator states, not a stricter gate.

**Two round engines were live with opposite doctrine — RESOLVED 2026-09-07
(CR-4b).** `rounds-and-layers.ts` (7-layer pressure ladder, TRAP round 1,
direct disputes wrongly citing § 1681s-2(b), MOV over-claim,
ClickUp/LetterStream statuses) is **deleted**; its callers moved to
`escalation-ladder.ts`. No third engine was built. Correcting it also exposed
that the surviving engine carried the § 1681s-2(b) error on two of its own
rounds.

| # | Item | Status |
|---|---|---|
| CR-1 | Rulebook, Source Register, Legacy Crosswalk, Gap Map | **DONE 2026-09-07** |
| CR-2 | Per-bureau observations | **DONE 2026-09-07.** Migration 0135. Two destinations decided by evidence: attributed values → `report_item_bureau_values` (one row per bureau, unique per item, append-only, `raw_metro2_verified = false` and `source_type` both CHECK-constrained); values the header could not resolve → `report_items.source_columns` as `field -> [raw values]`, **preserved verbatim rather than reduced to "columns differ"** (Dee's refinement 1). Attribution decided per field from the source's own header order — `bureausIn` answered EQ/EX/TU from a fixed list regardless of the header, so `bureausInOrder` was written and a test reverses a header to prove values follow it. **No backfill**: 0 child rows, 0 `source_columns` on historical reports, asserted by a matrix probe. Unblocked `BUREAU.VALUE_DIFFERS` and **nothing else** — `dormant-rules.test.ts` reads the source tree and fails if anything calls `detectConditions` or `selectReason`, verified by planting a real call. 869 tests, matrix phase 52 at 16/16, full gate green |
| CR-3 | Chronology layer | **DONE 2026-09-07, with NO schema change.** The proposal expected three migrations; CR-2 and CR-14 had already stored everything it needed, so chronology is a pure computation (`chronology.ts`) plus a UI. **Facts only**: "Experian balance changed $3,031 → $2,800" and never corrected, inaccurate, re-aged or violated — a test audits the rendered screen for those words. Three refusals hold: a field absent on either side raises **no** change event (an unreported balance is not $0); a **partial** snapshot yields `COMPARISON_UNAVAILABLE` rather than `NO_LONGER_OBSERVED`, because an account missing from a report that read 24 of 30 is an account not read; and an ambiguous identity is `MATCH_REVIEW_REQUIRED`, never a merge. `NO_LONGER_OBSERVED` needs a **complete** verdict and coverage of that bureau. A return is `POTENTIAL_REAPPEARANCE_EVENT` — "a question, not a finding". Payment history compares **by month**, never by array index. Statutory timers deliberately excluded (G-11's), asserted by test. Account-level History view with a readable timeline and a table. 1000 tests (42 new); matrix 16+52+53 at 130/130 including two new cross-report read probes; no dormant rule activated |
| S-15 / S-16 | **Public records and inquiries as canonical items** | **DONE 2026-09-07.** Migration 0139: eight nullable columns on `report_item_bureau_values` (`filed_on`, `reference_number`, `court`, `liability_cents`, `asset_cents`, `exempt_cents`, `inquiry_date`, `inquiry_type`) — additive, same table, **no new policy or grant, so no new authorization surface**. ONE record is ONE item and ONE enquiry is ONE item, with `report_items.kind` keeping them apart; a test asserts no field label ("Court", "Liability", "Date of Inquiry") ever becomes an item. `filed_on` is deliberately not `open_date` — § 1681c(a)(1)'s ten years runs from the filing date, and a probe asserts a filing date never lands in `open_date`. Each bureau's own wording of a court is kept and marked as a difference rather than merged. **`inquiry_type` stays NULL = UNKNOWN**, never inferred from a subscriber name or recency, so Section J's hard-enquiry rule returns UNKNOWN rather than disputing a healthy file. Public-record and inquiry counts now participate in Import Quality — a shortfall is partial, never deleted. Preview grouped into Accounts / Public records / Inquiries, one row per item, and a record shows a record's fields rather than an empty tradeline. 1032 tests (31 new); matrix 16+52+53 at 135/135. **No legal rule activated** — the § 1681c(a)(1)–(3) rules and Section J remain off |
| R5 | **Result / outcome vocabulary** | **DONE 2026-09-07.** Migration 0140. **Closed a live defect:** `report_item_changes` labelled ANY account absent from a later import `deleted`, with no completeness check, no bureau-coverage check and matching by `account_ref` alone — and that value fed `report_facts`, the `outcomes.deleted_engine` KPI, the pivot, progress reports and the client's own summary. An import that failed to read an account told the client the bureau deleted it; a renamed furnisher did the same. Ten canonical outcomes replace Deleted/Updated/Verified, with `bureau_confirmed_deletion` (the result SAYS so) held apart from `no_longer_observed` (our reading of a complete report) — **never summed**, and enforced by database CHECKs: a `bureau_confirmed_deletion` cannot come from `reimport_comparison` and needs a note of provenance, and a `corrected` needs a reviewed source because a diff cannot establish intent. New append-only `dispute_item_outcomes` (no UPDATE/DELETE grant, no unique constraint — a revised review is a new row); view rewritten so an absence is `unable_to_compare` unless the later report graded complete; `newly_reported` added (the old view walked only the earlier report, so an appearing item was invisible). **Consequence stated honestly:** no report was backfilled by CR-14, so historical comparisons now yield `unable_to_compare` and `outcomes.no_longer_observed` reads zero across historical data — correct, because completeness was never measured. Legacy manual counts map at READ time to `legacy_reported_*` and are never upgraded; `outcomes.verified` relabelled to say it means the item came back unchanged, not that the reporting is accurate. Client-facing wording reworded across progress reports, SMS and affiliate summaries ("No longer observed on Experian in this report", not "Experian deleted the account"); hardcoded sample figures in the re-import cards now labelled Sample data. Per-item UI: Previous / Current / Observed / Outcome / Source / Reviewed by. 1046 tests (14 new); matrix phases 30 (rewritten) + 54 (new) at 105/105; full gate 866/866 (phases 1–54). `docs/creditops/OUTCOME_VOCABULARY.md` |
| S-17 | **SmartCredit HTML + PDF adapters** | **DONE 2026-09-07.** Two adapters, one canonical record — **the data model did not change**. `SmartCreditHtmlAdapter` wraps the existing parser; `SmartCreditPdfAdapter` reads page GEOMETRY (page/x/y/width per fragment plus filled rects), never a flattened text blob. Columns are attributed by the CENTRE of the bureau header the document prints, never by order; a band with no header or two keeps its values in `sourceColumns` unattributed. Rows ordered by `(page, y)` so an account whose fields end on one page and whose history begins on the next stays ONE item. Each of a block's three grids (fields / 2-year history / 7-year tally) votes only on its own columns — without that, month positions split the field columns and a header lands over the payment grid. Four cell states stay four (`NONE REPORTED` / `——` / blank / a reported `$0`), via a `classifyCell` shared by both adapters; both dash glyphs recognised. History stored as `YYYY-MM:status` with the year taken from the source's own `'25` markers (which stand in for January), so nothing is located by index — TransUnion's row starts in August and Experian's in September. Status stored as the PROVIDER'S CODE from its own legend, not the glyph; `status-6` is undeclared by that legend and stays undeclared rather than guessed as 180 days. **The PDF carries no marks and no legend** (verified against the real 36-page export: zero `OK`/`PP`/`RF` in the text layer). The colours are recoverable but NEITHER document declares a colour key — the status colours live in external stylesheets the saved page does not inline — so months are read and dated and each status is recorded `not_exposed_by_provider` with the observed fill attached. Never decoded. Acceptance test: one synthetic report defined once, rendered to BOTH formats, must normalise to equivalent canonical data — same accounts by the shared `normalizeAccountRef`, same attribution, same values, same reconciliation, same dated months; the single divergence asserted rather than smoothed over. Real consumer report NOT committed; fixtures fully synthetic and regenerable. **Found and fixed four live defects in the HTML path:** a missing history grid fell back to the FIRST grid (publishing one bureau's payment record under another's name); `class="month-label"` matched exactly while the real export writes `month-label text-center` on 696 of 706 cells; a blank badge dropped the month entirely; `——` was stored as a literal value so an all-blank account read as universally reported. 1060 tests (14 new). `docs/creditops/sources/SMARTCREDIT_ADAPTERS.md` |
| S-17b | **S-17 real-source validation + reconciliation windows** | **DONE 2026-09-07.** Migration 0141. Ran the adapter against a real 36-page SmartCredit PDF (local only; not committed). **PASS:** 46 blocks → 46 canonical items; **29 accounts span a page break and all stay single items**; per-bureau TU 42 / EX 42 / EQ 0 reconciles exactly against the summary's own stated totals (46 unique > 42 per bureau, which is why reconciliation is per bureau, never against a unique-account count); 0 unattributed or duplicate-header columns; account numbers 21 shared / 8 single / 17 varies-by-bureau with **0 values not verbatim in the source** — no hidden digit reconstructed; 1,152 dated history entries across 2022–2026 with no month out of range; 0 parse failures, 0 warnings. Equifax reports nothing in this file and is recorded as 1,012 `bureau_not_present` facts, never as a removal. **FIXED — reconciliation windows.** The summary states `Inquiries (2 Years)` per bureau; the listing states `We found 49 inquiries in the past 3 years` across all three. **Both parsers were comparing the first against a parse of the second** — 23 against a population of 49, a discrepancy manufactured purely out of differing periods. Every stated figure now carries metric · bureau · window · section · the source's own wording, and reconciles only like-for-like; a mismatch of scope keeps both numbers and grades nothing (`comparable = false`). The window is part of `check_key` because `report_reconciliation` is unique on (report, bureau, check_key) and two windows sharing a key would silently overwrite each other. 0141 teaches `create_credit_report` the same rule so the database and the application cannot disagree about one import, and a report where nothing was comparable grades `review_required`, never complete. Shortfall detection is preserved by the listing's own stated total, which IS like-for-like — an unread inquiry now grades **partial**, never 'absent'. **FIXED — fill provenance.** `filledRects` recorded nothing: it read the wrong `constructPath` argument (the interleaved command array, not the min/max box), ignored the transform stack so boxes landed off-position, and used `instanceof Float32Array` against a typed array built in pdf.js's own module realm. With CTM tracking and a realm-safe check, 15,523 rects extract and all 1,152 months carry their own cell's observed fill (tightest containing box, never a page-level container). **Wording corrected** throughout: the PDF *does* render the marks visually; what it lacks is a machine-readable status label and an authoritative embedded colour-to-status key. Behaviour unchanged — month/year preserved, fill provenance preserved, status UNKNOWN / NOT_EXPOSED, delinquency never inferred from colour. 1065 tests; matrix phase 53 at 108/108 (6 new probes). `docs/creditops/sources/SMARTCREDIT_ADAPTERS.md` |
| AGENCY-HQ | **BES Agency Team Operating Workspace** | **BUILT 2026-09-07, LIVE PENDING ONE DASHBOARD STEP.** Audited the "done" work engine as a BES staff member and found a structural blocker: `workspaces.organization_id` was NOT NULL and the consistency trigger required `scope='ORGANIZATION'`, so BES HQ had nowhere to put a task that is not about a customer — and inventing an Organization would have put internal work inside the tenant boundary. A workspace now belongs to exactly one of an organization or an agency, and the whole existing engine works for both. No second task engine. **Added:** checklist and blockers (neither existed), inheriting the task's own authorization through one shared expression; three views over one filter module so My Work, Team Work and the manager's view cannot disagree; a task drawer reusing the canonical activity timeline; list rename/archive/safe-delete that refuses to destroy work; agency partners with a portal and NO tenant (a `partner_contacts` row is the boundary, name+email the only required fields); a personal Home replacing a dashboard of hardcoded figures shown to everyone as real; the U.S. federal holiday calendar computed from the statute with observed dates per 5 U.S.C. 6103(b), resolving in America/New_York so a Manila morning cannot end a U.S. holiday early; idempotent holiday announcements; EOD that builds itself and reports files worked AND actions completed as two numbers that are never summed; auto-submission that names nobody and says so. **Security:** staff navigation and route authorization now read ONE authority — a test asserts that for every role, everything shown opens and everything hidden is refused when typed as a URL. Full matrix **907/907** across 55 phases (new phase 55, 112 checks). **Bugs the matrix caught before the team would have:** `announcements` has no INSERT policy so the holiday publisher would have failed silently forever; no workspace created through the app has ever had a status, so the first task into one always failed; `workspace_reach` could not see an agency workspace at all; my own policy rewrite dropped two branches off `workspaces_select`; and a DEFINER function called an RLS-dependent helper. **Remaining:** Vercel GitHub connection is Dee's dashboard step — CLI deploys are refused because the commit author is not a team member. Live at https://bes-full-suite.vercel.app on the first deployment; one commit behind until connected. Invite email path verified deployed and configured but end-to-end receipt needs Dee to send one |
| COMMS | **Canonical Communication system** | **DONE 2026-09-08.** Migrations 0192–0195. Dee's 46-section spec. **One conversation record, many authorized surfaces** — the agency inbox, the partner portal and the organization workspace read the SAME `channels` row; nothing is copied, mirrored or synced, and the one-owner CHECK makes a second copy unrepresentable. **What 0190/0191 got wrong and this fixes:** a partner conversation was visible to ANY agent who could see the partner, so a GHL implementer on a partner's CRM engagement could read that partner's CreditOps processing notes; an agency channel was `member OR is_admin_of`, silently making every administrator a participant; and membership could only name a PERSON. Now: `channel_member_of()` accepts a USER **or a TEAM**, so joining and leaving the team is the only edit anybody makes (§12, §32); `open_to_scope` is a *deliberate* all-hands flag, false by default, because "everyone" as the accident of an empty member list is the shortcut §15 forbids; `partner_service_id` scopes a conversation to ONE engagement, visible to whoever is assigned to that service or to the whole account and to nobody else (§19); and `channel_auditable()` separates administrative inspection from participation — an admin may READ a non-direct conversation with `communication.audit`, is shown it under **Administration** with no composer, and **cannot post**, because writing still asks `channel_visible` (§17). Direct messages are excluded from audit entirely. **§10 gap closed:** `channel_shared_with_bes` called `in_scope(..., NULL, ...)` with no team, so a team lead or agent could never see a channel their customer had shared with BES specifically so they could work in it — only owners, admins and division-scoped managers got in. `fulfillment_engagements.authorized_team_id` (a uuid, never the legacy `authorized_team` **text**, which rule 4 forbids authorizing on) now names the BES team staffing the engagement, and access follows team membership. The customer still controls whether BES is in at all; BES controls which of its people. **Also:** per-user `channel_reads` + `mark_channel_read()` (§21) — `channel_members.last_read_at` dropped rather than left beside it, because somebody reaching a conversation through a team has no membership row; `visible_channels()` returns the whole left rail *with unread counts* in ONE call (rule 14); `open_direct_channel()` finds-or-creates the ONE DM per pair whoever starts it (§13); `search_messages()` is SECURITY INVOKER narrowed to `channel_visible`, so it can only ever return less than the conversation list (§24); audit triggers on channels, members, teams and shares — and deliberately **not** on messages (§36). **SECURITY FIX found on the way:** `is_staff_of`, `is_manager_of` and `is_admin_of` never read `agency_memberships.status`, added in 0169. Deactivating somebody did nothing at all — they kept work, clients, partners, finance, everything. All three now require `status = 'active'` (§33). All nine live memberships are active, so nobody lost access; what changed is that deactivation now means something. **Verified:** matrix phase 60 rewritten as Dee's own test matrix A–I, **147/147** against the live database, plus full-matrix re-run because `is_staff_of` touches every policy. Every audit trigger exercised live. 1226 tests; tsc, eslint (0 errors) and build clean. **Remaining:** Test J (Preview As) needs the View As feature, which does not exist yet; message attachments (§23) reuse the canonical file system but are not wired to the composer; a BES agent ↔ partner *contact* one-to-one (§14) is not built — `open_direct_channel` is staff-to-staff, and partner conversations are partner-level |
| UI | **Canonical module rail** | **DONE 2026-09-07.** Dee's screenshot: the CreditOps secondary rail collapsed to a thin strip still rendering its full text — a paragraph wrapped one character per line, a crushed badge, no visible way out. `ModuleRail` makes both mistakes unrepresentable: collapsed is a **different layout** (56px icon rail with tooltips), not a narrower one, so there is no width at which a sentence can wrap; and the toggle sits above everything that gets hidden, in both states. ONE shell for every module — CreditOps and FundingOps keep their own trees, `OpsTreeHeader` deleted rather than left beside its replacement. FundingOps could not be collapsed at all before. Explanatory paragraphs moved out of both rails into their page headers (§8). Mobile gets a drawer, not a permanent strip (§15). The preference is per module and cannot trap anybody: exactly one stored value means collapsed, so "", "0", "30px" and a private window all fall back to expanded (§11, §12). Collapsed and expanded render from the same authorized list (§26, §28). Verified live at 1440/1024/375. Also fixed: `Login` called `useState` after an early return |
| COMMS-2 | **Communication as the team's primary space** | **DONE 2026-09-08.** Migrations 0197–0206, against Dee's 95-section spec. **§1 root cause — the create-channel RLS failure.** Not RLS. My own 0194 audit triggers were `security invoker`, and `log_audit` is granted to `postgres` and `service_role` only (all 53 other callers are DEFINER). The trigger raised `42501: permission denied for function log_audit`, which aborted the INSERT and surfaced as "new row violates row-level security policy". Fixed in 0196 by making the four triggers DEFINER. **No policy was weakened anywhere in this work** — 0192 tightened them. The 0194 verification missed it because the probe ran as the superuser, which holds EXECUTE; every write probe now runs `set local role authenticated`. Same failure shape as 0174, and it recurred a third time in 0206. **§2 the deadlock, closed before it bit:** creating a channel then joining it are two writes whose policies deadlock for anybody who is not already an administrator — an `agency_manager` granted the capability would create a channel they could not manage. `create_agency_channel()` does both in one transaction, resolves the agency from the caller's own active membership (there is no agency argument to pass), and checks `communication.channels.create` first. **§5–§8 default channels:** General Discussion and Announcements and Updates, idempotent on a permanent `system_key` rather than a name, adopting an equivalent unkeyed channel rather than standing a duplicate beside it, never merging two that both hold messages. Both are AGENCY_ALL via `open_to_scope`, which resolves through `is_staff_of` and therefore membership *status* — future staff inherit them, suspended staff lose them the same second, and there is no per-employee membership row to tidy. Neither can be archived. **§10–§15 announcements:** a published BES announcement posts ONE card carrying `announcement_id` and no content — `body_text` is the literal word "Announcement". That single decision satisfies §12 (nothing to edit independently; an edit is already reflected) and §15 (message search holds no announcement words, and the card's title and body come from a join `announcements_select` filters, so an unauthorized reader gets an unavailable card rather than a redacted one). **§18–§34 rich messaging:** threads one level deep on the canonical message model, reactions whose primary key IS the rule, pins that store no copy, attachments on the canonical `files` table and private bucket, tombstones that keep thread shape with the body withheld by the SERVER, idempotent send on a client key, an Undo window that does not delay the send. **§30 (permanent) proved from every chair:** author yes; another agent, the admin and the owner all refused, through the function AND through a direct table UPDATE. **§35–§40 the guard:** deterministic, in-database, no network call in the send path; word-boundary matching so "class" and "Scunthorpe" send; every §36 example of normal direct business language passes; external partner and organization messages are never refused; an agent cannot disable their own or delete the terms. The default list deliberately ships no slurs — that is Dee's policy call, and Settings → Communication treats an added term identically. **§41–§45 performance:** measured, not guessed. The first Supabase call of a session costs 850–1170ms (cold start) and later calls 250–280ms; the old send waited for an insert plus a full message refetch before a character appeared. Now the message renders synchronously and only the one row is reconciled. **§56–§68 meetings:** the model is complete and both providers read NOT CONNECTED, because BES has no OAuth credentials yet (rule 19). There is no `start_url` column anywhere in the schema and `agency_meeting_credentials` grants `authenticated` nothing. **Three security findings closed on the way:** `is_staff_of`/`is_manager_of`/`is_admin_of` never read `agency_memberships.status`, so deactivating somebody did nothing at all (0192); the storage policy let any BES staff member fetch any `agency/` object, which would have defeated §26 — narrowed in place rather than joined by a second policy, because permissive policies are OR-ed (0203); and `agency_meeting_credentials` held a SELECT grant to `authenticated` from Supabase's default privileges that `revoke ... from public, anon` does not touch (0204). A fourth, `notify_message_mentions`, would have refused any message containing an @ in a BES or partner channel — an inner join to `organizations` left `notifications.agency_id` null (0206). **Verified:** phase 60 (access, Dee's tests A–I) 147/147 and phase 61 (messaging, guard, announcements, defaults) 135/135 against the live database, and a clean full matrix at **1136/1136** (phases 1–61). 1234 tests; tsc, eslint (0 errors) and build clean. Deployed: `8e441a0` at https://bes-full-suite.vercel.app, confirmed by the live chunks carrying the new code. **Remaining:** an @-mention autocomplete in the composer (the notifier is fixed and correct, but the composer emits plain text so no mention marks are produced yet); realtime delivery of other people's messages (the list refetches on its own schedule); Google/Zoom OAuth and the Edge Function that calls them; message editing UI; Test J (View As) needs the View As feature |
| CR-13 | **SmartCredit source mapping + completeness contract** | **SPEC DONE 2026-09-07.** `docs/creditops/sources/SMARTCREDIT_SOURCE_MAPPING.md` + a synthetic structural fixture. All 22 tradeline fields mapped: **16 canonical, 1 needing a shape change, 6 with no canonical destination**. The real sample was read privately and is **not in the repository** — it is a named consumer's report, and the stack doctrine is "synthetic fixtures only". Key findings: attribution is **declared by the source** (bureau named per column in a CSS class, invariant across 94 header groups), so it is proven rather than inferred — but labels and values are not adjacent, and a first naive adjacency parse recovered 6 of 22 fields. **No DOFD exists in this format at all** → `NOT_EXPOSED_BY_PROVIDER`, which is a statement about SmartCredit and **not** evidence a bureau omitted it. **No score model is named** → `UNKNOWN`, never guessed. `NONE REPORTED` is an explicit marker, distinct from a blank. Parser is **not built** |
| CR-15 | **SmartCredit mapper** | **DONE 2026-09-07.** Migrations 0136 (the six columns) + 0137 (the writer carries them). `smartcredit-html-parser.ts` reads the CSS grid by `(row-start, col-start)` and takes each column's bureau from that section's **own declared header class** — the fixture contains a block whose header order is *reversed*, so a positional parser labels it backwards and fails. **ONE tradeline = ONE report_item**: "Last Verified", "Dispute Status" and the rest are fields, and a test asserts no field label is ever emitted as an item. Payment history and the seven-year 30/60/90 tally hang off the same bureau observation, dated, with a gap staying absent rather than shifting the months. `account-heading.ts` decides what a heading may claim — shared suffix / single bureau / "varies by bureau" / "not shown" — comparing visible **digits** so `****0002` and `XXXX0002` are one number, and refusing to reconstruct a longer number from two partials. Matching uses creditor + suffix + type + open date, never the number alone, and withholds the suffix when the bureaus disagree about it. Import preview is **one row per account**, expandable to the 23-row bureau comparison. 920 tests (51 new); matrix 16+52 at 105/105 |
| CR-14 | Report completeness manifest (8 states) + summary reconciliation | **DONE 2026-09-07.** Migration 0138: `report_completeness`, `report_reconciliation`, `report_partial_acceptances`, `credit_reports.import_quality`, and `report_analysis_complete()`. **The verdict is derived in SQL, never sent by the client** — a parse that read 24 of 30 accounts cannot claim a complete import. Three verdicts, and the distinction earns its keep: `partial` when a check was made and the counts disagree, `review_required` when a check could not be made at all or a section is missing, because "we could not verify" is a worse position than "we are six short". **A data-integrity guardrail, not an operator gate**: the accounts that parsed are workable, and the ones that did not are never treated as deleted, absent or non-reporting — the panel says so in words. An authorised acceptance records a decision and changes **no** fact: the verdict stays partial and `report_analysis_complete()` stays false. Import Quality panel shows source expected / parsed / difference / reason per bureau, including the checks that passed. HTML import wired so the manifest has a producer. 958 tests (31 new); matrix phase 53 at 23/23; full gate green. Old note: (schema S-13, S-14). The manifest is what makes every other field honest: `PARSE_FAILED`, `BLANK_IN_SOURCE` and `NOT_EXPOSED_BY_PROVIDER` are three different failures with three different owners, and none may be upgraded by absence. Reconciliation holds a report at `REVIEW_REQUIRED` rather than publishing 24 of 30 tradelines — the format-drift failure mode, which is invisible downstream because a missing tradeline looks like an account the consumer does not have |
| CR-4a | **L-01 only** — the "Required" claim removed, four operator states added, `evaluateTruthGate`'s conflation of "does not recognize" with an identity-theft claim fixed, and the enclosure invariant enforced | **DONE 2026-09-07.** `requiresFTC()` deleted rather than renamed so no code can answer that question from an account; the identity-theft route is reached only from a recorded consumer statement, named `consumer_reports_identity_theft` so it never reads as verified. No BES rule blocks for a missing document. 27 new tests; 827 passing; no schema, no migration, no matrix |
| CR-4b | L-02/L-03/L-04/L-05; `rounds-and-layers.ts` retired; composer wording; V1 renames | **DONE 2026-09-07.** TRAP retired — `DISPUTE_CHANNELS` are context, a round may be just *fact → recipient → dispute → result*, and `TrapStrategyPanel` became `DisputeChannelsPanel`. All 18 § 1681s-2(b) references classified rather than swept: 8 kept as legitimate CRA-forwarded usage (including 5 that warn against the very misuse), 7 deleted with the engine, and **2 removed from `escalation-ladder.ts` itself — rounds 3 and 8 carried the same error the "correct" engine was supposed to be free of**. No replacement statutory promise added. MOV renamed to "Reinvestigation procedure request" everywhere, and `knowledge/qa-entries.ts` had cited **FCRA § 609** for it — corrected to § 611(a)(7). `rounds-and-layers.ts` and its test deleted after proving no product caller remained; `RoundEscalationPanel` rewritten to show what a round rests on instead of "Layer 4 active", with every round still selectable. Composer opening fixed. 837 tests (18 new), no schema, no matrix |
| CR-12 | `organization_dispute_sop` — per-organization requirements, all defaulting off (gap G-13, schema S-9) | **PROPOSAL** — nothing depends on it; CR-4a ships without it |
| CR-5 | Finding taxonomy, evidence strength, confidence axes as domain types | **READY — no schema needed** |
| CR-6 | Truth gate, party routing, `DISPUTE_ORIGIN` threading | **READY — no schema needed** |
| CR-7 | Section A reconciliation against the new taxonomy | Pending CR-5 |
| CR-8 | Inquiry rewrite · DOFD/re-aging · reinsertion · forensic review | Pending CR-2/CR-3 |
| CR-9 | `BES-CRA-*` catalogue expansion | **Last.** Not gated on the missing legacy catalogue |
| CR-10 | Primary-source verification pass | **Counsel** — §1681s-2(a)(8)/Reg V §1022.43 first |
| CR-11 | CDIA/CRRG licence review | **External** — gates `metro2-status-rules` extension and all of V2 |

## Competitor research (Dee, 2026-09-07) — reconciled, deltas awaiting approval

Committed verbatim on receipt at `docs/research/BES_CRM_Research_and_Implementation_Framework.md`;
reconciled against the actual repository at `docs/research/RESEARCH_RECONCILIATION_2026-09-07.md`.

The research was written without sight of this repository and says so. Most of
what it recommends is already built: 33 items reconcile as ALREADY IMPLEMENTED,
6 as PARTIALLY IMPLEMENTED. Four recommendations conflict with locked doctrine
and are rejected with reasons (Next.js; a reseller tenancy tier; a `tenants`
table beside `organizations`; a monorepo restructure). One — the Sender
anti-spam warning — does not apply, and is redirected to Resend as blocker A10.

**Nine genuine gaps, recorded as PROPOSALS. None is approved work yet.**

| # | Delta | Status | Note |
|---|---|---|---|
| R1 | Per-bureau report observations | **PROPOSAL — highest priority** | Same gap as `ENGINE_INVENTORY.md` §5, independently confirmed. Unblocks `BUREAU.VALUE_DIFFERS`, six cross-bureau conditions, and `detectConditions`, which has no product caller at all. Canonical-model change |
| R2 | Transactional outbox | **PROPOSAL** | `ghl_events` is already a proper inbound ledger; the outbound half is not committed in the business transaction |
| R3 | Document checksum, scan state, retention, legal hold | **PROPOSAL** | Dee's approved 7-year retention (2026-09-06) has nothing in the schema enforcing it |
| R4 | Work-item `blocked_reason` + dependencies | **PROPOSAL** | No new statuses — one engine (rule 17) |
| R5 | Comparison outcome vocabulary | **DONE 2026-09-07** — see §5 | Was: "Bureau-confirmed deletion" and "no longer observed" collapsed into one `deleted` count shown to clients |
| R6 | Agreements, signatures, billing eligibility | **PROPOSAL** | CROA service-start and cancellation gating. Needs Dee's rules and counsel review — never AI-generated |
| R7 | Offer revisions | **PROPOSAL** | Mirror `funding_applications`, which is already versioned |
| R8 | Time-limited HQ support access grants | **PROPOSAL — highest risk** | Creates a new path to customer data; must be customer-granted, time-boxed and audited. Written proposal before any migration |
| R9 | Metering beyond AI (postage, pages, storage) | **PROPOSAL** | Generalise the existing ledger; do not add a second one |

## Verification strategy (2026-09-07)

**During development:** targeted unit tests → the affected matrix phases
(`node supabase/scripts/rls-matrix.mjs --phases=45,46,47`) → tsc/lint/build.

**At a milestone:** one full gate (`--phase=47`), ~11 minutes.

`--serial` disables batching and is how the batched path is proven equivalent.

## Working order (priority: security → data integrity → authorization → business logic → approved requirements → performance → maintainability → UX)

1. ~~FundingOps A / B / C~~ — **done 2026-09-06**
2. **Seat doctrine** (§24) — authorization-adjacent, currently unencoded
5. ~~Client-level documents~~ — **done 2026-09-07**
6. **Metro 2 Sections B–P** — **BLOCKED, SOURCE NOT YET RECONCILED.** No rules to be written until Dee supplies the catalogue document (see the row in §5 and `src/lib/dispute/ENGINE_INVENTORY.md`). Wiring Section A into the detector is *not* blocked and can proceed separately
7. **Lender portal** (tenancy change — proposal first)
8. ~~DIY Referrals~~ — **done 2026-09-07**
9. **Authorize.Net** (build against sandbox; go-live blocked on A3)
10. **Hub Operations / Hub Performance packages**
11. **Reporting drill-through**
12. **Goals / Notes / Tags on the canonical client**
13. **Mobile pass 2**, final UX consistency
14. ~~Positions as first-class records~~ — **done 2026-09-08.** Migrations 0209 (`divisions.parent_division_id`/`tier`, `positions`, dated `position_assignments` with `kind` in (`holder`, `acting`), `agency_positions()`, `manager_of()`) and 0210 (the 21 BES seats). Seat-to-seat reporting through `reports_to_position_id`, so a promotion does not redraw the chart; assignments are ENDED and never deleted, which is how "who held this in March" keeps its answer when somebody moves in April. State (`filled` / `covered` / `vacant`) is derived. No authorization helper reads any of it. `org-chart.ts` + 14 tests. **19 of the 21 seats are vacant** and each is tagged `INVITE EMAIL REQUIRED` — B6 in `WHAT_I_NEED_FROM_DEE.md`.
15. **Communication follow-ons** — @-mention autocomplete **done**; realtime delivery **done** (0217: publication, `channel_message_by_id()`, dedupe on `client_message_id` so an optimistic send is replaced rather than doubled, one refetch on reconnect); message editing with history **done** (0217 `message_revisions` + trigger). **Remaining and blocked on credentials only:** Google Meet (A5) and Zoom (A6) OAuth plus the Edge Function behind the meeting model — both providers read NOT CONNECTED rather than faking a connection.

---

## 2026-09-08 — operational notifications, View As, and two honesty passes

| # | What | State |
|---|---|---|
| N-1 | **View As User + Access Inspector** | **DONE.** 0215/0216 and `use-access-context.ts`. `auth.uid()` never changes — the preview is built from FACTS ABOUT the target read through `*_for_user` functions only a privileged caller may call, so it is not impersonation and grants no row, write or reach the previewer lacks. Preview is an explicitly granted capability, not a role: 0216 requires an `agency_member_permissions` row, because `agency_can` answers yes to every admin by role and would have handed every administrator the ability to look through a colleague's eyes with nobody granting it. The menu (Sidebar) and the door (RequireAgencyRoute) now read ONE context, so a preview cannot show a link its own guard would refuse. Matrix phase 63, 115/115. |
| N-2 | **Operational notifications** (Dee §14/§59) | **DONE.** 0218. Four of the six were missing and one was written unreadable: `notify_message_mentions` (0206) stamped every channel mention `organization_internal`, and `can_view_activity(agency, NULL, 'organization_internal', 'channel')` is FALSE for BES staff — so every @ in #general inserted a row nobody could read, with no error anywhere. `channel_notice()` now resolves a conversation's visibility from its owner, once, for every notification about it. Added: direct messages (told once as a mention if also mentioned, never twice); handoffs (the client's agent, the client's team leads, and the leads of the teams attached to the DESTINATION department, found through `departments.key` — the seeded key, because the NAME has already drifted, "Complaints & Mailing" still keying as `complaints`); moving INTO Attention reported as `attention` and reaching somebody who can unblock it; and announcements ringing the bell, which is what Dee reported missing. Announcement targeting is MIRRORED not ignored — `announcement_notifiable()` applies 0128's `managers_only` / department / team narrowing to the named recipient, so a staffing note is not fanned out to every agent and then hidden at read time. 29 probes in a rolled-back transaction before the push; matrix phase 64, 33/33. |
| N-3 | **Dishonest controls removed** | **DONE.** Settings → Portals showed five switches with `onChange={() => {}}`, three "on" and one "off", against no per-portal enable model anywhere in the schema — it claimed the Outsourcing portal was switched ON when that portal does not exist. Settings → Workflow rules showed six switches all "on", four of which describe something the platform does and two of which describe nothing. Both are now statements of fact: the route and whether it is open; the rule and where it lives. `PlaceholderNote` gained a `detail` prop so the Fulfillment and Templates catalogues can say which part of them IS real (the letter library) instead of implying all of it is. |
| N-4 | **ClickUp partner adapter** | **DONE as far as it can go without Dee.** `src/lib/migration/clickup-partners.ts` + 22 tests: the lifecycle/service split, the field mapping, the credential guard and the identity reconciliation of `PARTNER_DATA_MIGRATION.md`. Pure — it proposes and writes nothing. **BLOCKED on B5**, the March 2026 revenue tracker: it is authoritative for everything commercial and ClickUp's MRR field is mostly empty, so a dry run without it would propose terms from the losing source. 23 partners would be created, 2 reconciled. |
| N-5 | 🔴 **Plaintext credentials in ClickUp** | **REPORTED, action is Dee's.** Several Partners Database descriptions are access lists holding passwords in plain text — DisputeFox, LetterStream, Gmail, GoHighLevel, Zapier, Credit Repair Cloud — including shared BES team logins. Nothing was copied anywhere; `scrubCredentials` makes it impossible for the importer to. Item 0.1 in `WHAT_I_NEED_FROM_DEE.md`. |
| N-6 | **Conversations in the global search** | **DONE.** The field claimed to cover "everything the organization holds" and searched no messages. Messages go through `search_messages` (INVOKER, narrowed to `channel_visible`), unfiltered on the client because there is nothing to filter, debounced through `useDebounced` so a run of keystrokes is one request. |
| N-7 | **Role persona invariants** (§21/§82) | **DONE.** `navigation.test.ts` gained seven tests that walk `AGENCY_ROUTES` × every role instead of hand-written lists, so a route added later is covered the moment it exists: the menu opens what it shows, refuses what it does not, never opens an unfinished page even for the owner, gives a signed-out person nothing, is monotonic in rank, still withholds a permission-gated route from an owner lacking the permission, and holds no route nobody can reach. |
| N-8 | **Route + dead-action audit** (§20/§78–§79) | **DONE.** 80 distinct internal destinations, 0 dead (`/auth/callback${search}${hash}` is a normaliser artefact, and that route exists). 75 routes, 53 sidebar links, none orphaned, no route element unimported. No `href="#"`, no TODO/FIXME, and the only remaining `onChange={() => {}}` are honest ones: a checkbox inside a label that handles the click, and toggles marked `unbuilt` / `enforced`. |

### Considered and deliberately not done, 2026-09-08

**A money strip on the Owner Home.** §68–§75 asks for "Owner Home / Attention
Centre / simple Finance". Finance itself is complete (`/app/finance`: fixed
MRR, variable recurring, expected, invoiced, collected, outstanding, overdue,
expenses, net cash, per month, behind `finance.dashboard.view`), and the money
that needs *action* — overdue invoices — is already on the Owner Home through
the Attention Centre, permission-gated the same way.

Adding a second figure there would mean calling `useFinancialInputs` (four
parallel queries) on the busiest page in the product, beside the
`useOverdueInvoices` call the Attention Centre already makes — two overlapping
fetches of the same invoices, which is the exact duplicate-request shape rule
14 forbids. Collapsing both onto one hook is the correct version of the change
and is a refactor of a live surface for a cosmetic gain. Recorded as a
decision rather than left looking like an oversight; say the word and it gets
the one-hook treatment.

### Left for a deliberate pass: dead members in `agency-context`

Archiving `/app/fulfillment` left four members of `src/lib/agency-context.tsx`
with no consumer outside `src/_archive/`:

- `workOrders` — derived from `workItems`, which is `useState<WorkItem[]>([])`
  and is never populated, and whose mapping sets every order's organization to
  `organizations[0]`
- `updateWorkOrderStatus`
- `addWorkOrder`
- the `FulfillmentWorkOrder` type, imported now only by the two archived files

Removing them also removes the last two writers of `setWorkItems`, which turns
`workItems` into a constant and makes `agencyWork` / `activeOrgWork`
provably empty — and those two ARE still consumed, by the not-signed-in demo
branches of `use-work.ts` and by `Dashboard.tsx`. So the change has a ripple
into a live code path.

Not done tonight on purpose. It is housekeeping with no user-visible effect,
in a context file every screen reads, and it wants the ripple in view rather
than a late-night edit. Named here so it is a decision rather than a thing
nobody noticed.
