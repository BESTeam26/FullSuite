# Proposal — Letter Builder: Letter Library, round letters, Hybrid (AI credits), Metro 2 finder

**Status: built 2026-09-05 (0059 Letter Library, live builder, Credit Reporting Integrity engine with saved findings). Original note: nothing built except removing the "Anytime"
options from the selector.** Dee's direction: the Letter Builder is not working
yet; Factual and Security Freeze letters come from a manual **Letter Library**
of templates; **no "Anytime" letters** — build round letters, then ask whether
to reset the round cycle or keep the current round counter (additional
letters); **Hybrid** is AI-generated and billed in BES AI Credits; **Metro 2** is
a hard-coded violation finder that produces a letter per violation/mismatch
found on the report (logic to come from Dee).

## What exists (verified)
- `components/clients/dispute-flow/*` — a selector (Factual / Metro2 / Other /
  Hybrid) and builder screens driven by the client-workspace context (sample
  items in demo; live items since the credit-report work). No letter is
  persisted; no templates exist in the database; `lib/dispute/letters-and-
  channels.ts` holds CRA addresses/channels and `metro2-engine.ts` /
  `metro2-intelligence.ts` hold deterministic Metro 2 field logic.
- Rounds are a number on `fulfillment_clients.round` and a counter in the
  client-workspace context; no round history record.

## Design

### 1. Letter Library (organization data, platform defaults)
```
letter_templates
  organization_id (null = BES platform default) · kind (factual | freeze | alternate_bureau | metro2 | other)
  name · audience (bureau | furnisher | secondary_bureau | cfpb) · body (markdown with placeholders)
  placeholders text[] (validated against the known set: client, bureau, item, account, dofd, dates…)
  is_active · version · created_by · updated_at
```
Organizations see BES defaults plus their own; owners/admins add, edit (new
version), deactivate. Deleting = deactivating (history keeps meaning). CROA
language guardrails as a unit test over BES defaults; organization templates
are the organization's responsibility, flagged when they contain prohibited
phrases ("guarantee", "remove accurate").

### 2. Rounds as records
```
dispute_rounds        client_id · round_number · opened_at · closed_at · strategy (factual | metro2 | hybrid | freeze | secondary)
dispute_letters       round_id · template_id (null for AI) · bureau/recipient · item_ids (report_items) · body_final · generated_by (template | ai) ·
                      ai_usage_event_id (Hybrid) · status (draft | approved | printed | mailed | responded) · created_by · timestamps
```
Building round letters = one function `build_round_letters(client, strategy,
item_ids, template_id?)` that creates a round if none is open and the letters
for each bureau/recipient. **After building:** the interface asks *"Reset the
round cycle (close round N, open N+1) or keep round N and treat these as
additional letters?"* — recorded on the round (`cycle_reset boolean`). This is
what "Anytime" was for in DisputeFox; it becomes a decision at build time, not a
separate letter type.

### 3. Strategies
- **Factual / Security Freeze / Alternate bureaus**: template merge only —
  deterministic, no AI. Placeholders filled from the canonical report items and
  client record.
- **Hybrid (Factual + Metro 2)**: AI drafts the narrative from the factual
  facts and the Metro 2 anomalies found; goes through the AI gateway (see
  `ARCHITECTURE_PROPOSAL_AI_CREDITS.md`): entitlement check, credit balance,
  metered tokens, one `ai_usage_events` row linked to the letter. The draft is
  a draft until a person approves it.
- **Metro 2**: `metro2-engine` evaluates each report item's fields against the
  hard-coded rules Dee will provide; each violation/mismatch yields a letter
  section highlighting the field, the reported value, the expected value and
  the furnisher duty; one letter per furnisher per round.

### 4. Print & mail
Letters render to PDF client-side (existing Print & Download tab) and, later,
to a mailing provider (separate consumption, never included in a plan).

### 5. Authorization
Templates: organization members read; owner/admin write (function, audited).
Rounds/letters: follow the client (visible to whoever sees the client; write
within reach). DIY consumers: their own letters only.

