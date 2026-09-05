# Proposal — FundingOps domain data, first-class (gap review step 1)

**Status: proposal (2026-09-04). Nothing built.** Foundation for the client,
lender and partner portals, readiness, matching, approvals and commissions in
`ARCHITECTURE_PROPOSAL_FUNDINGOPS_PLATFORM_GAPS.md`. Reuses the existing
hierarchy `funding_clients → funding_businesses → funding_files → funding_deals`
and the existing engine tables; adds only what has no home today.

## Tables (all RLS, all append-preferring; no deletes where history matters)

| Table | Purpose | Key columns |
|---|---|---|
| `lenders` | canonical lender/program records (agency-owned; organizations may add their own) | agency_id, organization_id (null = BES catalogue), name, program, product_type, min/max amount, min_credit_score, min_time_in_business_months, min_monthly_revenue, industries_excluded text[], active, notes |
| `funding_applications` | screening data for a funding FILE (one active per file; versions kept) | file_id, submitted_at, requested_amount, purpose, use_of_funds, time_in_business_months, monthly_revenue, annual_revenue, credit_score_stated, existing_debt, collateral jsonb, owner_ownership_pct, source (portal \| staff \| ghl), version |
| `funding_documents` | required/received document checklist per file | file_id, doc_type (bank_statements, tax_returns, id, voided_check, p_and_l, balance_sheet, business_license, …), status (required \| received \| reviewed \| rejected), file_id→`files.id` link, requested_at, received_at, reviewed_by, note |
| `funding_approvals` | decision records per deal | deal_id, decision (approved \| declined \| countered), approver_id, decided_at, terms jsonb (rate, term, fees, payment), conditions text, note |
| `commissions` | who earns what on a funded deal | deal_id, party_kind (agency \| org_user \| partner \| lender_referral), party_id, basis (pct \| flat), rate_or_amount, computed_amount, state (pending \| approved \| paid \| void), funded_at, paid_at, note |
| `funding_leads` (GHL step) | inbound inquiries before a client exists | organization_id, source, external_id, contact jsonb, requested_amount, purpose, status (new \| contacted \| qualified \| converted \| lost), converted_client_id |

`funding_deals.lender` (free text) gains `lender_id uuid references lenders` (kept
in parallel until every reader uses it, then the text is retired).

## Deterministic engines (in `src/lib/funding/`, unit-tested, mirrored in SQL only where policies need them)

- **Readiness** — `assessReadiness(application, documents, reportScores?) → { level: ready | needs_work | not_ready, factors: [{key, status, reason}], missing: [...] }`. Factors: time in business, monthly revenue, stated/reported credit score, documents complete, existing debt ratio, ownership. Thresholds are data (`funding_readiness_rules` rows per organization with platform defaults), never prose.
- **Lender matching** — `matchLenders(application, lenders) → ranked list with the criteria each lender passes/fails`. Pure evaluation of lender criteria columns; no scores invented.
- **Commission** — `computeCommission(deal, rule) → amount`, rules as rows.

## Authorization (existing chain, no shortcuts)

- Organization members: their organization's files/applications/documents/approvals/commissions within `org_scope_allows`; admins write.
- BES: under a live FundingOps engagement, within scope (as funding_clients).
- **Client (external role `client`)**: the file(s) linked to their own person record only — read application/documents/status; write application drafts and document uploads; never commissions or internal notes. Link: `external_memberships.user_id` ↔ `funding_clients.portal_user_id` (new column).
- **Lender (external role `lender`)**: files explicitly shared with that lender (`lender_file_shares`: lender_id, file_id, shared_by, shared_at, revoked_at) — read the application summary and documents marked shareable; write offers (→ `funding_deals` rows for their lender_id). Nothing else.
- **Partner/BRM (external roles)**: deals they referred (`funding_files.referred_by_membership_id`) — read status and their own commission rows; no client PII beyond name/business.
- Every write through SECURITY INVOKER functions where a multi-row transaction is needed; audit via activity_events on the client/file.

