# BES Credit Reporting Intelligence & Compliance Engine — Rulebook

**Authoritative product and legal doctrine for CreditOps.** Adopted 2026-09-07
on Dee's instruction. This is not commentary. Where an older BES training rule,
template or reason conflicts with anything here, the older rule loses and is
recorded in `CREDIT_REPORTING_LEGACY_CROSSWALK.md`.

**The product is no longer conceptually a "Metro 2 Violation Detector."**

---

## 0. The operating doctrine

> A difference is not yet an inaccuracy.
> An inaccuracy is not automatically a Metro 2 violation.
> A Metro 2 deviation is not automatically an FCRA violation.
> An FCRA issue does not automatically entitle the consumer to whole-account
> deletion.
>
> The system must establish the fact, identify the duty, identify the
> responsible party, and select the remedy supported by the evidence and
> applicable law.

**TRUTH FIRST. EVIDENCE SECOND. METRO 2 CONTEXT THIRD. LAW FOURTH. REMEDY FIFTH.**

### The canonical sequence

```
REPORTED DATA
  → METRO 2 CONTEXT
    → POTENTIAL ANOMALY
      → CONSUMER FACT
        → DOCUMENTARY EVIDENCE
          → APPLICABLE LEGAL DUTY
            → RESPONSIBLE PARTY
              → PROPER DISPUTE CHANNEL
                → APPROPRIATE REMEDY
                  → HUMAN REVIEW
                    → LETTER / ACTION
                      → RESULT / REIMPORT
```

**Never:**

```
METRO 2 DIFFERENCE → VIOLATION → DELETE
```

### The four questions, which never collapse into one

| | Question | Answered by |
|---|---|---|
| **A** | Is there a data anomaly? | Deterministic comparison of reported values |
| **B** | Can the correct fact be established? | Consumer attestation and documentary evidence |
| **C** | What legal or regulatory duty governs? | Verified primary authority, by actor |
| **D** | What remedy and route are appropriate? | The finding, the evidence, and the party |

A high-confidence answer to **A** says nothing about **B**, **C** or **D**. The
engine must be able to say "the anomaly is certain, the fact is unestablished,
no legal duty is yet engaged, and the correct next step is a question to the
consumer."

---

## 0.5 Two kinds of rule, and they are not interchangeable

**Revised 2026-09-07 on Dee's correction.** The first draft of this Rulebook
read as an evidence-gating system. That was wrong, and it would have made BES
dictate how every credit repair company operates.

> **BES guides. The Organization decides its SOP. The operator remains
> responsible for the facts.**

| | **Platform safety rule** | **Organization SOP rule** |
|---|---|---|
| Constrains | **What BES itself says and claims** | **What a company requires of its own staff** |
| Set by | This Rulebook. Not configurable | Each Organization, in its own settings |
| Enforced | Hard, in the database and the domain | Per-organization, and only where that Organization turns it on |
| Example | BES never asserts identity theft nobody confirmed | *This* company requires an uploaded FTC report before an identity-theft letter |
| If violated | A bug, and a serious one | A company's own process question |

### Evidence lives outside BES, and that is normal

A phone call, a client confirming something on a Zoom, a document in the
company's own drive, a note from a previous round, a paralegal's read of a
statement — all of these are real evidence that BES will never see. **Evidence
upload is optional by default.** An operator may proceed on the consumer's
confirmation or on their company's process.

What BES does instead of blocking:

- **Educate.** Say what the account type does and does not establish.
- **Warn.** Say what a claim will rest on if it is made now.
- **Suggest.** *"Consider verifying…"*, *"Your organization's SOP may
  require…"*
- **Record what the operator selected or confirmed**, wherever that is
  practical, without demanding a file.

### What is still hard, and always will be

The hard guardrails are around **the software fabricating facts**, never around
a human following a legitimate process:

1. BES never asserts identity theft, fraud, a legal violation, willfulness, or
   any other factual conclusion that nobody established.
2. BES never infers a consumer's factual position from the report.
3. BES never puts a claim in the consumer's voice that the consumer did not
   make.
4. BES never records a fact with a stronger provenance than it actually has.

An operator saying *"the consumer confirms this account is not theirs"* is
**not** BES fabricating a fact. It is BES recording a fact the operator
established, attributed to the operator, and it is a legitimate basis to
proceed.

### Whose voice a claim is in

This is the distinction that makes the rest of the Rulebook work.

