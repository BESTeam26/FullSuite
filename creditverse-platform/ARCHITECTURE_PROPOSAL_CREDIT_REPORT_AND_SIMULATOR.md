# Proposal — Canonical credit report + factual Score Simulator

**Status: proposal (2026-09-04). Nothing built.** Requested by Dee: the Score
Simulator must be a factual guide for agents, owners and DIY clients, based
solely on the client's imported credit report; recommendations grounded in
FCRA, law and FICO's published education; a monthly rules-update discipline
for Experian, Equifax, TransUnion and FICO changes; possible-score outcomes for
client actions; a build-credit assessment; no misleading information.

## What exists (verified on disk)

- `lib/score-potential.ts` / `lib/score-simulator.ts`: deterministic engines
  (not AI) over the published FICO factor weights, unit-tested. They output a
  synthetic 300–850 "ceiling" from hard-coded factor caps (e.g. utilization
  ceiling 95/100) — an internal index, **not a FICO score**.
- `components/clients/ScoreSimulator.tsx` reads items from
  `client-workspace-context`, which is initialised from
  `lib/sample-credit-report.ts`. `ReportImportFlow` "imports" by calling
  `classifyReport(sampleRaw)` — **no real report is parsed and nothing is
  persisted**; there is no `credit_reports` or `report_items` table. The
  "Connected · Next import in 30 days" badge has no backing connector.
- Result today: the simulator shows "Baseline ceiling 821" beside real-looking
  bureau scores for a sample client. Presented to a customer this would be
  exactly the misleading output Dee prohibits.

## Design

### 1. Canonical report model (the missing source of truth)
```
credit_reports      one import: organization, client (fulfillment or DIY consumer),
                    bureau(s), pulled_at, source (manual_upload | connector:<name>),
                    file (files row), parser_version, imported_by
report_items        one row per tradeline / inquiry / public record / personal item:
                    report_id, bureau, kind, creditor, account_no_last4, opened_at,
                    balance, limit, status, payment_history (jsonb), dispute-relevant
                    flags, classification (from lib/credit-classification), raw jsonb
report_scores       per bureau per report: score, model (e.g. "FICO 8", "VantageScore 3")
                    exactly as the source states it — never computed
```
RLS: the client's organization members (entitlement `creditOps` or
`diyCredit`), BES under an engagement, the DIY consumer for their own report.
Provenance on every row. History is append-only: a re-import is a new report,
never an overwrite (rule 11) — which is also what makes "no movement" and
"deleted since last round" answerable for Reporting.

### 2. Real import, honestly scoped
- **Manual upload first**: the agent/consumer uploads the bureau PDF or the
  monitoring-service export (HTML/CSV). Parsing runs server-side (Edge
  Function) with a versioned parser; anything the parser cannot read is shown
  as "unparsed" and never guessed.
- **Connectors later** (existing "Credit Data Connectors" settings): each
  connector is a provenance value and a scheduled pull; no connector exists
  today and the UI must say so until one does.
- Live mode with no report → the analysis tabs show "No report imported for
  this client" — never the sample. Demo mode keeps the sample, labelled.

### 3. The simulator as a guide, not a score
- **No synthetic score.** Replace "ceiling 821" with what the sources
  support: the bureau's own stated scores (from `report_scores`), the FICO
  factor analysis (payment history, amounts owed, length, mix, new credit) with
  the client's actual figures, and **directional ranges** per action ("paying
  revolving balances below 10% utilization typically moves amounts-owed from
  Poor to Excellent; FICO reports this factor as 30% of the score"). Ranges
  are expressed as factor improvement, not as "+42 points", unless a cited
  source states a range.
- **Every recommendation carries its basis**: a `basis` field with the source
  (FICO education page/topic, FCRA section, CFPB guidance) and the rule
  version. Rendered inline ("Basis: FICO — Amounts Owed"). Nothing without a
  basis ships.
