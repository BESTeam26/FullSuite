# Per-bureau observations — IMPLEMENTED

**Status: shipped 2026-09-07 as CR-2.** Migration `0135`
(`20260904011300_per_bureau_observations.sql`) applied and verified against the
live database. Approved by Dee with four refinements, all of which changed the
design — recorded in §9 below.

Governed by `docs/creditops/CREDIT_REPORTING_INTELLIGENCE_RULEBOOK.md` §9.

---

## 1. The problem, in one line

BES reads which bureau reported what, and throws it away before storing it.

## 2. Evidence

| Layer | What it holds | Per-bureau? |
|---|---|---|
| `pdf-report-parser.ts` `firstColumn()` | Splits tri-merge columns, computes `differs`, **returns `columns[0]`** | Reads them, discards them |
| `report_items` | One `status`, one `balance_cents`, one `dofd`, one `open_date`, `bureaus text[]`, `raw jsonb` | No — and `createCreditReport` writes `raw: null` |
| `RawReportItem` | Same one-value shape | No |
| `BureauRecord` (`condition-detector`) | **Exactly the shape both engines want** | Constructed only in tests |

The parser already knows the columns disagree: `differs` lowers parse
confidence to `review` and adds the remark *"Bureau columns differ — check each
bureau's figure."* What is lost is **which bureau said what**.

## 3. What the gap costs

1. `BUREAU.VALUE_DIFFERS` — catalogued with authorities and a route,
   unreachable.
2. Six detector conditions unreachable: `balance_inconsistent`,
   `status_inconsistent`, `dates_inconsistent`,
   `payment_history_inconsistent`, `single_bureau_only`,
   `deleted_from_other_bureaus`.
3. **`detectConditions` has no product caller at all** — 31 conditions and the
   whole reason-selection path behind an input nothing can build.
4. The Rulebook's seven comparability questions (§9) cannot be asked.

## 4. The constraint that decides the design

**Column order is not bureau order.** Pairing a column to a bureau by position,
without a header that says so, is inferring identity from layout — the same
error as inferring ownership from a display name (project rule 4). It would
manufacture the sentence *"Equifax says $1,400 and TransUnion says $0"* out of
nothing.

So: **pair only where a header names exactly as many bureaus as there are
columns.** Otherwise store the columns unattributed. Unattributed columns still
support *"the bureaus report different values"* — which the parser already
says — and correctly refuse *"Equifax says X."*

## 5. Proposed change — three independently shippable steps

### Step 1 — parser keeps what it reads (no schema)

`firstColumn()` returns `{ value, differs, columns: string[] }`. The block
already knows which bureaus it names (`bureausIn`). A new
`attributeColumns(columns, namedBureaus)` returns either
`{ attributed: Map<Bureau,string> }` or `{ unattributed: string[] }`, never a
guess.

### Step 2 — one child table

```
report_item_bureau_values
  id                     uuid pk
  report_item_id         uuid not null → report_items(id) on delete cascade
  bureau                 text not null check (bureau in ('EQ','EX','TU'))
  -- the BureauRecord shape, as text plus parsed value
  status, payment_status, account_type, account_number_masked   text
  balance_cents, high_balance_cents, credit_limit_cents,
  past_due_cents, monthly_payment_cents                          bigint
  term_months                                                    integer
  open_date, date_closed, date_last_payment,
  date_last_active, dofd                                         text
  payment_history                                                text[]
  remarks                                                        text
  -- provenance, per the Rulebook §6 and §9
  source_type            text not null
  raw_metro2_verified    boolean not null default false check (raw_metro2_verified = false)
  reporting_period       text
  account_information_date text
  source_locator         jsonb
  parser_version         text not null
  unique (report_item_id, bureau)
```

- RLS inherited through the existing `credit_report_visible` chain on the
  parent. **No new permission surface.**
- `select, insert` only — append-only like its parent.
- `raw_metro2_verified` carries the same `= false` check the findings table
  already uses, so a consumer display can never be recorded as raw Metro 2.
- Unattributed columns are **not** written here. They stay on the item's
  existing `differs` remark until a header proves the pairing.

### Step 3 — engines read it

`RawReportItem` gains `records?: BureauRecord[]`. `evaluateItem` evaluates
`BUREAU.VALUE_DIFFERS` when present and skips it when absent — no behaviour
change for old reports. `detectConditions` finally has a producer.

## 6. Security and data impact

