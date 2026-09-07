# SmartCredit: two formats, one canonical record

**Status:** implemented 2026-09-07.

SmartCredit publishes the same report as a saved HTML page and as a printed
PDF. Both are read into the same canonical model — the same
`ParsedReportItem`s, the same per-bureau values, the same reconciliation
counts. **The canonical data model did not change** to accommodate either.

| | |
|---|---|
| `SmartCreditHtmlAdapter` | wraps the existing HTML parser |
| `SmartCreditPdfAdapter` | reads page geometry |
| shared vocabulary | `smartcredit/source-fields.ts` |
| acceptance test | `smartcredit/adapter-equivalence.test.ts` |

## The PDF is read as a grid, not as a text blob

`pdf-text.ts` flattens a PDF into visual lines. That is right for a single
column of prose and wrong here: a SmartCredit export is a three-column grid
(label at x≈47, then the bureaus at x≈184 / 313 / 443), and flattening it
leaves space-counting as the only way back — which reassigns a value to the
wrong bureau as soon as a figure is wide enough to close the gap.

So `pdf-geometry.ts` hands the parser every fragment with its **page, x, y and
width**, plus every filled rectangle. The parser groups rows by baseline and
columns by left edge.

### Three rules, each because the shortcut is wrong

**Columns are never assigned by order.** Value edges are found from where
values actually sit; bureau names are matched to them by the **centre** of the
header text, because the export centres headers over left-aligned values. A
band with two headers, or none, is returned unattributed and its values are
preserved under `sourceColumns` with nobody's name on them. There is no
fallback to left-to-right order.

**Page breaks are not record boundaries.** Rows are ordered by `(page, y)` and
a block runs from its heading to the next account's — so an account whose
fields end on one page and whose payment history begins on the next stays one
`report_item`. In the real 36-page export, most accounts do this.

**Each grid votes only on its own columns.** An account block contains three
grids: the field table, the two-year payment history, and the seven-year late
tally — with different x positions. A row contributes a column edge only if it
carries one of that grid's labels. Without this, month positions split the
field columns into slivers and a bureau header lands over a slice of the
payment grid.

## Four cell states stay four

| Source prints | State |
|---|---|
| `NONE REPORTED` | `explicit_not_reported` — the source looked and says nothing is there |
| `——` or `––` | `bureau_not_present` — this bureau's column is empty |
| nothing | `blank_in_source` |
| `$0`, `0` | `present`, value zero |

Collapsing the last into the others would let "balance $0" read as "no balance
reported". `classifyCell` is shared by both adapters, so the formats cannot
drift on what an empty cell means. The real export uses **both** dash glyphs
(1,476 em-dash pairs and 162 en-dash pairs), so both are recognised.

## Payment history keeps its dates

Stored as `YYYY-MM:status`, one string per month — the date travels with the
status, so nothing is located by array index. That matters: in the real export
TransUnion's history row starts in August and Experian's starts in September,
so index 0 is a different month for each.

The year comes from the source's own markers. The export prints `'25` **in
place of January**; a marker sets the year and stands for that January, months
after it belong to it, and months before the first marker belong to the year
before.

The status stored is the **provider's code** (`C`, `1`, `U`) from its own
`payment-history-legend`, not the glyph beside it. The code survives a
restyle, and it keeps `U` — which the provider declares with an *empty* badge,
meaning the bureau reported nothing that month — distinguishable from a cell
carrying nothing at all.

`status-6` appears on 16 cells of the real export and is **not in the
provider's legend**. The obvious reading is 180 days, which is exactly why it
is not written down: a plausible guess about a delinquency severity is still a
guess, and it would be printed to a consumer as fact.

## What the PDF renders visually but does not label

The PDF **does** carry the payment-history marks — visually. Each month is
drawn as a filled rectangle, and those rectangles are recoverable from the
page's drawing operators (`#16a35c` green, `#efefef` grey in the export
examined). What it does not carry is any **machine-readable status label** for
them, and no **authoritative embedded colour-to-status mapping**.

Verified against the real 36-page export: zero occurrences of `OK`, `PP`, `RF`
or any delinquency glyph in the text layer, and the `payment-history-legend`
block that decodes the marks does not print. The status colours are defined in
external stylesheets the saved page does not inline — `16a35c` appears zero
times in the HTML source — so nothing in either supplied document states which
status a given green means.

