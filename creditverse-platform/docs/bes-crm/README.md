# BES CRM — source documents

## `BES_GHL_Full_Infrastructure_Build_Tracker.xlsx`

**The master build standard.** Supplied by Dee on 2026-09-08 from Google Drive
(`1md9i8JDFBgDlye_56OTXqJVBWj6m47LN`, modified 2026-07-28), committed here
**verbatim and unmodified** — 156,642 bytes, byte-for-byte identical to the
file in Drive.

It is committed *before* anything was read out of it, on purpose. The Metro 2
catalogue was supplied the same way once, read out of chat, never committed,
and lost. A source document that only exists in somebody's Drive is a
dependency on somebody's Drive.

### What it contains

| Phase | Window | Tasks |
|---|---|---|
| Phase 0 — Access & Lock | Day 0–5 | 24 |
| Phase 1 — Foundation | Day 5–18 | 39 |
| Phase 2 — Automations | Day 15–30 | 30 |
| Phase 3 — Integrations | Day 25–38 | 18 |
| Phase 4 — Optimization | Day 35–45 | 12 |
| Phase 5 — QA & Delivery | Day 38–45 | 17 |
| | **Total** | **140** |

Each task row carries: Phase · Section · Task · Details / Acceptance Criteria ·
Owner · Blocker · Priority · Due Date · Status · Document Link · Client Note ·
Dee's Note · Team's Remarks.

### How it is used

**It is a LIBRARY, not a task list** (CLAUDE.md rule 17b). 140 source
requirements are not 140 live work items. Each row is imported into
`crm_requirements` with its provenance, classified into an engine and one of
work_unit / checklist / acceptance / prerequisite / client_requirement / qa /
automation / reference / optional, and mapped onto a Work Unit. A row becomes
live work only when it is classified `work_unit` **and** its engine was
purchased.

`crm_requirements_unmapped()` is the completeness gate: the library is not
complete while it returns anything.

### Derived files

`sheets/*.csv` are extracted from the workbook by
`scripts/extract-tracker.mjs` and committed alongside it so the content is
diffable, greppable and reviewable in a pull request. **The `.xlsx` is the
source of truth**; regenerate the CSVs rather than editing them.
