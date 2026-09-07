# The chronology layer — BUILT

**Status: shipped 2026-09-07 as CR-3, and with NO schema change.**

The proposal below expected three migrations. None was needed: CR-2 put
per-bureau values, `reporting_period` and `account_information_date` on the
snapshot, and CR-14 put the coverage verdict on the report. Chronology turned
out to be a pure computation over data already persisted —
`src/lib/credit-report/chronology.ts` — plus a UI.

What that means for the two analyses the proposal said were guesswork:

| Proposal said | As built |
|---|---|
| §4.2 needs a `report_bureau_coverage` table before "no longer observed" is honest | `credit_reports.import_quality` + `credit_reports.bureaus` answer it. `comparableFor()` requires a **complete** verdict AND coverage of that bureau; anything else is `COMPARISON_UNAVAILABLE` with the reason |
| §4.4 cure reconstruction needs grid positions mapped to months | CR-2's dated `payment_history` already carries month and year, so history is compared **by month** — a month present on one side only is a new observation, not a change |
| §4.3 timeline events table | **Not built, and deliberately out of CR-3.** Dispute receipt, CRA notice and investigation deadlines are G-11's. Mixing them into a report comparison is how a diff starts implying a legal clock; a test asserts the chronology contains no such word |

One thing the proposal did not anticipate, found while building: **a renamed
creditor changes the account handle**, so the same obligation looks like one
account dying and another being born. `nearMatchIn()` blocks the
disappearance and raises `MATCH_REVIEW_REQUIRED` instead — histories are never
merged on a guess, and never split on one either.

The record of the original proposal follows.

---

Governed by `docs/creditops/CREDIT_REPORTING_INTELLIGENCE_RULEBOOK.md` §10.

---

## 1. The problem

BES can say *what* a report said. It cannot reliably say *when that was true*.
Without that, two of the highest-value analyses are guesswork:

- **Re-aging.** `DOFD.MOVED_LATER` compares the DOFD across snapshots and
  guards only on the absence of a derogatory remark. It cannot reconstruct
  whether the account was **cured**, which is the whole difference between
  re-aging and lawful reporting.
- **Reinsertion.** `ITEM.REAPPEARED` cannot distinguish a deletion following a
  reinvestigation from an item merely absent because the import was
  incomplete. Those look identical today.

## 2. What exists

| Have | Where |
|---|---|
| Immutable snapshots with a pull date | `credit_reports.pulled_at`, `report_items` append-only |
| Four statutory timers per mailing, started by the mailing event | `dispute_timers` via `mark_letter_mailed()` |
| Mailing acceptance and delivery, kept separate | `letter_mailings` reserve-then-reconcile |
| Round outcomes per bureau | `client_round_outcomes` |

**This is already better than the research assumed:** clocks start from the
mailing, not from generating a PDF.

## 3. What is missing

| Missing | Consequence |
|---|---|
| **Reporting period** and **account information date** per observation | Cannot ask the Rulebook's "same reporting period?" question, so a stale figure and a wrong figure are indistinguishable |
| Cure reconstruction from the payment grid | Re-aging detection is guesswork (L-17) |
| Snapshot **completeness** per bureau | An absent item cannot be told from an unavailable bureau (L-18) |
| `cra_furnisher_notice_at` | The § 1681s-2(b) trigger event is not recorded |
| `procedure_request_at`, `reinsertion_detected_at`, `extension_basis` | Timeline incomplete |
| Triggering **evidence reference** per timer | A timer knows its start date, not what proves it |

## 4. Proposed change

### 4.1 Two columns on the observation (with S-1)

`reporting_period` and `account_information_date` land on
`report_item_bureau_values` — already in that proposal, and the reason the two
are sequenced together.

### 4.2 Snapshot completeness

```
report_bureau_coverage
  report_id   uuid → credit_reports(id) on delete cascade
  bureau      text check (bureau in ('EQ','EX','TU'))
  state       text check (state in ('present','absent','partial','unavailable'))
  reason      text
  primary key (report_id, bureau)
```

One row per bureau per report, written at import from what the parser saw.
**This single table is what makes "no longer observed" honest**: an item
missing from a report whose Equifax coverage is `unavailable` produces no
outcome at all, rather than a deletion.

### 4.3 Investigation timeline events

```
dispute_timeline_events
  id            uuid pk
  client_id     uuid → fulfillment_clients(id) on delete cascade
  letter_id     uuid → dispute_letters(id) on delete set null
  round_id      uuid → dispute_rounds(id) on delete set null
  event_type    text  -- dispute_received | cra_furnisher_notice
                      -- | investigation_deadline | extension_granted
                      -- | result_received | procedure_requested
                      -- | reinsertion_detected | mail_accepted | mail_delivered
  occurred_at   timestamptz not null
  basis         text not null   -- WHAT PROVES IT
  evidence_file_id uuid → files(id) on delete set null
  recorded_by   uuid → profiles(id)
  created_at    timestamptz not null default now()
```

Append-only, no update or delete policy — this is the record of what happened,
in the same class as `activity_events`.

**`basis` is not optional.** A timeline event without its proof is the thing
the Rulebook forbids: a legal clock with no triggering evidence. Existing
`dispute_timers` rows keep working; new events reference the evidence.

### 4.4 Cure reconstruction (no schema)

A pure function over the payment grid, once §4.1 gives grid positions a month:

```
last current period → initial delinquency → cured? →
delinquency immediately preceding charge-off/collection → reported DOFD
```

`DOFD.MOVED_LATER` then upgrades from "the date moved and no remark explains
it" to "the date moved **and the grid shows no cure between the two**". That is
the difference between a finding a bureau can dismiss and one it cannot.

## 5. Security and data impact

| Concern | Answer |
|---|---|
| Tenancy | Both tables join to an existing tenant-scoped parent; no new boundary |
| New permission | None — `credit_report_visible` and `credit_client_visible` unchanged |
| History | Append-only, no update or delete policy |
| Legal clocks | Unchanged. `dispute_timers` keeps its trigger; timeline events **record**, they do not start clocks |
| Risk of over-claiming | `basis` being NOT NULL is the guard |

## 6. Tests required

**Coverage:** an item absent from a report whose bureau is `unavailable`
produces no "no longer observed" outcome · a `present` bureau with the item
absent does produce one.

**Cure:** grid shows 30 → OK → 60, DOFD at the second delinquency →
`not_an_error` · grid shows 30 → 60 → 90 uninterrupted, DOFD later →
`HIGH_PRIORITY_DATA_INTEGRITY_REVIEW`.

**Timeline:** an event cannot be written without a `basis` · a timer's start
still comes only from `mark_letter_mailed()`.

**Matrix:** a new phase for both tables — cross-organization reads refused;
append-only proven by an attempted update.

**Rulebook invariants:** a Date Updated change alone is never re-aging · a
one-bureau absence never forces another bureau's outcome.

## 7. Sequencing

After `ARCHITECTURE_PROPOSAL_PER_BUREAU_OBSERVATIONS.md`. §4.1 lives in that
table; §4.4 needs grid positions mapped to months, which needs the report's own
pull date beside the observation. §4.2 and §4.3 are independent and could ship
first if the outcome-honesty problem is judged more urgent than cross-bureau
analysis.
