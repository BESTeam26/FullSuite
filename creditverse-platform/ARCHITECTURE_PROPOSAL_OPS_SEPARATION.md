# Proposal — CreditOps / FundingOps product structure: domain execution vs. operational work management

**Status: inspection complete, proposal only (2026-09-04). Nothing structural changed.**
Requested by Dee: lock the product logic — CLIENTS (do the work) · WORKSPACE
(run the operation) · MY WORK (personal responsibility) · REPORTS (management
intelligence) — before more UI, with the smallest clean correction and no
duplicate engines. Every claim below carries a path:line; all under
`creditverse-platform/`.

## 1. What exists — mapped to the four categories

Legend: **A** specialized domain execution · **B** operational work management ·
**C** shared work engine · **D** reporting.

### CreditOps

| Surface | Category | Evidence |
|---|---|---|
| Client file: `pages/app/ClientDetail.tsx` + `components/clients/*` (Overview, Client Info, Import & Analysis, Dispute Dashboard, Letter Builder, Print, Next Steps, Build Credit, Simulator) | **A — clean** | `ClientDetail.tsx:41-51`; zero references to production / work_items / department statuses under `components/clients/` |
| Workspace client file: `components/dashboard/fulfillment/ClientWorkWorkspace.tsx` | **B**, with A leakage | composes `DepartmentProgressSection` + `CompleteWorkSection` (`:21-22`); hard-coded dispute-domain description and checklist text (`:44-71`) |
| `DepartmentProgressSection.tsx` | **B — but not persisted** | step vocabularies `:26-77`; toggles write only `store.addActivity` (`:158-168`), never `client_department_statuses`; "Handoff" is activity-only (`:184-190`) |
| `CompleteWorkSection.tsx` | **C/B — the production write path** | idempotent `requestId` `:98`, `store.logProduction` `:163-172`, status change kept separate `:187-198`; organization authors write activity, not production (`:75,173-183`) |
| Queues `QueueViews.tsx` | **B** | filter on `client.status` (`:74-124`), escalation on SLA (`:110`) |
| Main Client List `FulfillmentClientsPanel.tsx` + `client-list-helpers.tsx` | **B** with one A column | columns round / status / agent / openItems / SLA / last activity (`client-list-helpers.tsx:83-94`) |
| Partner dashboard `CreditOpsDashboardView.tsx` | **D over B** | counts from client rows + department statuses (store-backed since today) |

### FundingOps

| Surface | Category | Evidence |
|---|---|---|
| Database hierarchy | **A — already correct** | `funding_clients` (`20260903000700_fundingops.sql:55`) → `funding_businesses` (`:106`) → `funding_files` (`:124`, own `stage`, `assigned_agent_id`, `due_at`) → `funding_deals` (`:151`) |
| Tree / selection `FundingOpsTreeSidebar.tsx`, `FundingOps.tsx` | **B** | tree is Partner → Client → Deal only (`FundingOpsTreeSidebar.tsx:65-68, 89-92`); businesses and files never appear |
| Queues `FundingQueueViews.tsx` | **B** | filter on **`client.status`** (`:72-126`), not `funding_files.stage` |
| `FundingClientsPanel.tsx` | **B** | status / agent / openFiles / requested / SLA / last activity (`funding-client-list-helpers.tsx:77-88`) |
| `FundingDealListPanel.tsx`, `funding-deal-store.tsx` | **A** | deal rows and deal field/status mutation (`funding-deal-store.tsx:47-76`) |
| `FundingClientWorkspace.tsx` (Overview / Deal List / Documents / Activity) | **A** | businesses and files read from **seed** (`:95-98`) |
| `FundingClientWorkWorkspace.tsx` | **B** | header SLA `:153-163`, department badges `:99,172-180`, blocker `:114-125`, checklist `:65-74`; also shows businesses/files from seed (`:95-98`) |
| `FundingDealWorkspace.tsx` | **A + B mixed** | edits lender/program/amount/rate/term (`:128-141`) and deal status (`:124-126`) **and** renders client-level department stages (`:119, 259-275`), file SLA (`:245-256`), blockers (`:175-186`), and logs production (`:188-207`) |
| `FundingDealSectionsA.tsx` Readiness / Documents / Stipulations | **A**, static | constants in `funding-deal-data.ts:19,44,77` |

### Shared engine (C)