## Order inside this step
1. Migration: tables + policies + `lender_id`; matrix phase (member/BES/other-org/lender/client/partner probes).
2. Engines + tests; data layer + hooks.
3. Deal detail tabs (Overview · Application · Documents · Lenders & Offers · Approvals · History) — the domain half of the deal-workspace split.
4. Operational side stays as built (per-file Department Progress, queues, Client List).

## Conflicts found while designing (to decide before build)
- `funding_clients.status` still doubles as a stage; queues keyed on file stage (separation step 3) must land before portals read "status".
- `funding_deals.lender` text vs `lenders`: a migration window with both; reports must read `lender_id` once populated.
- Client portal identity: today external users are memberships to an organization; a borrower needs a link to their `funding_clients` row — the `portal_user_id` column above, set by invitation.

---

# Addendum B — Document qualification, verification, lender matching, GHL bridge (2026-09-04)

**Status: proposal.** Source: Dee's FundingOS research (three documents received
2026-09-04: *Verified Blueprint for Document Qualification, Funding Operations
and GHL Integration*; *Document Qualification and Verification Blueprint*;
*Real-Time Lender Lookup and Funding-Match App*). Statements of law, vendor
capability and competitor pricing below are **Dee's research, not verified by
this codebase**; they are carried as REQUIREMENTs and must be confirmed by
counsel / vendor contracts before anything customer-facing states them.
The 0058 draft is **parked** (`scratchpad/DRAFT_0058_funding_domain.sql`) and
will be rebuilt to this addendum before it is applied.

## B1. Doctrine (REQUIREMENT — becomes code comments, labels and tests)

```
GHL owns the relationship.   FundingOps owns the funding file.
AI extracts, compares, explains and flags.   Rules evaluate known requirements.
Humans validate exceptions and package acceptability.
The lender / funder decides credit.
```

Inequalities the product must make impossible to misread:

| This | is never | Where it bites |
|---|---|---|
| AI finding | a fraud finding | flags say *Potential …*, never *fraudulent* |
| AI flag | a document rejection | disposition is a human field |
| Document *Not Accepted* | a credit rejection | separate vocabularies, separate tables |
| Document *Accepted* | loan approved | file status ≠ lender decision |
| *Funding Ready* | lender approval | readiness is "meets configured requirements" |
| *Potential lender match* | pre-approval | match output carries policy version + verified date |
| a state's summary | the funding file | GHL receives summaries only |

Never display an approval percentage unless it is a calibrated model over
lender-level outcome data the platform actually holds (none today). Until then
three honest tiers only: **profile fit** (our rules), **prequalified /
preapproved** (label returned by a lender or network, shown verbatim with their
disclaimer), **final approval** (lender decision record).

## B2. What changes in the 0058 design (PROPOSAL)

| 0058 draft | Revised | Why |
|---|---|---|
| `funding_documents` (one row = a checklist line that flips to received) | **`document_requests`** (what the requirement engine says must exist) + **`document_instances`** (what was actually uploaded) | an upload classified as *May* must not satisfy a request for *June*; the request stays open, the instance stays stored, a flag says WRONG_PERIOD |
| status `rejected` | disposition `pending_review \| accepted \| needs_correction \| not_accepted \| escalated` | "Rejected" reads as a credit decision |
| `funding_readiness_rules` (thresholds) | **`requirement_rules`** (versioned, effective-dated, sourced) with readiness thresholds as one rule family | there is no universal checklist; SBA SOP versions, lender overlays, amount bands, ownership %, state all change the package |
| `lenders` flat criteria columns | `lenders` + **`lender_programs`** + **`lender_policy_versions`** (criteria jsonb, source, published date, effective_from/until, last_verified_at, verified_by) | matching must cite *which* policy version and when it was last verified; stale policy ⇒ "Policy verification required", not a match |
| `funding_approvals` | **`lender_decisions`** `pending \| approved \| conditional \| declined \| withdrawn \| expired` | a decision object separate from file status and document disposition |
| — | **`document_flags`** controlled taxonomy | no free-text AI conclusions in the data |
| — | **`verification_results`** | provider results are evidence for a reviewer, not a verdict |
| — | **`consumer_report_requests`** gate | no consumer report retrieval without a recorded purpose, party, product, requester, permissible-purpose basis, authorization state, provider, report id |
| — | **`ghl_mappings`, `integration_events`, `integration_outbox`** | the bridge is a broker with idempotency and an outbox, not browser-to-GHL calls |
| — | `lenders` registry identifiers: `nmls_id`, `fdic_certificate`, `ncua_charter`, `official_domain`, `last_registry_check` | "verified lender" panel from authoritative registries rather than a typed name |

