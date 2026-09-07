# CreditOps detection engine — what it actually detects today

Written 2026-09-07, by inspection of the code, not from the register and not
from memory. Every row below was read out of the file named in it.

**Updated the same day**, after the five catalogue-independent corrections in
§2 were made. Sections 1.x describe the engine as it stands now; §2 records
what each correction was and §5 documents the one gap that could not be closed
without a canonical-model change.

**Why this document exists.** The Master Completion Register carries a row
reading *"Metro 2 Sections B–P — PENDING — ~293 defects"*. Dee's instruction of
2026-09-07: do not write rules against that number until its source is traced.
Section 3 of this document is that trace. Sections 1 and 2 are the inventory
that has to come first, because a catalogue can only be reconciled against an
engine somebody has actually enumerated.

---

## 0. The four engines, and why there are four

They are not four attempts at one thing. They answer four different questions
and produce four different outputs.

| Engine | File | Question it answers | Output |
|---|---|---|---|
| **Condition detector** | `condition-detector.ts` | What is wrong with this account's reporting, in terms a letter can be built from? | `ReasonCondition[]` + confidence |
| **Reporting-integrity engine** | `reporting-integrity-engine.ts` (+ `reporting-integrity-rules.ts`) | Which named rule is engaged, on whose authority, and who should receive the dispute? | `IntegrityFinding[]` with route + remedy |
| **Metro 2 field registry** | `metro2/` | Which FIELD carries a defect, with the permitted claim and recipient? | `Metro2Finding[]` for the disputed-field table |
| **Metro 2 intelligence** | `metro2-engine.ts`, `metro2-taxonomy.ts`, `metro2-guardrails.ts`, `metro2-status-rules.ts`, `metro2-field-codes.ts` | Field-level anomaly classification, status-code arithmetic, the comparison grid, and the guardrails that stop a wrong letter | Various, per function |

**What is actually wired, corrected 2026-09-07.** The reporting-integrity
engine is the canonical flow: `report_items → evaluateReports() →
IntegrityFinding[] → saveFindings() → report_findings → human_disposition →
dispute`. **Section A now feeds that same flow** through
`metro2/to-integrity-finding.ts`, so an identity defect is saved to the client
record and dispositioned by a person like every other finding — it is no longer
rendered and discarded.

**The condition detector has no product caller at all.** `detectConditions` is
invoked only by its own tests. `letter-composer` imports its *types* and never
runs it. The cause is the same model gap as §5: the detector's input is
`BureauRecord[]`, one record per bureau, and nothing in the application can
build one. Thirty-one conditions and a reason-selection engine sit behind that
one missing input. This is the single largest piece of unreachable CreditOps
logic and it is not a rules problem.

---

## 1. Detection rules, grouped as Dee asked

Legend for **Provenance captured**: what the finding carries with it so a claim
can be traced back. `—` means the finding carries no source reference.

### 1.1 Personal information

| Rule ID | Input fields required | Deterministic condition | Output / finding | Provenance captured | Tests |
|---|---|---|---|---|---|
| `A1` | none (reads `attestedNotMine`, `reportedName`, `verifiedName`) | Consumer has signed that the account is not theirs, **or** the reported name does not agree with the verified name | `confirmed` when attested; `apparent` on name alone | `catalogue: A.1`, `sourceKind: metro2_format`, permitted claim, recipient | `metro2/section-a-identity.test.ts` (28 tests across A1–A20) |
| `A2` | `reportedName`, `verifiedName` | `namesAgree()` is false — surnames differ outright, or given names are incompatible beyond abbreviation/initialisation | `confirmed` mismatch; `not_an_error` for cosmetic differences | same | same file |
| `A4` | `reportedSsnLast4`, `verifiedSsnLast4` | Last four digits differ | `confirmed` | same | same file |
| `A6` | none (reads `reportedSsnLast4`, `reportedDob`) | Neither SSN nor date of birth is reported anywhere on the item | `confirmed` deficiency | same | same file |
| `A12` | `documentedRelationship` | Displayed ECOA code, or its label, contradicts the documented relationship | `confirmed` only when the ECOA code was **displayed**; `apparent` when inferred from a label | same, plus displayed-vs-inferred | same file |
| `A14` | `isCollection` | Item is a collection **and** the ECOA designation is authorised user | `confirmed` | same | same file |
| `A16` | `reportedDeceased` | Reported deceased **and** the consumer has signed that they are not | `confirmed`; `apparent` without the signed statement | same | same file |
| `A20` | `reportedAddress`, `knownAddresses` | Reported address matches none of the consumer's verified addresses | `confirmed` | same | same file |

**Not detected here:** anything about personal information that the consumer has
not verified. The engine never guesses a consumer's real name, SSN or address
from the report itself — every A-rule compares the report against something a
person supplied and signed.

### 1.2 Account identity

