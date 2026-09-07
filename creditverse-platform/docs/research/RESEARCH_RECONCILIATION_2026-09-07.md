# Research reconciliation — 2026-09-07

Reconciles `BES_CRM_Research_and_Implementation_Framework.md` (Dee, 2026-09-07)
against the repository as it actually stands: **142 migrations, ~120 tables**,
a React/Vite application, and the doctrine locked in `CLAUDE.md`.

**Nothing was changed to produce this document.** No schema, no application
behaviour, no migration. Every row below was read out of the file it names.

> **The research was written without sight of this repository.** It says so
> itself: *"no BES repository was supplied or tested in this research
> session."* Read as a specification for a greenfield build it is excellent.
> Read as a description of what BES lacks it is wrong in most rows — a large
> majority of what it recommends is already built and tested. Its real value
> is a short list of genuine gaps and a set of accuracy doctrines, and both
> are isolated below.

**Dee's locked decisions of 2026-09-07 are treated as binding**, and this
document does not relitigate them. One of them repeats a factual error from
the research and is corrected in §6.

---

## 1. Terminology: research word → what BES actually calls it

The research uses a vocabulary from a platform that does not exist here. Every
term below already has an owner, and **no new table is warranted for any of
them**.

| Research term | BES canonical entity | Notes |
|---|---|---|
| `tenant` / `tenant_id` | **`organizations.id` / `organization_id`** | The tenant boundary, unchanged. A separate `tenants` table would be a second answer to "whose record is this" (rule 2). |
| — *(no equivalent in the research)* | **`outsourcing_groups`** | **The research misses BES's second tenancy entirely.** Rule 16 model 3 — a BES fulfilment partner with no SaaS subscription. Every scoped table carries `organization_id` XOR `outsourcing_group_id` with a generated `partner_scope_id`. A design that assumes one tenancy would break model 3. |
| `platform operator` | **`agencies` + `agency_memberships`** | One agency row, and meant to be one. `is_staff_of(agency)` is a safety net, not a reseller feature. |
| `reseller organization` | **Does not exist, deliberately** | See §5 — conflicts with rule 16. |
| `documents` / `document_versions` | **`files`** (canonical) + private `bes-files` bucket, plus `document_requests`, `document_instances`, `document_flags` | One `files` table with `entity_type`/`entity_id`; storage policies separate from row policies. |
| `tasks` / `projects` | **`work_items`** (the one engine) + `workspaces`, `workspace_boards`, `workspace_item_types`, `workspace_statuses`, `workspace_fields`, `work_item_field_values` | Rule 17: one engine underneath, customization as data. `work_scope` is AGENCY or ORGANIZATION; `work_related_type` is credit_case, funding_deal, project, support, fulfillment. |
| `funding case` | **Three records, not one:** `funding_files` (the file), `funding_applications` (**already versioned**, `unique (file_id, version)`), `funding_deals` (the decision) | The research collapses these. BES separates them on purpose: a file is the engagement, an application is a versioned submission-ready statement, a deal is a decision. |
| `clients` | **`clients`** (canonical person) + `fulfillment_clients` (the credit case) + `funding_clients` (the funding party) | Rule: one Client identity, many service records. |
| `business_entities` | **`businesses`** + `funding_businesses` | |
| `offers` / `offer_versions` | **`offers`** | Versioning is a gap — see §4.7. |
| `commission_rules` / `commission_ledger` | **`commission_plans`** + `commissions` | Computed by the database (C6). |
| `tenant_entitlements` | **`product_entitlements`** + `plans` + `plan_addons` + `organization_subscriptions` + `organization_trials` + `hub_modules` + `organization_hub_modules` | Three-layer gate (rule 18): entitled AND organization-enabled AND user-authorized. |
| `submission_access_grants` | **`lender_file_shares`** (+ `lender_users`, `record_grants`) | Grant per lender per file, revocable. |
| `program_policy_versions` | **`lender_policy_versions`** | Already versioned. |
| `inbound_events` | **`ghl_events`** | Already has the idempotency key the research asks for: `unique (location_id, event_type, external_id)` plus `processed_at`/`outcome`. |
| `audit_events` | **`activity_events`** (append-only, trigger-written) + `audit_log` | No delete policy; history cannot be skipped by a client. |
| `usage_events` | **`ai_usage_events`**, `production_logs`, `time_entries` | Metering beyond AI is a gap — see §4.9. |
| `support_access_grants` | **`fulfillment_engagements`** + `in_scope()` | Structurally stronger than the research's proposal *except* for time-limited HQ support access — see §4.8. |