| Concern | Answer |
|---|---|
| New tenancy surface | None. Parent carries `client_id`/`consumer_user_id`/`organization_id`; the child joins through it |
| New permission | None. `credit_report_visible` unchanged |
| History | Append-only, matching the parent's "no update, no delete" |
| False attribution | The one real risk, addressed by the header rule in step 1 |
| Payload growth | Up to 3 rows per item. A 60-item report becomes ≤180 child rows — bounded, indexed by `report_item_id` |

## 7. Tests required

**Parser:** header names 3 bureaus + 3 columns → attributed · 3 columns, no
header → unattributed · 2 columns, 3 named bureaus → unattributed · 1 column →
unchanged behaviour.

**Engine:** `BUREAU.VALUE_DIFFERS` fires only with ≥2 attributed values ·
never fires from `bureaus text[]` alone (the existing test, kept) ·
`detectConditions` cross-bureau conditions fire from real data for the first
time.

**Matrix:** phase 16 extended — an unrelated organization cannot read another's
`report_item_bureau_values`; the child is unreadable when the parent is.

**Rulebook invariants:** a cross-bureau difference alone produces
`OBSERVED_REPORTING_DIFFERENCE`, never a legal violation; comparability
questions gate any stronger classification.

## 8. What shipped, against what was proposed

| Proposed | Shipped | Why it changed |
|---|---|---|
| Unattributed columns stay on the item's `differs` remark | **`report_items.source_columns jsonb`** — `field -> [values in source order]` | **Dee's refinement 1.** The proposal lost the figures along with the attribution: a reviewer was told "bureau columns differ" and could not see what any of them said. Now the values survive with nobody's name attached |
| `RawReportItem.records?: BureauRecord[]` | `RawReportItem.records?: BureauValues[]`, declared in `credit-classification` | `credit-classification` is the lower layer and may not import from `dispute/`. Same shape; the layering holds |
| Engines read it when present | **Only `BUREAU.VALUE_DIFFERS` reads it** | **Dee's refinement 2.** `detectConditions` stays dormant. `dormant-rules.test.ts` reads the source tree and fails if anything calls it — verified by planting a real call |
| — | `source_type` constrained to five V1 values; `raw_metro2_verified = false` as a CHECK, not a default | **Dee's refinement 4.** A consumer-report observation cannot be recorded as authorized raw Metro 2 even by a deliberate insert. Both refusals are probed |
| — | Two SQL statements in the writer, not one data-modifying CTE | A CTE's inserted rows share the statement's snapshot, so the child's `WITH CHECK` sub-select would have found no parent and refused every row. Found while writing it |
| — | Attribution decided **per field**, not per block | A row where all bureaus agree often prints one column beside a neighbour printing three. All-or-nothing would have discarded the resolvable fields with the unresolvable ones |

### The three things that were harder than they looked

**`bureausIn` answers in the wrong order.** It walks a fixed `BUREAU_WORDS`
list, so it returns EQ, EX, TU whatever the header said. Correct for "who
reports this account", useless for "which column is whose" — and using it would
have attributed by position while appearing not to. `bureausInOrder` reads the
header's own order, and a test reverses a header to prove the values follow it.

**A single column is not agreement.** One value under a three-bureau header
could mean all three agree, or that one of them reports the account at all.
Spreading it across three would invent two facts, so a single-column field is
never attributed and never counted as a disagreement either.

**One value plus two silences is not a disagreement.**
`crossBureauDifferences` requires two bureaus to have *said* something before
it compares. Without that, an account reported by one bureau would have
produced a difference against nothing.

## 9. Dee's four refinements, and where each lives

1. **Preserve unattributed values** → `report_items.source_columns`;
   `attributeColumns` returns them under the field label with a `reason`;
   the item's remark now says which of the two things happened.
2. **Data capability, not rule activation** → `dormant-rules.test.ts`. Six
   structural tests: no product caller for `detectConditions` or
   `selectReason`, the detector's 31-condition list unchanged in size, exactly
   one rule unblocked, and it stays at `observed_difference` / route `none`.
3. **No backfill** → no `UPDATE` anywhere in 0135. Verified live: 0 child rows,
   0 `source_columns` set. A matrix probe asserts it, so a later backfill would
   fail the gate.
4. **Source provenance** → all six fields on the child table, with
   `source_type` CHECK-constrained to the five V1 values and
   `raw_metro2_verified` CHECK-constrained to false.

## 10. What this does not do

It does not add `import_jobs`, `parser_runs` or `field_evidence`. Those are
correct designs that belong *after* this one — building an import-job record
around a parser that still discards per-bureau values would bank the ceremony
without the substance.

It does not enable the V2 Metro 2 Validation Layer. These are still
consumer-display values; `raw_metro2_verified` stays false by constraint.
