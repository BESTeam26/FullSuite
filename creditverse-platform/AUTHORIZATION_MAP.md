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


### 0029 — TalentOps bridge (Phase 7)

| Object | Rule | How |
|---|---|---|
| `workspace_reach(ws, board, need_work)` | THE workspace visibility decision | member of entitled org, OR live unrevoked share under a live `talentops` engagement of the workspace's org, `is_staff_of(e.agency_id)`, `in_scope(e.agency_id,'talentops',…)`, board match, `access='work'` when writing |
| `workspaces_select` / `workspace_boards_select` | follow reach | `workspace_reach(id, null)` / `workspace_reach(workspace_id, id)` |
| `work_items` select / update / insert | items follow reach | conjunct `workspace_id IS NULL OR workspace_reach(workspace_id, board_id[, true])`; insert gains "BES working a shared workspace item" branch |
| `workspace_shares` SELECT | org members of the workspace; BES staff within TalentOps scope of the engagement | policy |
| `workspace_shares` INSERT / UPDATE | org admin of an entitled org; BES cannot self-share; no DELETE (revoke) | policy + `workspace_shares_consistency` (engagement must be TalentOps for that org) |


### 0031 — BES CRM (Phase 8)

| Object | Rule | How |
|---|---|---|
| `work_items_select`, customer branch | only BES CRM projects, only when entitled | `scope='AGENCY' AND subject_organization_id IS NOT NULL AND division='bes_crm' AND is_org_admin(subject) AND org_entitled(subject,'crm')` |
| customer reads of activity | only what BES published | existing `can_view_activity`: org members read `organization_internal` / `shared_with_partner` / `client_visible`, never `bes_internal` |
| customer writes | comment, upload; never status/assignment/dates/completion | `activity_events_insert` and `files_insert` (existing); no customer UPDATE branch on AGENCY work items |


### 0035 — service-aware production

| Object | Rule | How |
|---|---|---|
| `production_logs` INSERT | producer is the caller, staff, and can see the subject | `employee_id = auth.uid() AND is_staff_of(agency_id) AND entity_visible(fulfillment_client \| funding_client \| work_item by service)` |
| `production_logs` SELECT | own rows, or manager within the service's scope | `is_staff_of AND (employee_id = auth.uid() OR (is_manager_of AND in_scope(agency, service, …)))` |
| `production_logs` UPDATE (void) | manager within the service's scope | same predicate, USING and WITH CHECK |
| tenancy columns | derived from the subject | `production_logs_derive_context` (definer BEFORE trigger, not executable by API roles) |
| `production_departments` SELECT | agency staff | `is_agency_staff()`; no writes via API |
| `work_items_completion_production` | one production row per BES-completed work-item-service item | definer AFTER trigger; `is_staff_of` guard; deterministic `request_id` |


### 0036 / 0037 — workspace owner experience

| Object | Rule | How |
|---|---|---|
| `work_items.assigned_to` | a legitimate person for the record | trigger `work_items_assignee_allowed`: ORGANIZATION → active org member, or agency staff under a live `work` share of the item's workspace/board; AGENCY → agency staff |
| `work_item_field_values` | typed by the field; archived and cross-workspace fields refused | trigger `work_item_field_values_validate` |
| `workspace_fields.options` | `{choices: [...]}` or absent | check constraint |
| `workspaces_select` | member of an entitled org (row-local), or reach via share, or assignee of an item in it | rewritten so `INSERT … RETURNING` no longer fails for the creator |
| configuration writes | `is_org_admin(org)` — which includes `org_manager` (pre-existing) | unchanged; the UI gate now mirrors it |


### 0038–0040 — Organization ID and switching

| Object | Rule | How |
|---|---|---|
| `organizations.public_id` | generated, unique, formatted, immutable; never an authorization key | default `gen_org_public_id()`, trigger redraws on collision and refuses UPDATE, unique index, check `^BES-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$` |
| active organization (frontend) | selects among organizations RLS already returned; never widens access | `agency-context` validates the session id against the list on every render; unknown → agency view (staff) or first membership (org users) |
| `/app/org/:orgPublicId` | resolves through the same list | unknown or unauthorized id renders "not available", never another organization's data |


