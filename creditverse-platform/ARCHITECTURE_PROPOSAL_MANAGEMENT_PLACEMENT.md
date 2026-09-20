# D-021 locked — Management placement is scope

**Dee, 2026-09-20:** "Role = experience. Management placement = scope.
Capability = action." Partner assignments constrain agents and team-level
delivery; they must not cripple legitimate managers. Payroll and Finance stay
orthogonal to the hierarchy.

## 1. What exists today (verified live)

Placement is already recorded in **three unrelated places**, none of which
grants record scope:

| Structure | Holds | Used by |
|---|---|---|
| `team_memberships.is_lead` | Team Lead | `in_scope` (led team), `may_view_workforce_record`, `holds_management_view` |
| `departments.manager_id` | Department Manager (Rowell on GHL/CRM Ops) | only `can_see_partner`'s managed-department branch |
| `divisions.lead_id` | Division lead (Rowell on BES CRM) | nothing |
| `agency_memberships.scope / scope_division / scope_department_id` | a ceiling ("division", "department") | only `may_view_workforce_record` (people), never records |

`ops.manage` is a capability with no shape: `is_manager_of()` answers "has
management authority" and nothing about where.

## 2. The helpers, classified by the question they answer

| Question | Helper | Verdict |
|---|---|---|
| **Operational management visibility** | `is_manager_of`, `holds_management_view`, `managed_people`, `may_view_workforce_record`, `manages_private_record_of`, `departments_of` / `my_departments`, `my_divisions` | All membership- or capability-derived. **Refactor to read placement.** |
| **Partner relationship visibility** | `can_see_partner` (admin · direct · team · managed dept via `departments.manager_id`), `creditops_directory_visible`, `bes_holds_partner`, `bes_may_fulfil`, `bes_engaged_with` | `can_see_partner` gains a *management* branch; engagement helpers untouched. |
| **Queue / work visibility** | `in_scope` (assigned · my team · my department · led team; **no division, no placement**), `can_write_work_item`, `can_work_fulfillment_client`, `credit_client_writable`, `may_work_client`, `workspace_reach`, `entity_visible` | `in_scope` gains **one** explicit management branch; the 11 callers inherit it; agent/lead branches unchanged. |
| **Financial visibility** | `reads_payroll_of`, `agency_can('payroll.*')`, `finance.dashboard.view`, `expenses.*`, `partners.financials.*`, `partners.invoices.*`, `partners.payments.record` | **Not touched by placement.** New keys `compensation.view` / `compensation.manage`. |

`in_scope` is called by 5 policies (work_items ×3, fulfillment_clients ×3,
funding_clients ×3, crm_projects, production_logs, workspace_shares) and 11
functions; `can_see_partner` by 11 policies and 14 functions. Both get a
single new branch each, so every caller follows.

## 3. Design

### 3.1 One placement table

```
management_seats
  id, agency_id, user_id
  seat            'chief_operations' | 'division_manager' | 'department_manager'
  division_id     required for division_manager, else null   (CHECK)
  department_id   required for department_manager, else null (CHECK)
  effective_from date, effective_to date null
  created_by, created_at, reason
```

Team Lead stays `team_memberships.is_lead` (it is already a relationship to a
team). A person may hold many seats. `departments.manager_id` and
`divisions.lead_id` become **projections** kept by trigger for display; the
`scope_division` / `scope_department_id` columns stop being read for
authorization.

### 3.2 Canonical scope helpers (new, all SECURITY DEFINER, all from seats)

```
has_operations_scope(agency)        admin, or a live chief_operations seat
managed_divisions()                 division seats ∪ all divisions when chief
managed_departments()               department seats ∪ departments of managed divisions
managed_teams()                     teams of managed departments ∪ led teams
management_reach(agency, service, team)
                                    chief · OR team ∈ managed_teams
                                    · OR (team is null AND service ∈ services of managed divisions)
```

### 3.3 The two edits

```
in_scope(...)        += or public.management_reach(p_agency, p_division, p_team)
can_see_partner(g)   += or (a live engagement for g whose service is one of my managed divisions)
                     += or (an assignment of g to a team in managed_departments())   [replaces the manager_id branch]
```

