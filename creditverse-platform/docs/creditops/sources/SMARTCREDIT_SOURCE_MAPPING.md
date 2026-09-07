# SmartCredit — source mapping and completeness contract

**Mapper BUILT 2026-09-07** (`smartcredit-html-parser.ts`), the six tradeline
columns exist (migrations 0136, 0137), and the **completeness manifest and
reconciliation are persisted** (migration 0138, CR-14). §5 and §6 below are no
longer specification.

The one thing 0138 added that this spec did not anticipate: the **verdict is
derived in SQL**, not sent by the client. A parser that read 24 of 30 accounts
cannot claim a complete import, because it never gets to say so — it supplies
the checks and the database draws the conclusion.
Written 2026-09-07 from one sample supplied privately by Dee.

> **The sample is not in this repository and never will be.** It is a real
> consumer report for a named individual. It was read locally as inert data —
> no script executed, no remote URL fetched — and nothing from it was copied.
> Every example below is invented. The structural fixture is
> `smartcredit-synthetic.fixture.html` beside this file, whose people,
> accounts, balances, dates and history are fabricated.
>
> One incidental finding from the sample, recorded because it is exactly the
> case the Rulebook quarantines: **the consumer name inside the document did
> not match the filename.** A real import must refuse to publish analysis on
> that, not reconcile it.

Governed by `../CREDIT_REPORTING_INTELLIGENCE_RULEBOOK.md`.

---

## 0. The goal, stated exactly

> **CAPTURE 100% OF WHAT THE SOURCE EXPOSES,
> PRESERVE WHICH BUREAU SAID IT WHERE PROVEN,
> AND RECORD WHAT THE SOURCE DOES NOT EXPOSE.**

Not "capture all bureau data" — that would be a promise about the bureaus. This
is a promise about the *source*, which is the only thing an adapter can keep.

Three consequences that shape everything below:

1. A field the provider does not expose is `NOT_EXPOSED_BY_PROVIDER`. It is
   **not** evidence that a bureau omitted it.
2. A field the provider exposes as blank is `BLANK_IN_SOURCE` — a different
   state, and a different question.
3. A field we failed to read is `PARSE_FAILED`, and it must never look like
   either of the first two.

### This document is versioned against a format, not a provider

SmartCredit's markup will change. IdentityIQ, MyFreeScoreNow and the bureaus'
own direct reports are different formats carrying **the same underlying bureau
data**. So:

```
provider + format version  →  ADAPTER (this document, one per format)
                                 ↓
                          CANONICAL REPORT
                                 ↓
                       COMPLETENESS MANIFEST (provider-agnostic)
                                 ↓
                   CREDIT REPORTING INTELLIGENCE ENGINE
```

The manifest states and the canonical destinations are **shared**. Only the
left-hand column of the mapping tables is SmartCredit's. A new provider is a
new adapter and a new mapping document — never a new engine, and never a new
set of completeness states.

---

## 1. What the sample actually contains

**Confirmed by inspection.** Counts are from the one sample and are structural,
not data.

| Section | Present | Shape |
|---|---|---|
| Bureau scores | ✅ | Three scores, one per bureau, in a definition list |
| Personal information | ✅ | 7 label rows × 3 bureau columns |
| Consumer statement | ✅ | One row × 3 columns |
| Bureau summary | ✅ | 8 counts × 3 columns |
| Account history (tradelines) | ✅ | **30 tradelines × 22 fields × 3 bureau columns** |
| Two-Year Payment History | ✅ | Month grid per tradeline per bureau |
| Days Late – 7 Year History | ✅ | 30 / 60 / 90 counts per bureau |
| Public information | ✅ | 9 fields |
| Inquiries | ✅ | 3 fields per inquiry |
| Creditor contacts | ✅ | Positional: name, address, phone |

### 1.1 The layout, and the one fact that decides attribution

It is a **CSS grid, not a table**.

| Cell role | Class marker | Count in sample |
|---|---|---|
| Field label | `grid-cell … col-start-1` | 637 |
| **transunion** value | `grid-cell … col-start-2` | 717 |
| **experian** value | `grid-cell … col-start-3` | 717 |
| **equifax** value | `grid-cell … col-start-4` | 717 |