So the adapter reads and dates every month, records the observed graphic
provenance, and leaves the meaning undetermined:

```
history: { bureau, year, month,
           status: null,
           unreadable: { reason: "status_not_in_text_layer", fill: "#16a35c" } }

facts:   { fieldKey: "payment_history_status", state: "not_exposed_by_provider",
           reason: "…prints the payment-history months but not the marks or the
                    legend that decodes them…" }
```

- **month and year are preserved**, from the source's own year markers
- **the observed fill is preserved**, so a reviewer can see which cell was
  unreadable and what it looked like
- **the status is UNKNOWN / NOT_EXPOSED** wherever the meaning is not proven
- **delinquency is never inferred from colour alone**

The fact is recorded once for the report, not per bureau, because no bureau is
at fault. `?` in the `YYYY-MM:status` encoding means *the format did not label
the mark*; `U` means *the bureau reported nothing that month*, which the
provider declares in its own legend. Different claims, kept apart.

Reading a colour as a delinquency severity would mean publishing our own
inference to a consumer on the strength of a stylesheet we were never given,
and it would break silently the first time the provider restyled.

**To resolve PDF payment-history statuses**, one of: import the HTML export
for that report; supply the provider's stylesheet so a colour key can be
declared with provenance and a version; or supply a print that carries the
legend.

## Reconciliation windows

A count without its window is not a count. The real export states the same
noun over two different scopes:

| Where | Wording | Scope |
|---|---|---|
| Summary, p1 | `Inquiries (2 Years)` | per bureau, 2-year window |
| Inquiry listing, p31 | `We found 49 inquiries in the past 3 years` | all bureaus, 3-year window |

Both parsers were checking the first against a parse of the second. On the real
file that compares **23 against a population of 49** — a discrepancy
manufactured entirely out of the two figures counting different periods.

Every stated figure now carries five things:

```
metric · bureau (where the source states one) · time window
       · source section · the source's own wording, verbatim
```

and two figures reconcile **only when metric and window agree**. A pair that
does not agree keeps both numbers and is marked `comparable = false`: it grades
nothing, because it measured nothing. Passing it would claim a verification
that never happened; failing it would report a shortfall from arithmetic that
was never valid.

The window is also part of `check_key` (`inquiries@2_years`,
`inquiries@3_years`). That is load-bearing, not cosmetic:
`report_reconciliation` is unique on `(report, bureau, check_key)`, so two
windows sharing a key would collide and one would silently overwrite the other
— the same conflation, happening in storage.

The verdict follows the same rule in **both** layers. Migration 0141 teaches
`create_credit_report` to exclude non-comparable rows from its arithmetic, so
the database and the application cannot disagree about one import. A report
where *nothing* was comparable grades `review_required` — never complete.

**What still catches an unread item** is the like-for-like check: the listing
against the total the listing itself states. That comparison is real, and it is
the one that turns an unparsed inquiry into `partial` rather than into a claim
that the inquiry is absent from the file.

Attribute counts — open, closed, delinquent, derogatory, balances, payments —
are captured in `summary` and deliberately **not** reconciled. They are not
item counts, and comparing them against a count of items would compare two
different things.

## The acceptance test

One synthetic report, defined once in `fixtures/synthetic-report.mjs`, rendered
into both formats by `fixtures/generate.mjs`. Both files go through their
adapter and the results must agree:

- the same accounts, by the same handle (`normalizeAccountRef`, shared)
- the same bureaus
- every field both formats print, attributed to the same bureau with the same value
- the same reconciliation against the source's own counts
- the same dated payment-history months

The single divergence — the PDF's undetermined statuses — is **asserted**, not
smoothed over. A test demanding byte-identical output could only be satisfied
by inventing the missing marks, which would make it a test that the platform
fabricates data.

### The fixture's deliberate cases

| Account | Case |
|---|---|
| NORTHSTAR CARD 4417 | three bureaus agree |
| HARBOR AUTO 8823 | Experian only; the others print an em-dash |
| MERIDIAN LOAN 5501 | fields on one page, history on the next |
| ATLAS RECOVERY 9910 | no bureau header — must stay unattributed |
| SUMMIT BANK 3072 | headers **reversed**, Equifax leftmost |