### Tables (all RLS on the existing chain; append-preferring)

```
document_requests      file_id · party_id · document_type · period (yyyy-mm, nullable) · required|conditional ·
                       rule_id · rule_version · status open|satisfied|waived · satisfied_by_instance_id · waived_by · waived_reason · created_at
document_instances     file_id · request_id (nullable) · files.id (object registry, private bucket, signed URLs) ·
                       sha256 · mime · size · pages · uploaded_by · upload_source (portal|staff|ghl) ·
                       classified_type · classified_period · extraction jsonb · extractor · extractor_version · extraction_confidence ·
                       disposition (pending_review|accepted|needs_correction|not_accepted|escalated) · reviewed_by · reviewed_at · reason ·
                       supersedes_id (a correction is a new row; originals are immutable) · created_at
document_flags         instance_id / request_id · flag_code (controlled) · automated_status (no_issue|review_recommended|potential_discrepancy|insufficient_data|processing_failed) ·
                       evidence jsonb · rule_id · rule_version · confidence · human_disposition · reviewer · reason · created_at
requirement_rules      product_family · product_subtype · lender_id (null = platform) · program_id · party_scope ·
                       document_type · required|conditional · condition jsonb (amount band, ownership_pct, state, entity_type, scenario flags) ·
                       lookback_months · max_age_days · sequence_required · all_pages_required · signature_required ·
                       source_type · source_reference · source_published_date · effective_from · effective_until ·
                       last_verified_at · verified_by · version · organization_id (null = BES defaults)
lender_programs        lender_id · name · product_family · states_allowed text[] · active
lender_policy_versions program_id · criteria jsonb · source_type · source_reference · source_published_date ·
                       effective_from · effective_until · last_verified_at · verified_by · version
lender_decisions       deal_id · decision · decided_at · terms jsonb · conditions · recorded_by · source (lender_portal|staff|api) · note
verification_results   party_id / instance_id · provider · provider_kind (identity|business|bank|document|fraud_signal|credit) ·
                       provider_ref · status (verified|partially_verified|unable_to_verify|verification_failed) · signals jsonb · requested_by · at
consumer_report_requests  party_id · product · purpose · permissible_purpose_basis · authorization_state · consent_text_version ·
                       requested_by · requested_at · provider · report_id (→ credit_reports.id when it is our canonical store)
ghl_mappings           organization_id · ghl_location_id · entity_kind (client|file|user) · entity_id · ghl_id · created_at
integration_events     direction inbound · provider ghl · event_id (unique) · signature_verified · raw jsonb · received_at · processed_at · result
integration_outbox     event · entity · payload_summary jsonb · attempts · next_attempt_at · dead_lettered_at · last_error
```