---

## 2. ALREADY IMPLEMENTED

Each row was verified against the file named. These need **no work**.

| Research recommendation | Where it already lives |
|---|---|
| Multi-tenant isolation enforced in data, not UI | RLS on every table; `is_org_member`, `member_can`, `can_view_org`, `entity_visible` — 793-check RLS matrix, 51 phases |
| "Two test tenants cannot read/write each other's data through APIs or Storage" (Phase 1 gate) | This is exactly what the RLS matrix asserts, and it has caught four real cross-tenant leaks |
| Secret keys never reach the browser | `ai-gateway` and every Edge Function; migration 0126 revoked PUBLIC execute on all DEFINER functions |
| Composite tenant-aware references | `partner_scope_id` generated column; `clients_mode_scope_ck`; per-table scope constraints |
| Product entitlements checked server-side | `product_entitlements`, `org_entitled()`, enforced in the database writer (rule 18) |
| Immutable report snapshots | `credit_reports` + `report_items`, grant is `select, insert` only — "no update, no delete: history is append-only" |
| Separate stable account entity from observation | `report_items.account_ref` matches a tradeline across imports |
| Findings carry rule id, version, catalogue version, evidence, route, remedy | `report_findings` — exactly these columns, plus `raw_metro2_verified boolean check (= false)` |
| A finding requires human disposition before action | `report_findings.human_disposition` (confirmed / dismissed / needs_evidence / escalated) + `SavedFindingsList` |
| Approval binds exact content | `approve_dispute_letter()` QA gate; `dispute_attestations` never editable (no update grant) |
| Generated / approved / accepted / mailed / delivered are separate states | `dispute_letters.status` + `letter_mailings` reserve-then-reconcile; a TEST Lob key deliberately does not start statutory clocks |
| Each recipient dispute has its own status | `dispute_letters.recipient_kind`, per-letter `dispute_timers` (4 per mailing) |
| Deadline engine driven by a trigger event | `dispute_timers` started by `mark_letter_mailed()`, not by building a PDF |
| Escalation is earned, not automatic | `escalation-ladder.ts` — `roundAvailability()` per entry requirement; regulator channels recommend-and-explain only, never filed by the system |
| "Unknown never becomes pass/violation" | `metro2/types.ts` `Evaluability`; `runRule()` is the single producer of UNKNOWN; 38 guardrail tests assert it |
| Missing data stays unknown, never zero | `condition-detector` and `metro2/tradeline-input` — every reader returns `undefined` for absent, never 0 |
| A missing bureau cannot create deletions | `BUREAU.MISSING_ON_ONE` classified `observed_difference`, explicitly *not* proof of unverifiability; `deleted_from_other_bureaus` is APPARENT |
| Breach exposure alone never establishes identity theft | `evaluateBreachGuardrail()` + tests added today |
| Metro 2 fields not inferred from a consumer PDF | `rawMetro2Verified: false` on every finding; `resolveStatusCode()` displayed-vs-inferred gate |
| Factor rate is not APR | `offers.pricing_type` + `pricing_value` — "meaning follows pricing_type" |
| Lender sees only granted submissions | `lender_file_shares` (unique per lender per file, revocable) + `lender_users` + RLS |
| Lender policy is versioned | `lender_policy_versions` |
| Funding application is versioned | `funding_applications` `unique (file_id, version)` |
| One work engine for list/board/workload | `work_items` + workspace customization as rows (rule 17) |
| Production / EOD / reporting over the same records | `production_logs`, `eod_submissions`, `report_pivot()` |
| DIY is the same engine with different actors | `diy_journeys`, `diy_consents`, DIY entitlement — same `clients`, same reports, same findings |
| Three commercial ledgers kept separate | `organization_subscriptions` (SaaS) vs consumer service billing vs `payment_transactions`/`ai_credit_ledger` |
| Inbound event ledger with idempotency | `ghl_events` `unique (location_id, event_type, external_id)` |
| GHL is not the authorization source | `ghl_connections`/`ghl_agency_credentials` map to BES membership; every gate is a database policy |
| Money stored with fixed precision | `numeric(14,2)` throughout; cents columns on report items |
| Audit preserves actor, timestamp, tenant, record, before/after | `activity_events`, written by triggers |