## Order
1. Migration: `letter_templates`, `dispute_rounds`, `dispute_letters` + BES default templates (Factual round, Security Freeze ×6 registries, Alternate bureaus) + policies + matrix phase.
2. Library settings screen (organization view) and the Factual/Freeze builders on templates; the round-cycle prompt.
3. Hybrid through the AI gateway (needs the AI credits ledger first).
4. Metro 2 finder → letters (after Dee's rule logic).

---

# Addendum — Metro 2 becomes the Credit Reporting Integrity & Investigation engine (2026-09-04)

**Status: proposal.** Source: Dee's research (two documents received 2026-09-04:
*Metro 2 Context Module: Verified Legal Foundation, Cross-Validation, and
Platform Rulebook*; *Metro 2 Reporting, FCRA Liability, and Platform
Implementation Framework*) with Dee's instruction: **"no AI hallucination …
based on facts and what is compliant only."** Legal citations below are carried
from that research as REQUIREMENTs for counsel to confirm; nothing here is
legal advice generated by this codebase. Where the codebase can verify a
statement it is marked FACT.

## M1. The one sentence every module obeys

> A difference is not yet an inaccuracy. An inaccuracy is not automatically a
> Metro 2 violation. A Metro 2 deviation is not automatically an FCRA
> violation. An FCRA issue does not automatically entitle the consumer to
> whole-account deletion. Establish the fact, identify the duty, identify the
> responsible party, select the remedy the law supports.

Consequences for the product:
- Rename in the interface: *Metro 2 Violation Finder* → **Credit Reporting
  Integrity & Investigation** (organization/B2B) and **"Something to review"**
  cards (DIY consumer). No dashboard ever counts "violations".
- Metro 2 is an industry reporting specification maintained by CDIA, not a
  statute. FACT about our data: `credit_reports` are imported from
  consumer-facing displays (CSV/PDF from monitoring services), **not** the raw
  furnisher record, so every finding carries `raw_metro2_verified = false` and
  is worded "possible Metro 2-related reporting inconsistency", never "Metro 2
  field validation result". The CRRG code tables are CDIA-licensed and are
  **not** embedded in the product until BES holds vendor access rights;
  V1 rules derive from public law and logical consistency only.

## M2. Hierarchy of authority (data, used by the rule mapper)
statute (FCRA, CROA, FDCPA, TILA/FCBA) → regulation (Reg V, Reg Z) → federal
appellate/Supreme Court decisions (jurisdiction-aware) → agency guidance and
consent orders (CFPB, FTC) → Metro 2 / CRRG (industry) → credit-repair training
material (secondary; validated against everything above before it becomes a
rule). Every rule row stores its authority level, citation, jurisdiction,
effective date and version.

## M3. Finding taxonomy (replaces "violation")

| Internal classification | Interface label | Auto-assignable? |
|---|---|---|
| Observed reporting difference | **Data discrepancy** | yes |
| Potential Metro 2 / data-integrity anomaly | **Potential inaccuracy** (review) | yes |
| Evidence-supported reporting inaccuracy | **Potential inaccuracy** (evidence attached) | yes, only with a linked evidence record |
| Potential FCRA / Reg V compliance issue | **Potential legal issue** | yes, as a route suggestion only |
| Established violation | — | **never**; reserved for counsel/adjudication |

Never auto-emitted: "violation confirmed", "willful", "fraudulent", "illegal",
"unverifiable" (from a cross-bureau difference), "identity theft" (from breach
exposure), "must delete".

## M4. Field engine outputs and rule classes (deterministic, versioned)

Per field combination the engine answers one of: `expected · possible ·
suspicious · needs_source_document · evidence_supported_inaccuracy ·
legal_review`, with multi-dimension confidence (data-anomaly, source, evidence,
legal-rule, remedy) and `human_review_required`.

**High-priority logical rules** (auto-flag as *potential inaccuracy*, still not a
verdict): DOFD after charge-off date · DOFD before open date on a non-collection
tradeline · current status + $0 past due + all-timely history + DOFD populated ·
paid-in-full + contradictory current balance / past due · DOFD that moved later
across snapshots without an intervening cure or new delinquency · reinsertion
of an item previously deleted after a reinvestigation.