| The record says | The letter may say | Needs a document? |
|---|---|---|
| Nothing | Nothing | — |
| BES observed a difference | *"Your records differ from…"* | No |
| The consumer stated a fact | *"I did not open this account"* — **the consumer's own statement** | **No** |
| A document establishes a fact | *"The enclosed statement shows a zero balance on 3 March"* | Yes, because the letter says there is one |

A consumer's statement **is** an established fact — the consumer established it
by making it. What must never happen is BES turning that statement into
*"this account is fraudulent"* in its own voice, or claiming an enclosure that
does not exist.

---

## 1. Locked truths

Each is binding on every rule, template, screen and letter. None may be
weakened by a training document, a competitor's practice, or a rule that would
otherwise produce a stronger-sounding letter.

1. **Metro 2 is an industry reporting specification, not a federal
   consumer-protection statute.** Deviation from it is not a cause of action.
2. **Metro 2 anomalies are diagnostic context, not automatic FCRA violations.**
3. **A difference is not automatically an inaccuracy.**
4. **An inaccuracy does not automatically require deletion.**
5. **The system must identify the factual issue, the legal duty, the
   responsible actor, the correct channel and a supported remedy** — all five,
   separately.
6. **UNKNOWN never becomes CONFIRMED.** A rule that cannot be evaluated
   contributes nothing to a letter, and never becomes a clean bill of health
   either.
7. **A missing field in a consumer report does not prove the furnisher omitted
   a raw Metro 2 field.** Consumer disclosures are transformed presentations.
8. **A consumer disclosure is not necessarily the raw furnishing record.**
9. **Bureaus legitimately differ** in reporting period, display semantics,
   masking convention and furnishing cycle.
10. **Current account status and historical payment history are different time
    dimensions.** "Current" with old late marks is not a contradiction.
11. **Date Updated / Date Last Activity is not DOFD**, and a change in either
    is not re-aging.
12. **One bureau deleting an item does not prove another cannot verify it.**
    Each CRA's reinvestigation stands on its own.
13. **Reappearance is a potential reinsertion event**, not automatically
    unlawful reinsertion.
14. **Repeated verification is not automatically willful noncompliance.**
15. **Breach exposure is not proof of identity theft.**
16. **Absence of written authorization is not proof of no permissible
    purpose.** § 1681b contains many permissible purposes.
17. **A direct furnisher dispute does not automatically trigger
    § 1681s-2(b).** That duty attaches to a CRA-forwarded dispute.
18. **§ 1681i(a)(7) does not entitle a consumer to the contract, the ledger, or
    the investigation file.** It concerns a description of the procedure.
19. **§ 1666 is not a universal late-payment removal statute.**
20. **Whole-account deletion is not the universal statutory remedy.**
21. **BES does not require evidence uploads to let work proceed.** Evidence
    lives outside BES as often as inside it. Only an Organization's own
    configured SOP may make a document mandatory, and only for that
    Organization. *(Added 2026-09-07 — §0.5.)*
22. **A consumer's recorded statement is a legitimate basis for a dispute.**
    BES carries it in the consumer's voice, attributed and dated, and never
    upgrades it into BES's own factual conclusion.

---

## 2. Authority hierarchy

Lower authority never overrides higher. Full detail and the register itself are
in `CREDIT_REPORTING_SOURCE_REGISTER.md`.

| Rank | Level | Example |
|---|---|---|
| 1 | **Federal statute** | 15 U.S.C. § 1681 et seq. |
| 2 | **Federal regulation** | Regulation V, 12 C.F.R. Part 1022 |
| 3 | **Controlling appellate / Supreme Court authority** | Verified primary opinions only, with jurisdiction |
| 4 | **Agency enforcement / official guidance** | CFPB advisory opinions; consent orders as *risk context*, never as holdings |
| 5 | **Metro 2 / CRRG context** | CDIA specification — licensed; see §3 |
| 6 | **BES operational / training material** | Internal SOPs, legacy round scripts |

When a BES training rule conflicts with a higher level, it is marked
**LEGACY RULE REJECTED** and removed or rewritten. It is never silently
preserved because it has tests or because a screen depends on it.

---

## 3. CDIA / CRRG licensing boundary

The CDIA Credit Reporting Resource Guide is licensed, proprietary material.
BES has not established redistribution rights.

**Prohibited:** bulk-copying it into production knowledge; reproducing
proprietary code tables in customer-facing form; committing large excerpts;
generating thousands of rules by transcribing its text; assuming
redistribution rights.