- **Production:** one table, one write path. UI callers: `CompleteWorkSection.tsx:163` and `FundingDealWorkspace.tsx:193` → `ops-client-store.tsx:823-837` → service adapters → `lib/data/production.ts:39-63`. `service`, `funding_client_id`, `funding_deal_id`, `work_item_id` and a subject-matches-service check exist (`20260904001500_service_aware_production.sql:32-60`).
- **EOD:** reads production only (`pages/app/EodPage.tsx:18,45` → `use-time.ts:150-210` → `eod.ts:58-70`); totals derived by `deriveEodTotals` (`eod-production-engine.ts:73`), never stored (`eod.ts:1-12`). `eod_submissions` carries `unfinished_work, blockers, escalations, additional_notes, next_workday_priority`. **This already matches "Work completion → Production log → EOD".**
- **Department / work status tables exist but are read-only from the app:** `client_department_statuses (client_id, department, status, assignee_id, updated_at)` and `funding_department_statuses (client_id, department, status, assignee_id, updated_at)` (`20260903000700_fundingops.sql:184`); policies exist (`20260904000200_work_engine_integrity.sql:106-109`); the only writers are seeds.
- **My Work reads only `work_items`** (`lib/data/work-items.ts:84-95`, `use-work.ts:39-66`). Client assignments (`fulfillment_clients.assigned_agent_id`, `funding_clients.assigned_agent_id`, department `assignee_id`) never reach it.
- **Two parallel work models** in effect: `work_items` (My Work, Attention, Custom Workspaces, TalentOps, BES CRM) and the ops-client stores (CreditOps / FundingOps client files). They meet only in `production_logs`.

### Reporting (D)

`pages/app/Reporting.tsx` is hard-coded constants (`:16-52`); no live source. Covered by `ARCHITECTURE_PROPOSAL_REPORTING.md`.

## 2. Mixing points (where the model breaks)

1. `FundingDealWorkspace.tsx` — one component does funding domain work **and** operational tracking **and** production logging.
2. `funding_clients.status` duplicates `funding_files.stage`: a domain stage stored on the operational client row; every funding queue keys off it. The UI treats the client as the deal container (production logged to client + optional deal; department statuses per client).
3. `funding_department_statuses` is keyed by **client**, though funding work happens per **file**.
4. Department progress in CreditOps is **not data**: toggles write activity text only, so "current department / work status" cannot be queried, filtered, reported or surfaced in My Work.
5. `ClientWorkWorkspace.tsx` carries dispute-domain description/checklist text inside the operational file.
6. Two FundingOps client-level surfaces (`FundingClientWorkspace` domain vs `FundingClientWorkWorkspace` operational) opened from different entry points for the same record.
7. `FundingClientWorkspace`, `FundingClientWorkWorkspace`, `FundingDealWorkspace` read `fundingops-seed` directly, bypassing the live hooks in `use-funding.ts`.
8. My Work ignores client and department assignments.

## 3. Already clean (preserve)

The CreditOps client file (A) · one production write path · EOD derived from production · status change kept out of the production unit · deal mutation isolated in `funding-deal-store` · `use-funding.ts` hooks with live/demo labelling · RLS, scope, engagements, entitlements, work_items, notifications, activity, files, teams, workspace views, role access — none of this changes.

## 4. The smallest clean correction (proposed order)

Principle: **client and department status become data on the existing tables;
the operational surfaces read them; FundingOps keys its operation on files, not
on the client row; My Work unions the assignment sources.** No new engines, no
new person/deal/task records.

### Step 1 — Department / work status becomes real data (CreditOps and FundingOps)
- `DepartmentProgressSection` (and the funding badges) **upsert** `client_department_statuses` / `funding_department_statuses` (tables, policies and grants already exist) instead of writing activity text only; the activity event stays as the audit trail (trigger or same handler, one write each).
- "Handoff" = set next department's status + `assignee_id` (or null → queue) + activity on the record. Deterministic transitions in `lib/fulfillment/department-domain.ts` (which statuses are terminal, which department follows), unit-tested.
- Three truths stay separate and visible on the same client: **credit status** (`fulfillment_clients.status` + `round`), **department/work status** (per-department rows), **results** (`report_items` across imports, coming).

