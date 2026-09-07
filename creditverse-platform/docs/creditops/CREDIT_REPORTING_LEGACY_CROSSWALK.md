# Legacy crosswalk — every current rule, template and claim against the Rulebook

Audited 2026-09-07 by reading the files named. Governed by
`CREDIT_REPORTING_INTELLIGENCE_RULEBOOK.md`.

**No code was changed to produce this document.** Everything below describes
the repository as it stands.

| Verdict | Meaning |
|---|---|
| `KEEP` | Already consistent with the Rulebook |
| `KEEP_WITH_QUALIFICATION` | Sound, but needs a narrower or clearer statement |
| `REWRITE` | The intent is right, the wording or the legal basis is wrong |
| `REJECT` | Doctrinally wrong. Remove; do not preserve because tests exist |
| `SUPERSEDED` | A newer implementation already does it correctly |
| `LEGAL_REVIEW_REQUIRED` | Cannot be settled by engineering |
| `SOURCE_UNVERIFIED` | Rests on material we cannot produce |

---

## 0. L-01 — FIXED 2026-09-07 (CR-4a)

**Resolved.** What follows is kept as the record of what was wrong and why.
The fix is described under L-01 below; regression tests are in
`src/lib/dispute/account-recognition.test.ts` (21) and the enclosure suite in
`letter-composer.test.ts` (6).

**L-01 was reachable in the product**, through
`ClientDetail.tsx → LettersTab.tsx → TrapStrategyPanel.tsx`. It instructs staff
that a federal identity-theft report at IdentityTheft.gov is **"Required for
third-party collections."**

A collection account is not evidence of identity theft. The FTC warns
specifically against false identity-theft reports used as a credit-repair
tactic, and filing one is a false statement to a federal agency. This is not
doctrine drift; it is advice to do something potentially unlawful, shown to an
operator.

Nothing was changed during the reconciliation itself; the fix landed
separately as CR-4a, ahead of every architectural delta, as planned.

> **Approach revised 2026-09-07 on Dee's correction.** The fix is *not* to
> replace one instruction with a stricter one. BES is an education, workflow
> and decision-support platform, not an evidence-gating system. See Rulebook
> §0.5, and the revised implementation approach under L-01 below.

---

## 1. The two round engines — RESOLVED 2026-09-07 (CR-4b)

`rounds-and-layers.ts` and its test are **deleted**. Its three callers moved to
`escalation-ladder.ts`; the grep proving no product caller remained is in the
CR-4b commit. There is now one engine, not three — no replacement was built.

What follows is the record of what was wrong.

| | `rounds-and-layers.ts` | `escalation-ladder.ts` |
|---|---|---|
| Model | 7-layer pressure ladder, TRAP round 1 | 12 rounds, each **earned by the record** |
| Framing | *"convert a simple dispute into a documented compliance failure case"* | Entry requirements per round; willfulness gated behind evidence |
| Reached by | `NextStepsTab`, `RoundEscalationPanel`, `package-builder` — all live via `ClientDetail` | `letter-composer` |
| Verdict | **DELETED 2026-09-07** | **KEEP — and corrected, see L-03** |

`escalation-ladder.ts` is the correct engine and already carries the right
comment at line 118: *"§1681i(a)(7) gets a DESCRIPTION of the procedure. It
does not entitle…"*. The resolution is to retire `rounds-and-layers.ts`, not to
reconcile the two.

---

## 2. Findings

### L-01 — FTC identity-theft filing "required for third-party collections"

- **Where:** `src/lib/dispute/letters-and-channels.ts:19` (`TRAP_CHANNELS.FTC`)
- **Claim:** *"Identity theft / fraud report filed at identitytheft.gov.
  Required for third-party collections and eligible inquiries."*
- **Why wrong:** Rulebook §1.15 and §15. A collection is not proof of identity
  theft, and BES must not conclude identity theft on its own.
- **Verdict: `REJECT` the claim. FIXED 2026-09-07 (CR-4a).**

#### What shipped