**Permitted:** source references, and rule logic expressed independently from
the underlying factual relationships.

Where an implementation genuinely requires a proprietary CRRG definition, the
rule is marked **CDIA LICENSE / ACCESS REVIEW REQUIRED** and left inactive
until rights are confirmed.

This blocks nothing that is independently supportable: FCRA and Regulation V
logic, factual comparison, observed-report analysis and consumer-evidence
reconciliation all proceed.

### V1 and V2 are different products

| | **V1 — Credit Report Accuracy & Data Integrity Analysis** | **V2 — Authorized Metro 2 Validation Layer** |
|---|---|---|
| Source | Consumer-facing reports, canonical observations, snapshots, consumer facts, documents | Authorized structured or raw Metro 2 data |
| Can claim | "Possible Metro 2-related reporting inconsistency" | "Metro 2 field validation result" |
| Needs | Nothing beyond what BES has | CDIA/CRRG access, current licensed rule definitions, approved use rights, source data capable of supporting field/code validation |
| Status | **This is what BES ships today** | **Not built. Not advertised.** |

**V1 must never be advertised as raw Metro 2 validation.**

---

## 4. Finding taxonomy

Replaces all loose "violation detected" language.

**These levels govern what BES CLAIMS, not what an operator may do.** A finding
at `NEEDS_SOURCE_EVIDENCE` does not block the workflow; it means BES will not
state that fact as established in its own voice. The operator may still record
the consumer's confirmation and proceed under their organization's SOP — the
letter then carries the claim as *the consumer's statement*, which it is.

| Level | Meaning | May BES state it as established? |
|---|---|---|
| `OBSERVED_REPORTING_DIFFERENCE` | Two sources differ; comparability unestablished | No — investigation only |
| `POTENTIAL_DATA_INTEGRITY_ANOMALY` | Values are internally implausible together | No — question only |
| `NEEDS_SOURCE_EVIDENCE` | BES cannot settle the fact from the report alone | No — but the operator may settle it outside BES and record what they confirmed |
| `CONSUMER_ATTESTED_DISCREPANCY` | The consumer has stated a specific fact | Yes, **as the consumer's statement**, never as independently proven. This is a complete and legitimate basis for a dispute |
| `DOCUMENT_SUPPORTED_INACCURACY` | A document contradicts the reported value for a comparable period | Yes |
| `POTENTIAL_LEGAL_COMPLIANCE_ISSUE` | Facts may engage a duty; route and party identified | As a request to investigate — never as an accusation |
| `LEGAL_REVIEW_REQUIRED` | Complex or jurisdictional legal question | No — routes to a human |
| `ESTABLISHED_VIOLATION` | A legal violation actually established | **Never produced by automated analysis** |

`ESTABLISHED_VIOLATION` requires an actually established legal basis —
preferably legal review, adjudication or a similarly authoritative
determination. No report analysis, no rule, and no model may generate it.

### Investigation-only class

These findings **never** automatically generate a dispute letter. They produce
`OBSERVED_REPORTING_DIFFERENCE` or `INVESTIGATION_REQUIRED`, and the correct
fact must be determined first:

- different balances across bureaus
- different masked account numbers
- creditor abbreviation differences
- different update dates
- different remarks
- one-bureau deletion
- any presentation difference without source evidence

### Strong logical-inconsistency class

High-priority factual review, **not** a legal violation. Output is
`HIGH_PRIORITY_DATA_INTEGRITY_REVIEW`:

- DOFD after the charge-off date
- DOFD before the open date on a non-collection account
- DOFD populated while current, zero past due, and a complete current history
- paid-in-full with an incompatible current balance
- internally incompatible open/closed/payment-obligation combinations

---

## 5. Evidence strength — tracked separately from severity

| Level | Meaning |
|---|---|
| `UNVERIFIED_OBSERVATION` | One source says something |
| `CROSS_SOURCE_DISCREPANCY` | Two sources disagree |
| `CONSUMER_ATTESTED_FACT` | The consumer has signed a specific statement |
| `DOCUMENT_SUPPORTED_FACT` | A document establishes the value for a comparable period |
| `INDEPENDENT_AUTHORITATIVE_RECORD` | Court, government or equivalent record |
| `LEGAL_REVIEW_REQUIRED` | Cannot be settled by evidence alone |

**Evidence strength governs what may be asserted.**

```
EQ = $0, EX = $5,000                                → CROSS_SOURCE_DISCREPANCY
  + creditor statement for the same period = $0     → DOCUMENT_SUPPORTED_INACCURACY
```

