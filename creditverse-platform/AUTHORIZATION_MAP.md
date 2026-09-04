# Authorization map — verified at HEAD 9f5140d, updated after migration 0021

Every line below is classified. **FACT** = read from the live schema, live
policies, or code. **REQUIREMENT** = BES doctrine (CLAUDE.md). **PROPOSAL** =
does not exist and needs design. Nothing here is inferred from documentation.

## Identity and membership — FACT

| Table | Columns | Note |
|---|---|---|
| `agency_memberships` | `id, user_id, agency_id, role` | **No scope. No team. No assigned-only.** One row per user; the frontend reads it with `maybeSingle()` |
| `org_memberships` | `id, user_id, organization_id, role, product?, assigned_only, team_scope:text?` | `assigned_only` is a real boolean; `team_scope` is **free text** ("Team Alpha") and is read by nothing that authorizes |
| `external_memberships` | `id, user_id, organization_id, role` | `record_grants(external_membership_id, record_type, record_id)` gives per-record access |
| `agency_role` enum | owner, admin, manager, team_lead, agent | |
| `org_role` enum | 15 values: org_admin, org_manager, credit_*, funding_* | `is_org_admin()` returns true for **org_manager too** |

No `divisions`, `departments`, `teams` or `team_memberships` tables exist.
`fulfillment_engagements.authorized_team` is free text. 8 agency members
(Dee + 7 fixtures), 5 org members.

## Assignment columns — FACT

`work_items.assigned_to`, `fulfillment_clients.assigned_agent_id`,
`funding_clients.assigned_agent_id`, `client_department_statuses.assignee_id`,
`funding_department_statuses.assignee_id`. All FK → `profiles`. Indexed:
`work_items_assignee_idx (assigned_to, stage)`.

## Helpers — FACT

| Function | Behaviour |
|---|---|
| `is_staff_of(agency)` / `is_manager_of` / `is_admin_of` | membership + role in the given agency |
| `is_agency_staff()` / `is_agency_manager_or_above()` | **agency-blind** legacy — still used by `can_view_work`, `can_write_work`, `client_department_statuses_write`, `can_view_org` |
| `bes_may_fulfil(org, group, service)` | live engagement for that service AND `is_staff_of(engagement.agency)`. Default deny |
| `can_view_activity(agency, org, visibility, entity_type)` | org members: not `bes_internal`; staff: `bes_internal` always, else needs engagement |
| `org_has_product(org, product)` | **returns TRUE when org is NULL** |

## What each SELECT policy actually gates — FACT

| Table | BES branch | Org branch | Person-level? |
|---|---|---|---|
| `work_items` | `is_staff_of(agency)` | `can_view_work(...)` | **No** |
| `fulfillment_clients` | `bes_may_fulfil(…,'creditops')` | product + `is_org_member` | **No** |
| `funding_clients` | `bes_may_fulfil(…,'fundingops')` | product + `is_org_member` | **No** |
| `activity_events` | `can_view_activity` | same | **No** |
| `files` (non-activity) | `is_staff_of(agency)` | `is_org_member` | **No** |
| `production_logs` | `is_staff_of AND (employee = me OR is_manager_of)` | — | **Yes** — self + manager |
| `time_entries`, `eod_submissions` | same shape | — | **Yes** |

`work_attention` is a `security_invoker` view over `work_items`, so it inherits
exactly `work_items_select`.

**Measured consequence:** `bes.restricted` (agent, assigned nothing) reads all
10 work items and all 6 attention rows. Tenant isolation holds — org users read
1 each — but there is no person-level boundary on operational records.

## Known defects confirmed from policy text — FACT (reproduction pending, Phase 3)

- `work_items_insert` = `is_staff_of(agency_id) AND can_write_work(scope, org)`.
  `can_write_work` contains an `is_org_member` branch that the `AND is_staff_of`
  makes unreachable. `work_items_update` has the same prefix.
- `production_logs` has **no uniqueness** beyond the primary key and **no link
  to `work_items`** — it references `fulfillment_clients.client_id`. There is no
  completion entity; "Complete Work" inserts one production row per click.
- `work_items.organization_id` is `ON DELETE CASCADE`.

## Doctrine — REQUIREMENT

Role ≠ Permission ≠ Scope ≠ Assignment ≠ Tenant ≠ Service ≠ Engagement ≠
Entitlement. Never authorize by name, email or label. Stable IDs and FKs.
Multi-team membership. Centralized evaluation. Default deny. Frontend
visibility is not security.

## Phase 1 — FACT (migration `20260904000100_team_and_assignment_scope.sql`, applied)

- `access_scope` enum: `agency | division | department | team | assigned | self`
- `departments(id, agency_id, division fulfillment_service, key, name)` — one
  table, because department identity is split across two enums today
- `teams(id, agency_id? | organization_id?, department_id?, name, archived_at)`
  — one table for both sides; **no separate org team system**
- `team_memberships(team_id, user_id, is_lead)` — join table → multi-team
- `agency_memberships + scope, scope_division, scope_department_id`
- `work_items + division, team_id`; `fulfillment_clients + team_id`;
  `funding_clients + team_id` — all nullable, CreditOps/FundingOps untouched
- `in_scope(agency, division, team, assignee, creator)` — the single evaluation
  point, composed into the BES branch of each operational SELECT/UPDATE
- **Unassigned team queue: visible to team scope, not to assigned scope.**
  Decided here, not by query breadth.
- Backfill: owner/admin → `agency`; manager → `agency` (parity with today's
  `is_manager_of`, which already grants agency-wide escalation — narrowing a
  real role is a policy decision, demonstrated on the fixture manager only);
  team_lead → `team`; agent → `assigned` (default deny).

### Measured after 0021 — RLS matrix, 77/77

| User | scope | work | attention | credit clients | funding | Cedar by id | update Cedar |
|---|---|---|---|---|---|---|---|
| bes.owner / bes.admin | agency | 10 | 6 | 17 | 3 | 1 | 1 |
| bes.manager (fixture) | division creditops | 7 (6 creditops + 1 assigned) | 5 | 17 | 0 | 1 | 1 |
| bes.lead | team → Team A (lead) | 2 | 1 | 4 | 0 | 0 | 0 |
| bes.credit | assigned (on Team A) | 1 | 0 | 4 | 0 | 0 | 0 |
| bes.funding | assigned (Team F) | 0 | 0 | 0 | 2 | 0 | 0 |
| **bes.restricted** | assigned, no team | **0** | **0** | **0** | **0** | 0 | 0 |
| org.owner (Lakeside) | tenant | 1 | 0 | 2 | 1 | 0 | 0 |
| org2.owner (Northgate) | tenant | 1 | 0 | 2 | 0 | 0 | 0 |

Positive control: Team A holds 4 clients, Team B holds 1; the lead reaches A and
not B; the division manager reaches both. Rows are read as each user's JWT with
the change rolled back, so these are the policies' own answers.

**Still not person-scoped (recorded, Phase 2/3):** `activity_events` for
`bes_internal` and non-activity `files` remain agency-wide for BES staff. The
record they hang off is now scoped, so the UI cannot reach them, but a direct
query can. `client_department_statuses_write` still uses agency-blind
`is_agency_staff()`.