| Rule ID | Input fields required | Deterministic condition | Output / finding | Provenance captured | Tests |
|---|---|---|---|---|---|
| `data_missing_or_deficient` | any of the 13 `EXPECTED_FIELDS` incl. `accountNumberMasked`, `accountType` | Field is blank on **every** bureau | `confirmed`, except the four fields a collection is expected to leave blank (`monthlyPayment`, `creditLimit`, `termMonths`, `highBalance`) which are `not_an_error` | — (condition name only) | `condition-detector.test.ts` |
| `auto_loan` / `student_loan` / `medical` / `open_revolving` | `item.subtype`, `item.category`, `item.name` | Substring match on the report's own classification | `confirmed` — these are facts, not findings | — | `condition-detector.test.ts` |
| Comparison grid | `GridInput` per bureau | Builds one row per Metro 2 display field, marks rows where bureaus differ | 12 `GridRow`s with `marked` flags | **BS- field codes**: BS-7, 8, 9, 10, 11, 12, 13, 15, 17A, 17B, 19, 21, 22, 27 | `metro2-field-codes.test.ts` (9) |

**Gap found during this inventory:** the grid and the detector both read the
account number, but **nothing compares account numbers, creditor names or
account types BETWEEN bureaus as a defect**. The grid marks the row visually;
no rule produces a finding from it.

### 1.3 Balances

| Rule ID | Input fields required | Deterministic condition | Output / finding | Provenance captured | Tests |
|---|---|---|---|---|---|
| `balance_above_high_credit` | `balance`, `highBalance` (same bureau) | `balance > highBalance` | **`apparent`** — fees and accrued interest legitimately exceed the original high credit | — | `condition-detector.test.ts` |
| `charge_off_with_balance` | `status`, `balance` | status contains "charge" and `balance > 0` | `apparent` — a charge-off is an accounting event, not forgiveness | — | `condition-detector.test.ts` |
| `discharged_with_balance` | `status` or `remarks`, `balance` | discharged/bankruptcy wording with `balance > 0` | `apparent` | — | `condition-detector.test.ts` |
| `collection_with_past_due` | `status`/category, `pastDue` | collection with `pastDue > 0` | **`not_an_error`** — recorded so nobody disputes it | — | `condition-detector.test.ts` |
| `STATUS.PAID_WITH_BALANCE` | `status`, `balance` | paid wording with `balance > 0`, excluding "unpaid", "paid charge", "settled for less" | `potential_anomaly` / `suspicious`, route `cra`, remedy `investigate_first` | **CFPB v. Santander consent order**, rule id + version + catalogue version | `reporting-integrity-engine.test.ts` (13) |
| `STATUS.CHARGEOFF_WITH_BALANCE` | `status`, `balance` | charge-off with a balance | classified explicitly as *not* a contradiction by itself | authorities on the rule | same |
| Status-code arithmetic | `displayedCode` or `statusLabel`, `balance`, `pastDue`, `paymentRating`, `reportedDaysPastDue` | For each of **21 Account Status codes**: `requiresZeroBalance`, `requiresZeroPastDue`, `requiresPaymentRating`, `daysPastDue` range | `StatusDefect[]`; `confirmed: true` **only when the code was displayed**, never when inferred from a label | Appendix 1 of the uploaded defect catalogue; codes 05, 11, 13, 61–65, 71, 78, 80, 82–84, 88, 89, 93–97 | `metro2-status-rules.test.ts` (15) |

**Not detected today:** past due greater than the balance; a zero balance
carrying an amount past due; a revolving balance above the credit limit; a
scheduled monthly payment on a closed or charged-off account.

### 1.4 Account status

| Rule ID | Input fields required | Deterministic condition | Output / finding | Provenance captured | Tests |
|---|---|---|---|---|---|
| `status_inconsistent` | `status`, `paymentStatus` from ≥2 bureaus | distinct values > 1 | `confirmed` | — | `condition-detector.test.ts` |
| `STATUS.CURRENT_WITH_HISTORY` | `status`, `remarks` | current/paid today with past-late **remarks** | classified as different time dimensions, not a contradiction | authorities on the rule | `reporting-integrity-engine.test.ts` |
| `paid_status_but_late_marks` | `status`/`paymentStatus`, `paymentHistory` | paid/current wording with ≥1 late mark in the grid | **`not_an_error`** by default; `apparent` **only** when the consumer has attested "never late" | — | `condition-detector.test.ts` |
| `resolveStatusCode` | `displayedCode`, `statusLabel` | Maps a printed label back to a code and records whether it was **displayed or inferred** | `CodeResolution` — the gate that stops an inferred code producing a confirmed defect | catalogue Appendix 1 | `metro2-status-rules.test.ts` |
**Resolved 2026-09-07:** `current_but_late_mark` was declared in the
`ReasonCondition` union and produced by no code path. It named exactly what
`paid_status_but_late_marks` already detects — that rule matches "current" and
"pays as agreed" as well as "paid" — so it was a duplicate reason semantic as
well as a dead one. **Removed**, with a comment left at the site so nobody
re-adds it. Nothing else referenced it: no catalogue reason required it, no
database enum or check constraint carried it.