Those two are not equivalent and must never be rendered in the same language.

### Confidence is multi-dimensional

A single blended confidence score mixes facts with law and is forbidden. A
finding must be able to carry, separately:

```
data_anomaly_confidence      how certain the values are implausible together
source_confidence            how reliable the source of those values is
evidence_confidence          how well documents establish the true value
legal_rule_confidence        how settled the governing duty is
remedy_confidence            how well the remedy follows from the finding
human_review_required        boolean
```

A DOFD after a charge-off date read off a transformed monitoring display can be
**high** data-anomaly confidence and **low** source confidence at the same
time. The legal conclusion stays separate from both.

### Objective verifiability

Every rule declares which class its issue falls into.

| Class | Examples |
|---|---|
| `OBJECTIVELY_VERIFIABLE_FACT` | balance, payment date, open date, close date, reported relationship, reported status, DOFD chronology, a specific payment-history month |
| `FACT_REQUIRES_MORE_EVIDENCE` | whether a payment was credited; whether an account was cured |
| `COMPLEX_LEGAL_INTERPRETATION` | bankruptcy discharge characterization, ambiguous contract liability, settlement/extinguishment, divorce-decree liability, ownership disputes, willfulness, damages |
| `JURISDICTION_DEPENDENT_LEGAL_ISSUE` | statute-of-limitations questions; state-law overlays |

**AI must never resolve a complex legal issue because a report field looks
unusual.**

---

## 6. Source type and provenance

Every reported fact identifies where it came from:

```
consumer_report_presentation
authorized_structured_credit_data
authorized_raw_metro2_data
consumer_document
creditor_document
court_or_government_record
consumer_attestation
other_verified_source
```

plus `raw_metro2_verified: boolean`.

A SmartCredit, IdentityIQ, MyScoreIQ or other consumer-facing display **never**
proves the exact raw Metro 2 code or field a furnisher transmitted, unless an
authorized underlying source actually establishes it.

| Source | Permitted customer-facing wording |
|---|---|
| Consumer report presentation | "Possible Metro 2-related reporting inconsistency" |
| Verified underlying Metro 2 data | "Metro 2 field validation result" |

These are never blurred.

---

## 7. Required rule schema

The catalogue uses **stable BES IDs**. Legacy numbering is never recreated from
memory; if a legacy source is later verified, its number is kept as metadata.

```
BES-CRA-BAL-001        balances and amounts
BES-CRA-DATE-001       dates and chronology
BES-CRA-DOFD-001       delinquency date and re-aging
BES-CRA-PH-001         payment history
BES-CRA-ECOA-001       responsibility / ECOA
BES-CRA-INQ-001        inquiries
BES-CRA-COLL-001       collections
BES-CRA-REINSERT-001   reinsertion
BES-CRA-XB-001         cross-bureau
```

Every catalogue rule defines:

```
rule_id                      legal_context
legacy_id (only if proven)   requested_remedy_options
title                        human_review_required
category                     implementation_status
authority_level              rule_version
source                       test_vectors
source_reference             code_location
source_version_or_date       test_location
responsible_party            objective_verifiability
recipient                    source_type
required_fields              raw_metro2_verified
optional_fields              evidence_required
applicable_account_types     evidence_strength_required
evaluation_scope             finding_classification
time_dimension               permitted_observation
deterministic_condition      permitted_assertion
false_positive_guardrails    permitted_question
missing_data_behavior
```

### High-value relationships to build first

Defensible and explainable, before any obscure code table:

- DOFD ↔ account open date · charge-off date · historical DOFD · current status / payment history
- account status ↔ balance · past due · payment history · open/closed state
- paid-in-full ↔ current balance
- payment history ↔ consumer or creditor payment evidence
- responsibility / ECOA context ↔ documented liability
- dispute status ↔ documented dispute history

**Do not implement Metro 2 code trivia to increase the rule count.**

---

## 8. Party and legal-duty routing

The engine must know **who** has the duty. Statutes are never stacked because
they sound stronger.

