# BES CRM — streamlined GHL build operating system

**Proposal, 2026-09-08.** Dee's brief of the same date, which explicitly
supersedes the earlier assumption that all 140 workbook rows become live
project WorkItems.

> **THE MASTER TRACKER MAY BE DETAILED. THE TEAM WORKSPACE MUST BE SIMPLE.
> AGENTS DO THE WORK. THE SYSTEM DOES THE REPORTING.**

---

## 0. What the inspection found, before proposing anything

§68 asks for an inspection first. Most of what the brief describes is **already
built and canonical**. This proposal is therefore thin, and deliberately so.

| Requirement in the brief | What already exists | Verdict |
|---|---|---|
| §8/§55 one canonical work engine | `work_items` with `agency_id`, `division`, `team_id`, `assigned_to`, `subject_organization_id`, **`partner_service_id`**, **`partner_group_id`**, `archived_at` | reuse |
| §13/§28 checklist actions | **`work_checklist_items`** — `label`, `done`, `done_by`, `done_at`, `position` | reuse |
| §34 blockers | **`work_item_blockers`** — `note`, `blocked_by_id`, `resolved_at`, `created_by` | reuse, +2 columns |
| §28 one completed unit = one production unit | **`work_items_completion_production`** already fires on `division='bes_crm'` completion and writes one idempotent `production_logs` row | reuse, refine |
| §24–29 automatic EOD | **`eod_day_activity`** is division-agnostic: it reads `work_items` by assignee and `production_logs` by employee, and already returns `actions`, `action_count` and per-division totals. Its own header says *"The employee does not retype what they did."* | reuse |
| §29 manual fields only for context | already the case — the manual fields are blockers, next-day priority and notes | nothing to do |
| §21–23 multiple simultaneous handoffs, one submit | **`handoff_client_departments()`** — one transaction, many destinations, never moves an already-active destination backwards, never closes the source, one activity entry | mirror this exactly |
| §25 automatic activity | `activity_events` + the six loggers, and 0218's notification triggers | reuse |
| §51 same canonical project seen by the customer | `work_items_select` already has the branch: `subject_organization_id IS NOT NULL AND division = 'bes_crm' AND is_org_admin(subject_organization_id) AND org_entitled(…, 'crm')`, and no policy lets the customer write | reuse |
| §50 CreditOps-only agent sees no CRM | `in_scope(agency_id, division, …)` already narrows by division | reuse |

**Live data:** exactly two `bes_crm` work items exist and **both are
fixtures**. There is no production CRM data to migrate, so the project model is
free to be right rather than compatible.

---

## 1. The one hard blocker

`BES_GHL_Full_Infrastructure_Build_Tracker.xlsx` **is not in this repository
and I do not have it.** §12 requires every source requirement mapped, §56
requires all 140 imported into a master library, and §57 requires the import
to prove 140 rows accounted for. None of that can be done from a file I have
not read, and inventing rows would put a guessed build standard into the
product — the way the Metro 2 catalogue was lost once.

**So this splits in two, and only the second half needs the file:**

| | Needs the workbook? |
|---|---|
| The machinery — engines, versioned templates, composable projects, dependency graph, parallel streams, auto-start, derived status/progress/health, multi-handoff, QA automation, client requirements, blockers, production, EOD, access, navigation | **No** |
| The build standard — which 140 requirements exist, which engine each belongs to, which Work Unit it sits under, and what kind it is | **Yes** |

The machinery ships with template content taken from **Dee's own worked
examples** in §4, §5, §6 and §13, marked `provisional_from_brief`. The master
requirement library ships **empty**, with an importer and a validation that
refuses to call the library complete while any source row is unaccounted for.

---

## 2. Project model — a project is a subject, not a task

Today a CRM project *is* a `work_items` row. That was right when a project had
no structure. It cannot carry selected engines, a blueprint version, a target
go-live or a health override, and it must not: `work_items` is the work engine,
not a subject table.

So CRM mirrors CreditOps exactly:

| CreditOps | BES CRM |
|---|---|
| `fulfillment_clients` — the subject | `crm_projects` — the subject |
| `client_department_statuses` — where the subject is | `crm_project_engines` — which engines are in scope, and where each is |
| `work_items` — the work | `work_items` — the work |
| `handoff_client_departments()` | `crm_complete_work_unit()` |

```
PARTNER  (outsourcing_groups)
  → BES CRM SERVICE ENGAGEMENT  (partner_services, service_type 'bes_crm')
    → CRM PROJECT               (crm_projects)
      → SELECTED ENGINES        (crm_project_engines)
        → WORK UNITS            (work_items, division 'bes_crm')
          → ACTIONS/CHECKLIST   (work_checklist_items)
          → HANDOFFS            (crm_complete_work_unit)
```