### 1.5 Payment history

| Rule ID | Input fields required | Deterministic condition | Output / finding | Provenance captured | Tests |
|---|---|---|---|---|---|
| `payment_history_inconsistent` | `paymentHistory` from ≥2 bureaus | joined grids differ | `confirmed` | — | `condition-detector.test.ts` |
| `single_late_mark` / `multiple_late_marks` | `paymentHistory` | count of marks in {30,60,90,120,150,180} is 1 / >1 | `confirmed` (facts) | — | `condition-detector.test.ts` |
| `severe_late_without_prior_30` | `paymentHistory` | first 90+ mark has no "30" anywhere before it | `apparent` — deferment, forbearance, a cure and missing months all produce it legitimately | — | `condition-detector.test.ts` |

**Not detected today:** anything positional. No rule maps a grid slot to a
calendar month, so nothing can find a month rated before the account opened, a
delinquency date later than the delinquency the grid shows, a charge-off mark
without a charge-off status, or gaps inside the reported range.

### 1.6 Dates / delinquency

| Rule ID | Input fields required | Deterministic condition | Output / finding | Provenance captured | Tests |
|---|---|---|---|---|---|
| `dola_before_open_date` | `openDate`, `dateLastActive` | last activity month < open month | `confirmed` — "genuinely impossible" | — | `condition-detector.test.ts` |
| `dates_inconsistent` | any of `openDate`, `dateLastActive`, `dateLastPayment`, `dateClosed`, `dofd` from ≥2 bureaus | distinct values > 1 on **any one** of the five (stops at the first) | `confirmed` | — | `condition-detector.test.ts` |
| `DOFD.BEFORE_OPEN_DATE` | `dofd`, `openDate`, non-collection | DOFD month < open month | `potential_legal_issue`, human review required, route `cra` | **15 U.S.C. § 1681s-2(a)(5)**, **§ 1681c(c)**, CFPB advisory opinion on facially false data | `reporting-integrity-engine.test.ts` |
| `DOFD.ON_CURRENT_ZERO_BALANCE` | `dofd`, `status`, `balance`, `remarks` | current/paid, zero balance, no derogatory remark, yet a DOFD populated | `potential_anomaly` / `suspicious` | CFPB advisory opinion; **12 C.F.R. Part 1022, App. E** | same |
| `DOFD.MOVED_LATER` | `dofd` across ≥2 stored snapshots, `remarks` | earliest DOFD ≠ current DOFD, later, with no new delinquency in the remarks | `potential_legal_issue` | authorities on the rule | same |

| **Missing DOFD, where relevant** *(added 2026-09-07)* | `status`, `subtype`, per-bureau `status`/`paymentStatus`/`remarks`/`paymentHistory`, `dofd` | Account is a collection, OR reports derogatory wording, OR carries any late mark in the grid — **and** no bureau reports a DOFD | **`apparent`** with `needs`: "whether the bureau omits the date or the import did not capture it". On an account with nothing delinquent: `not_an_error`, recorded so the check is visibly considered | — (condition `data_missing_or_deficient`) | `condition-detector.test.ts` (7 new tests) |

`dofd` is deliberately **not** added to `EXPECTED_FIELDS`: on an account that
has never been late there is no delinquency to date, and making it universally
mandatory would flag every healthy tradeline. It is raised as APPARENT rather
than confirmed because "the bureau omits it" and "our import did not capture
it" look identical from here — missing source data is a review task, never a
reporting violation on its own.

**Still not detected:** a closing date before the opening date; a payment dated
before the account opened; any date later than the day the report was pulled; a
closing date on an account still reported open; obsolescence — nothing computes
the seven-year period from the DOFD.

### 1.7 Ownership / ECOA

| Rule ID | Input fields required | Deterministic condition | Output / finding | Provenance captured | Tests |
|---|---|---|---|---|---|
| `A12` | `documentedRelationship`, `ecoaCodeDisplayed` or `ecoaLabel` | displayed/inferred ECOA contradicts the documented relationship | `confirmed` only on a **displayed** code | catalogue A.12 | `metro2/section-a-identity.test.ts` |
| `A14` | `isCollection` | authorised user designation on a collection | `confirmed` | catalogue A.14 | same |
| `attested_no_written_consent` | signed attestation | consumer states there was no written consent | `confirmed` | — | `condition-detector.test.ts` |
| ECOA per bureau | — | **NOT DETECTED** | — | — | — |