Nothing is removed from either. Agent and Team Lead evaluate exactly as
before.

### 3.4 Workforce helpers follow

`may_view_workforce_record`, `managed_people`, `holds_management_view`,
`creditops_directory_visible`, `may_reach_marketing/talentops` (workspace
modules) read `managed_teams()` / `managed_divisions()` instead of
`scope_division` and membership. A CreditOps Division Manager therefore
reaches CreditOps people, queues, partners and clients — and **no** TalentOps
workspace, which phase 7 already asserts.

### 3.5 Money stays orthogonal

- `payroll.view` / `payroll.manage` unchanged; new `compensation.view` /
  `compensation.manage` registered.
- Owner has all by role today (`agency_can_all`); Bryan holds payroll.*
  explicitly; Aaron receives payroll.* + compensation.* **on acceptance**
  through staged onboarding (`grants` added to the payload).
- No seat grants any money key. `admin` grants none. Finance keys
  (`finance.dashboard.view`, `expenses.*`, `partners.financials.*`) are not
  granted to Bryan.
- JM: `partners.view`, `partners.contacts`, `partners.clients`,
  `partners.invoices.view`, `partners.invoices.manage`,
  `partners.payments.record` — and nothing from payroll/compensation.

### 3.6 Current configuration (data, not code)

| Seat | Who | Note |
|---|---|---|
| Department Manager · Dispute | Daniel Macasiab | staged on his invitation; also Team Lead of Dispute Processing Team (invitation) |
| Department Manager · Complaints & Mailing | Daniel Macasiab | staged |
| Department Manager · Support & Onboarding | Allyssa Mores | staged; department "Onboarding" renamed |
| Department Manager · Client Success | Allyssa Mores | staged; "Client Success / Support" renamed "Client Success" |
| Division Manager · BES CRM | Rowell | seat; `divisions.lead_id`/`departments.manager_id` already say so |
| Chief Operations | nobody | seat type exists, unassigned |
| Managing Partner | Bryan | not a seat: workforce admin (`ops.manage` via manager profile) + payroll.* + compensation.* |

Bureau Calling department stays as is (not in Dee's list).

## 4. Which of the 18 failing phases D-021 resolves

| Phase | Failing checks | Cause | D-021? |
|---|---|---|---|
| 5 | 5 | probes act as `bes.manager` (division, no team) who reaches nothing | **yes** |
| 6 | 1 | division manager must see NO organization workspace — currently sees 3 | **yes** (placement-based `may_reach_*`) |
| 7 | 4 | same, TalentOps scope | **yes** |
| 19 | 2 | "BES staff in scope" = `bes.manager` | **yes** |
| 26, 28 | 1+1 | processor/manager fixture writes | **yes** |
| 41 | 4 | MGR channel reach | **yes** |
| 62 | 8 | "division-scoped manager reaches a client in their division" | **yes** |
| 2 | 7 | pre-0913 reach model for restricted/credit | no — harness rewrite |
| 37 | 2 | probe ordering (audit), fixture assignee cleared on insert | no — harness |
| 55, 56, 57, 60, 61, 64, 70, 72 | 42 | not yet examined | unknown |

D-021 addresses **8 phases, 26 checks**. The fixture `bes.manager` receives
a Division Manager seat for the CreditOps fixture division (fixture
configuration), and `scope_division` on that row stops mattering.

## 5. Order of work

1. `management_seats` + projections + new helpers (no behaviour change yet).
2. `in_scope` and `can_see_partner` gain their branch; workforce helpers
   read seats. Targeted phases 5, 6, 7, 19, 26, 28, 41, 62 + base.
3. Capability keys `compensation.*`; grants for Bryan (compensation), JM
   (billing/collections); Aaron's staged grants; Daniel/Allyssa staged seats;
   Rowell's seat; department renames.
4. Probe: `management-placement-probe.mjs` covering the eight UAT personas
   (agent, team lead, department manager, division manager, chief operations,
   managing partner, executive assistant, payroll user) on sidebar registry,
   routes, record queries, mutations, RPC and sensitive fields.
5. UI: People & Teams › Structure shows and sets seats; Positions unchanged.
6. Full gate.