- **Rules are versioned data** in `lib/credit-guidance/rules.ts`: each rule
  has `id, factor, condition, guidance, basis[], effective_from, reviewed_at`.
  A visible stamp on the simulator: "Guidance rules reviewed 2026-09-01".
- **Monthly review discipline** (we cannot auto-read bureau policy): a
  scheduled task on the 1st of each month opens a review checklist (FICO
  education, each bureau's dispute/reporting policy page, CFPB) and a rule
  version bump is required to close it; the stamp turns amber when the review
  is older than 35 days. Honest: this is a process with tooling, not automatic
  knowledge.
- **Repair vs build**: the existing assessment (thin file / short history /
  few accounts) becomes a "Build credit" section with cited, lawful options
  (secured card, credit-builder loan, authorized-user with caveats, on-time
  history) — again factor-based, no promised points.
- **Language guardrails** (CROA-safe): no "guarantee", no "remove accurate
  information", disputes only for inaccurate/unverifiable items — enforced by a
  unit test over every rule's text.

### 4. Where it shows
CreditOps client workspace (agent view), DIY consumer app (client view, white-
labelled), and the "Build Credit" tab — one engine, one rules module, three
surfaces. Reporting's deletion/no-movement KPIs read `report_items` across
reports for the same client.

## Order of work (recommended)
1. Canonical report model + manual upload + parser v1 (Edge Function) + RLS +
   matrix phase.
2. Rules module + basis + review stamp + simulator rewrite on real items; live
   gating (no report → no analysis).
3. Connectors (per provider, as credentials arrive).

## Verification
Matrix: report rows readable only by the client's organization / engaged BES /
the consumer; re-import creates a new report; no update/delete policies.
Unit: every rule has a basis and passes the language guardrail; simulator
never emits a point figure without a cited range. Browser: live client with no
report shows the empty state, not the sample.

## Addendum — PDF bureau reports, OCR, and client evidence (requested 2026-09-04)

**Requirement as stated:** read Equifax, Experian and TransUnion PDF reports
and turn them into system data; read the proof/evidence clients upload.

**What is true about accuracy.** No parser or OCR can be promised at 100%.
What can be promised, and enforced, is that nothing unverified becomes system
data: every extracted field carries a confidence and a source location, low-
confidence fields are flagged, and a report is committed only after a person
confirms the flagged fields (or when zero fields are flagged). The workflow,
not the model, is what protects accuracy.

**Design, in order of reliability:**
1. **Text-layer parsing first.** Bureau and monitoring-service PDFs carry a
   text layer; extracting it is deterministic (no OCR) and layout parsers per
   source (`equifax-pdf-v1`, `experian-pdf-v1`, `transunion-pdf-v1`,
   `identityiq-v1`, …) map sections to `report_items` / `report_scores`. Each
   parser is versioned (`credit_reports.parser_version`) and unit-tested against
   redacted fixtures; an unknown layout is refused, never guessed.
2. **OCR fallback** for scanned/image PDFs and photographed documents, via a
   document-AI provider (Google Document AI, AWS Textract or Azure Document
   Intelligence — Dee's choice; credentials go to the server environment,
   never the browser). Output fields carry the provider's confidence.
3. **Review step.** The importer shows the parsed items side by side with the
   page image; flagged fields must be confirmed or corrected; the confirmed set
   is what `create_credit_report` receives. Corrections are recorded on the
   import (who confirmed what) so accuracy is auditable.
4. **Evidence.** Client uploads (ID, utility bill, letters, bureau responses)
   use the existing `files` storage under the client record with a document
   type and, where useful, the same text-layer/OCR extraction to prefill
   fields (never to commit them). DIY consumers upload into their own record;
   the organization sees them under CreditOps.

**Infrastructure this needs (none exists today):** a Supabase Edge Functions
deployment for the parsers and the provider call, a storage bucket policy for
report PDFs, and a provider account. Until then the structured CSV import (v1,
shipped) is the only import path, and the interface says so.