`BureauRecord` carries no responsibility or ECOA field, so "individual at one
bureau, joint at another" cannot be evaluated. This is a **source-data**
limitation at import, not a missing rule.

### 1.8 Collections

| Rule ID | Input fields required | Deterministic condition | Output / finding | Provenance captured | Tests |
|---|---|---|---|---|---|
| `collection_with_past_due` | category/`status`, `pastDue` | collection carrying an amount past due | **`not_an_error`**, recorded deliberately | — | `condition-detector.test.ts` |
| Collection blanks | `monthlyPayment`, `creditLimit`, `termMonths`, `highBalance` | blank on a collection | **`not_an_error`** — the expected state | — | `condition-detector.test.ts` |
| `A14` | `isCollection` | authorised user on a collection | `confirmed` | catalogue A.14 | `metro2/section-a-identity.test.ts` |
| Section Q false positives | — | Encoded as notes in `metro2-status-rules.ts` | prevents wrong letters | uploaded catalogue, section Q | `metro2-status-rules.test.ts` |

**Not detected today:** a collection reporting a credit limit or a scheduled
payment (the inverse case — fields it should not have); a collection whose DOFD
falls after its own placement date; the same debt reported by both the original
creditor and the collector.

### 1.9 Inquiries

| Rule ID | Input fields required | Deterministic condition | Output / finding | Provenance captured | Tests |
|---|---|---|---|---|---|
| `analyzeInquiry` | `consumerRecognizesInquiry`, plus `hadCreditApplication`, `existingAccount`, `accountReview`, `collectionActivity`, `insurance`, `employment`, `writtenInstructions` | Decision tree over the **permissible purposes** in § 1681b | `PermissiblePurposeFinding` + classification + recommended route; returns "do not dispute" when a purpose is established | **15 U.S.C. § 1681b** | `metro2-guardrails.test.ts` (38 tests, added 2026-09-07) |
| Inquiry protection | `linkedCreditor` | An inquiry tied to an open account is protected from auto-selection | `linkedOpenAccount` on the classified item | — | classification tests |

**Not detected today:** inquiry age. Nothing computes whether an inquiry is
past the bureaus' twenty-four-month retention, and nothing checks an inquiry
dated after the report was pulled.

**Test gap closed 2026-09-07.** All four decision functions now have tests —
38 of them, written to prove the REFUSALS. No guardrail behaviour was changed.
Two behaviours are documented in the tests rather than altered, and are listed
in §4 below for a decision.

### 1.10 Public records

| Rule ID | Input fields required | Deterministic condition | Output / finding | Provenance captured | Tests |
|---|---|---|---|---|---|
| `discharged_with_balance` | `status`/`remarks`, `balance` | discharged or bankruptcy wording with a balance | `apparent` | — | `condition-detector.test.ts` |
| Public Record category | `item.kind` | Classified as a public record | routing/disposition only | — | classification tests |

**Not detected today: essentially everything.** No rule reads a filing date, a
discharge date or a satisfaction date. The ten-year bankruptcy period
(§ 1681c(a)(1)) and the seven-year judgment / paid-lien periods
(§ 1681c(a)(2)–(3)) are not computed anywhere. `RawReportItem` has no
`filedOn`, `chapter` or `satisfiedOn` field, so this is **partly** a
source-data gap as well as a missing-rule gap.

### 1.11 Cross-bureau comparison

| Rule ID | Input fields required | Deterministic condition | Output / finding | Provenance captured | Tests |
|---|---|---|---|---|---|
| `balance_inconsistent` | `balance` from ≥2 bureaus | distinct values > 1 | `confirmed` | — | `condition-detector.test.ts` |
| `status_inconsistent` | `status`/`paymentStatus` | distinct values > 1 | `confirmed` | — | same |
| `dates_inconsistent` | five date fields | distinct values > 1 on any | `confirmed` | — | same |
| `payment_history_inconsistent` | `paymentHistory` | grids differ | `confirmed` | — | same |
| `single_bureau_only` | `records.length === 1` | one bureau reporting | **`apparent`** — single-bureau reporting is permitted and common | — | same |
| `deleted_from_other_bureaus` | `deletedFromBureaus` | ≥1 bureau deleted it, others still report | **`apparent`** — one bureau's deletion does not bind another | — | same |
| `BUREAU.MISSING_ON_ONE` | `item.bureaus` | fewer than three bureaus report it | `observed_difference`; explicitly *not* proof of unverifiability | authorities on the rule | `reporting-integrity-engine.test.ts` |
| `BUREAU.VALUE_DIFFERS` | — | **CATALOGUED, DECLARED UNREACHABLE** — see §5 | none produced | authorities present; `blockedBy` states why | `reporting-integrity-engine.test.ts` (6 structural tests) |
| `detectAnomaly` | `field`, `values[]` per bureau, `hasSourceDocument`, `sourceDocumentContradictsReport`, `sameReportingPeriodConfirmed`, `consumerAssertedValue`, `isDebtCollector`, `consumerDisputedDebt`, `reportCommunicatesDispute` | Field-level: cross-bureau difference → potential Reg V issue; source document contradicting the report → evidence-supported inaccuracy; consumer assertion without a document → needs source document | `AnomalyResult` with classification + field verdict + evidence strength | Metro 2 field context from `METRO2_FIELD_ANALYSES` (14 fields) | `metro2-engine.test.ts` (16) |

