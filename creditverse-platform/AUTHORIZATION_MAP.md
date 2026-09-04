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

**Was still not person-scoped after 0021 (closed by 0022/0023 below):**
`activity_events`, `files`, `client_department_statuses`, `funding_files`,
`businesses` and the funding satellites were agency-wide for BES staff. The
independent review measured exactly that — see Phase 2.


## Phase 2 — independent review, then remediation (migration 0023)

An independent reviewer attacked 0021 as all 13 users across 14 tables and
**failed it as a system boundary**: the parents were scoped, the satellites were
not (restricted read 53 department statuses, 94 activity events, 3 funding
files, 5 businesses; blind UPDATE/DELETE reached all of them; two escalation
paths; INSERT into unseen records). Full table with quoted counts and the
closing change per finding: `BUILD_STATUS.md` → *Phase 2*.

The remediation principle: **a child follows its parent.** `entity_visible()`
(SECURITY INVOKER, so it runs under the caller's RLS) asks whether the record an
event or file hangs off is visible; funding files, department statuses, deals
and businesses ask the same of their client. Scope is stated once, on the
parent, and inherited.

| Was FACT before 0023 | After 0023 |
|---|---|
| `activity_events`, `files` agency-wide for staff | follow their record |
| `businesses` readable by any staff | engagement required |
| `work_items` BES branch engagement-blind for ORGANIZATION scope | `bes_engaged_with(org)` |
| staff could INSERT notes/production/files/work on unseen records | `entity_visible` / visible client / supervisor-only assignment |
| assigned-scope agent could mint a client and self-assign | client creation is a ceiling act |
| lead clause honoured any team, incl. org teams and archived | agency's own live team only |
| `org_manager` could self-promote | role writes strictly `org_admin`, never own row |
| `log_audit()` callable by anyone | EXECUTE revoked from clients on all trigger/seed functions |
| `assignable_profiles` enumerated any org | managers/leads; org admins; engaged managers |

**0024 (follow-up from the extended matrix):** `businesses` follow the caller's
reach into the organization — visible only alongside a client or work item the
caller can already see. And *creation must land inside the creator's own reach*:
`INSERT … RETURNING` evaluates the SELECT policy, so a scope-limited creator
self-assigns work; ceiling holders may queue it unassigned. Stated in
`work_items_insert`.


### 0025 — notifications (Phase 5)

| Object | Rule | How |
|---|---|---|
| `notifications` SELECT | mine, and the record is still visible to me — except `unassigned`, which is readable after access is lost and carries no detail (0026) | `recipient_id = auth.uid() AND (kind = 'unassigned' OR (can_view_activity(…) AND entity_visible(…)))` |
| `notifications` UPDATE | mine; only `read_at` | policy `recipient_id = auth.uid()` + column grant `update (read_at)` |
| `notifications` INSERT / DELETE | nobody via API | no grant; rows written only by `notify_from_activity()` (definer trigger) |
| `record_owner`, `as_uuid`, `notify_from_activity` | internal | EXECUTE revoked from `public`, `anon`, `authenticated` |
| all public tables | TRUNCATE / TRIGGER / REFERENCES | revoked from `anon`, `authenticated`, and from default privileges |

Recipient rules live in one function and read only stable IDs the loggers
already record (`previous_value` / `new_value` as UUID text, `assigned_to`,
`assigned_agent_id`, `team_memberships.is_lead`). Names and emails are never
used to route.


### 0028 — Custom Workspaces (Phase 6)

| Object | Rule | How |
|---|---|---|
| `workspaces` SELECT | member of an entitled organization | `is_org_member(organization_id) AND org_entitled(organization_id, 'workspaces')` — Phase 7 adds the TalentOps share branch here only |
| `workspaces` INSERT / UPDATE | org admin of an entitled organization | `is_org_admin(...) AND org_entitled(...)`; no DELETE policy (archive) |
| `workspace_boards` / `_statuses` / `_item_types` / `_fields` | follow the workspace | SELECT: `EXISTS workspaces` under caller RLS; writes: same plus `is_org_admin(w.organization_id)` |
| `work_item_field_values` | follow the item | SELECT: `EXISTS work_items`; writes: item visible, field in the item's workspace, org member |
| `work_items` (all three policies) | items follow the workspace | added conjunct `workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id)` |
| `work_items_workspace_consistency` | org + scope + same-workspace board/status/type; stage derived from status | BEFORE trigger, definer, not executable by API roles |
| `audit_workspace_config` | every config change keeps actor, before, after | AFTER trigger on the five config tables → `audit_log` |
| `org_entitled(uuid, text)` | entitlement check for policies | definer, stable; executable by `authenticated` only |