---

## 3. PARTIALLY IMPLEMENTED

| Research recommendation | What exists | What is short |
|---|---|---|
| Consent / agreements / signatures with version and revocation | `diy_consents`, `dispute_attestations` | No general `agreements` + `agreement_signatures` + `billing_eligibility` triple. CROA service-start and cancellation gating is not encoded. See §4.6. |
| Report comparison outcome vocabulary | `client_round_outcomes` (deleted / updated / verified per bureau per round, `source = 'manual'`) + integrity-engine chronology | The five-label vocabulary is not modelled: "bureau-confirmed deletion" and "no longer observed" collapse into `deleted`, and `source` accepts only `'manual'`. See §4.5. |
| Task statuses that distinguish waiting | `work_stage` has `Blocked` | No `blocked_reason` code and no `awaiting_external` / `awaiting_review` split; no `task_dependencies`. See §4.4. |
| Document integrity | `files` has path, mime, size, uploader | No checksum, no scan state, no classification, no retention or legal-hold columns. See §4.3. |
| Per-tenant metering | `ai_usage_events` (with a $100 cap and reserve-then-reconcile) | Postage, parsed/OCR pages, letter pages, storage and messaging are not metered. See §4.9. |
| Outbound integration reliability | `webhook_endpoints` + `webhook_deliveries` (status, message) | No transactional outbox committed in the same transaction as the business write. See §4.2. |

---

## 4. ADOPT AS DELTA

Nine items. Each is a genuine gap the research identified correctly.

### 4.1 Per-bureau report observations — **PRIORITY 1**

- **Current implementation.** `report_items` stores one `status`, one `balance_cents`, one `dofd`, one `open_date`, plus `bureaus text[]`. The PDF parser's `firstColumn()` reads tri-merge columns, computes a `differs` flag, keeps `columns[0]`, and discards the rest. `raw jsonb` is written as `null`.
- **Exact gap.** Which bureau reported which value is lost before storage. `BUREAU.VALUE_DIFFERS` is catalogued and unreachable; six of `condition-detector`'s cross-bureau conditions are unreachable; **`detectConditions` has no product caller at all** — 31 conditions and the whole reason-selection path behind an input nothing can build.
- **Smallest change.** Three steps, already written up in `src/lib/dispute/ENGINE_INVENTORY.md` §5: (1) `firstColumn()` returns the columns, paired to bureaus **only where a header names exactly as many bureaus as there are columns** — never by position; (2) one child table `report_item_bureau_values`, `unique (report_item_id, bureau)`, RLS inherited through `credit_report_visible`; (3) `RawReportItem` gains optional `records?: BureauRecord[]`, engines read it when present.
- **Security / data impact.** New table inherits the parent's tenancy and policy chain — no new permission surface. Append-only like its parent. The one risk is the pairing rule: attributing a column to a bureau by position would be inferring identity from layout (rule 4), and would produce false "Equifax says X" claims.
- **Test required.** Matrix phase 16 extended for the child table; parser fixtures with (a) a header naming three bureaus and three columns, (b) three columns and no header — must stay unattributed, (c) two columns and three named bureaus — must stay unattributed; plus the existing "never fabricate from one value and a list of bureau names" test.
- **Priority.** **Highest.** It is the single largest piece of unreachable CreditOps logic, and it is a prerequisite for most of what the research wants from the import pipeline. Canonical-model change — proposal first.

### 4.2 Transactional outbox — **PRIORITY 2**