| Change | File |
|---|---|
| Four operator states, provenance labels, and neutral guidance per state. Nothing inferred from an item — a person selects one | **new** `src/lib/dispute/account-recognition.ts` |
| `TRAP_CHANNELS.FTC` reworded; `requiresFTC()` **deleted**, not renamed, so nothing can answer this question from an account; `FTC_RULES` became `FTC_CONSUMER_RESOURCES` with a caution on each; `ftcResourceFor(category, recognition)` requires the recorded statement | `letters-and-channels.ts` |
| `LetterCategory.requiresFTC` → `ftcResourceRelevant` — the field name was itself the bug | `letters-and-channels.ts` |
| `ftcRequired` no longer derived from the category; false until a recognition is threaded through | `package-builder.ts` |
| Four-state selector, guidance, provenance line; the § 1681c-2 "block fraudulent tradeline" instruction moved out of the general preset list and offered only on a reported identity theft; a dead `ftcRule` removed | `ItemDetailPanel.tsx` |
| FTC card no longer says "filings required" | `TrapStrategyPanel.tsx` |
| `evaluateTruthGate`: blocks only where the consumer **reports** identity theft and their statement is unrecorded; "does not recognize" produces a note, not a block; **no path blocks for a missing document** | `metro2-guardrails.ts` |
| A letter naming evidence not in the enclosures is `unresolved` and not `ready` | `letter-composer.ts` |

The existing composer test fixture named an enclosure the envelope did not
contain — the defect the new rule catches, sitting in the test suite. The
fixture was corrected, not the rule.

#### Implementation approach — revised 2026-09-07

The first draft of this fix replaced a bad instruction with a gate: ask the
consumer, then require documentation. Dee's correction: **that is not BES's
call to make.** Evidence lives outside BES, and each Organization runs its own
SOP.

**What is removed:** the word *"Required"*, and any automatic path from an
account type to an identity-theft action.

**What replaces it — neutral education plus recorded operator states.**

On a third-party collection, BES shows:

> This account type alone does not establish identity theft. If the consumer
> confirms the account resulted from identity theft, follow your
> organization's identity-theft dispute SOP.

and offers four states, none of which requires an upload:

| State | BES records | BES then |
|---|---|---|
| Consumer confirms identity theft | The confirmation, who recorded it, when | Explains the § 1681c-2 route and IdentityTheft.gov **as education**; surfaces this Organization's SOP if configured |
| Consumer does not recognize account | Exactly that | Suggests verification steps. **Not treated as an identity-theft claim** |
| Account is recognized | Exactly that | Routes to ordinary factual dispute analysis |
| Needs further review | Exactly that | Leaves it in the review queue |

**Hard guardrail retained:** BES never concludes identity theft, never
instructs an FTC filing off an account type, and never puts an identity-theft
claim in the consumer's voice that the consumer did not make.

**Not a guardrail:** requiring a file before the operator may proceed. An
Organization may configure that for its own staff later; BES does not impose
it.

#### Related finding — a conflation to fix with L-01

`metro2-guardrails.ts` `evaluateTruthGate` blocks whenever
`consumerRecognizesAccount === "no"` and no identity-theft certification is
present. That treats *"I don't recognise this"* as an identity-theft claim —
the same conflation as L-01, one layer down. `evaluateBreachGuardrail` in the
same file already separates the states correctly and is the pattern to follow.

Note also that the same function already handles evidence the right way:
`supportingDocuments.length === 0` produces a **`requiredForFiling` note, not a
block**, which is exactly the doctrine in Rulebook §0.5. That half needs no
change.

**Scope:** L-01 and this conflation only. Per instruction, not broadened into
the other legacy fixes. Both shipped together in CR-4a.

**Noticed in CR-4a, fixed in CR-4b:** the composer's opening read *"I am asking
you to correction of the exact field that is wrong"*. `asksFor` entries are
noun phrases, so the frame was wrong, not the content. Now *"What I am asking
for is correction of the exact field that is wrong…, under 15 U.S.C.
§ 1681i(a)."* Legal meaning untouched; four tests hold it.

### L-02 — "TRAP" multi-channel pressure from Round 1

- **Where:** `letters-and-channels.ts:6–28`; `rounds-and-layers.ts:81`
  (`Round 1 — TRAP Filing`); `TrapStrategyPanel.tsx`