**Evidence-required rules** (ask for a document before any dispute): reported
late month vs bank/creditor records · balance vs payoff/settlement letter ·
liability/ECOA relationship vs agreement (authorized user vs borrower) · open
vs closure confirmation · payment dates/amounts vs ledger.

**Investigation-only** (never generate a letter by themselves): different
balances or dates across bureaus · different masked account numbers · creditor
name abbreviations · deletion by one bureau · different update dates · different
remarks. These produce "determine the correct underlying fact first".

**Not contradictions** (encoded as `possible` so the engine stops flagging
them): current status with historical lates · $0 balance with historical
delinquency · charge-off with a remaining balance · recent update date on an
old derogatory · one bureau missing an account.

**Mandatory human/legal review**: bankruptcy discharge characterisation,
contract rescission or ambiguous terms, statute of limitations, whether a
settlement extinguished liability, ownership of transferred debt, divorce
decree liability, judgment interpretation, unclear identity theft, any
"willful/negligent" language, conflicting circuit authority.

## M5. Legal routing map (fact → duty → responsible party → route → remedy)

| Established fact | Duty / citation (per Dee's research; counsel to confirm) | Route |
|---|---|---|
| CRA file shows inaccurate/incomplete information | 15 U.S.C. §1681i reinvestigation; §1681e(b) reasonable procedures (CRA duty, **not** a furnisher letter citation) | CRA dispute with evidence |
| Furnisher received the dispute **through the CRA** | §1681s-2(b) reasonable investigation (Johnson, Gorman) | tracked as the CRA route's second leg |
| Consumer disputes **directly** with the furnisher | §1681s-2(a)(8) / 12 C.F.R. §1022.43 — with the **credit-repair-organization exception** | only when `dispute_origin = consumer_prepared`; CRO-prepared disputes default to the CRA route |
| DOFD / re-aging | §1681s-2(a)(5), §1681c(c), Reg V Appendix E | correct the date; deletion only if the corrected date makes the item obsolete |
| Previously deleted item reappears | §1681i(a)(5) reinsertion certification + notice | reinsertion review |
| Genuine identity theft with attestation + report | §1681c-2 block | identity-theft route, gated by attestation |
| Unknown inquiry | §1681b permissible-purpose questionnaire (did you apply? existing account? collection? insurance? employment?) — never "no written permission = violation" | inquiry route |
| Qualifying open-end billing error within 60 days of the first statement showing it | 15 U.S.C. §1666 / Reg Z §1026.13 (the material's "USC 666" is a wrong citation) | FCBA route, eligibility check first |
| Debt collector continues reporting a genuinely disputed debt without the dispute notation | FDCPA §1692e(8) — only if the entity is a debt collector under the Act | collector route |
| Method of verification after results | §1681i(a)(7): description of the procedure + furnisher contact — **not** a right to contracts/ledgers | MOV request template, scoped wording |

**Remedy engine**: `correct | modify | delete | block | dispute_notation |
no_action`, chosen from the established fact. Deletion is never the default;
§1681i says delete **or modify as appropriate**.

**Timers as data**: 30 days (+15 when the consumer supplies new relevant
information), 5-business-day furnisher notice, 5-business-day results notice,
reinsertion watch on every re-import. Never "30 days = automatic deletion".

## M6. Truth gate and QA gate (hard stops before any letter)

Truth gate (consumer/client attestation stored on the letter): recognise the
account? the specific information believed inaccurate; the reason; the
supporting document. Extra gates: identity theft ("I did not open, authorise,
use or receive…"), inquiry ("I do not recall initiating…"), late payment,
balance. CROA prohibits counselling untrue or misleading statements; the gate
is the platform's protection as much as the consumer's.

QA gate (checklist enforced in `build_round_letters`, not in the UI): source
report exists · correct consumer/account/bureau · exact disputed field · reported
value copied verbatim · evidence actually supports the claim · difference is not
formatting · cross-bureau difference not used as proof · raw Metro 2 not claimed
· citation matches the duty and the recipient type (CRA vs furnisher vs
collector) · remedy matches evidence · no "willful" · no breach language · no
fabricated identity theft · no repeat dispute without a new basis · CRO/direct-
dispute rule checked · attestation present · human approved.

**Not built, ever**: e-OSCAR evasion (font/colour/spelling variation, random
citations), identity-theft framing from breach exposure, "one bureau deleted so
all must", freeze-as-tactic wording.

## M7. Data model additions to §1–2 of this proposal

```
report_findings        report_id · item_id · classification (M3) · fields text[] · observation · evidence_level
                       (unverified_observation | cross_source_discrepancy | consumer_attested | document_supported | authoritative_record | legal_review) ·
                       confidences jsonb · legal_context text[] · recommended_route · requested_remedy · human_review_required ·
                       rule_id · rule_version · raw_metro2_verified boolean default false · created_at
dispute_attestations   letter_id · statements jsonb (the gate answers) · attested_by · attested_at
dispute_letters        + dispute_origin (consumer_prepared | attorney_assisted | cro_prepared | cra_forwarded)
                       + recipient_kind (cra | furnisher | collector | cfpb | secondary_bureau)
                       + finding_ids uuid[] · evidence_file_ids uuid[] · qa_passed_at · qa_by
dispute_timers         letter_id · kind (reinvestigation | furnisher_notice | results_notice | reinsertion_watch) · due_at · satisfied_at
```
Snapshots: `credit_reports` is already append-only (FACT, 0048) — the
chronology engine compares snapshots and never overwrites a prior report.

Rules live in `src/lib/dispute/reporting-integrity-rules.ts` (versioned rule
objects with authority, citation, jurisdiction, effective date) and are the
only source the finding engine, the letter builder and the Hybrid AI prompt
read. `metro2-engine.ts` / `metro2-intelligence.ts` are folded into it under the
new vocabulary; nothing keeps the word "violation" in a type name.

## M8. Corrections to existing BES letter content (from Dee's research; apply to BES default templates and the reason library before they ship)
- "USC 666" → 15 U.S.C. §1666; use only when the FCBA facts and 60-day timing fit.
- §1681e(b) addressed to a furnisher → CRA-only citation.
- "A direct certified letter activates §1681s-2(b)" → it does not; CRA notice does.
- MOV demands for contracts/ledgers/employee names → §1681i(a)(7) scope only.
- "Inaccuracy = must delete" → delete **or modify as appropriate**.
- "Deleted at one bureau proves unverifiable elsewhere" → discrepancy only.
- "Verified twice = willful" → never automatic (Safeco standard is a legal question).
- "Current + historical lates is contradictory" / "charge-off + balance is contradictory" → not contradictions.
- Inquiry library's "only four permissible purposes / written permission required" → §1681b questionnaire.
- Breach-exposure identity-theft framing → removed.

## M9. Hybrid (AI) under this engine
Input = structured findings + attached evidence + attestation; output is
constrained to fact slots in an approved template; a prohibited-phrase filter
runs on the draft; a person approves before anything prints. Billed in BES AI
Credits (see `ARCHITECTURE_PROPOSAL_AI_CREDITS.md`). The model never selects
the legal route or the remedy — the rules module does, before the model runs.

## M10. Order (revises "Order" above)

**Status 2026-09-05:** step 1's rules module and finding engine are built and
tested (`reporting-integrity-rules.ts`, `reporting-integrity-engine.ts`) and
step 4's findings panel is live in the client profile; `report_findings`
persistence, the Letter Library migration, the truth/QA gates in
`build_round_letters` and Hybrid remain open. The existing
`metro2-taxonomy` / `metro2-guardrails` (truth gate, permissible purpose,
FCBA eligibility) stay as they are and are reused by the letter milestone.
1. Rules module + finding engine + tests (fixtures from the high-priority and
   not-contradiction lists above); `report_findings` migration.
2. Letter Library migration (§1–2) + attestation/timer/origin columns + QA gate
   in `build_round_letters`.
3. Factual / Security Freeze builders on templates with the truth gate and the
   round-cycle prompt; MOV and escalation templates with scoped wording.
4. Findings panel in the client profile ("Something to review" for DIY).
5. Hybrid through the AI gateway.
6. CDIA access → CRRG-backed validation layer (V2), jurisdiction-aware case
   rules with counsel.