- **Current implementation.** `webhook_deliveries` records outbound attempts with a status. `ghl_events` is a proper inbound ledger with an idempotency key.
- **Exact gap.** No outbox committed in the *same transaction* as the business write. A crash between "letter marked mailed" and "webhook queued" silently loses the notification; there is no reconciliation job for stale pending actions.
- **Smallest change.** One `outbox_events` table (tenant, aggregate type/id, event type, payload, `available_at`, attempts, `published_at`), written by the same functions that already write `activity_events`, drained by one Edge Function. Reuse the trigger sites — do not add a second event vocabulary.
- **Security / data impact.** Payload must carry ids and revisions only, never report contents (the research is right about this). Tenant-scoped RLS; drained by the service role in a scoped worker.
- **Test required.** Matrix phase for outbox RLS; a unit test that a failed publish leaves the business write intact and the row unpublished; a replay test proving no duplicate side effect.
- **Priority.** High. It is the difference between "usually delivered" and "delivered".

### 4.3 Document integrity columns — **PRIORITY 3**

- **Current implementation.** `files`: organization, entity, bucket, unique path, name, mime, size, uploader, created_at.
- **Exact gap.** No `checksum`, `scan_state`, `classification`, `retention_until`, `legal_hold`. Dee's own 7-year retention decision (2026-09-06) has nothing in the schema enforcing it, and duplicate uploads cannot be detected.
- **Smallest change.** Five nullable columns on `files` plus an index on `(organization_id, checksum)`. No new table. Checksum computed at upload in the existing `save_*_document` writers.
- **Security / data impact.** Legal hold must be writable only by an administrator and must block the delete paths that exist today (`delete_company_document`).
- **Test required.** Matrix: a non-admin cannot set or clear `legal_hold`; a held document cannot be deleted. Unit: duplicate checksum surfaces as a duplicate rather than a second row.
- **Priority.** Medium-high — retention is already an approved decision with no implementation.

### 4.4 Work-item blocking vocabulary and dependencies — **PRIORITY 4**

- **Current implementation.** `work_stage` enum with `Blocked` and `Attention`.
- **Exact gap.** "Waiting on client documents", "provider unavailable" and "awaiting bureau response" are all `Blocked` with no reason. No `task_dependencies`.
- **Smallest change.** A `blocked_reason` text column with a check constraint over a small vocabulary, and one `work_item_dependencies` table (`work_item_id`, `depends_on_id`, unique pair, cycle guard in the writer). **No new statuses** — the enum stays, because a second status vocabulary is how one engine becomes two (rule 17).
- **Security / data impact.** Dependencies inherit `work_items` policies; the cycle guard belongs in the writer, not the client.
- **Test required.** Matrix: a dependency cannot cross organizations. Unit: a cycle is refused; a blocked item reports its reason in Attention.
- **Priority.** Medium. Real operational value, low risk.

### 4.5 Comparison outcome vocabulary — **PRIORITY 5**

- **Current implementation.** `client_round_outcomes` counts deleted / updated / verified per bureau per round; `source` accepts only `'manual'`. The integrity engine compares snapshots for `DOFD.MOVED_LATER` and `ITEM.REAPPEARED`.
- **Exact gap.** "Bureau-confirmed deletion" (a response says so) and "no longer observed" (absent from a comparable snapshot) collapse into one `deleted` count. That is precisely the false-deletion claim the research warns about, and it feeds progress reporting.
- **Smallest change.** Extend `source` to `('manual','bureau_response','report_comparison')` and add a `not_observed` count column. Report-derived outcomes (0071) then land as `report_comparison` and are displayed with different language.
- **Security / data impact.** None — same table, same policies. **Reporting impact is the point:** a "deleted" figure shown to a client must not include items merely absent from an incomplete import.
- **Test required.** Unit: an item absent from a report missing that bureau produces neither count. Matrix: the writer still refuses a cross-tenant client.
- **Priority.** Medium-high — it affects what a client is told, which is the highest-consequence output the platform has.

### 4.6 Agreements, signatures and billing eligibility — **PRIORITY 6**