**Handled 2026-09-07, not faked.** The rule keeps its authorities and now
carries `blockedBy` saying exactly what is missing. `RULES_IN_USE` — the string
that travels onto compliance output as the statement of what was applied — no
longer advertises it; `RULES_NOT_YET_EVALUABLE` lists it with the reason. A
structural test asserts that **every unblocked rule is actually reached by
running code**, so a rule can never again sit in the catalogue reading as
coverage. Verified by planting the regression: unblocking it makes the suite
fail.

The underlying cause is §5, and it is *not* the same as the detector's
`balance_inconsistent` — that one does compare per-bureau values, but its input
has no producer either.

### 1.12 Round-to-round comparison

| Rule ID | Input fields required | Deterministic condition | Output / finding | Provenance captured | Tests |
|---|---|---|---|---|---|
| `DOFD.MOVED_LATER` | ≥2 stored snapshots ordered by `pulledAt`, `dofd`, `remarks` | earliest DOFD ≠ current, later, no new delinquency in remarks | `potential_legal_issue` | authorities on the rule | `reporting-integrity-engine.test.ts` |
| `ITEM.REAPPEARED` | ≥3 snapshots | present → absent → present for the same `accountRef` | `potential_legal_issue`; prompts checking whether the absence followed a reinvestigation deletion | authorities on the rule | same |
| `reinserted_after_deletion` | `history.everDeletedThenReturned` (our own records) | flag set | `confirmed` | — | `condition-detector.test.ts` |
| `detectReinsertion` | `previouslyDeleted`, `reappearedOnNewReport`, `furnisherCertifiedCompleteAndAccurate`, `consumerReceived5DayNotice` | Reinsertion event, with separate flags for the missing certification and the missing 5-day notice | `ReinsertionResult` | **§ 1681i(a)(5)(B)** | `metro2-engine.test.ts` |

**Not detected today:** a balance returning to an account previously reported
paid at zero; a status reported worse than the previous round with no new
delinquency; an opening date that moved between rounds.

### 1.13 Dispute / result logic

Not detection, but the chain a finding travels down. Listed so the inventory is
complete end to end.

| Module | Entry point | What it decides | Tests |
|---|---|---|---|
| `reason-selector.ts` | `selectReason`, `suggestedTier` | Which catalogue reason fits the confirmed conditions, and how hard the round pushes | `reason-selector.test.ts` |
| `letter-composer.ts` | `composeLetter`, `itemRows` | The letter, its disputed-item table, and the confidence label on each row | `letter-composer.test.ts` |
| `letter-voice.ts` | — | Tone, as an axis separate from escalation | `letter-voice.test.ts` |
| `decision-engine.ts` | `decideDisputePath`, `buildFactualDisputeRecord` | Fact → duty → responsible party → channel | `decision-engine.test.ts` |
| `legal-paths.ts` | `DISPUTE_STATES`, `LEGAL_PATHWAYS`, `CONFIDENCE_STATES` | The states a dispute can be in and the pathways available | — (data) |
| `escalation-ladder.ts` | `roundAvailability`, `availableRound` | Whether a round has been **earned by the record**, per entry requirement | `escalation-ladder.test.ts` |
| ~~`rounds-and-layers.ts`~~ | — | **DELETED 2026-09-07 (CR-4b).** The 7-layer pressure ladder and TRAP round 1. Its three callers moved to `escalation-ladder.ts`; no third engine was built | — |
| `dispute-queues.ts` | `disputeQueueMembers`, `disputeQueueCounts` | The 12 dashboard queues | `dispute-queues.test.ts` |
| `letter-batching.ts` / `letter-merge.ts` | — | Batching letters by recipient; merging duplicates | both tested |
| `cra-addresses-and-workflows.ts` | — | Where each letter goes | tested |
| `regulator-guidance.ts` | — | FTC/CFPB recommendation and explanation only — never filed by the system | tested |
| `metro2-guardrails.ts` | `evaluateTruthGate`, `checkFcbaEligibility`, `evaluateBreachGuardrail`, `analyzeInquiry` | The gates that stop a materially false dispute | **NO TESTS** |
| `package-builder.ts` | — | Assembling the mailed package | — |
| `metro2/run-section.ts` | `runSection`, `assertableClaims`, `permittedQuestions`, `claimsFor`, `outstandingFacts` | Only `confirmed` findings may be asserted; `apparent` becomes a question; `unknown` reaches no letter | `metro2/run-section.test.ts` (9) |