And the bureau→column mapping is **declared by the source itself**, in the
header row:

```html
<dt class="bg-transunion … col-start-2">transunion<sup>®</sup></dt>
<dt class="bg-experian   … col-start-3">experian<sup>®</sup></dt>
<dt class="bg-equifax    … col-start-4">equifax<sup>®</sup></dt>
```

**Identical across all 94 header groups in the sample. Zero variation.**

This is the strongest form of the CR-2 evidence rule. There is no column
counting and no order assumption: the document states which column is whose,
per section, in a class name.

**The parser therefore reads `(row-start, col-start)` coordinates and the
declared header classes — never DOM adjacency and never an assumed order.**

> Proof that adjacency is wrong here: a first naive adjacency parse recovered
> **6 of 22 tradeline fields**. Labels and values are not neighbours in reading
> order; the grid places them.

**If a section's header classes do not declare a bureau per column, that
section's multi-column values are `AMBIGUOUS` and go to
`report_items.source_columns` unattributed.** No fallback, no inference.

---

## 2. Tradelines — all 22 source fields

Destination legend:

| | Meaning |
|---|---|
| **canonical** | A column exists on `report_item_bureau_values` today |
| **missing** | Real per-bureau fact, no canonical destination yet |
| **raw-only** | Preserve verbatim; no rule reads it yet |
| **derived-only** | Not stored; computed from other fields |

| # | SmartCredit field | Destination | Column / note |
|---|---|---|---|
| 1 | Account # | **canonical** | `account_number_masked` |
| 2 | Account Type | **canonical** | `account_type` |
| 3 | Account Status | **canonical** | `status` |
| 4 | Payment Status | **canonical** | `payment_status` |
| 5 | Balance Owed | **canonical** | `balance_cents` |
| 6 | High Balance | **canonical** | `high_balance_cents` |
| 7 | Credit Limit | **canonical** | `credit_limit_cents` |
| 8 | Past Due Amount | **canonical** | `past_due_cents` |
| 9 | Payment Amount | **canonical** | `monthly_payment_cents` |
| 10 | Term Length | **canonical** | `term_months` |
| 11 | Date Opened | **canonical** | `open_date` |
| 12 | Closed Date | **canonical** | `date_closed` |
| 13 | Last Payment | **canonical** | `date_last_payment` — *the column exists and the PDF parser never filled it* |
| 14 | Date of Last Activity | **canonical** | `date_last_active` |
| 15 | Date Reported | **canonical** | `account_information_date` — the provenance field CR-2 added |
| 16 | Creditor Remarks | **canonical** | `remarks` |
| 17 | Two-Year Payment History | **canonical, shape change needed** | `payment_history` — see §3 |
| 18 | **Account Description** | **canonical (0136)** | `responsibility_raw` — the `_raw` suffix is a promise. **See the caution below.** |
| 19 | **Dispute Status** | **canonical (0136)** | `dispute_status` — observed field. **See the caution below.** |
| 20 | **Account Rating** | **canonical (0136)** | `account_rating` — raw-only; no rule reads it |
| 21 | **Creditor Type** | **canonical (0136)** | `creditor_type` — raw-only |
| 22 | **Payment Frequency** | **canonical (0136)** | `payment_frequency` — raw-only |
| — | **Last Verified** | **canonical (0136)** | `last_verified` — a *second* date, deliberately not folded into `account_information_date` |

**All 22 mapped.** 16 were canonical already; 6 were added by migration 0136;
`payment_history` still carries its dates as an encoded `text[]` pending S-11.

### 2.1 Account Description is not an ECOA code

The source prints a word. It may **support responsibility normalisation** —
mapping "Individual" onto an individual-liability concept — and that is worth
having.

It is **not** a raw ECOA / Account Designator code, and must not be recorded as
one unless a source is found that actually prints the code. Storing a
normalised word as if it were the furnisher's transmitted designator is the
same error as treating a consumer display as raw Metro 2 (Rulebook §6).

> Recorded honestly: the value vocabulary for this field could **not** be
> extracted from the sample — the grid separates labels from values, and the
> first extraction attempt failed. Confirm against more samples before
> normalising anything.

