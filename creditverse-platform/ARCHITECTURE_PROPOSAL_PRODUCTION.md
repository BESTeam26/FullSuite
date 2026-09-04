# Proposal — Service-aware production (one engine, service-specific outputs)

**Status: proposal, checked against every consumer below; migration
`20260904001500_service_aware_production.sql` implements exactly this.**

## What exists (verified live, 2026-09-04)

`production_logs` (9 rows, all CreditOps): `agency_id, employee_id,
division_id text default 'creditops', department fulfillment_department?,
organization_id?, outsourcing_group_id?, client_id? → fulfillment_clients,
production_unit_type text, production_unit_quantity, actions text[],
work_notes?, work_date, completed_at, is_voided/void_reason/voided_by/voided_at,
request_id?` with `unique (agency_id, request_id) where request_id is not null`.
No trigger, no function and no view reads it. Policies: insert = `employee_id
= auth.uid() AND is_staff_of AND (client_id null OR visible fulfillment
client)`; select/update = self or manager within `in_scope(agency,
to_service(division_id), …)`.

The only record link is a **CreditOps client**. A funding client, a funding
deal or a work item (TalentOps, BES CRM, Custom Workspaces) has no storable
production. `department` is the CreditOps enum. `division_id` is free text
that a second column (`to_service`) reinterprets.

## Consumers of `production_logs` — the checklist

| Consumer | Reads / writes | Change |
|---|---|---|
| `production_logs_select/update` policies | `to_service(division_id)` | read `service` directly |
| `production_logs_insert` policy | `client_id` visibility | visibility of the **subject** per service (`entity_visible` on fulfillment_client / funding_client / work_item) |
| `lib/data/fulfillment-clients.ts` `logProduction` | inserts `division_id`, `department`, `client_id` | replaced by canonical `lib/data/production.ts` (service-discriminated subject) |
| `lib/fulfillment/creditops-client-store.tsx` backend | calls `logProduction` | calls the canonical one with `service: 'creditops'` — behaviour unchanged |
| `lib/fulfillment/fundingops-client-store.tsx` backend | throws "not available" | calls the canonical one with `service: 'fundingops'`, funding client + deal |
| `components/…/CompleteWorkSection.tsx` | department label + actions | unchanged |
| `components/…/FundingDealWorkspace.tsx` | `unavailableReason` | removed; work group → funding department mapping; passes `dealId` |
| `lib/data/eod.ts` `fetchProductionLogs` | `division_id`, `department`, `client_id` | reads `service` (mapped to the engine's `DivisionId`, `bes_crm → bes-crm`), `department_key`, all subject ids |
| `lib/eod-production-engine.ts` `deriveEodTotals` | `divisionId`, `productionUnitType`, `isVoided` | unchanged — already service-agnostic |
| `lib/data/use-time.ts`, `EodPage`, `MyTimePage` | via the engine | unchanged |
| `lib/data/log-production.test.ts` | old function | rewritten for the canonical module |
| `supabase/scripts/rls-matrix.mjs` `prod()` | inserts `division_id`, `department` | inserts `service`, `department_key`; phase-10 block added |
| `supabase/scripts/verify-live.mjs` | table list | + `production_departments` |
| `time_entries.division_id` | a different table | untouched |

## The model (minimum canonical)

```
production_logs
  service          fulfillment_service NOT NULL        ← the canonical dimension
  department_key   text → production_departments(service, key)   ← taxonomy as DATA
  client_id        → fulfillment_clients   (creditops)   ON DELETE RESTRICT
  funding_client_id→ funding_clients       (fundingops)  ON DELETE RESTRICT
  funding_deal_id  → funding_deals         (fundingops, optional)
  work_item_id     → work_items            (bes_crm, talentops, workspaces)
  division_id      generated always as (service::text)   ← read compatibility, one truth
  department       fulfillment_department  (legacy; set by trigger for creditops, never by clients)
  CHECK subject_matches_service            ← exactly the subject the service needs

production_departments (service, key, label, position)
  seeded from the two existing enums: CreditOps (5), FundingOps (7). Nothing invented for
  bes_crm / talentops / workspaces — their production carries no department until one exists.
```

**Derivation, not trust:** a BEFORE trigger derives `agency_id`,
`organization_id`, `outsourcing_group_id` from the subject record, sets the
legacy `department`, defaults `production_unit_type` to the department. A
client cannot place production under a tenant it did not work.

**Completion → production for work-item services:** an AFTER UPDATE trigger on
`work_items` inserts exactly one production row when `completed_at` is first
stamped on an item in `bes_crm`, `talentops` or a Custom Workspace, **by a BES
staff completer only** (organization users produce the organization's work, not
BES production). `request_id = md5('work_item_completion:' || id)::uuid`, so
re-completion or replay cannot duplicate. CreditOps and FundingOps items are
excluded: their production is logged from their own surfaces and would double
count.

**QA where applicable:** QA is the work item's stage (`Ready for QA`, `QA
Review`); production rows carry no QA state until a consumer needs one.

**Idempotency preserved:** the partial unique index stays; 23505 is success.
**History preserved:** additive columns, backfill `service = 'creditops'`,
`department_key = department::text`; no row rewritten beyond that.
**Authorization preserved:** self or manager-in-scope by service; insert
requires the subject to be visible to the caller under their own RLS.

## Assumptions recorded
- A Custom Workspace item without a division completed by BES staff is BES work
  under **TalentOps** (that is the only way BES reaches a workspace).
- The deal panel's "Client Support" group has no funding department; its
  production is typed `Client Support` with no department. The other three
  groups map: Document / Processing → Document Review; Underwriting /
  Readiness → Readiness Review; Lender / Submission → Submissions.
