# Architecture proposal — per-bureau observations

**Status: proposal. Nothing built. No migration written.**
Requires Dee's approval: this changes the canonical credit-report model.

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

## 8. What this does not do

It does not add `import_jobs`, `parser_runs` or `field_evidence`. Those are
correct designs that belong *after* this one — building an import-job record
around a parser that still discards per-bureau values would bank the ceremony
without the substance.

It does not enable the V2 Metro 2 Validation Layer. These are still
consumer-display values; `raw_metro2_verified` stays false by constraint.