### 0044–0045 — Team rosters without recursion; organization workspace views

| Object | Rule | How |
|---|---|---|
| `team_memberships_select` | own rows, team lead, teammate, or agency manager / org admin of the team's owner | the teammate branch is `is_member_of_team(team_id)` (SECURITY DEFINER) instead of a self-referencing subquery that raised 42P17 for every caller |
| `organizations.workspace_views` | readable with the organization row (presentation only); never an authorization input | plain jsonb column, default `{}` |
| `merge_organization_workspace_views(org, patch)` | `is_manager_of(agency)` OR `is_org_owner_admin(org)`; only `creditOps` / `fundingOps`; `hidden` must be a string array; `dashboard`, `main-list`, `deal-list` cannot be hidden | SECURITY DEFINER with explicit checks, raises 42501 / 22023, audits `organization.workspace_views_updated` |
| interface role (CreditOps / FundingOps) | derived from `agency_memberships.role`, else `org_memberships.role` for the active organization; no membership → "none" | `ops-role-resolver.ts`; demo mode alone may preview a role; the database still enforces every write |


### 0047 — Configurable organization role access

| Object | Rule | How |
|---|---|---|
| `organization_role_access` (select) | members of the organization, or a BES manager | policy `organization_role_access_select`; no insert/update/delete policies — the functions are the only writers |
| `set_organization_role_access(...)` | `is_manager_of(agency)` OR `is_org_owner_admin(org)`; `org_entitled(org, product)`; product ∈ {creditOps, fundingOps}; role belongs to the product; departments ⊆ `production_departments(service)`; views ⊆ `workspace_view_ids(product)`; `org_admin`/`org_manager` refused | SECURITY DEFINER, raises 42501 / 22023, audits `organization.role_access_updated` |
| `reset_organization_role_access(...)` | same authorization | deletes the row, audits `organization.role_access_reset` |
| `default_role_access(role, product)` | the platform defaults; pure | mirrored by `role-access-defaults.ts` |
| interface access (CreditOps / FundingOps) | agency role rules → organization's configured row → platform default → none | `resolveOpsAccess`; narrows the offer only; RLS unchanged |


### 0048 — Canonical credit reports