| Situation | Duty holder | Authority to consider |
|---|---|---|
| CRA accuracy / reinvestigation | CRA | § 1681e(b) where applicable; § 1681i |
| Furnisher receiving a **CRA-forwarded** dispute | Furnisher | § 1681s-2(b) |
| **Direct** consumer dispute to a furnisher | Furnisher | § 1681s-2(a)(8); Reg V § 1022.43 eligibility — **including the CRO-origin exception** |
| Furnisher accuracy/integrity systems | Furnisher | Reg V § 1022.42 and Appendix E |
| DOFD / re-aging | Furnisher, then CRA | § 1681s-2(a)(5); § 1681c(c); Appendix E context |
| Actual identity theft | CRA | § 1681c-2 |
| Inquiry | User of the report | § 1681b permissible-purpose analysis |
| Qualifying open-end billing error | Creditor | § 1666; Reg Z § 1026.13 — **after** an eligibility check |
| Debt-collector dispute reporting | Collector | § 1692e(8), only where FDCPA coverage and the facts actually fit |

### Dispute origin is required

```
consumer_independent
consumer_attorney_assisted
consumer_cro_assisted
cro_prepared
cra_forwarded
other
```

Origin changes the legal consequence. **The system must not promise that a
CRO-prepared direct furnisher dispute triggers Regulation V direct-dispute
duties.** Where a CRO exception may apply, the correct behaviour is: evaluate
direct-dispute eligibility → if the exception may apply, route to reviewed
strategy or the CRA path → never misstate the trigger.

CRA-forwarded disputes are a distinct route and track the actual CRA notice or
forwarding event when known.

---

## 9. Cross-bureau model

Per-bureau observation is a **prerequisite** for cross-bureau intelligence, not
an optimisation. `RawReportItem` must not be patched with fake single-value
comparisons. Architecture: `ARCHITECTURE_PROPOSAL_PER_BUREAU_OBSERVATIONS.md`.

The canonical extension preserves, per value: bureau · field · raw value ·
normalized value · reporting period · account information date · source
locator · snapshot · parser version.

Before any cross-bureau difference is called suspicious:

1. Same reporting period?
2. Same underlying entity?
3. Same semantic field?
4. Same date granularity?
5. Same data availability?
6. Masking or display transformation?
7. Source record available?

```
difference, comparability unestablished          → OBSERVED_REPORTING_DIFFERENCE
difference + comparable periods + a document
  contradicting one value                        → DOCUMENT_SUPPORTED_INACCURACY
```

---

## 10. Chronology engine

Snapshots are immutable. History is never overwritten. Temporal analysis is
built **before** any temporal contradiction is claimed.
Architecture: `ARCHITECTURE_PROPOSAL_CHRONOLOGY.md`.

Preserved where available: source report date · data reporting period ·
account information date · date opened · date closed · date last payment ·
DOFD · payment-history months · dispute date · CRA forwarding/receipt event ·
furnisher response date · CRA result date · mail/delivery evidence.

| Pattern | Correct reading |
|---|---|
| Current status with old historical lates | **Possible** — different time dimensions |
| $0 past due with historical delinquency | **Possible** |
| Date Updated moved | **Not re-aging by itself** |
| DOFD materially moved later after transfer, no documented cure | **High-priority potential re-aging anomaly** |

### DOFD analysis must reconstruct the sequence

```
last current period → initial delinquency → was the account cured? →
delinquency immediately preceding collection/charge-off → reported DOFD →
statutory reporting chronology
```

A generic date change is never a re-aging detector.

### Reinsertion

Prior item absent, later item present → `POTENTIAL_REINSERTION_EVENT`. Then:

- Was the prior disappearance actually a deletion resulting from a CRA
  reinvestigation?
- Is this the same obligation and entity?
- Was certification involved where required?
- Was consumer notification generated?
- Was the absence merely incomplete or unavailable reporting?

Never labelled unlawful automatically.

### Investigation timeline data

`dispute_received_at` · `cra_furnisher_notice_at` · `investigation_deadline_at`
· `extension_basis` · `result_received_at` · `procedure_request_at` ·
`reinsertion_detected_at` · `mail_accepted_at` · `mail_delivered_at`

**Legal clocks never start from:** a letter generated, a letter downloaded, a
round created, or a processor clicking send. Every timer records its
triggering evidence.

---

## 11. Method of procedure — corrected

§ 1681i(a)(7) concerns a **description of the reinvestigation procedure**, with
furnisher business name, address and telephone number where reasonably
available.

It is **not** an automatic right to: a signed contract · a complete ledger ·
every investigation document · employee identity · complete verification
evidence.

Legacy templates and round scripts requesting those are listed in the crosswalk
and rewritten. The product term is **"Reinvestigation Procedure Request"**, not
"Method of Verification".

---

## 12. Remedy engine