### 2.2 Dispute Status is an observation, not a conclusion

The sample carries this per bureau per account, with two values in evidence:
one meaning not disputed and one meaning disputed.

That is a **useful observed field** and a real improvement: today
`not_notated_as_disputed` is sourced only from *our own* records of what we
sent, never from the bureau's own answer.

It is **not** a legal conclusion. It does not establish a § 1692e(8) issue, and
it does not establish that a furnisher failed a duty. It is one input to a
question a person answers.

### 2.3 There is no DOFD in this source

Zero occurrences of "first delinquency", "DOFD", "delinquency date" or "date of
first" anywhere in the sample.

**State: `NOT_EXPOSED_BY_PROVIDER`.**

This is a statement about SmartCredit, and only about SmartCredit. It is **not**
evidence that a bureau omitted the field, and it must never be reported as one.

Consequences, and all of them are correct behaviour:

- Obsolescence (`G1`, the seven-year period) returns **UNKNOWN** from this
  source. It cannot be computed, so it is not.
- Re-ageing detection across rounds has nothing to compare.
- The DOFD relevance rule added in CR-4a fires **apparent** on a derogatory
  account — and with a manifest, its wording can finally be exact: *"this
  provider does not expose a delinquency date"* rather than *"the bureau omits
  it or our import missed it"*.

Getting the DOFD is a **data-acquisition problem**: a § 1681i(a)(7) procedure
request, a furnisher response, or a provider feed that carries it.

---

## 3. Payment history — month and year travel with the status

The source has **two separate history blocks**, and they answer different
questions. Both are kept.

### 3.1 Two-Year Payment History

A grid per tradeline per bureau. Month names and year labels are
`<p class="month-label">`; the status marks are `<p class="month-badge">` inside
a `status-*` wrapper. Marks observed: `OK`, `30`, `60`, `90`, `120`, `CO`.

**The current `payment_history text[]` shape is not sufficient**, and this is
the one shape change tradelines need.

```
WRONG   payment_history: ["OK","OK","30","OK", …]
```

An array of statuses is chronology by array index. It survives only while the
grid is complete, contiguous, and read in the same direction — and a real grid
is none of those reliably. Worse, `metro2/section-d`'s positional rules
(a month rated before the account opened, a DOFD later than the grid's first
uncured delinquency) map an index to a month by counting backwards from the
report date. A missing or padded month silently shifts every finding by one.

```
RIGHT   payment_history: [
          { "year": 2026, "month": 3, "status": "OK" },
          { "year": 2026, "month": 2, "status": "30" },
          …
        ]
```

Each status carries its own month and year, from the grid's own labels. A gap
is an absent entry, not a shifted one — which is also what makes `D4`
(months missing from the middle) honest rather than an artefact of padding.

### 3.2 Days Late – 7 Year History

Separate 30 / 60 / 90 counts, per bureau. **Preserved as its own three
figures** — not folded into the two-year grid, and not derived from it.

They cover a different window (seven years against two) and are the source's
own tally. Deriving them from a two-year grid would produce a number the source
never stated; deriving the grid from them is impossible. Two facts, kept as two.

---

## 4. Every other section

### 4.1 Bureau scores

| Source | Destination | Note |
|---|---|---|
| Score value ×3 | `report_scores.score` + `bureau` | |
| **Score model** | `report_scores.model` = **`UNKNOWN`** | |

**No model or version is named anywhere in the sample.** The document title
says "3-Bureau Credit Report & Scores" and nothing more.

So `model` is recorded as unknown, explicitly. It is **not** guessed at, and it
is **not** defaulted to a popular model name. A score whose model is unknown
cannot be compared with a score whose model is known — Rulebook §10, and the
reason a VantageScore and a FICO must never be diffed as a change over time.

### 4.2 Personal information

Per bureau, 7 rows. `Credit Report Date` · `Name / Also Known As` ·
`Date of Birth` · `Current Address` · `Previous Address` · `Employer` ·
`Consumer Statement`.

Two things matter here more than the fields:

1. **`NONE REPORTED` is an explicit marker**, and the sample uses it. It maps
   to `EXPLICIT_NOT_REPORTED`, which is *different from* a blank cell. The
   source is telling us it looked and found nothing.