- **Current implementation.** `diy_consents`, `dispute_attestations`, `agreements-context.tsx` in the UI.
- **Exact gap.** No `agreements` / `agreement_signatures` / `billing_eligibility` records. The CROA service-start gate, cancellation window and "may this charge be made yet" question have no server-side answer. The research's CFPB/Credit Repair Cloud finding (a $3m stipulated judgment against a *software provider* for assisting advance-fee violations) makes this directly relevant to BES's own exposure, not only its customers'.
- **Smallest change.** Three tables: `agreements` (organization, kind, version, body ref, effective dates), `agreement_signatures` (agreement version, signer, timestamp, IP/user-agent), `billing_eligibility` (client, service, eligible_from, basis, evidence ref). The existing payment writer checks eligibility before charging.
- **Security / data impact.** A signature is a legal record: append-only, no update or delete policy, same treatment as `activity_events`.
- **Test required.** Matrix: charging a client with no eligibility row is refused at the database, not the UI. Unit: cancellation window arithmetic.
- **Priority.** Medium-high, and it becomes Priority 1 the day real consumer billing is switched on. Needs Dee's decision on the exact rules — this is the "reviewed legal rules" item, not something to seed from an AI-generated matrix.

### 4.7 Offer revisions — **PRIORITY 7**

- **Current implementation.** `offers`, one row per offer, with `status`, `presented_at`, `client_decided_at`.
- **Exact gap.** A revised offer either overwrites the row or becomes an unrelated second row. Acceptance points at an offer, not at an exact version, so "what did the client actually accept" is not answerable after a revision.
- **Smallest change.** Mirror `funding_applications`: add `version integer not null default 1` and `unique (deal_id, lender_id, version)`, with acceptance recording the version.
- **Security / data impact.** None new. Correctness impact is material — acceptance of a superseded offer is a contract problem.
- **Test required.** Matrix phase for offers extended: accepting a superseded version is refused server-side. Unit: revision preserves the prior row.
- **Priority.** Medium.

### 4.8 Time-limited HQ support access — **PRIORITY 8**

- **Current implementation.** `fulfillment_engagements` + `bes_may_fulfil()` + `in_scope()`. BES staff status alone is never access (rule 16) — already stronger than the research's model.
- **Exact gap.** No time-limited, audited *support* grant. Today HQ either has engagement-scoped access or none; a support case on a SaaS-only organization has no lawful path except a permanent engagement, which is the wrong instrument.
- **Smallest change.** One `support_access_grants` table (organization, granted_by an org admin, purpose, expiry, records in scope), read by a new branch in `can_view_org` — **narrowing, never widening**, and granted by the *customer*, not by BES.
- **Security / data impact.** This is the highest-risk delta in the list: it creates a new path to customer data. It must be customer-granted, time-boxed, purpose-recorded and audited on every read. Propose before building.
- **Priority.** Medium — real need, high risk, needs a written proposal.

### 4.9 Metering beyond AI — **PRIORITY 9**

- **Current implementation.** `ai_usage_events` + `ai_credit_ledger` + `ai_limits` with a monthly cap and reserve-then-reconcile.
- **Exact gap.** Postage, parsed and OCR'd pages, letter pages, storage and messaging are not metered, so the contribution model the research proposes cannot be computed and no budget control exists before a Lob dispatch.
- **Smallest change.** Generalise the existing ledger rather than adding a second one: a `usage_events` table with the same organization/feature/quantity/cost shape, written by the mailing and import writers that already exist.
- **Security / data impact.** Cost data is organization-scoped; aggregate figures for BES HQ must come from a view, not from widening row access.
- **Test required.** Unit: a mailing over the organization's postage cap is refused before dispatch. Matrix: one organization cannot read another's usage.
- **Priority.** Medium-low until volume exists; it becomes urgent the first month postage is material.

**Deliberately not adopted as deltas:** `import_jobs` / `parser_runs` / `field_evidence`. They are correct designs, but they belong *with* §4.1 — building an import-job record around a parser that still discards per-bureau values would bank the ceremony without the substance. Sequence them behind it.

---

## 5. CONFLICTS WITH APPROVED BES DOCTRINE