```
CORRECT_FIELD              CORRECT_DOFD
MODIFY_STATUS              CORRECT_BALANCE
DELETE_ITEM                CORRECT_PAYMENT_HISTORY
BLOCK_INFORMATION          CORRECT_RESPONSIBILITY
ADD_OR_UPDATE_DISPUTE_NOTATION
REINVESTIGATE
REQUEST_INFORMATION
OTHER_SUPPORTED_REMEDY
```

**`DELETE_ITEM` is never the default.** The remedy follows the factual and
legal finding. Where information is found inaccurate, incomplete or
unverifiable, the statute contemplates deletion **or modification** — the
letter says so.

---

## 13. Inquiry engine

The old four-purpose model is rejected. The engine asks about the actual
§ 1681b contexts, at minimum: consumer recognizes the inquiry · credit
application · existing account · account review · collection activity ·
insurance · employment · written instructions · other applicable statutory
purpose.

**No written authorization ≠ automatic unauthorized inquiry.**
Unknown purpose → **NEEDS FACTS / REVIEW**, never a § 1681b finding.

---

## 14. FCBA eligibility gate

Before § 1666 or Reg Z § 1026.13 is cited at all, run
`FCBA_ELIGIBILITY_CHECK`: does the account and the alleged billing error fall
within the open-end billing-error framework, and within its timing
requirements?

If not, **do not cite FCBA**. It is not a late-payment removal tool.

---

## 15. Identity theft — a platform safety rule about BES's voice

**The hard rule, and the only hard rule here:** BES never concludes identity
theft. Not from breach exposure, not from an account type, not from a
collection, not from a consumer failing to recognise something, and never from
a model's inference.

```
NEVER:  breach exposure → negative account → identity theft
NEVER:  third-party collection → identity theft
NEVER:  "consumer does not recognise it" → identity theft
```

**What BES does instead: it asks, it educates, and it records the answer.**

On a third-party collection, BES says:

> This account type alone does not establish identity theft. If the consumer
> confirms the account resulted from identity theft, follow your
> organization's identity-theft dispute SOP.

and offers the operator these states:

| Operator state | What BES records | What BES then does |
|---|---|---|
| **Consumer confirms identity theft** | The consumer's confirmation, who recorded it, when | Explains the § 1681c-2 route and IdentityTheft.gov as **education**; surfaces the organization's own SOP if one is configured |
| **Consumer does not recognize account** | Exactly that, and nothing more | Suggests verification steps. **Does not treat this as an identity-theft claim** |
| **Account is recognized** | Exactly that | Routes to ordinary factual dispute analysis |
| **Needs further review** | Exactly that | Leaves it in the review queue |

**No file upload is required at any point.** The consumer's confirmation is
recorded as what it is — a statement by the consumer, attributed and dated.

### Not recognising an account is not an identity-theft claim

These are different answers and BES must never collapse them. A consumer who
does not recognise a tradeline may be looking at a creditor's trading name, a
purchased debt, an old account, or a genuine error — and only sometimes at
fraud. Demanding an identity-theft certification from someone who merely said
"I don't recognise this" both misstates what they said and pushes them toward a
claim they did not make.

> **Implementation note.** `metro2-guardrails.ts` `evaluateTruthGate` currently
> blocks whenever `consumerRecognizesAccount === "no"` and no identity-theft
> certification is present — conflating the two states above.
> `evaluateBreachGuardrail` in the same file already separates them correctly.
> Recorded here; not changed, per the documentation-only instruction.

### Where an organization may add its own requirement

An Organization may configure that **its** staff must attach an FTC report, a
police report or a signed affidavit before an identity-theft letter is
approved. That is its SOP, it is configurable, and BES enforces it for that
organization only. **BES does not impose it globally.**

---

## 16. Letter basis — what BES needs, and what it merely asks

A letter has to say something specific to be worth sending. BES needs enough to
draft without inventing. It does **not** need a document.

### Required, because a letter cannot be written without them

These are not compliance gates. They are the sentence itself — without them
there is no letter, only a complaint about an account in general, which is the
kind of dispute that gets dismissed as frivolous.

1. **Which specific field or information is disputed**
2. **What the consumer says is accurate**
3. **Why**
4. **Which bureau or recipient**
5. **What remedy is being requested**
6. **Which legal route actually applies**

All six can be satisfied by the operator recording what the consumer told them.
**None requires an upload.**

### Asked, recorded, and never blocking