- **Claim:** CRA + FTC + CFPB filed together at Round 1; *"multi-channel
  pressure"*; CFPB *"complaint filed by category. Separate complaint per
  negative category."*
- **Why wrong:** Rulebook §0 — the sequence is fact → duty → party → channel.
  Channel is chosen from the facts, not fired in parallel by category. CFPB
  intake for inaccurate-reporting complaints has prerequisites (a prior CRA
  dispute, and an attestation tied to it no longer being pending or the stated
  period having run), so a category-driven Round 1 complaint is premature.
- **Verdict: `REJECT`. FIXED 2026-09-07 (CR-4b).**
  - `TRAP_CHANNELS` → `DISPUTE_CHANNELS` (old name kept as a deprecated alias).
    Header rewritten: a round may be just *fact → recipient → dispute →
    result*.
  - CFPB description now names its **prerequisites** — a prior dispute with the
    bureau and an attestation about it — and says the consumer files it, not
    BES. "By category. Separate complaint per negative category." is gone.
  - `LetterCategory.requiresCFPB` → `cfpbResourceRelevant`, matching
    `ftcResourceRelevant` from CR-4a. Relevance decides what to *explain*.
  - `package-builder`: `trapChannels` and `layersActivated` removed;
    `cfpbComplaints` → `cfpbRelevantCategories`, counted as context.
  - `TrapStrategyPanel` → **`DisputeChannelsPanel`**. It read "TRAP Strategy /
    CRA + FTC + CFPB / Multi-channel pressure from Round 1. Every channel fires
    simultaneously to establish the compliance record." It now reads "Channels
    for this round / Context, not a checklist", and closes with the line that
    matters: your organization's own SOP decides which it uses.
  - 12 tests in `letters-and-channels.test.ts` assert the words: no
    "required", no "must file", no "fires simultaneously", no "pressure".

### L-03 — Direct furnisher dispute "activates § 1681s-2(b)"

- **Where:** `rounds-and-layers.ts:31` (Layer 2 description) and `:123`
  (Round 3 required action)
- **Claim:** *"Direct dispute to the creditor or collection agency under FCRA
  §1681s-2(b)"* / *"Activate furnisher obligations under FCRA §1681s-2(b)"*
- **Why wrong:** Rulebook §1.17 and §8. § 1681s-2(b) attaches to a
  **CRA-forwarded** dispute. A direct consumer dispute runs under
  § 1681s-2(a)(8) and Reg V § 1022.43 — which **excludes** disputes prepared by
  a credit repair organization. Since BES prepares them, the promise is doubly
  wrong.
- **Verdict: `REJECT`. FIXED 2026-09-07 (CR-4b).**

  All 18 references were read and classified rather than swept:

  | Kept — legitimate CRA-forwarded usage | Why |
  |---|---|
  | `reporting-integrity-rules.ts:163` | The `furnisher_via_cra` route, with the caution "Triggered by the CRA's notice under § 1681i(a)(2), not by a direct letter" — already exactly right |
  | `metro2-engine.ts` ×5 | Every one is a warning *against* the misuse, including "Do not claim a direct certified-mail dispute 'activates §1681s-2(b)'" |
  | `knowledge/fcra-sections.ts:89` | Reference material on § 623(b) |
  | `metro2-engine.test.ts:204` | Tests the above |

  | Removed — incorrect direct-furnisher usage | |
  |---|---|
  | `rounds-and-layers.ts` ×7 | Deleted with the engine |
  | `rounds-and-layers.test.ts:44` | Deleted with the engine |
  | **`escalation-ladder.ts:138` (round 3, direct dispute)** | **Found during CR-4b — the correct engine had the error too.** § 1681s-2(b) removed; Reg V § 1022.43 retained as what a direct dispute must comply with, with a comment that whether it governs depends on `DISPUTE_ORIGIN` and awaits primary-source verification |
  | **`escalation-ladder.ts:213` (round 8, executive office)** | Also found in CR-4b. § 1681s-2(b) removed; § 1022.42 retained as the provision that round actually speaks to |

  **No replacement categorical promise was added**, per instruction. Round 3
  keeps its neutral name, "Direct dispute to the furnisher", and now claims no
  statutory trigger at all.