`crm_projects.organization_id` is **nullable** (§9: "Organization remains
optional"). When set, the customer sees **the same project** through its own
authorization — no second row, no sync.

---

## 3. Engines are rows, never code branches

`crm_engines` seeded with Dee's fourteen (§3): `project_setup`,
`website_funnel`, `sales`, `fulfillment`, `onboarding_support`,
`communication`, `billing`, `integration`, `marketing_ai`, `reporting`,
`portal_membership`, `qa_launch`, `support_optimization`, `custom`.

Adding an engine is a row plus its template, never a new branch (rule 17:
"Modules are data, not code branches").

## 4. Versioned templates (§46, §47)

```
crm_engine_templates        (engine, version, status, notes)          v1 per engine
  → crm_work_unit_templates (title, requires_qa, phase, sort,
                             default_team_role, dependency rows)
      → crm_work_unit_template_actions (kind: checklist | acceptance | qa,
                                        label, requirement_id)
```

A project records the **exact template version** each of its engines was
instantiated from (`crm_project_engines.template_id`). A later `v2` therefore
cannot rewrite an active project (§47); adding work needs an explicit
**Upgrade Blueprint** or **Add Engine** action (§48).

## 5. Dependencies, not phases (§19, §40)

`crm_work_unit_template_deps (template_id, depends_on_template_id)` plus
`crm_work_unit_templates.dependency_mode` in (`none`, `all_required`,
`any_required`).

- no rows → **NO DEPENDENCY**
- one row → **SPECIFIC PREREQUISITE**
- many + `all_required` / `any_required` → the other two

`phase` stays on the template as **planning metadata only** — scheduling,
target dates, reporting. It is never read by the readiness function. That is
what makes §17/§18 true: independent engines run in parallel, and one WAITING
unit cannot freeze a project because readiness is per-unit dependency, not a
global phase counter.

## 6. Six display states from one stage column (§15)

**No new status enum.** CRM reads the canonical `work_stage`, plus one new
`waiting_on` reason:

| CRM display state | Derived from |
|---|---|
| READY | `stage in ('Queued','Assigned')` and dependencies satisfied |
| IN PROGRESS | `stage = 'In Processing'` |
| WAITING | `waiting_on is not null` — **overrides the stage in display only** |
| BLOCKED | `stage in ('Blocked','Attention')` or an unresolved `work_item_blockers` row |
| QA | `stage in ('Ready for QA','QA Review')` |
| COMPLETED | `completed_at is not null` |

`waiting_on` is an enum of **reasons** — `client`, `third_party`, `internal` —
exactly as §15 requires, not three task engines. A WAITING unit keeps its real
stage, so it is not counted as progress and it does not stop its siblings.

## 7. Auto-start (§14) and derived project state (§16, §35, §38)

One trigger, on the deterministic events only (§54): a checklist item ticked,
a file attached to the unit, a work note posted, a required field set. Any of
those on a `Queued`/`Assigned` CRM unit moves it to `In Processing`. Nothing
infers completion, approval or a QA pass.

Everything else is **derived, never stored**:

- `crm_engine_progress(project, engine)` — completed units ÷ units in scope
- `crm_project_progress(project)`
- `crm_project_state(project)` → Onboarding / Building / Waiting on Client / QA / Support / Completed
- `crm_project_health(project)` → On track / At risk / Blocked / Waiting / QA / Support

with `status_override` + `status_override_reason` + `status_override_by` and
the same three for health, writable by manager-and-above only (§16, §35).

## 8. One completion event does everything (§53)

`crm_complete_work_unit(p_unit, p_actions text[], p_note text, p_targets uuid[], p_keep_open boolean)`

One transaction, mirroring `handoff_client_departments`:

1. ticks the confirmed actions on `work_checklist_items`
2. if `requires_qa` → opens a QA unit and assigns it by template/team logic (§30); otherwise completes the unit
3. `p_keep_open = true` → opens the targets and **leaves the current unit In Progress** (§22B); `false` → completes it (§22A)
4. opens every target whose dependencies are now satisfied, and never moves an already-open target backwards
5. writes ONE activity entry — which is what feeds 0218's notifications
6. production and EOD follow from the existing completion trigger; nothing is written twice

**Nothing here is a second engine.** Every write lands in `work_items`,
`work_checklist_items`, `production_logs` or `activity_events`.

## 9. QA and client requirements

- **QA pass** → unit completes, dependents open (§32)
- **QA fail** → `crm_fail_qa(unit, feedback)` returns the ORIGINAL unit to `In Processing` with the feedback and an activity record; no manager rebuilds anything (§31)
- **Client requirements** → `crm_client_requirements` rows from template requirements of kind `client_requirement`. Satisfying one clears `waiting_on` on every dependent unit in the same transaction (§33). Independent units are untouched.

## 10. Production and EOD (§26–29)

Two refinements to what exists, no new tables:

1. `work_items_completion_production` currently writes `actions = ['Work item completed']`. For a CRM unit it should write **the checklist actions actually ticked**, so `action_count` in EOD is the real Build Actions figure (§28).
2. It should set `outsourcing_group_id` from `work_items.partner_group_id`, so the EOD subject line reads as the **partner** rather than falling through to the unit type.

Then §27's shape — *3 Projects Worked · 4 Work Units Completed · 12 Build
Actions · 2 Handoffs · 1 QA Review*, then **WORK BEHIND THESE TOTALS** — comes
out of `eod_day_activity` grouped by project and engine. A unit **worked but
not completed** appears under Worked and is **not** counted as completed
production (§28).

## 11. Access (§50) and the customer's view (§51, §52)

`crm_projects` and `crm_project_engines` get policies of the same shape as the
`work_items_select` CRM branch:

- BES staff of the agency, narrowed by `in_scope(agency_id, 'bes_crm', team_id, …)` — so a CreditOps-only or FundingOps-only agent sees nothing
- the customer's org admin, when `organization_id` is set and `org_entitled(org, 'crm')`
- **no write policy for the customer at all** — not a hidden control, no policy

Customer-facing updates stay **published, not automatic** (§52): the existing
`ProjectUpdates` visibility model already distinguishes `bes_internal` from
`shared_with_partner`, so a milestone is published deliberately and internal
notes, production metrics, QA detail and team assignments are not.

## 12. Navigation (§36–43)

Agent: **Dashboard · Projects · My Work · QA / Handoffs · Support.**
Manager and above additionally: Templates · Reports · Admin.
Project workspace: **Overview · Work · Files · Updates · Support**, with
Scope/Blueprint · Activity · Reporting for manager-and-above.
Work view groups **Engine → Work Unit**, never Phase → Section → 140 rows.

## 13. Master requirement library (§12, §56, §57)

```
crm_requirements
  source_reference   'BES_GHL_Full_Infrastructure_Build_Tracker.xlsx'
  source_row_ref     the workbook row
  engine_key         which engine
  work_unit_template_id  which unit it sits under (null until mapped)
  kind               work_unit | checklist | acceptance | prerequisite
                     | client_requirement | qa | automation | reference | optional
  import_batch_id, imported_at
```

Nothing is discarded (§12). `crm_requirements_unmapped()` lists every row not
yet assigned an engine and a unit, and the library is not "complete" while it
returns anything. **The count of live work units in a project is not 140 and is
not asserted to be** (§57) — it depends on selected engines, scope and template
version.

## 14. What this proposal deliberately does NOT do

- no second task engine, no `crm_build_task` table (§8, §55)
- no revival of `FulfillmentWorkOrder` (retired in `6d349cd`)
- no 140 live work items per project — that assumption is **superseded**, including my own register entry in `cf80840`, which is corrected in this change
- no inferred completion, approval, QA pass or credential receipt (§54)
- no duplicate project for the organization view (§9, §51)
- no invented workbook content

---

## 15. Sequence

| | | Needs Dee? |
|---|---|---|
| 1 | Supersede the 140-live-task assumption in the register and add rule 17b to CLAUDE.md | no |
| 2 | Migration: engines, versioned templates, work-unit templates + actions + deps, requirement library | no |
| 3 | Migration: `crm_projects`, `crm_project_engines`, `waiting_on`, blocker reason, policies | no |
| 4 | Migration: readiness, progress, state, health functions | no |
| 5 | Migration: `crm_create_project`, `crm_complete_work_unit`, `crm_fail_qa`, client requirements, auto-start trigger, production refinement | no |
| 6 | Seed engine templates v1 from Dee's §4/§5/§6/§13 examples, marked provisional | no |
| 7 | UI: project creation with presets, project workspace, work view, My Work, QA/Handoffs | no |
| 8 | Tests + RLS matrix phase | no |
| 9 | **Import the 140 rows, classify, map, prove all accounted for** | **the workbook** |

Steps 1–8 are buildable now. Step 9 is the blocker, and until it lands the
seeded template content is labelled provisional rather than presented as the
BES build standard.