- Does the consumer recognize the account?
- What reporting period?
- What supporting evidence exists, and **where does it live** — in BES, in the
  company's own system, or with the consumer?

BES records the answer, including *"held outside BES"*. It does not demand the
file.

### The one thing a letter may never do

**A letter may not describe an enclosure that is not enclosed.** *"The enclosed
statement shows…"* is a claim about a document, and BES will not write it
unless the document is attached. *"I paid this account in full in March"* is
the consumer speaking and needs nothing attached.

That is the whole of the hard rule: not "prove it before you dispute", but
"don't say there's a document when there isn't one".

AI may draft **only** from the facts the operator recorded. No invented
narratives, no facts the consumer did not give.

### Where an organization may add its own requirement

An Organization may require, for its own staff: evidence attached, a manager's
approval, a signed attestation, a note recorded, or a second reviewer — per
letter kind, per claim type, or across the board. Configurable, enforced for
that organization, **never imposed by BES globally**.

### Letter language model — three layers, in order

| Layer | Says |
|---|---|
| **OBSERVATION** | What the report says |
| **FACTUAL CONFLICT** | What verified evidence contradicts |
| **LEGAL REQUEST** | What the recipient is asked to investigate or correct |

```
REPORT SAYS X
EVIDENCE SHOWS Y
I DISPUTE FIELD Z
PLEASE REINVESTIGATE / CORRECT
IF IT CANNOT BE VERIFIED AS COMPLETE AND ACCURATE, APPLY THE APPROPRIATE
FCRA REMEDY
```

Never: *"Violation detected. Delete permanently."*

### Evidence manifest — a record, not a requirement

Where a fact came from is recorded whether or not a file exists. "Consumer
confirmed by phone, 7 September, recorded by J. Rivera" is a complete and valid
entry. Every dispute package preserves: exact disputed field · reported value ·
claimed correct value · report/bureau/date · basis · consumer attestation ·
supporting document IDs · document hashes and revisions · evidence dates ·
previous dispute · previous result · new evidence · recipient · legal route ·
requested remedy · QA reviewer.

Later analysis must know not merely that evidence was attached, but exactly
which evidence supported which assertion.

---

## 17. e-OSCAR doctrine

**Rejected outright**, and removed wherever found: evading automated dispute
classification · randomising spelling · odd colours or fonts · deliberately
varying wording to disguise assistance · manufacturing emotional narratives ·
randomising citations · hiding CRO involvement.

**Canonical replacement: MAXIMIZE FACTUAL SPECIFICITY AND EVIDENCE
TRANSMISSION.** A dispute succeeds by being specific and documented, not by
being hard to classify.

---

## 18. Post-result forensic review

A VERIFIED response never automatically triggers escalation. It triggers
analysis:

```
original dispute → evidence supplied → response/result → new report →
changed fields → unresolved contradiction? → new evidence? →
investigation-quality concern? → correct next route
```

Outputs:

```
RESOLVED_CORRECTED
VERIFIED_NO_REMAINING_CONTRADICTION
VERIFIED_UNRESOLVED_OBJECTIVE_CONTRADICTION
INSUFFICIENT_EVIDENCE
NEW_DISCREPANCY
POTENTIAL_REINSERTION
POTENTIAL_INVESTIGATION_QUALITY_ISSUE
LEGAL_REVIEW_RECOMMENDED
```

---

## 19. Provider adapter boundary

```
SmartCredit · IdentityIQ · MyFreeScoreNow · MyScoreIQ · manual PDF/HTML/structured
        ↓
PROVIDER ADAPTER
        ↓
CANONICAL REPORT / OBSERVATIONS
        ↓
CREDIT REPORTING INTELLIGENCE ENGINE
```

No provider-specific legal engine. No undocumented scraping or reverse
engineering. Production automatic retrieval requires a permitted commercial
integration.

---

## 20. QA checklist

Split by §0.5, because the two halves are enforced differently.

### Platform safety — BES checks these itself, and they do not block the operator

Each is a statement about what BES may say. A failure here is a bug in BES, not
a task for the operator.

- [ ] Raw Metro 2 status accurately represented — a consumer display is never
      recorded as raw Metro 2
- [ ] Format difference not presented as a substantive error
- [ ] Cross-bureau difference not presented as proof
- [ ] Legal duty assigned to the correct actor
- [ ] Remedy follows the finding; `DELETE_ITEM` not defaulted
- [ ] No automatic willfulness
- [ ] No identity theft BES concluded on its own
- [ ] No unsupported permissible-purpose allegation
- [ ] No enclosure described that is not attached
- [ ] Nothing put in the consumer's voice that the consumer did not say