---

## 2. What the inventory found, and what was done about it

Five corrections, all made 2026-09-07, none of which needed the missing
catalogue.

### 2.1 Section A now feeds the canonical flow — DONE

Section A's rules ran inside `Metro2IdentityPanel` and their output was
rendered and thrown away. Nothing could be saved to the client record, nothing
could be dispositioned, and nothing downstream could act on an identity defect.

`metro2/to-integrity-finding.ts` maps a `Metro2Finding` onto the
`IntegrityFinding` the rest of CreditOps already speaks, and
`useReportIntegrityFindings` folds Section A into the same list the integrity
engine produces. One queue, one review gate, one table.

The chain is preserved exactly, and nothing on it is automatic:

```
report + verified identity → Section A rules → finding
  → saved to report_findings (human_review_required: true, disposition null)
    → A PERSON DISPOSITIONS IT in SavedFindingsList
      → only then a dispute round, a letter, a mailing
```

What deliberately does **not** cross into the pipeline:

- **UNKNOWN.** "The facts needed were not reported" is not a finding about the
  report. It stays visible in the panel, where a reviewer can go and find the
  fact; it is never persisted as an allegation.
- **NOT_AN_ERROR.** Recorded so nobody disputes correct reporting; not
  something to save to a client's record.

And what the adapter refuses to derive: `remedy` is never `delete` or `block`.
Deletion is a remedy a person chooses on the evidence — deriving it from a
rule's confidence is how "the name is wrong" becomes "delete the account".
A `recipient` of "either" routes to the bureau, not to a direct furnisher
letter, because the CRA route triggers the reinvestigation duty and reaches the
furnisher anyway.

No extra network round trip: the identity row is fetched under the query key
`Metro2IdentitySection` already uses, so the two screens share one request, and
it runs in parallel with the items query rather than after it.

*20 tests in `metro2/to-integrity-finding.test.ts`.*

### 2.2 Guardrail test coverage — DONE

`metro2-guardrails.ts` had no test file. It now has 38 tests, written to prove
the refusals rather than the permissions, covering every path of all four
functions: positive, negative, unknown, missing evidence, consumer attestation,
and each legitimate permissible purpose.

The invariants asserted repeatedly:

- **UNKNOWN never becomes a violation.** "The consumer does not recall this
  inquiry" produces `needs-investigation` with classification
  `observed-difference` — never `potential-fcra-reg-v-issue`.
- **A permissible purpose always wins**, including over uncertainty: an unsure
  consumer plus an insurance purpose is still "do not dispute".
- **Nothing is ever classified `established-violation`**, on any path of any
  function.
- **The identity-theft pathway needs all three facts** — not recognised,
  confirmed unauthorised, report filed — asserted exhaustively over every
  combination of its four inputs.

**No guardrail behaviour was changed.** Two behaviours are documented in the
tests rather than altered; both are listed in §4 for a decision.

### 2.3 Missing DOFD, where it is relevant — DONE

`dofd` was absent from the expected-field analysis. It is now checked, and
deliberately **not** by adding it to `EXPECTED_FIELDS`: an account that has
never been late has no delinquency to date, and universal enforcement would
flag every healthy tradeline.

Relevance is decided by the account's own reporting — a collection, or
derogatory wording in the status, subtype, payment status or remarks, or any
late mark in the payment grid. Where it is relevant and no bureau reports one,
the finding is **APPARENT**, not confirmed, with the reason stated plainly:
"the bureau omits it" and "our import did not capture it" look identical from
here. Missing source data is a review task, never a reporting violation.

Where it is not relevant, a `not_an_error` is recorded, so a reviewer can see
the check was considered rather than skipped.

**No obsolescence rule was added.** Computing the seven-year period needs the
report's own pull date carried alongside the item, which the detector's input
does not have, and it needs a rule the catalogue has not yet supplied.

*7 tests in `condition-detector.test.ts`.*

### 2.4 `current_but_late_mark` — REMOVED as a duplicate

Declared in the `ReasonCondition` union, produced by no code path. It named
exactly what `paid_status_but_late_marks` already detects — that rule matches
"current" and "pays as agreed" as well as "paid" — so it was a duplicate reason
semantic as well as a dead one.

Checked before removing: no catalogue reason required it, no reason-selector
path read it, no database enum or check constraint carried it, no test named
it. A comment is left at the site so it is not re-added without reading why.

### 2.5 `BUREAU.VALUE_DIFFERS` — DECLARED UNREACHABLE, not faked

See §5 for the model gap and the change that would close it. What was done
here is to stop the catalogue reading as coverage:

- the rule keeps its authorities and gains `blockedBy`, stating exactly what is
  missing;