Flag taxonomy (controlled, mirrored SQL ⇄ TS, unit-tested): MISSING_REQUIRED_DOCUMENT,
WRONG_DOCUMENT_TYPE, UNREADABLE_DOCUMENT, MISSING_PAGE, EXPIRED_DOCUMENT,
STALE_DOCUMENT, DUPLICATE_DOCUMENT, DUPLICATE_PERIOD, STATEMENT_PERIOD_GAP,
NAME_MISMATCH, BUSINESS_NAME_MISMATCH, ADDRESS_MISMATCH, APPLICATION_DATA_MISMATCH,
ACCOUNT_OWNERSHIP_MISMATCH, ENTITY_VERIFICATION_MISMATCH, FINANCIAL_PERIOD_MISMATCH,
CALCULATION_VARIANCE, INCOME_VARIANCE, PROPERTY_DATA_MISMATCH, VIN_MISMATCH,
THIRD_PARTY_RISK_SIGNAL, POSSIBLE_TAMPER_SIGNAL, INSUFFICIENT_EXTRACTION_CONFIDENCE,
LENDER_SPECIFIC_EXCEPTION, COMPLIANCE_REVIEW_REQUIRED, PROCESSING_FAILURE.
Client-facing text per code is data (e.g. POSSIBLE_TAMPER_SIGNAL → "Additional
verification is required for this document").

### Party model
Documents attach to the **party or asset they prove something about**, not to
"the client": person, business, owner/guarantor (ownership %), property,
vehicle, seller, affiliate. Today `funding_clients → funding_businesses` covers
person and business; `funding_parties` (kind, links, ownership_pct) is the
smallest addition that gives owners/guarantors, property and vehicle a home
without a second client record.

### Statuses (three vocabularies, never merged)
- **File status** (operational; today's `funding_files.stage` stays the queue
  key): the GHL summary is a deterministic function of stage + waiting_on
  (`ghl_funding_status()`), never a second lifecycle.
- **Document disposition**: the five values above.
- **Lender decision**: the six values above.

## B3. Engines (deterministic, `src/lib/funding/`, unit-tested)

1. **Requirement resolver** — `resolveRequirements(file, parties, rules, asOf)` →
   the document requests that must exist for this product/lender/amount/state/
   scenario on that date. Effective-dating first-class (SBA SOP 50 10 8 vs 8.1).
2. **Deterministic document checks** — file integrity, duplicate hash, page
   count, expiry/staleness, period sequence, name/entity/address normalisation
   (LLC punctuation ≠ mismatch), arithmetic continuity. No model needed.
3. **Cross-document graph** — application ↔ ID ↔ statements ↔ tax ↔ KYB ↔ property
   ↔ VIN comparisons; outputs flags with evidence, never verdicts.
4. **Readiness** — `assessReadiness` (exists) recomputed from requests/instances/
   flags; level names stay `ready | needs_work | not_ready`, surfaced as
   "Funding Ready under configured requirements".
5. **Matching** — `matchLenders` (exists; no importer yet) gains: policy version +
   `lastVerifiedAt` on criteria; result vocabulary `potential_match |
   not_matched | policy_verification_required` with `matched[] / unconfirmed[]`
   instead of `eligible: boolean`; `unknown` renamed `unconfirmed`. Never a
   probability.
6. **Offer normaliser + ranking** (later stage) — `Offer` shape (amount, term,
   apr, fees, net_proceeds, payment, total_repayment, status prequalified |
   preapproved | estimate, source, expires_at); rankings *Best chance / Lowest
   cost / Best overall* with user-chosen weights; sponsored placement separate
   from organic ranking; partner economics never in the organic formula.
7. **GHL status projection** — summary fields only (file id, status, product,
   readiness, waiting on, missing count, next action, review pending, submission,
   lender review, offer, funded amount, last update, portal link). Deny-list
   enforced in code and test: SSN, account/routing numbers, raw transactions,
   ID numbers, tax data, credit report, provider raw payloads, AI reasoning,
   compliance notes.

Human review routing reuses the existing department queues; flags route to a
queue by rule rows (Standard · Correction · Identity/KYB · Financial · Risk
signal · Compliance · Lender exception). AI may prioritise queues; it never
closes one.

## B4. Integration boundary (FACT + PROPOSAL)

- FACT: no Edge Function exists in this repository yet; every provider call
  (GHL API, document extraction, identity/KYB/bank providers, marketplaces)
  needs one — secrets server-side only, browser never talks to GHL.
- PROPOSAL: adapters as interfaces in `src/lib/funding/verification/` —
  `IdentityVerificationProvider`, `BusinessVerificationProvider`,
  `BankDataProvider`, `DocumentExtractionProvider`, `FraudSignalProvider`,
  `CreditProvider`, `LenderAdapter` (validate → eligibility → quote → offers →
  normalise → application → status → webhook). First implementation of each is
  **"recorded by reviewer"** (a human enters the provider result) so the data
  model and console work before any vendor contract; vendors slot in later.
- GHL webhooks: verify **`X-GHL-Signature` (Ed25519)** — Dee's research states
  the legacy `X-WH-Signature` is deprecated 2026-09-01 — over the raw body,
  dedupe on event id, persist raw, ack fast, process from our queue, audit.
  Outbound through `integration_outbox` with retry and dead-letter.
- Third-party consumption (extraction pages, verifications, bank pulls,
  marketplace calls) is **metered and billed as consumption**, never bundled
  into a software plan — same rule as BES AI Credits.

## B5. Compliance boundaries carried as requirements (counsel to confirm)

- Regulation B reaches referral/selection of creditors; feature governance
  table per profile field: permitted for eligibility? ranking? analytics only?
  Nothing collected for reporting flows into ranking by default.
- FCRA permissible purpose per consumer per transaction — the
  `consumer_report_requests` gate above; no reuse of report data for other
  purposes.
- Safeguards-Rule-grade controls as product requirements (encryption at rest
  and in transit, MFA, least privilege, tenant + document-level authorisation,
  download logging, retention and secure disposal schedules, vendor inventory).
- State licensing / commercial-finance disclosure matrix as a **geo gate**
  (`state_product_rules`: state × borrower type × product × activity →
  allowed | blocked | pending). Default deny until counsel marks a state
  allowed. Marketing cannot switch on "all 50 states".
- App-store loan rules (Dee's research: 36% APR cap and ≥60-day repayment for
  U.S. loan apps on both stores) as `available_web / available_ios /
  available_android` on products.
- Tenant screening and Section 1071 data collection are **separate modules**,
  not FundingOps document review. Out of scope here; recorded so nobody
  sprinkles their fields into this model.

## B6. Metrics that matter (reporting proposal feeds)
Critical-field extraction accuracy · false discrepancy rate · missed discrepancy
rate · human override rate · flag-to-confirmed-issue rate · documents per review
hour · correction cycles per file · time to document-ready · processing failure
rate · duplicate-event rate · **lender additional-document rate after "Funding
Ready"** · lender rejection due to documentation.

## B7. Revised order (replaces "Order inside this step")

**Status 2026-09-05:** steps 1–3 built and applied (migration 0058, engines,
deal detail tabs, requirement resolver — see BUILD_STATUS). Steps 4–6 open.
Rule rows and lender policy rows are authored by SQL until their settings
screens exist; the interface says so instead of inventing defaults.
1. Migration 0058 (rebuilt): parties, requirement_rules, document_requests,
   document_instances, document_flags, lender_programs + policy versions,
   lender_decisions, verification_results, consumer_report_requests, lenders
   registry ids, `lender_id` on deals, `portal_user_id`, referral link; policies;
   matrix phase 22 rewritten to these tables.
2. Engines + tests (resolver, deterministic checks, cross-document graph,
   matching vocabulary change, GHL projection with deny-list test).
3. Reviewer console = deal detail tabs (Overview · Application · Documents
   (requests vs instances, flags, dispositions) · Lenders & Offers (potential
   matches with policy provenance) · Decisions · History).
4. Client portal uploads → instances (private bucket, signed URLs), requests
   visible with plain-language next action.
5. GHL bridge Edge Function (mappings, inbound events, outbox) — only after 1–4.
6. Verification adapters with real vendors; marketplace adapters (personal /
   SMB networks) only after contracts and the licensing matrix.

## B8. Decisions needed from Dee
- Storage: FundingOps owns underwriting uploads (not GHL's client portal
  documents). Confirm.
- First product lane: business funding + MCA/revenue-based first; SBA as a
  policy pack second; real-estate packs third; consumer/mortgage/auto later;
  tenant screening separate. Confirm the order.
- Which lenders/programs BES already works with, so the first
  `lender_policy_versions` rows are real (source + date) rather than seeded.

---

# Addendum C — Reconciliation with Dee's FundingOS design (2026-09-05)

**Status: proposal, with the cheap corrections applied the same day.** Source:
Dee's *FundingOS — Complete Platform Logic, Design & Purpose* and the
FundingOS preview (dashboard as action queues; Lender Network Intelligence
with a policy-update feed). That design is the **authority** for FundingOps
from here on; Addendum B stands where it agrees and yields where it differs.
Doctrine, verbatim: *CRM owns the relationship. FundingOS owns the funding
operation. Facts from the system. Math from deterministic code. Intelligence
from AI. Decisions from people.*

## C1. Where what exists already matches (FACT)

| FundingOS design | In the platform today |
|---|---|
| Organization → Clients → Applicant → Business → Funding File; a business can have many files; a return is a **new** file | `funding_clients` (applicant) → `funding_businesses` → `funding_files`; nothing overwrites a file |
| Own `organization_id` as tenant key; CRM is an attached integration | rule 16; GHL bridge planned as a broker with mappings |
| Capital Providers → Programs → Policy Versions → Criteria; source + verification date on the version | `lenders` → `lender_programs` → `lender_policy_versions` (criteria jsonb, source type/reference/date, effective dates, last verified) |
| Document requests ≠ uploaded instances; extraction ≠ verification; disposition is human | `document_requests`, `document_instances` (extraction jsonb + human disposition), `document_flags` |
| Program Fit never says approved/qualified/probability | engine outputs "potential match"; never a probability |
| Readiness is a third path, not decline; credit repair is one path | hand-off to CreditOps exists (0052/0053); "Endorsed to Readiness" wording adopted |
| Lender decision is its own object, append-only | `lender_decisions` |
| Consumer report only through a recorded permissible purpose | `consumer_report_requests` |
| Language rules (no "fraud", no "approved", no APR for factor rate) | flag meanings, disposition labels, policy provenance on matches |

## C2. Where the design differs — and what changes (PROPOSAL)

| Design | Today | Change |
|---|---|---|
| **Three state axes**: Primary Stage (17 steps in 5 phases), Secondary Status (13 dispositions), Waiting On (7 owners) | `funding_files.stage` has 9 values and mixes stage with disposition (`Declined`, `Withdrawn`) | migration: extend `funding_file_stage` to the 17 steps; add `secondary_status` and `waiting_on` enums + columns; data map: `Readiness Review → Application Review`, `Document Review → Document Collection`, `Lender Matching → Lender Selection`, `Submitted → Submitted`, `Stipulations → Additional Requirements`, `Offer Received → Offer Received`, `Funded → Funded`, `Declined → stage unchanged + secondary Lender Declined`, `Withdrawn → secondary Withdrawn`. `waiting_on` derived once, then owned by operators |
| Departments (Readiness Review … Funded Deals) as the internal work axis | `funding_department` + per-file statuses (0054) | **keep**: departments are *who does the work* (team routing, production, EOD); the 17-stage spine is *where the file is*. The phase groups (Intake · Preparation · Submission · Decision · Closing) map onto the departments for queues. Decision for Dee below |
| Criteria with **rule strength** (Hard · Preferred/Guidance · Informational · Manual Review), each with source and verification metadata | criteria jsonb, one source per version | **`policy_criteria` rows** (version_id, key, operator, value, strength, source_id, verified_at); interim: `criteria.strength` map in the jsonb read by the engine (done today) |
| Policy version lifecycle Draft → Verified → Pending Approval → Active → Superseded | effective dates + last verified | add `state` enum; only **Active** versions feed Program Fit |
| **Source tiers** 1–4; Tier 4 research never drives fit | `source_type` text | `policy_sources` (tier, kind, reference, captured_at, verified_by); research queue = Tier 4 candidates |
| **Program Fit vocabulary**: per criterion Meets / Does Not Meet / Needs Review / Missing Information / Not Applicable; overall Apparent Fit / Conditional Fit / Needs Review / Insufficient Information / Apparent Mismatch; Policy Unavailable | potential_match / not_matched / policy_verification_required | **engine renamed today** (see C4) |
| **Readiness statuses**: Ready for Placement · Potential Fit · Conditional/Needs Improvement · Not Currently Funding Ready · Insufficient Information; constraint identified; readiness path chosen | ready / needs_work / not_ready | **engine renamed today**; `readiness_assessments` table later (constraint kind, path, reassessment date) |
| **Lender Network Intelligence**: identity truth, published policy truth, relationship intelligence (BDM, partner status, last contact), observed outcomes with sample size; data confidence (never a score); policy update feed with deterministic file impact + acknowledge; SBA 7(a) lender import | registry ids, policy versions, decisions | `lender_contacts` (BDM, role, verified), `lender_relationships` (partner status, last contact), `policy_updates` (version from→to, change kind Tightened/Relaxed/Paused/Clarified, affected files computed by the fit engine, acknowledged_by/at), `outcome_rollups` (per program: submissions, funded, declined by normalized reason — descriptive only), SBA import as a research-candidate loader |
| **Submissions** preserve policy version + fit snapshot; outcomes with lender-reported reason verbatim + normalized category | `funding_deals` + `lender_decisions.terms` | `funding_deals` gains `policy_version_id`, `fit_snapshot jsonb`; `lender_decisions` gains `reason_verbatim`, `reason_category` enum; outcome kinds extended (Additional Info, No Response, Expired) |
| **Offers**: raw lender terms vs FundingOS-calculated values; factor rate never APR; Internal Review → Ready to Present → Presented → Client decision | terms jsonb on the decision | `offers` table (raw fields as provided + pricing_type; calculated fields separate and labelled; state machine with human actions) |
| **Closing**: Start Closing → requirements/stipulations → signatures → Funding Pending → **Confirm Funding** creates the Funded Deal; four amounts kept apart | `funding_deals.status = Funded` | `closings` + `funded_deals` (requested, accepted, gross funded, net funded, discrepancy surfaced); only `confirm_funding()` writes a funded deal |
| **Renewals**: monitoring, potential renewal date (reminder, not eligibility), review → outreach → interested → **new** file with lineage | — | `renewal_opportunities`; `funding_files.renews_file_id` |
| **16-tab Funding File workspace** | 4 tabs (Overview · Application · Documents · Lenders & Offers) | grow to the 16 in the design's order; today's tabs are Overview, Requirements+Documents, Matches/Submission, Submissions+Offers |
| **Dashboard = 14 action queues**, waiting-on distribution, team workload | department queues + My Work | FundingOps dashboard rebuilt as the design's queues (each a bounded query on stage/secondary/waiting_on/requests/timers) |
| **AI layer**: Copilot (bounded, read-only), Document Intelligence, Policy & Outcome Analyst — all behind the backend | none live | Edge Functions + BES AI Credits; capabilities exactly the design's lists; no mutation |
| **Never**: "Best Lender" ranking label | Addendum B allowed "Best chance / Lowest cost" rankings for the consumer marketplace | **withdrawn for FundingOps**: matches are shown in operational order with no ranking label; the marketplace idea stays separate and later |

## C3. Decisions for Dee
0. **Decided by Dee (2026-09-05):** the Funding File workspace is its own
   in-frame surface, separate from the FundingOps Workspace — exactly as
   Clients sits apart from the CreditOps Workspace. The Workspace keeps the
   operational views (queues, department progress, client list) and links to
   the file; the Funding File page carries the 16 tabs; Lender Network
   Intelligence is a third surface under FundingOps. The deal detail leaves
   the work file today. Dee's framing, kept verbatim in spirit: **FundingOps
   is the engine** — the counterpart of DisputeFox/CRC for CreditOps — with
   the funding pipeline, lender lookup and the roles around it (sales agents,
   business relationship managers, lenders, clients); **the Workspace is the
   operational add-on** that tracks the work.
1. **Decided by Dee (2026-09-05): departments stay as the team axis** under the 17-stage spine. Dee's brief for the shape: a streamlined engine with one space for production and fulfillment (the Workspace) and one space to track client/file progress (Funding Files with the Pipeline view) — no redundant views.
2. **Table naming**: keep `funding_deals` as the submission record (interface says "Submission") or rename the table in the migration. Recommended: rename once, now, before more code reads it.
3. Confirm the 17 stage labels verbatim (I will not paraphrase them).

## C4. Applied today (no database change)
- Readiness engine speaks the design's five statuses; matching speaks the design's Program Fit vocabulary (per-criterion and overall, plus Policy Unavailable), honours `criteria.strength` (a Preferred criterion below guidance is *Needs Review*, never *Does Not Meet*), and the interface labels follow. Tests updated.
- The deal-detail header says "Ready for Placement", never "Funding Ready".

## C5. Layout — where the FundingOS surfaces live in BES (proposal for Dee)

Principle: **one platform shell, module groups inside it.** FundingOS's own
navigation was a whole product; in BES it is one module beside CreditOps,
DIY Credit and Custom Workspaces, so platform-wide items stay platform-wide
and the module group holds only the engine and its add-on.

```
Home                      one personalizable Home (cards link into modules)
My Work                   = FundingOS "Tasks" (work items, department files, queues)
Notifications             platform-wide
Clients (CreditOps) …

FundingOps
  Dashboard               = FundingOS "Dashboard": the 14 action queues, waiting-on
                            distribution, team workload (module dashboard, not Home)
  Funding Files           list ⇄ Pipeline board (the 17 stages) — same records, two views
      └ Funding File      the 16-tab workspace (Overview · Readiness · Submission ·
                            Matches · Documents · Doc Intel · Bank Analysis ·
                            Requirements · Tasks · Submissions · Offers · Closing ·
                            Outcomes · Renewal · Copilot · Activity)
  Lenders                 Lender Network Intelligence: Directory · Relationship ·
                            Policy Matrix · Research Queue · Scorecard (observed
                            outcomes, descriptive) · Policy Update feed at the top;
                            "Import SBA 7(a) report" and "Add capital provider" here
  Submissions             cross-file record list (every submission, its policy
                            version snapshot, its outcome)
  Offers                  cross-file record list (raw terms vs calculated; states)
  Funded Deals            immutable record list (four amounts, discrepancies) → Renewals
  Commissions             per funded deal, per party
  Workspace               the operational add-on: department queues, department
                            progress, client list, SLA, EOD/production — never the
                            record of truth, always a view of it
  Reports                 shared reporting (pivots, KPIs) — the "Lender Scorecard"
                            numbers also surface here

Settings › Users & roles  = FundingOS "Contacts": sales agents, BRMs, processors,
                            closers as organization roles; lenders, clients and
                            partners as external access (their portals)
Settings › Billing        = FundingOS "Billing" (platform-wide)
—                         "Legacy Pipeline": not carried over (nothing to migrate)
```

Why this shape:
- **Records vs work.** Submissions / Offers / Funded Deals are *record* pages
  (the truth, one row each). The Workspace's "Submissions · Offers · Funded"
  views are *work queues* over the same rows (who does what next, SLA). Both
  read the canonical tables (rule 2); the Workspace view names gain the word
  "queue" so nobody mistakes a queue for the record.
- **Pipeline is a view, not a second list.** The 17 stages are a board over
  Funding Files; one search, one filter model, one deep link.
- **Lender lookup lives in Lenders.** Directory search, policy matrix, the
  update feed with deterministic file impact and acknowledgement, research
  candidates (Tier 4, never driving fit), and the marketplace/registry
  lookups later — all one surface, because they answer one question: *what
  do we know about this capital provider, from which source, verified when?*
- **Dashboard ≠ Home.** Home is the person's day across modules; the
  FundingOps Dashboard is the module's operating picture. CreditOps gets the
  same treatment later.
- **Roles are settings, portals are surfaces.** Sales agents, BRMs,
  processors and closers are organization roles with configurable access
  (0047); lenders, clients and partners are external memberships with their
  own portals, record-scoped by RLS.

Built (2026-09-05): Funding Files (list ⇄ Pipeline board), the file page
(Overview · Application · Documents · Matches & Submissions · Offers · Closing
· Renewal, Move control), Lenders (directory, programs, policy versions,
Scorecard), FundingOps Dashboard (fourteen queues), Deals (Submissions ·
Offers · Funded · Commissions · Renewals as one record surface), Workspace.
Schema C2 applied as 0060–0062. Still to come: lender contacts/relationship
and the policy-update feed on Lenders, drag-and-drop stage moves, portal
uploads, the AI layer (keys needed from Dee).
