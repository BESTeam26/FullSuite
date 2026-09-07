# Result and outcome vocabulary (R5)

**Status:** implemented 2026-09-07. Migration `0140_outcome_vocabulary`.

## The defect this closed, and it was live

`report_item_changes` said:

```sql
case when cur.id is null then 'deleted'
```

An account present in one import and absent from the next was labelled
**deleted**. There was no completeness check, no bureau-coverage check, and
matching was by `account_ref` alone.

That value flowed into `report_facts`, into the KPI catalogue
(`outcomes.deleted_engine`, labelled "Items deleted (from reports)"), into the
pivot, and from there into progress reports and a client's own summary.

So an import that failed to read an account told the client the bureau deleted
it. A furnisher renaming itself did the same. It was the most consequential
false statement the platform could make, because it was made to the consumer
about their own credit file, in writing.

## The distinction the vocabulary exists to hold

| | |
|---|---|
| `BUREAU_CONFIRMED_DELETION` | the result document says the item was removed |
| `NO_LONGER_OBSERVED` | it is absent from a complete, comparable report |

The first is somebody else's statement. The second is our own reading of two
files. **They are never summed into one "deletions" figure**, and a reimport
comparison can never produce the first — enforced by a database CHECK, not
only by the domain module, because the domain module is not the only writer.

## The ten outcomes

| Outcome | Client-facing wording | What it does not establish |
|---|---|---|
| `bureau_confirmed_deletion` | "{bureau} confirmed this item was removed from your file." | — |
| `no_longer_observed` | "No longer observed on {bureau} in this report." | Not a confirmation that the bureau deleted it |
| `corrected` | "{bureau} now reports {field} as {current}, which is what the dispute asked for." | — |
| `updated` | "{bureau} changed {field} from {previous} to {current}." | A change is not by itself a correction |
| `unchanged` | "No change observed on {bureau} for this item." | Not verified as accurate, not a reasonable investigation, not compliance |
| `newly_reported` | "This item appears on {bureau} in this report and was not in the previous one." | — |
| `reappeared` | "This item is observed again on {bureau} after not appearing in the previous report." | Reappearing is not by itself improper |
| `unable_to_compare` | "We could not compare this item between reports." | Nothing follows about the item |
| `ambiguous_match` | "This item needs review before we can say what happened to it." | No outcome is claimed until someone decides |
| `result_not_available` | "No result has been received for this item yet." | — |

Plus three legacy values — `legacy_reported_deleted`, `legacy_reported_updated`,
`legacy_reported_verified` — described below.

## Where an outcome may come from

`cra_result_notice` · `reimport_comparison` · `operator_review` ·
`consumer_provided_result` · `other` · `legacy_manual_entry`

Every outcome carries its source, so **a reimport inference can never
masquerade as a bureau response**. Two constraints are in the database:

- a `bureau_confirmed_deletion` requires a reviewed source **and** a note of at
  least ten characters saying where the statement came from;
- a `corrected` requires the same, because a correction is a claim that the
  dispute achieved something and a diff cannot establish intent.

## What the comparison view says now

```
later report not graded complete, or bureau coverage differs → unable_to_compare
absent, but the later report holds the same creditor under a
  different account handle                                   → ambiguous_match
absent from a COMPLETE comparable report                     → no_longer_observed
status or balance moved                                      → updated
neither                                                      → unchanged
present only in the later report                             → newly_reported
```

`newly_reported` is new: the old view walked only the earlier report's items,
so an item that *appeared* was invisible to every metric.

### The scope of the completeness gate

Only an **absence** is withheld when completeness is unknown. An account read
in both imports still reports its change, because both values were actually
read. Completeness decides what an absence means; it does not decide whether a
difference between two read values happened.

### Consequence for historical data, stated plainly

Nothing was backfilled (CR-14 deliberately graded no historical report), so
every report imported before completeness existed has `import_quality = null`.
Under the new rule, **comparisons of those reports yield `unable_to_compare`
rather than `no_longer_observed`.** The `outcomes.no_longer_observed` KPI will
therefore read zero across historical data.

That is the correct answer, not a regression: we never measured whether those
imports were complete, so we cannot say an absence means the item came off the
file. A report imported from today, reconciled and graded complete, produces
`no_longer_observed` normally.

## Legacy rows are read, never rewritten

`client_round_outcomes` holds coarse integer counts — `deleted`, `updated`,
`verified` — recorded by hand before provenance existed. They map at **read
time** to `legacy_reported_*` and keep counting under honest labels:

- `outcomes.deleted` → "Items reported deleted (legacy manual)"
- `outcomes.verified` → "Items reported verified (legacy manual)", described as
  *the bureau returned the item unchanged* — not a finding that the reporting
  is accurate

The stored rows are not upgraded to stronger conclusions. The provenance that
would justify one was never captured, and manufacturing it would be worse than
leaving the record coarse.

## Metric grouping

Outcomes carry a `metricGroup`, and a metric may only sum within one:

```
confirmed_removal · observed_absence · established_correction · change
no_change · new · return · not_comparable · legacy
```

A caller wanting "deletions" has to choose which of the two it means.

## Where it lives

| Layer | File |
|---|---|
| Domain | `src/lib/dispute/outcome-vocabulary.ts` |
| Data | `src/lib/data/dispute-outcomes.ts`, `use-dispute-outcomes.ts` |
| UI | `src/components/clients/ReportChangesPanel.tsx` |
| Database | `supabase/migrations/20260904011800_outcome_vocabulary.sql` |
| Tests | `src/lib/dispute/outcome-vocabulary.test.ts` (14), matrix phases 30 and 54 |

`dispute_item_outcomes` is **append-only** — no UPDATE, no DELETE grant. A
reviewer who reaches a different conclusion records a new row, and the earlier
one stays inspectable; that is why the table carries no unique constraint and
why reads take the most recent row per item.

Nothing here re-compares snapshots. CR-3's chronology establishes what was
observed; this vocabulary names what that means. There is one comparison
engine.