| Research recommendation | Conflict | Resolution |
|---|---|---|
| **Next.js interfaces and API routes** | `CLAUDE.md` rule 19: the stack is locked — Vite + React SPA on Vercel, Supabase Edge Functions for server work. Dee re-locked it today. | **Rejected.** No architectural requirement is demonstrated: every reason the research gives for Next.js (server-side authorization, API routes, secrets off the client) is already satisfied by Edge Functions and RLS. The migration cost is the entire front end. What *is* worth taking from the section is its API-contract discipline — versioned schemas, idempotency keys on mutations, structured error codes — and that applies to Edge Functions unchanged. |
| **Reseller organization tier** | Rule 16: *"BES is NOT a multi-agency or reseller platform… Do not redesign the platform for multiple agencies."* Dee re-locked it today. | **Rejected.** A partner referring customers is `referral_attributions` + `commissions`, which exists. A commercial relationship never implies consumer-data access — already enforced, because a referral row grants nothing. |
| **A `tenants` table distinct from organizations** | Rule 2: one canonical data model. | **Rejected.** `organization_id` is the boundary. Adding `tenant_id` would create two answers to one question. |
| **`apps/web` + `packages/*` monorepo layout** | Rule 12.4 (smallest coherent change) and rule 19. | **Deferred indefinitely.** The existing layout already separates UI → application → domain → data → database, and rule 13 states that separation as a review standard. Restructuring directories would move every import in the repository and change no boundary. |
| **Global consumer deduplication avoided** | *Agrees with us* — `clients_one_email_per_partner` is scoped to `partner_scope_id`, never global. Recorded here because the research raises it as a risk BES has already closed. | No action. |
| **"Do not let tenants upload executable JavaScript to the workflow engine"** | *Agrees with us.* Rule 17: customization is data — statuses, fields and types are rows. | No action. |

---

## 6. NOT APPLICABLE — including one correction to a locked item

### 6.1 The Sender warning does not apply to BES

The research devotes a stack decision to Sender's anti-spam policy prohibiting
loans and affiliate marketing. **BES does not use Sender.**

`CLAUDE.md` rule 19 records it explicitly:

> *Email — **Resend** (resend.com). **Corrected 2026-09-06** — this was written
> down as "Sender (sender.net)" from a misheard name; Dee's account is Resend,
> and the two are different companies with different APIs.*

Resend is wired in two places: Supabase Auth SMTP (`smtp.resend.com`) and the
transactional API (`api.resend.com/emails`). Sender appears in the *"explicitly
not used"* list beside Postmark, SendGrid and Mailgun.

**Dee's locked item of 2026-09-07 — "Sender must be flagged for provider-policy
review before funding, lender, affiliate or referral messaging is routed
through it" — carries the research's error forward.** Flagging Sender protects
nothing, because nothing routes through Sender.

**The underlying concern is entirely valid and is redirected, not dismissed.**
Before any funding-offer, lender-outreach, affiliate or referral message is
sent, **Resend's** acceptable-use policy must be checked for the same
restrictions, in writing, for those exact uses. That is an external action for
Dee — I will not contact a provider on BES's behalf. It is recorded as an open
item in the Completion Register.

The architectural half of the recommendation is already right and already
planned: a replaceable, permission-aware messaging adapter, so a provider that
refuses a category can be swapped without touching the callers.

### 6.2 Other not-applicable items

| Item | Why |
|---|---|
| "Do not replace a functioning application with a new scaffold" | Agreed and never contemplated. Recorded because the research's handoff prompt would, if executed literally, do exactly that. |
| Competitor procurement questionnaire (§17) | Useful if BES ever evaluates buying a module. No build implication. |
| Amazon Textract as the OCR adapter | `ocr-extraction.ts` already exists behind an adapter boundary. Provider choice is a later, separate decision. |
| FDIC BankFind / SBA Lender Match as discovery | Reasonable leads. `lenders` + `lender_programs` + `lender_policy_versions` already hold what a discovery run would produce. No contract exists. |

---

## 7. EXTERNAL PROVIDER / CONTRACT BLOCKER