| Object | Rule | How |
|---|---|---|
| `credit_reports` (select/insert) | visible iff the subject is: `entity_visible('fulfillment_client', id)` for a fulfillment client (SECURITY INVOKER → the client's own policy applies); consumer = self, or their organization's members when entitled to diyCredit, or engaged BES | `credit_report_visible()`; insert also requires `imported_by = auth.uid()` |
| `report_items`, `report_scores` | follow their report; insert only into a report the caller imported | EXISTS on `credit_reports` |
| update / delete | none — append-only history | no policies granted |
| `create_credit_report(...)` | SECURITY INVOKER: policies decide; refuses an empty item list | atomic multi-row insert |


### 0049–0053 — Pricing data, organization client writes, department status, hand-off

| Object | Rule | How |
|---|---|---|
| `plans`, `plan_addons` (select) | public (anon + authenticated) | pricing is public information |
| `provision_self_serve_organization()` | trial grants `trial_grant_plan` (Empire Grow) products minus CRM; Build requires a CreditOps/FundingOps choice; non-public-trial plans refused | 23514 on violations; owner recorded on `organizations.owner_user_id` |
| `organization_seat_usage(org)`, `organization_active_records(org)` | `is_org_member(org)` or agency manager; else null | SECURITY DEFINER with explicit check |
| `fulfillment_clients` / `funding_clients` insert | + organization branch: `is_org_admin(org)` and `org_has_product` and organization-owned (no outsourcing group) and same agency | permissive OR beside BES policies (0027 §E unchanged) |
| `fulfillment_clients` / `funding_clients` update | + organization branch: `org_has_product` and `org_scope_allows(org, assigned_agent_id)`, organization-owned | same |
| `client_department_statuses` / `funding_department_statuses` insert/update | + organization branch mirroring the client update reach | 0051 |
| `set_client_department_status(...)` | SECURITY INVOKER; status ∈ `creditops_department_statuses(department)`; writes the activity event with visibility derived from author/engagement | 22023 on unknown status; 42501 when the client is not visible |
| `handoff_to_creditops` / `handoff_to_fundingops` | SECURITY INVOKER; caller must write both records under existing policies; entitlement to CreditOps required for the send | 0053 |
| `set_funding_department_status(...)` | SECURITY INVOKER; file must be visible; status ∈ `fundingops_department_statuses(department)`; row keyed by file | 0054; organization branch on `funding_files` insert (admins) / update (reach) |
| `set_client_lifecycle(...)` | SECURITY INVOKER; client must be visible and writable under existing policies; writes the activity event | 0055; `organization_active_records` counts `lifecycle = active` |
| comment visibility (interface) | organization surface never offers `bes_internal`; default `shared_with_partner` when BES fulfils for the organization | `allowedVisibilities` / `defaultVisibility`; the database insert policy is unchanged and remains the enforcement |


### 0058 — FundingOps domain data (Addendum B)

| Object | Rule | How |
|---|---|---|
| `lenders`, `lender_programs`, `lender_policy_versions` (select) | BES catalogue rows (`organization_id` null): any agency staff or any organization member; an organization's own rows: its members or agency management; a lender user sees their own lender | `lender_visible(lender)` |
| same (insert/update) | catalogue: agency manager; organization rows: `is_org_admin` with FundingOps | `lender_editable(lender)`; a policy version is verified (`last_verified_at`) or superseded, never rewritten in meaning |
| `lender_users` (select) | the user themself, or whoever may edit the lender | 0058 |
| `lender_users` (insert/delete) | whoever may edit the lender | 0058.1 (`20260904003810`) — found by the matrix: 0058 shipped select only |
| `funding_parties` | follow the client (existing `funding_clients` policies) plus the borrower; reviewers write | EXISTS on `funding_clients` / `file_reviewer` |
| `funding_applications` | readable with the file, by the borrower and by a lender the file is shared with; reviewers write; the borrower writes portal drafts until submitted | `funding_file_visible`, `is_borrower_of_file`, `is_lender_for_file`, `file_reviewer` |
| `requirement_rules` | platform rows readable by anyone with a seat; organization rows by that organization and BES; agency managers / organization admins write | same shape as `lenders` |
| `document_requests` | readable with the file, borrower, shared lender; **reviewers only** insert/update | `file_reviewer(file)` = `file_org_admin` OR `file_bes_in_scope` (the funding client's own BES scope rule: `bes_may_fulfil` AND `in_scope`) |
| `document_instances` | borrower uploads (`upload_source = portal`, disposition pending) and sees their own; reviewers see all and update; a lender sees only instances marked shareable **and** accepted | policies + `record_document_disposition()` |
| `document_flags` | reviewers only, in every direction; the borrower sees the plain-language request, never the flag | `file_reviewer` |
| `record_document_disposition(instance, disposition, reason)` | SECURITY INVOKER; caller must be a reviewer; pending is never a target; accepting satisfies the linked request, anything else reopens it; activity event on the funding client | 42501 / 22023 |
| `lender_decisions` | readable with the file or by the lender who posted; inserted by reviewers or by a lender user on their own lender's deal; **append-only** (no update grant, no update policy) | `record_lender_decision()` maps decision → deal status by `deal_status_for_decision()`; `funding_deals_lender_update` lets that status move on the lender's own deal |
| `verification_results`, `consumer_report_requests` | reviewers only; append-only | no consumer report is pulled without a request row naming party, product, purpose, permissible-purpose basis and authorization state |
| `commissions`, `lender_file_shares`, `funding_deals` lender branch | as the first draft: reviewers write shares/commissions; a party sees its own commission rows; a lender inserts/reads deals only on files shared with them | 0058 |
| flag vocabulary, dispositions, decision kinds | Postgres enums, mirrored in `document-vocabulary.ts`; no free text | one source of truth |
| `funding_files` (select, lender branch) | a lender user with an active share reads the shared file (purpose, amount, stage) — never `funding_clients` | 0058.2 (`20260904003820`) `funding_files_lender_select` |
| `funding_file_tenancy(file)` | SECURITY DEFINER: agency, organization and client id of a file, for functions that must write audit rows on behalf of a lender | 0058.2 |
| `record_lender_decision(...)` | now SECURITY DEFINER; authorization explicit inside: lender user of the deal's lender with a share, or a file reviewer; anyone else 42501; the activity event lands under the file's organization with the recorder as actor | 0058.2 |


### 0059–0062 — Letter Library, pipeline axes, offers/closing/funded/renewals, public ids

| Object | Rule | How |
|---|---|---|
| `letter_templates` | BES defaults (organization null) readable by any seat; an organization's own by its members/BES; agency managers write defaults, organization admins with CreditOps write their own | `letter_template_visible/editable` (0059) |
| `dispute_rounds` | follow the CreditOps client; rows are created only by `open_dispute_round()` (select+insert grant, no update) | `credit_client_visible` / `credit_client_writable` = the client's own BES-scope and organization-scope update rules |
| `report_findings`, `dispute_letters`, `dispute_timers` | follow the client; writers = whoever may write the client | same helpers |
| `dispute_attestations` | one per letter; insert only — never edited | select+insert grant only |
| `open_dispute_round(client, strategy, reset)` | SECURITY INVOKER; reset closes the running round and opens the next, otherwise returns the running round; client round label updated; activity written | 42501 when not writable |
| `approve_dispute_letter(letter)` | the QA gate in the database: draft only; body ≥ 40 chars; attestation present; § 1681e(b) never to a furnisher; § 1022.43 never on a CRO-prepared direct dispute; forbidden phrases refused | 22023 with the reason |
| `mark_letter_mailed(letter)` | approved/printed only; CRA letters start four timers (furnisher notice, 30-day reinvestigation, results notice, reinsertion watch) | data, not deadlines the code enforces |
| `funding_files.stage` (17), `secondary_status` (13), `waiting_on` (7) | change only through `move_funding_file()`: reviewer of the file; **Funded refused** (only `confirm_funding()` sets it); one activity row per changed axis | 0060 |
| `offers` | readable with the file, by the borrower and by the lender who made it; reviewers write; a lender user inserts on their own deal | 0061 |
| `set_offer_status()` | state machine (received → internal review → ready to present → presented → considering/accepted/declined; expired/withdrawn from any open state); accepting moves the file to Offer Accepted and funds nothing | 22023 on an illegal transition |
| `closings` / `start_closing()` / `advance_closing()` | reviewers; closing starts only on an accepted offer; Funding Pending moves the file to Funding; `funded` cannot be set here | 22023 |
| `funded_deals` / `confirm_funding()` | **the only writer of a funded deal**; from Funding Pending; gross, net and date required; net ≤ gross; requested/accepted/gross/net kept apart; sets Funded on both file axes, the deal, the client, and opens renewal monitoring; select+insert only — never updated or deleted | 0061 |
| `renewal_opportunities` / `create_renewal_file()` | reviewers; a NEW file with `renews_file_id` lineage; never reuses the prior fit | 0061 |
| `lender_contacts`, `lenders.partner_status/last_contact_at`, `policy_updates` / `acknowledge_policy_update()` | follow the lender's visibility/editability | 0061 |
| `public_id` on `fulfillment_clients`/`funding_clients` (CN-), `funding_files` (FND-), `lenders` (LDR-) | generated by the database, unique, immutable (trigger refuses change), display/support reference only — never authorization; a funding client linked to a CreditOps client adopts its CN- | 0062 |


### 0063 — Grant hygiene and organization-operated submissions

| Object | Rule | How |
|---|---|---|
| `dispute_rounds` (update) | whoever may build letters for the client may close a round — the gate `open_dispute_round()` already enforces; before 0063 the reset's "close previous round" matched 0 rows under RLS and raised nothing | `dispute_rounds_update` = `credit_client_writable(client_id)` |
| `funding_deals` (insert, update) | submissions follow the file: an organization admin of the file's organization, or BES staff in scope — the same `file_reviewer()` gate as stage moves, offers, closings and funding (0060/0061). Replaces the 0044 staff-only policies that left organization-operated files unable to record submissions and left deal status stale after `set_offer_status()`/`confirm_funding()`. Delete stays with agency admins; the lender branch (0058.2) is unchanged | `funding_deals_insert/update` |
| every table in `public` | `authenticated` holds UPDATE or DELETE **only** where a policy can allow it. Supabase's default privileges had granted both on every table; RLS kept them inert (0 rows, no error) but "append-only" now means no grant: `dispute_attestations`, `funded_deals`, `lender_decisions`, `credit_reports`, `audit_log`, `activity_events`, `document_instances`, `dispute_letters` (delete), … — 60 grants across 47 tables revoked by catalogue query, not by hand-kept list. TRUNCATE / REFERENCES / TRIGGER / MAINTAIN revoked from `authenticated` and `anon` everywhere | one `DO` block over `information_schema.role_table_grants` × `pg_policies` |
| default privileges (`postgres` in `public`) | a new table starts at SELECT + INSERT for `authenticated`; UPDATE/DELETE are granted per table, deliberately. A forgotten grant fails loudly in the matrix — the safe direction | `alter default privileges … revoke update, delete, maintain` |
| default privileges (`supabase_admin`) | still grants everything on tables *it* creates; none of the application's tables are owned by it. Recorded, not changed | out of scope |

Matrix probes added: "resetting the cycle closes the previous round" (phase 23), "an organization agent (not an admin) cannot record a submission" (phase 24).


### 0064 / 0064.1 — Team permissions

| Object | Rule | How |
|---|---|---|
| `permission_keys` | the vocabulary (22 keys, `module.action`), readable by every seat; written only by migrations | select grant only; no insert/update/delete grant for the API role |
| `role_permissions` | platform defaults (`organization_id` null, one row per role × key) readable by everyone; an organization's own rows readable by its members and BES; written by the organization's admins or BES managers | `role_permissions_write` |
| `member_permissions` | per-member overrides, readable by the member, their organization and BES; **never written directly** — no write grant; only `set_member_permission()` / `copy_member_permissions()` | definer-rights functions, explicit checks |
| `member_can(org, key)` | admins/managers of the organization → allowed; else member override → organization's role row → platform default → **deny**; anyone outside the organization → false | SECURITY DEFINER, stable |
| `my_permissions(org)` | every key for the caller in one call — the auth context bundles it once per session (rule 14) | — |
| `set_member_permission(membership, key, allowed, reason)` | organization owner/admin or BES manager of the organization's agency; **never on yourself**; unknown key 22023; null clears the override; audit row with previous and new value | 42501 / 22023 |
| `copy_member_permissions(from, to, copy_scope)` | same callers; both members in one organization; copies role and overrides (scope only when asked); audit row | 42501 |
| `invite_team_member(org, email, role, assigned_only)` | organization owner/admin or BES manager; one open invitation per email per organization (23505); audit row | 42501 / 23505 |
| `accept_invitation(token)` | the caller's own profile email must equal the invitation's; open and unexpired; creates or updates the membership; stamps the invitation; audit row | 42501 / 22023 |
| INSERT grants everywhere | the API role holds INSERT only where a policy can allow it (0064.1 — same rule as 0063 for UPDATE/DELETE); new tables default to SELECT only | catalogue query |

Matrix phase 25 (20 probes) covers defaults, deny outside the organization, overrides and their audit, self-change refused, cross-organization refused, unknown key, Copy Permission, no direct writes, invitations and acceptance by the wrong email.