### Step 2 — Workspace Main Client List becomes operational
Columns: Client · Credit Stage (`round`) · Current Department (first non-terminal department row) · Work Status · Assigned To (department `assignee_id`, else client agent) · Open Work (count of open department rows) · SLA · Last Activity. Same rows, same click → `ClientWorkWorkspace`; the "Open client profile" link to `/app/clients/<id>` stays for the domain file. Remove the hard-coded dispute text/checklists from `ClientWorkWorkspace` (replace with real notes = activity, or nothing).

### Step 3 — FundingOps keyed on files
- Migration: add `file_id uuid references funding_files` to `funding_department_statuses` (nullable, then backfill from each client's open file, then unique `(file_id, department)`); keep `client_id` for compatibility during the move. Add `funding_files` write (`updateFundingFileStage`) — none exists today.
- Queues and the FundingOps client list filter on **file stage / department rows**, not `funding_clients.status`; `funding_clients.status` narrows to lifecycle only (Onboarding / Active / Declined / Withdrawn / Archived) in a later step once no queue reads it.
- Split `FundingDealWorkspace`: keep lender / program / amount / rate / term / deal status / stipulation data (A); move department stages, SLA, blockers and production logging into `FundingClientWorkWorkspace` at **file** scope (B). Tree and queues open the operational file; the domain "Funding files & deals" surface (today `FundingClientWorkspace`) becomes the FundingOps analogue of Clients, reachable from the sidebar.
- Replace the three direct `fundingops-seed` reads with the existing `use-funding.ts` hooks.

### Step 4 — My Work unions the assignment sources
`useMyWork` returns one list from three bounded, RLS-scoped queries: `work_items` assigned to me (today), `client_department_statuses` / `funding_department_statuses` rows with `assignee_id = me` and a non-terminal status (department work), and client files assigned to me with no department rows (legacy). Same shape, same key, one screen. Queue membership (unassigned department rows in my authorized departments) appears as "Available in my queues", driven by the configured role access.

### Step 5 — Reporting reads the same rows
The `report_facts` union in `ARCHITECTURE_PROPOSAL_REPORTING.md` gains the department-status rows (time per department = updated_at deltas, handoff time, overdue, blocked) — no new table.

### Not in this correction
Renaming FundingOps departments (Intake, Document Collection, Lender Selection, Submission Processing, Stipulation Management, Closing) — the taxonomy is agency-level `production_departments`; making it organization-configurable is a separate, small proposal once Step 3 lands. Departments already switch on/off per organization through workspace views and role access.

## 5. Verification plan
Matrix: department-status writes obey the existing client policies (organization member vs BES scope vs another organization); funding department rows visible with their file; My Work returns only rows the person could open. Unit: department transitions; My Work union shape. Browser: set a department status → Main Client List shows current department / work status; My Work shows the department file for the assignee; FundingOps queue keyed on file stage.


## Addendum (2026-09-04) — client lifecycle and organization-customizable statuses

**Lifecycle (built, migration 0055).** `fulfillment_clients.lifecycle` /
`funding_clients.lifecycle` ∈ active · program_completed · graduated ·
archived, separate from the processing status and from department status.
Only `active` counts as an active client (plan usage, active lists, dashboards).
Archive is a transition with an activity event, never a delete.

**Customizable statuses (proposal — the DisputeFox "Field Setup" analogue).**
Today the processing statuses and each department's vocabulary are fixed
(enum + Status Guide). Organizations run different setups, so statuses become
data with platform defaults:

```
organization_status_options
  organization_id · kind (processing | department:<Dispute|Support|…> | funding_department:<…>)
  code (stable) · label (shown) · position · is_open (counts as open work) · is_active (offered)
  created_by · created_at · updated_at
```
- No rows = platform defaults (today's Status Guide / vocabulary). An owner
  may add, rename, reorder, or switch off statuses; codes never change, so
  history and reports keep meaning. Deleting is switching off (rule 11).
- Validation in `set_client_department_status` / `set_funding_department_status`
  (and the processing-status write) checks the organization's active set when
  rows exist, else the platform default — one rule, in the database.
- Settings → Statuses (organization view): tabs per kind, like DisputeFox's
  Field Setup, every control a real write through an audited function.
- The processing status column stays an enum for now (a wide, cross-cutting
  change); customization applies first to department vocabularies and to
  labels/order of the processing statuses, then the enum is retired in a later
  step once every reader goes through the options table.