2. **Identity verification comes first.** `Name` and `Date of Birth` feed the
   Rulebook's first check. A mismatch against the expected consumer
   **quarantines the import** — no analysis published. The sample is itself an
   example of why: its internal name did not match its filename.

Section A already compares reported name and address against the client record.
`Date of Birth` is deliberately **not** stored (see `identity-input.ts` —
the client record has no SSN column and the parser refuses identifiers), so
DOB is read for the identity check and discarded, never persisted.

### 4.3 Consumer statement

Per bureau, free text. **Raw-only.** No rule reads it. Worth capturing because
a consumer statement on file changes how a dispute should be written, and
because its presence is a fact about the file.

### 4.4 Bureau summary — the reconciliation source

Eight counts per bureau: `Open Accounts` · `Closed Accounts` · `Delinquent` ·
`Derogatory` · `Balances` · `Payments` · `Public Records` ·
`Inquiries (2 years)`.

**These are the parser's own check on itself.** See §6.

### 4.5 Public information

`Type` · `Status` · `Date Filed/Reported` · `Reference#` · `Closing Date` ·
`Court` · `Liability` · `Asset Amount` · `Exempt Amount`.

Destination: `report_items` with `kind = 'Public Record'`. **No canonical
columns exist for filed date, court, liability, asset or exempt amount** — the
same gap `ENGINE_INVENTORY` §1.10 records, and the reason the § 1681c(a)(1)
ten-year bankruptcy rule cannot run. Raw-only until CR-3.

### 4.6 Inquiries

`Creditor Name` · `Date of Inquiry` · `Credit Bureau`.

Destination: `report_items` with `kind = 'Inquiry'`; the bureau is stated
per inquiry rather than as three columns, so attribution is direct.

**Not exposed:** inquiry type (hard / soft), and permissible purpose. Both
`NOT_EXPOSED_BY_PROVIDER`. This matters — `metro2/section-j`'s retention rule
is written for hard inquiries only, so from this source it must return UNKNOWN
rather than assume every inquiry is hard.

### 4.7 Creditor contacts

Positional: name, address, phone. **Raw-only**, and genuinely useful — a
furnisher address the source states is better than one a template guesses, and
`letter-composer` refuses to invent an address.

---

## 5. The report completeness manifest

One record per report per bureau per field, stating what we know about what we
know. Provider-agnostic: the states are the same for SmartCredit, IdentityIQ,
MyFreeScoreNow and a direct bureau report.

| State | Means | Example |
|---|---|---|
| `PRESENT` | The source exposed a value and we read it | Balance Owed, populated |
| `EXPLICIT_NOT_REPORTED` | The source **says** nothing is reported | `NONE REPORTED` |
| `BLANK_IN_SOURCE` | The field exists in the layout and is empty | An empty grid cell |
| `BUREAU_NOT_PRESENT` | That bureau has no column or no data for this item | Account on two bureaus of three |
| `NOT_EXPOSED_BY_PROVIDER` | The format has no such field | **DOFD** · inquiry type · score model |
| `PARSE_FAILED` | The field exists and we could not read it | Grid coordinates unresolved |
| `AMBIGUOUS` | Read, but attribution or meaning is unproven | Multi-column values with no declared header |
| `UNKNOWN` | No determination made | Default; never a conclusion |

### 5.1 As built (0138)

| Table | Holds |
|---|---|
| `report_completeness` | report × bureau × item × field × state × reason. A non-present state without a reason is refused by a CHECK constraint |
| `report_reconciliation` | report × bureau × check_key × stated × parsed × ok × reason |
| `credit_reports.import_quality` | `complete` · `partial` · `review_required`, **derived by the writer**, and null on any report imported before 0138 — which reads as UNKNOWN, never as complete |
| `report_partial_acceptances` | who chose to work a partial snapshot, when, and why. Unique per report; a reason under 10 characters is refused |
| `report_analysis_complete(report)` | false unless the verdict is `complete`. **An acceptance does not make it true** |

All three tables are append-only (`select, insert` only — no update or delete
grant), carry no tenancy column, and authorize entirely through
`credit_reports → credit_report_visible()`. 23 probes in matrix phase 53.