Summary counts are derived from the accounts by a stated rule, so the fixture
cannot drift out of agreement with itself. ATLAS counts for no bureau, because
its columns are attributable to nobody — correct arithmetic that a
position-guessing parser fails.

Regenerate with:

```bash
node src/lib/credit-report/smartcredit/fixtures/generate.mjs
```

## Bugs the PDF adapter exposed in the HTML path

Building the second reader found four live defects in the first, all fixed:

1. **A missing history grid fell back to the first grid in the block** — so a
   bureau reporting no history was handed another bureau's twenty-four months,
   publishing one bureau's payment record under another's name.
2. **`class="month-label"` was matched as an exact string**, while the real
   export writes `class="month-label text-center"` on 696 of its 706 cells.
3. **A month with a blank badge was dropped entirely** — losing every month
   the provider marked `status-U`.
4. **`——` was stored as a literal value**, so an account every bureau left
   blank read as an account every bureau reports.

## Real-source validation, 2026-09-07

Run against a real 36-page SmartCredit PDF export, locally. The file is not in
this repository and never will be; only aggregates are recorded here.

| | |
|---|---|
| pages / text fragments | 36 / 8,482, text layer present |
| account blocks → canonical items | 46 → 46 (one block, one item) |
| blocks spanning a page break | **29**, all still single items |
| per-bureau observations | TU 42, EX 42, EQ 0 |
| summary's stated account totals | TU 42, EX 42, EQ 0 — **reconciles per bureau** |
| unattributed / duplicate-header columns | 0 / 0 |
| account-number outcomes | 21 shared · 8 single-bureau · 17 varies-by-bureau |
| stored values not verbatim in the source | **0** — no digit reconstructed |
| dated history entries | 1,152 across 2022–2026, no month outside 1–12 |
| observed fills preserved | 1,152 of 1,152, two distinct colours |
| completeness facts | 1,589 present · 1,447 bureau-not-present · 1 not-exposed |
| parse failures / warnings | 0 / 0 |

Note that **46 canonical accounts exceeds any single bureau's total of 42**.
That is correct and is why reconciliation is per bureau: some accounts are
reported by one bureau and not another, so a unique-account count can never be
checked against one bureau's figure.

Equifax reports nothing at all in this file — no score, no accounts. It is
recorded as 1,012 `bureau_not_present` facts, never as "Equifax removed
everything", and its stated total of 0 reconciles against 0 parsed.

Verdict: **partial**, driven by the one honest shortfall — the inquiry listing
states 49 and the adapter parses none, because it does not yet read that
section. Not "49 inquiries absent from the file".

## Known gaps in the PDF adapter, stated rather than hidden

**Public records and inquiries are not yet read from the PDF.** The HTML
adapter reads both (S-15 / S-16); the PDF adapter returns none.

This is deliberately *visible*: the reconciliation checks
`public_records` and `inquiries` against the summary's own counts, so a PDF
stating three judgments reconciles short and grades the import **partial /
review required**. It never reads as "the records are absent from the file" —
an unread item and a removed item look identical to a comparison and mean
opposite things.

**Attribute counts are captured but not reconciled.** The summary also prints
open, closed, delinquent, derogatory, balances and payments. They are kept in
`summary` and left unchecked, because they are not item counts and comparing
them against a count of items would compare two different things.

**Utilization is preserved, but not as a reported value.** It appears under
`derived` — `accountRef → bureau → label → value as printed` — because it is
arithmetic on balance and limit rather than something a bureau furnished.
Storing it among the reported fields would make a derived number look
furnished, and a later balance correction would leave a stale percentage
beside it.

## Other providers

The layout was measured from a SmartCredit export, but the doctrine is the
provider's, not the format's: read what the source exposes, attribute only
what the source proves, and record what it does not carry. IdentityIQ,
MyFreeScoreNow and direct bureau reports each need their own adapter against
their own declared headers. Their data is the same bureau data.

Any PDF the SmartCredit adapter does not recognise falls through to the
existing line reader, which handles every other provider.