The research is right that these cannot be engineered around, and right that
the product must say plainly where automation stops.

| Blocker | Current state | What Dee must obtain |
|---|---|---|
| Monitoring-provider contract (SmartCredit / IdentityIQ / ConsumerDirect …) | No connector. PDF and CSV import only, which the research endorses as the correct starting route | Written scope covering credit repair, consumer DIY, funding prequalification; white-label/sublicense terms; retention, AI-processing and lender-sharing rights; sandbox and schemas |
| **Resend acceptable-use for funding / lender / affiliate / referral mail** | Resend wired for auth and transactional mail | Written confirmation for those exact categories (see §6.1) |
| Authorize.Net public client key | Accept.js coded; card never reaches the platform | `AUTHNET_PUBLIC_CLIENT_KEY` |
| Lob webhook secret and endpoint | `lob-webhook` deployed; reserve-then-reconcile in place | `LOB_WEBHOOK_SECRET` + endpoint registered |
| GHL agency token + Company ID | `ghl_agency_credentials` + discovery built | Entered through Settings → GoHighLevel |
| Real lender matrices and broker relationships | Schema ready and versioned | Actual current criteria; tenant-specific broker approvals |
| Licensed score simulator | `score-*.ts` is educational and labelled | A licensed product, if exact model outputs are ever offered |
| Reviewed CROA / state service rules | Not encoded (see §4.6) | Counsel review — explicitly *not* AI-generated |

---

## 8. Metro 2 and credit-report accuracy doctrines

Per Dee's instruction: extract the accuracy and evidence doctrines; **invent no
catalogue IDs**. The BES Metro 2 defect catalogue remains **SOURCE NOT YET
RECONCILED** — see `src/lib/dispute/ENGINE_INVENTORY.md` §3.

Doctrines worth adopting into the BES Credit Reporting Accuracy & Metro 2 Rule
Catalogue when the source arrives:

1. **Four separable layers of intelligence** — data integrity, credit
   observations, potential dispute issues, explanation/drafting. BES already
   separates the last one (AI never decides a classification). Naming the first
   three explicitly would make the catalogue easier to classify against.
2. **The five comparison labels** — bureau-confirmed deletion / no longer
   observed / corrected / unchanged / unable to compare. Adopted as §4.5.
3. **Compare like with like** — same bureau, compatible periods, same score
   model and version. Already true of the score model in `report_scores`;
   worth stating as a catalogue guardrail.
4. **A consumer disclosure is not the raw Metro 2 furnishing file.** Already
   enforced (`rawMetro2Verified: false`), and it is the reason Section P of any
   catalogue — raw segment defects — is *not applicable* to our source.
5. **Missing from a PDF ≠ omitted by the furnisher.** This is exactly the
   reasoning behind today's DOFD change: relevance-gated, and APPARENT rather
   than confirmed, because "the bureau omits it" and "our import missed it"
   look identical from here.
6. **Every finding carries `missing_facts`.** Our `RuleOutcome.missing` does
   this for UNKNOWN; extending it to APPARENT findings would make "what would
   settle this" machine-readable rather than prose.
7. **Evidence locators** — page/region or JSON path per extracted field.
   Sequenced behind §4.1.
8. **A model-generated confidence is not a calibrated probability.** Our
   confidence values are rule-assigned, never model-assigned. Worth stating so
   it stays that way.
9. **An evaluation set with deliberately difficult cases**, measuring field
   accuracy, entity-match precision and false-deletion rate. We have unit
   fixtures, not an evaluation corpus. Needs real (or realistic synthetic)
   reports — currently blocked on Dee supplying them.

---

## 9. What actually changes

**Nothing, today.** This document is documentation only, as instructed.

Recommended order when work resumes, and the reasoning: §4.1 first because
almost everything else in the research's import pipeline sits on top of it and
because it is already unblocking dead code; §4.2 next because losing a
notification is silent; §4.5 close behind because it changes what a client is
told about their own case.

Four of the nine deltas — §4.1, §4.6, §4.8 and the outbox's event vocabulary —
are canonical-model or authorization changes and get a written proposal before
any migration, per rule 12.