- **Corroborating gap, unchanged:** § 1681s-2(a)(8) still appears **nowhere**
  in `src/`. Adding it is a legal-routing decision that waits on counsel
  (Source Register §9 item 1), not a find-and-replace.
- A test asserts **no round in the ladder cites § 1681s-2(b)**.

### L-04 — Method of Verification over-claim

- **Where:** `rounds-and-layers.ts:99–104`; `ItemDetailPanel.tsx:46`;
  `OperationsSections.tsx:240`; `LetterLibrarySection.tsx:22`
- **Claim:** *"Force the bureau to produce verification records"*; *"Request:
  method of verification, date of verification, furnisher verification method,
  data furnisher used"*
- **Why wrong:** Rulebook §11. § 1681i(a)(7) concerns a **description of the
  procedure**, plus furnisher business name, address and telephone where
  reasonably available. It is not a production right.
- **Verdict: `REWRITE`. FIXED 2026-09-07 (CR-4b).**
  - `escalation-ladder` round 2: "Method of verification" →
    **"Reinvestigation procedure request"**; `REQUIREMENT_LABELS.mov_requested`
    → "a description-of-procedure request already sent".
  - `ItemDetailPanel` preset instruction → "Describe the procedure used to
    reinvestigate, and provide the furnisher's business name, address and
    telephone number." Substance was already within the statute; only the label
    and framing were wrong.
  - `OperationsSections` template name → "Reinvestigation Procedure Request
    Template".
  - `knowledge/qa-entries.ts` carried a **wrong citation** — it attributed the
    procedure request to **FCRA § 609**. Corrected to § 611(a)(7)
    (15 U.S.C. § 1681i(a)(7)), and the entry now states plainly that it does
    not entitle a consumer to the contract, the ledger or the investigation
    file. Found during CR-4b; not previously recorded.
  - `knowledge/fcra-sections.ts` and `knowledge/violations.ts` reworded.
  - The `mov` letter-kind enum value is unchanged — an internal identifier.
- A test asserts no round's `asksFor` mentions a signed contract, a payment
  ledger, an investigation file, or "full verification documentation".

### L-05 — Round 3 demands the contract and ledger

- **Where:** `rounds-and-layers.ts:124`
- **Claim:** *"Request: payment ledger, contractual agreement, date of first
  delinquency, Metro 2 reporting justification, full account verification
  documentation"*
- **Why wrong:** Rulebook §11. No provision entitles a consumer to the contract,
  the ledger or the investigation file as of right.
- **Verdict: `REJECT`. FIXED 2026-09-07 (CR-4b)** — deleted with the engine.

### L-06 — The pressure ladder, rounds 4–7

- **Where:** `rounds-and-layers.ts:133–200` — compliance officer → chief risk
  officer → general counsel legal-exposure notice → executive office →
  regulatory pressure; and the header, *"Objective: convert a simple dispute
  into a documented compliance failure case."*
- **Why wrong:** Rulebook §0. Escalation is earned by the record, not scheduled
  by round number. Naming the objective as building a compliance-failure case
  inverts truth-first.
- **Verdict: `SUPERSEDED`. DELETED 2026-09-07 (CR-4b)** in favour of
  `escalation-ladder.ts`, which requires `willfulness_record`,
  `consumer_authorised_legal` and `human_review_complete` before any § 1681n
  round. `RoundEscalationPanel` was rewritten against it: instead of "Layer 4
  active" it now shows who the round is addressed to, what it asks for, and
  **what must already be true** before it is worth sending. Every round stays
  selectable — the ladder shows availability, it does not enforce a sequence.

### L-07 — External system statuses baked into the round model

- **Where:** `rounds-and-layers.ts` — `statusAfter: { clickup, googleSheet }`;
  Round 1 *"Mail all Round 1 letters via LetterStream"*
- **Why wrong:** ClickUp and Google Sheets are not part of the product; the
  mailing provider is **Lob** (rule 19).
- **Verdict: `SUPERSEDED`. DELETED 2026-09-07 (CR-4b)** with the engine that
  held them.