### Draftability — without these there is no specific letter to send

- [ ] Source report exists (or the item was entered manually and labelled so)
- [ ] Correct consumer, account, bureau
- [ ] Exact field identified
- [ ] What the consumer says is accurate, and why
- [ ] Recipient and requested remedy
- [ ] Legal route

### Organization SOP — configurable, off unless the Organization turns it on

- [ ] Evidence attached
- [ ] Reporting period identified
- [ ] Source type / provenance recorded
- [ ] Consumer attestation signed
- [ ] Second reviewer or manager approval
- [ ] Prior-round result reviewed before a repeat dispute
- [ ] Legal review for the claim types this Organization routes that way

---

## 21. Testing doctrine

Every deterministic rule is tested for: positive · negative · unknown/missing
input · different reporting period · unsupported field · false-positive
guardrail · same-bureau · cross-bureau where applicable · historical snapshot
where applicable · consumer attestation · document-supported fact ·
wrong-recipient/legal-route protection.

**Permanent invariant tests, which never expire:**

- UNKNOWN never becomes confirmed
- a cross-bureau difference alone cannot become a legal violation
- a field missing from a consumer PDF cannot prove furnisher omission
- historical lates plus a current status is not automatically contradictory
- a Date Updated change alone is not re-aging
- one bureau's deletion does not force another bureau's deletion
- breach exposure cannot create an identity-theft finding
- a CRO-prepared direct furnisher dispute does not map blindly to § 1681s-2(b)
- an inquiry without written authorization is not automatically unlawful
- delete is not the default remedy
- willfulness cannot be declared automatically
- **a third-party collection alone never produces an identity-theft finding,
  an IdentityTheft.gov instruction, or an identity-theft letter**
- **"consumer does not recognize the account" is never treated as an
  identity-theft claim**
- **no platform rule blocks a workflow for a missing evidence file** — only an
  Organization's own configured SOP may do that
- **a letter never describes an enclosure that is not attached**
- **a consumer's recorded statement is a sufficient basis for a dispute**, and
  the letter carries it in the consumer's voice

---

## 22. Product language

**Module name (customer-facing):** Credit Report Accuracy & Data Integrity
Analysis
**Canonical engine (internal):** BES Credit Reporting Intelligence & Compliance
Engine
**Reserved:** *Metro 2 Validation Layer* — only where BES holds the authorized
source data and a current licensed rule basis.

| Use | Never use |
|---|---|
| Reporting Difference | "Metro 2 violation confirmed" |
| Needs Review | "FCRA violation detected" |
| Potential Data-Integrity Issue | "Guaranteed deletion" |
| Evidence-Supported Inaccuracy | "Unverifiable because another bureau deleted it" |
| Potential Compliance Issue | "Willful violation confirmed" |
| Legal Review Recommended | |

Unless that conclusion is genuinely established through the appropriate review
path.

### How BES talks to an operator

Guidance, never obstruction. BES is a colleague who knows the rules, not a
gate.

| Say | Not |
|---|---|
| "This account type alone does not establish identity theft." | "Identity theft detected." |
| "Consider verifying the balance against a statement." | "Upload a statement to continue." |
| "Your organization's SOP may require an attestation here." | "Attestation required." |
| "If the consumer confirms this, follow your identity-theft SOP." | "File an FTC report." |
| "Recorded: consumer confirms the account is not theirs." | "Fraud confirmed." |

Every one of those left-hand phrasings leaves the decision with the person who
actually spoke to the consumer.

---

## 23. Research verification rule

This doctrine is authoritative **product direction**. Its individual legal
propositions are **not** automatically production rules.

Before any statute, regulation or case proposition becomes executable legal
logic:

```
verify primary authority → record source → record version/date →
record jurisdiction → record reviewer → write test → activate
```

**Never code from a secondary summary.** The research names authorities —
Safeco, Saunders, Gorman, Hinkle, Bibbs, Sessa, Mader, Holden, and a 2026 Tenth
Circuit decision. **None is encoded from that text.** Each requires the primary
opinion, read and recorded, before it governs anything. Every one is tracked in
the Source Register as `UNVERIFIED — PRIMARY SOURCE NOT READ`.

Consent orders and enforcement actions are **not** judicial holdings. Santander
and TD Bank may support detection test cases and regulatory-risk context; they
are never represented as case law.