- `RULES_IN_USE` — the string that travels onto compliance output as the
  statement of what was applied — excludes blocked rules;
- `RULES_NOT_YET_EVALUABLE` lists them with the reason;
- **a structural test asserts that every unblocked rule is reached by running
  code**, so this cannot recur silently.

The regression was planted to prove the test works: removing `blockedBy` makes
the suite fail.

---

## 3. Where "Sections B–P / ~293 defects" came from

Traced by searching the working tree, the full git history (`git log -S` across
all refs), every commit message, `CLAUDE.md`, `BUILD_STATUS.md`, the migrations
and `src/_archive/`.

### 3.1 The number

The string `~293` appears **exactly once in the repository and once in its
entire history**:

```
creditverse-platform/COMPLETION_REGISTER.md:131
| **Metro 2 Sections B–P** | **PENDING** | ~293 defects. Largest single remaining CreditOps item |
```

Introduced by commit **`d95a5cc`** ("FundingOps A: workspace route named
honestly, BES Partners at HQ, FundingOps navigation") — **the same commit that
created `COMPLETION_REGISTER.md`**. The register is a *generated* document,
written by Claude in this session series. The number therefore has:

- **no source document** in the repository
- **no commit message** stating it
- **no migration comment** stating it
- **no entry in `CLAUDE.md`**
- **no entry in `BUILD_STATUS.md`** (which discusses the A–P work at length,
  at lines 4231–4265, and never gives a count)
- **no archived specification** carrying it

**Classification: generated register estimate. SOURCE NOT YET RECONCILED.**

### 3.2 The section range

`A–P` predates the register. `BUILD_STATUS.md:4231` records it in the roadmap
Dee fixed on 2026-09-06 — *"Client Portal (C3) → DIY Credit (C2) → Channels
(C4) → Commissions (C6) → Metro 2 catalogue A–P"* — added by commit `5ce1e39`.
That is a roadmap line, not a catalogue table of contents. It establishes that
a document with sections lettered at least to P was discussed; it does not
establish how many defects those sections contain.

### 3.3 The document that does exist, outside the repository

Three artefacts prove a real source document was supplied in an earlier session
and never committed:

| Evidence | Where | What it proves |
|---|---|---|
| Commit `258b086` message: *"From **Appendix 1 of the uploaded defect catalogue**"* | git history | The catalogue was an **uploaded file in chat**, with an Appendix 1 |
| `metro2-status-rules.ts:17` — *"**Section Q** of the catalogue lists what looks like a defect and is not"* | source comment | The document runs at least to **section Q**, and section Q is a false-positive list |
| Section A rule ids **A1, A2, A4, A6, A12, A14, A16, A20** | `section-a-identity.ts` | Section A is numbered to at least 20 with real gaps — the ids were **transcribed**, not generated. Eight of at least twenty items were implemented |

So the source is a **chat upload from an earlier session**: a BES Metro 2
defect catalogue with lettered sections running past P to at least Q, and an
Appendix 1 listing 24 Account Status codes. It is not in git, not in
`src/_archive/`, and cannot be reconstructed — the A-series gaps alone prove
that anything I generated would be a different document wearing its numbering.

### 3.4 What was actually built from it, and is verified

| From the catalogue | Where | Coverage |
|---|---|---|
| Appendix 1 — Account Status codes | `metro2-status-rules.ts` | **21 of 24** codes encoded (05, 11, 13, 61–65, 71, 78, 80, 82–84, 88, 89, 93–97), 15 tests |
| Section A — identity defects | `metro2/section-a-identity.ts` | **8 rules**: A1, A2, A4, A6, A12, A14, A16, A20 — 28 tests, wired into `Metro2IdentityPanel` |
| Section Q — false positives | notes across `metro2-status-rules.ts` and `condition-detector.ts` | encoded as `not_an_error` outcomes |

### 3.5 Register correction required

Row 131 of `COMPLETION_REGISTER.md` should read **SOURCE NOT YET RECONCILED**,
not `PENDING ~293 defects`. The count is withdrawn. The row is not complete and
is not being reported as complete.

---

## 4. Two guardrail behaviours documented rather than changed

Both are asserted in `metro2-guardrails.test.ts` so they cannot drift, and
neither was altered — the instruction was not to change guardrail behaviour to
make a test pass unless a real bug is demonstrated. Neither is a bug; both are
judgment calls that belong to Dee.

**A payment confirmation outranks the consumer's own admission of lateness.**
`checkFcbaEligibility` guards with `consumerWasActuallyLate &&
!hasPaymentConfirmation`, so a consumer who says they were late but holds proof
of a payment that was not credited still reaches `eligible: true`. That is
defensible — a real mis-credited payment in one month does not stop being one
because the consumer was late in another — and it is clearly deliberate, given
the function's stated purpose is to refuse "I was late but want it removed".
Left as it is.

**One breach-guardrail message is unhelpful, though the gate is right.** With
the unauthorised transaction confirmed but no identity theft report on file,
`evaluateBreachGuardrail` correctly returns `canUseIdentityTheftPathway:
false` — and says "No identity-theft pathway trigger detected" rather than
naming the missing report. The safety-critical output is correct; the wording
could send an operator away from a pathway that one document would open. A
one-line message change would fix it, and it is a change to guardrail
behaviour, so it waits for a decision.

## 5. The model gap: per-bureau values (BUREAU.VALUE_DIFFERS and more)

**Classification: SOURCE-DATA / MODEL GAP.** Confirmed by inspection, not
assumed.

### 5.1 What is actually missing

| Layer | What it holds | Per-bureau? |
|---|---|---|
| PDF parser, `firstColumn()` | Splits tri-merge columns, **keeps `columns[0]`**, returns a `differs` flag | **Reads them, then discards them** |
| `report_items` table | One `status`, one `balance_cents`, one `dofd`, one `open_date`, plus `bureaus text[]` and a `raw jsonb` that `createCreditReport` writes as `null` | No |
| `RawReportItem` | The same one-value shape, plus `bureaus: Bureau[]` | No |
| `BureauRecord` (`condition-detector`) | Exactly the per-bureau shape both engines want | **Constructed only in tests** |

So the values exist for a moment during parsing and are thrown away before
storage. The parser even *knows* the columns differ — `differs` lowers parse
confidence to `review` and adds the remark "Bureau columns differ — check each
bureau's figure." What is lost is **which bureau said what**, and that is
precisely what the rule needs to state a finding.

### 5.2 What the gap actually costs

Not one rule. Three things, all the same cause:

1. `BUREAU.VALUE_DIFFERS` — catalogued with authorities, unreachable.
2. Six of the condition detector's cross-bureau conditions —
   `balance_inconsistent`, `status_inconsistent`, `dates_inconsistent`,
   `payment_history_inconsistent`, `single_bureau_only`,
   `deleted_from_other_bureaus`.
3. **`detectConditions` has no product caller at all** — 31 conditions and the
   whole reason-selection path behind one input nothing can build.

### 5.3 The smallest change that would close it

Three steps, each shippable on its own, in this order. **This is a change to
the canonical report model and is written down as a proposal, not started.**

**Step 1 — stop discarding what the parser already reads.** `firstColumn()`
returns `{ value, differs }`; it would return the columns too. The block
already knows which bureaus it names (`bureausIn`), so columns can be paired
with bureaus **only when the header names exactly as many bureaus as there are
columns**. Otherwise the columns are kept unattributed.

  > This is the constraint that decides the whole design. Pairing a column to a
  > bureau by position, without a header that says so, is inferring identity
  > from layout — the same mistake as inferring ownership from a display name
  > (project rule 4). An unattributed set of columns still supports "the
  > bureaus report different values", which the parser already says. It does
  > **not** support "Equifax says $1,400 and TransUnion says $0", and that
  > sentence must not be produced until the pairing is certain.

**Step 2 — one child table.** `report_item_bureau_values`: one row per item per
bureau, the columns of `BureauRecord`, `unique (report_item_id, bureau)`,
`on delete cascade`, RLS inherited from `report_items` through the existing
`credit_report_visible` chain, append-only like its parent. No new permission
system, no new tenancy column — the parent already carries both.

**Step 3 — let the engines read it.** `RawReportItem` gains an optional
`records?: BureauRecord[]`; `evaluateItem` evaluates `BUREAU.VALUE_DIFFERS`
when it is present and skips it when it is not; `detectConditions` finally has
a producer, and its 31 conditions become reachable.

**What must not be done meanwhile:** generate a cross-bureau finding from one
value plus a list of bureau names. Three bureau names on an item say who
reports it, not what each of them reports. A test asserts this.

## 6. What is needed to close the catalogue work

**From Dee:** the BES Metro 2 defect catalogue file itself — the document with
Appendix 1 and sections through Q. Re-uploading it to this session is enough;
it should then be committed so this cannot recur.

Draft rule sections written before that instruction arrived are parked on the
local branch `metro2-drafts-unreconciled`, unmerged and imported by nothing.
They are candidate material to check against the catalogue, never to merge on
the strength of already existing.

**Then, before any rule is written:** each catalogue item is classified against
sections 1.1–1.13 above as ALREADY IMPLEMENTED + VERIFIED / IMPLEMENTED BUT
INCOMPLETE / OVERLAPS ANOTHER RULE / REAL MISSING RULE / REQUIRES ADDITIONAL
SOURCE DATA / NOT DETERMINISTICALLY SUPPORTABLE / NOT APPLICABLE / REQUIRES
HUMAN REVIEW / SUPERSEDED — and only the REAL MISSING items are built.