### L-08 — "delete if unverifiable" as the standing request

- **Where:** `ItemDetailPanel.tsx:44`; `metro2-engine.ts:88`
- **Claim:** *"Please reinvestigate under FCRA §1681i and delete if
  unverifiable."*
- **Why partly wrong:** Rulebook §12. § 1681i(a)(5)(A) contemplates deletion
  **or modification**. The phrasing is not false, but it presents deletion as
  the only outcome and trains the operator to expect it.
- **Verdict: `KEEP_WITH_QUALIFICATION`.** "…delete **or modify** as
  § 1681i(a)(5)(A) requires."
- **Note:** `metro2-engine.ts:88` is better — it asks for the DOFD to be
  corrected *or* deleted if unverifiable. That is the pattern to copy.

### L-09 — Willfulness

- **Where:** `escalation-ladder.ts:256–272, 337`; `decision-engine.ts:142`;
  `letter-voice.ts:20, 123`
- **Finding:** already correct. Willfulness is a finding requiring a
  `willfulness_record` (*"repeated notice of the same error with responses that
  did not address it"*), consumer legal authorisation and completed human
  review; `letter-voice` explicitly refuses *"You are willfully breaking the
  law"*; `decision-engine` routes to human review citing Safeco.
- **Verdict: `KEEP`.**

### L-10 — Cross-bureau difference ≠ unverifiable

- **Where:** `decision-engine.ts:9`; `metro2-engine.ts:182`;
  `reporting-integrity-rules.ts:135` (BUREAU.MISSING_ON_ONE);
  `DisputeDashboard.tsx:234`
- **Finding:** already correct, in four places, in the right words —
  *"Cross-bureau inconsistency is an investigation trigger, not proof of
  unverifiability"*; *"Deletion or absence at one bureau never proves another
  cannot verify it."*
- **Verdict: `KEEP`.**

### L-11 — "Inaccurate = must delete"

- **Where:** `decision-engine.ts:5–7`; `LegalPathPanel.tsx:294`
- **Finding:** already rejected in code, explicitly: *"Replaces absolute legal
  assertions ('inaccurate = must delete')… §1681i(a)(5)(A) says delete OR
  modify."*
- **Verdict: `KEEP`.**

### L-12 — Forbidden-phrase gate on letters

- **Where:** `letter-merge.ts:14–15`
- **Finding:** already blocks *"guarantee"*, *"willful violation"*, *"willful
  noncompliance"*, *"metro 2 violation"*, *"fraudulent"*, *"illegal
  reinsertion"*, *"must delete"*, *"must be deleted"*, *"unverifiable
  because"*, *"data breach"*, *"you are required to ensure maximum possible
  accuracy"*. Enforced at the QA gate — matrix phase 23 proves a forbidden
  phrase blocks approval.
- **Verdict: `KEEP`, and extend** with the Rulebook §22 list: *"FCRA violation
  detected"*, *"guaranteed deletion"*, *"unverifiable because another bureau
  deleted it"*, *"willful violation confirmed"*.

### L-13 — Breach exposure and identity theft

- **Where:** `metro2-guardrails.ts` `evaluateBreachGuardrail`
- **Finding:** already correct — breach exposure alone refuses the pathway,
  which needs all three of: not recognised, unauthorised transaction confirmed,
  identity-theft report filed. Asserted exhaustively in tests added 2026-09-07.
- **Verdict: `KEEP`.** One known weakness: the "no report on file" branch
  returns an unhelpful message while correctly keeping the gate shut
  (`ENGINE_INVENTORY.md` §4).

### L-14 — Permissible purpose

- **Where:** `metro2-guardrails.ts` `analyzeInquiry`
- **Finding:** already correct and explicitly labelled as replacing *"the
  dangerous 'absence of written authorization = unauthorized inquiry' rule"*.
  Unsure → `needs-investigation` / `observed-difference`, never a § 1681b
  finding.
- **Verdict: `KEEP`.** Rulebook §13 asks for a wider context list (collection
  activity, insurance, employment, written instructions are present; "other
  applicable statutory purpose" is not). **Minor `REWRITE`.**

### L-15 — FCBA

- **Where:** `metro2-guardrails.ts` `checkFcbaEligibility`
- **Finding:** already correct — an explicit eligibility gate that refuses
  *"I was late but want it removed"*, refuses closed-end credit, and refuses
  once the 60-day window has passed.
- **Verdict: `KEEP`.** One documented judgment call: a payment confirmation
  outranks the consumer's own admission of lateness (`ENGINE_INVENTORY.md` §4).

### L-16 — Current status with historical lates

- **Where:** `reporting-integrity-rules.ts` STATUS.CURRENT_WITH_HISTORY;
  `condition-detector.ts` `paid_status_but_late_marks`
- **Finding:** already correct — classified as *"different time dimensions"*
  and `not_an_error` unless the consumer attests never-late.
- **Verdict: `KEEP`.**

### L-17 — Date Updated is not DOFD

- **Where:** `reporting-integrity-rules.ts` DOFD.MOVED_LATER
- **Finding:** partially correct. It compares **DOFD** across snapshots, not
  Date Updated, which is right. But it does not reconstruct cure, and it treats
  the absence of a derogatory remark as the only guard.
- **Verdict: `KEEP_WITH_QUALIFICATION`** — needs the Rulebook §10 sequence
  (last current period → initial delinquency → cure? → delinquency preceding
  charge-off → reported DOFD). Blocked on the chronology proposal.

### L-18 — Reinsertion

- **Where:** `reporting-integrity-rules.ts` ITEM.REAPPEARED;
  `metro2-engine.ts` `detectReinsertion`; `condition-detector`
  `reinserted_after_deletion`
- **Finding:** mostly correct. ITEM.REAPPEARED prompts *"Check whether the
  absence followed a reinvestigation deletion"* rather than asserting.
  `detectReinsertion` separately flags a missing certification and a missing
  5-day notice.
- **Verdict: `KEEP_WITH_QUALIFICATION`.** Rulebook §10 adds two questions
  neither engine asks: *is this the same obligation and entity?* and *was the
  absence merely incomplete reporting?* — the second matters because an
  incomplete import currently looks identical to a deletion.

### L-19 — Security freeze on secondary bureaus

- **Where:** `letters-and-channels.ts:30–130`; `RoundLettersPanel.tsx` letter
  kind `freeze`
- **Finding:** the registry is LexisNexis, SageStream, ChexSystems, ARS,
  CoreLogic, Innovis. Freezing a specialty consumer reporting agency is a
  lawful consumer right. **It is not a verification-defeat tactic here** — no
  code frames it as one, and nothing sequences it to obstruct an
  investigation.
- **Verdict: `KEEP`.** Recorded because Dee's list named it; the audit did not
  find the abuse. Guardrail to add to the Rulebook when the letter library is
  next touched: a freeze is never offered as a way to make an item
  unverifiable.

### L-20 — e-OSCAR evasion tactics

- **Searched for:** e-OSCAR, randomize, vary wording, disguise, evade,
  obfuscate.
- **Finding: none present.** No spelling randomisation, no font or colour
  tactics, no citation randomisation, no CRO concealment. `letter-voice.ts`
  varies register deliberately and openly, and refuses legal conclusions.
- **Verdict: `KEEP`** — nothing to reject.

### L-21 — Metro 2 mismatch = FCRA violation

- **Where:** `metro2-taxonomy.ts` `AnomalyClassification`;
  `metro2/types.ts`; `reporting-integrity-rules.ts`
- **Finding:** already correct. `established-violation` exists in the taxonomy
  and **no engine may produce it** — asserted by test. Every integrity finding
  carries `rawMetro2Verified: false`, and the strongest classification an
  engine can reach is "potential legal issue".
- **Verdict: `KEEP`.** Rulebook §4 renames the levels; the semantics already
  match.

### L-22 — Metro 2 status codes

- **Where:** `metro2-status-rules.ts` — 21 Account Status codes
- **Finding:** derived from Appendix 1 of the BES defect catalogue, which is
  **not in the repository and cannot be produced**. It may also contain
  CRRG-derived definitions.
- **Verdict: `SOURCE_UNVERIFIED` **and** `LICENSE_REVIEW_REQUIRED`.** The
  displayed-vs-inferred gate in `resolveStatusCode` is sound and stays; the
  code table itself cannot be extended, and should not be presented
  customer-facing, until both questions are answered.

### L-23 — "Metro 2 Intelligence" as a product name

- **Where:** `Metro2IntelligencePanel.tsx`, `Metro2IdentityPanel.tsx`, the
  `/app/metro2` route, `metro2-intelligence.ts`
- **Why wrong:** Rulebook §3 and §22. BES analyses consumer-facing displays.
  Naming the module "Metro 2" claims a validation capability BES does not have
  (that is V2).
- **Verdict: `REWRITE`. FIXED 2026-09-07 (CR-4b).** Customer-facing labels only;
  internal filenames and identifiers unchanged, per instruction.
  - "Open Accuracy Inspector" → **"Credit Report Accuracy & Data Integrity
    Analysis"** (`DisputeDashboard`)
  - "Identity reporting (Metro 2 Section A)" → **"Personal information
    accuracy"**, with a subtitle stating it reads the consumer-facing report,
    not the furnisher's transmitted record, so a finding is never a verified
    Metro 2 field result
  - Copilot tab "Metro 2" → **"Metro 2 reference"** — it renders the field
    reference, which is education about the format and stays
  - `Metro2IntelligencePanel` header comment records why the rename happened
  - **Not renamed:** `Education.tsx`'s "Metro 2 Field Reference Guide". It
    teaches the format honestly and `knowledge/metro2-fields.ts` already
    carries the CDIA caveat.

### L-24 — § 1692e(8) citations

- **Where:** `legal-paths.ts`, `decision-engine.ts` — 13 occurrences
- **Finding:** used for a collector communicating disputed information without
  noting the dispute. Correct in substance, but no gate checks that the
  recipient is actually a **debt collector under the FDCPA** rather than an
  original creditor.
- **Verdict: `KEEP_WITH_QUALIFICATION`** — add the coverage gate before this
  citation reaches a letter. Rulebook §8.

### L-25 — Score simulator

- **Where:** `score-*.ts`, the Score Simulator tab
- **Finding:** already labelled educational; no licensed model is claimed.
- **Verdict: `KEEP`.** Rulebook §22 language applies to its headings.

---

## 3. Summary

| Verdict | Count | Items |
|---|---|---|
| `REJECT` | 4 | **all FIXED 2026-09-07** — L-01 (CR-4a), L-02, L-03, L-05 (CR-4b) |
| `SUPERSEDED` | 2 | **both DELETED 2026-09-07 (CR-4b)** — L-06, L-07 |
| `REWRITE` | 3 | **L-04, L-23 FIXED (CR-4b)**; L-14 (minor) outstanding |
| `KEEP_WITH_QUALIFICATION` | 5 | L-08, L-17, L-18, L-24, plus L-12's extension |
| `KEEP` | 10 | L-09, L-10, L-11, L-12, L-13, L-15, L-16, L-19, L-20, L-21, L-25 |
| `SOURCE_UNVERIFIED` + `LICENSE_REVIEW_REQUIRED` | 1 | L-22 |

**Eight of the nine are corrected as of 2026-09-07** (CR-4a and CR-4b). One
remains: **L-14**, widening `analyzeInquiry`'s § 1681b context list with "other
applicable statutory purpose" — minor, and it waits on the primary-source pass.

Two things the fix work found that the audit had not:

1. **`escalation-ladder.ts` carried the L-03 error too**, on rounds 3 and 8.
   The "correct" engine was not clean; only its comments were.
2. **`knowledge/qa-entries.ts` cited FCRA § 609** for the reinvestigation
   procedure request. The provision is § 611(a)(7).

The legacy doctrine was contained rather than diffuse, as hoped — but it had
leaked one citation into the good engine and one wrong section number into the
knowledge base.

The newer engines (`escalation-ladder`, `decision-engine`, `legal-paths`,
`metro2-guardrails`, `letter-merge`, `letter-voice`, `metro2/`) already
implement the Rulebook. They were written against the same principles and need
renaming, not rethinking.