**One known limitation, recorded rather than hidden.**
`report_completeness`'s unique key includes two nullable columns, and Postgres
treats NULLs as distinct in a unique index — so it catches a duplicate
*item-level* fact but not a duplicate *report-level* one. The writer's
`on conflict do nothing` therefore dedupes item-level facts only. Left as it
is deliberately: a duplicate fact is noise rather than a false claim, and
`NULLS NOT DISTINCT` would raise this project's minimum server version. If
report-level duplicates ever become visible noise, a partial unique index on
`(report_id, field_key) where bureau is null and report_item_id is null` is the
one-line fix.

### 5.2 The rules that make it worth having

1. **A state is never upgraded by absence.** `PARSE_FAILED` does not become
   `BLANK_IN_SOURCE` because nothing was found, and neither becomes
   `NOT_EXPOSED_BY_PROVIDER`. Those are three different failures with three
   different owners: us, the bureau, the provider.
2. **`NOT_EXPOSED_BY_PROVIDER` is a statement about the format**, asserted from
   the format's own field inventory, not inferred from one report having no
   value. It is set from this document, not from the data.
3. **Every rule reads the manifest before it reads a value.** A rule whose
   required field is `NOT_EXPOSED_BY_PROVIDER` returns UNKNOWN with that
   reason, so a letter can say *"this provider does not report it"* instead of
   the vaguer *"not reported"*.
4. **`AMBIGUOUS` never reaches an assertion.** It is the state of an
   unattributed value, and it belongs to §1's rule: no declared header, no
   attribution.
5. **The manifest is part of the snapshot.** Immutable, append-only, and
   re-derivable — the same inputs must produce the same manifest.

---

## 6. Reconciliation — the summary checks the parser

SmartCredit states its own counts. So the parser can be held to them, per
bureau:

| Source count | Compared against |
|---|---|
| Open Accounts + Closed Accounts | Parsed tradelines with that status |
| Delinquent | Parsed tradelines reading delinquent |
| Derogatory | Parsed tradelines reading derogatory |
| Public Records | Parsed items with `kind = 'Public Record'` |
| Inquiries (2 years) | Parsed items with `kind = 'Inquiry'` and a date inside 24 months of the report date |
| Balances | Sum of parsed balances |
| Payments | Sum of parsed monthly payments |

**Any mismatch means the snapshot is not complete, and
`report_analysis_complete()` returns false.** As built, the distinction is
finer than this section first proposed:

| Verdict | When |
|---|---|
| `complete` | Every check passed |
| `partial` | A check was made and the counts disagree — the shortfall is known and bounded |
| `review_required` | A check could not be made at all (the source states no count), or a required section is missing |

**This is a data-integrity guardrail, not an operator gate.** A partial
snapshot is workable: the operator inspects and works the accounts that did
parse, and the ones that did not are **never** treated as deleted, absent or
non-reporting. What a partial snapshot switches off is
completeness-dependent analysis — an item "no longer observed", a bureau "not
reporting" — because six unparsed accounts look exactly like six accounts the
consumer does not have.

This is the check that catches format drift, which is the failure mode Dee
named: SmartCredit's markup will change, and when it does, a parser that
silently returns 24 of 30 tradelines is far more dangerous than one that fails.
A missing tradeline is not visible as an error anywhere downstream — it looks
like an account the consumer does not have.

Money comparisons need a stated tolerance and rounding rule before they can
gate anything; counts do not, and counts are the ones that catch drift.

The reconciliation result is itself recorded on the snapshot, so "this report
was published because its counts matched" is auditable.

---

## 7. Parser validation tests required

**Attribution** — the CR-2 rule, on this format:

- Header classes declare bureau→column → values attributed to the declared
  bureau, not to a position
- Header classes present but naming only two bureaus → those two attributed,
  the third `BUREAU_NOT_PRESENT`
- A section with multi-column values and **no** declared header → every value
  `AMBIGUOUS`, preserved in `source_columns`, **nothing attributed**
- Column order changed in the fixture (equifax first) → values follow the
  declared classes, not the order
- **Adjacency must never attribute.** A fixture where the DOM order and the
  grid coordinates disagree must attribute by coordinates

**Grid geometry:**

- Labels at `col-start-1` are never read as values
- A label with no value cell at a coordinate → `BLANK_IN_SOURCE`
- Unresolvable coordinates → `PARSE_FAILED`, never blank

**Payment history:**

- Each status carries its own month and year
- A gap in the grid is an absent entry, not a shifted one
- The two-year grid and the seven-year 30/60/90 counts are stored separately
- The counts are never derived from the grid, nor the grid from the counts

**Completeness:**

- `NONE REPORTED` → `EXPLICIT_NOT_REPORTED`, not `BLANK_IN_SOURCE`
- DOFD → `NOT_EXPOSED_BY_PROVIDER` on every tradeline, and no rule reports it
  as a bureau omission
- Score model → `UNKNOWN`, and never a guessed model name
- Inquiry type → `NOT_EXPOSED_BY_PROVIDER`, so the retention rule returns
  UNKNOWN rather than assuming hard

**Reconciliation:**

- Counts match → published
- One tradeline dropped → `REVIEW_REQUIRED`, not published
- A count the source does not state → not compared, and not treated as a match

**Security and safety:**

- Uploaded HTML is inert: no script executed, no remote URL fetched
- Identity mismatch against the expected consumer → quarantine, no analysis
- A fixture with a name mismatch (as the real sample had) is refused
- No test fixture contains real consumer data

---

## 8. The smallest schema changes needed

**None for this document.** Listed for CR-3's review.

| # | Change | Enables | Size |
|---|---|---|---|
| S-10 | Six columns on `report_item_bureau_values`: `account_description`, `dispute_status`, `account_rating`, `creditor_type`, `payment_frequency`, `last_verified` | The 6 missing tradeline fields | Six nullable columns. No new table |
| S-11 | `payment_history` → `jsonb` array of `{year, month, status}` | Dated chronology; makes `section-d`'s positional rules sound | One column type change. **Nothing populates the current `text[]` in production, so there is no migration of data** |
| S-12 | `late_counts_7y jsonb` — `{"30": n, "60": n, "90": n}` per bureau | The seven-year tally, kept separate | One nullable column |
| S-13 | `report_completeness` — report × bureau × field × state × reason | The whole manifest | One child table, same RLS chain as CR-2 |
| S-14 | `report_reconciliation` — source counts, parsed counts, verdict | The §6 hold | One child table, or columns on `credit_reports` |
| S-15 | Public-record columns: `filed_on`, `court`, `liability_cents`, `asset_cents`, `exempt_cents`, `satisfied_on` | § 1681c(a)(1)–(3) rules | Nullable columns on `report_items` |
| S-16 | `report_items.inquiry_type` | Section J's hard-inquiry gate | One nullable column |

**Sequence:** S-13 first. The manifest is what makes every other one honest —
without it, a new column is just another place for a blank to mean three
different things.

---

## 9. What is confirmed, and what needs more samples

Read as a contract, this document's confidence is not uniform. Stated plainly
because a spec that hides its own uncertainty is worse than a shorter one.

**Confirmed from the sample:**

- The grid layout and the four `col-start` roles
- Bureau→column declared in header classes, invariant across 94 groups
- 30 tradelines × 22 fields × 3 columns; 717 value cells per column
- The section list and each section's field labels
- Both history blocks and the mark vocabulary
- No DOFD, anywhere
- No score model named
- `NONE REPORTED` used as an explicit marker
- Dispute Status carries two distinct values

**Needs more samples before it is built on:**

- The exact month/year pairing geometry inside the two-year grid — part of what
  was inspected turned out to be the legend, not the grid
- Whether `status-*` wrapper classes or the badge text is authoritative for a
  mark
- Whether the 30/60/90 counts sit in per-bureau columns like everything else
- The value vocabularies of Account Description and Account Rating — the first
  extraction attempt failed, and normalising a vocabulary from one sample would
  be guessing
- Whether an account reported by fewer than three bureaus renders an empty
  column or omits it

**This is blocker A6.** Three to five real reports per provider, and the
uncertainties above close. Until then the fixture encodes what is confirmed and
leaves the rest for a parser to declare `PARSE_FAILED` on, honestly.
