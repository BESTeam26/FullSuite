# BES CRM — architecture inspection

**Dee, 2026-09-13:** *"Before implementation, inspect and report the
reuse/extension plan. Do not change production until that architecture check is
complete."*

**Nothing in production was changed to produce this report.** It is a read of
the live database and the source.

---

## Headline: the model you want is ~80% built, and PHASE is the exception

BES CRM is already a project-delivery module with projects, engines, milestones,
templates, QA, waiting reasons, dependencies, derived progress and a full
lifecycle. It is not a reporting dashboard pretending to be one.

**But the finding you most need, before anything else:**

> ### There are no phase records to preserve.
>
> `phase` exists as exactly one column — `crm_work_unit_templates.phase`
> (integer) — and **it is NULL on all 64 work unit templates.** There is no
> phase column on `crm_projects`, no phase table, no phase enum, and no phase
> value anywhere in production data.
>
> This is deliberate. `CLAUDE.md` rule 17b: *"Readiness comes from per-unit
> dependencies … **never from a phase counter** — phase is planning metadata."*
> The column was left in place as planning metadata and never populated.

So "preserve existing project phases and existing phase data" has a simpler
answer than expected: **there is nothing to destroy, rename or migrate.** Adding
Phase as a first-class project concept is **new model work**, not preservation.

**What plays the role of a phase today** is `crm_project_journey(project)` — a
**derived**, never-stored stage:

`Gathering information → Planning & designing → Building → Testing → Launch → Support → Complete`

It is computed from real work-unit state, with `journey_override` (plus reason,
who and when) when a human disagrees. That is a good design and it is closer to
your Phase concept than the unused integer is.

**The architectural question for you**, and it is the only significant one in
this report: should Phase be **derived** (as journey is now — always true, never
maintained, but only as expressive as the rules behind it) or **stored** (as you
described — explicit, orderable, groupable, but somebody must keep it right)?

My recommendation: **store the phase, keep deriving a suggestion.** A stored
`crm_phases` per project gives you grouping, a board lane and a visible journey;
the existing journey derivation becomes the *suggested* phase the interface
offers, exactly as `suggestedLifecycle()` already does for partners. Nothing is
auto-advanced without a person, and nothing is manually maintained that the
system could already know.

---

## REUSE — exists, suitable, do not rebuild

| You asked for | What exists | Notes |
|---|---|---|
| Partner → Project | `crm_projects` — `partner_group_id`, `partner_service_id`, `organization_id`, `lead_id`, `team_id`, `started_on`, `target_go_live`, `went_live_at`, `support_start_date`/`support_end_date`, `business_name` | A partner has many projects already. **One partner record, many projects** — already correct |
| **Milestones** | **`crm_milestones`** — `project_id`, `key`, `label`, `engine_key`, **`work_item_id`**, `scheduled_at`, `completed_at`, `completed_by`, `notes`, `link_url`, **`client_visible`**, `sort` | Already first-class, already links to a task, already carries partner visibility. 7 live rows |
| Milestone templates | `crm_milestone_templates` — 13 rows, per engine | |
| Tasks | **`work_items`**, with `crm_project_id`, `crm_engine_key`, `crm_work_unit_template_id` | 13 live. **`bes_crm_tasks` must never exist** |
| Task fields | title, description, priority, `assigned_to`, `due_at`, status, `team_id`, `division`, `completed_at`, `previous_assigned_to` | |
| Waiting **with a reason** | `work_items.waiting_on` / `waiting_note` / `waiting_since`; `crm_set_waiting()` | Your "Waiting" column already knows *why* |
| QA as a first-class step | `qa_result`, `qa_reviewed_by`, `qa_reviewed_at`, `qa_feedback`; `crm_pass_qa()` / `crm_fail_qa()`; `requires_qa` on templates | **Already built.** Do not add a second QA concept |
| Dependencies | `crm_work_unit_template_deps`, `dependency_mode` (`none` / `all_required` / `any_required` / specific), `crm_work_unit_ready()` | Timeline dependencies have a real source |
| **Project templates** | **`crm_engine_templates`** (versioned, with `status` and `provenance`) → `crm_work_unit_templates` (64) → `crm_work_unit_template_actions`; `crm_instantiate_engine()`, `crm_add_engine()`, `crm_cancel_engine()` | **Your "+ New Project → choose a template" already exists as engines.** 14 engines: Project Setup/Intake, Website & Funnel, Sales, Fulfillment, Onboarding/Support, Communication, Billing/Payment, Integration, Marketing/Reputation/AI, Reporting/Tracking, Portal/Membership, QA/Launch, Support/Optimization, Custom |
| Progress, derived | `crm_project_progress()`, `crm_project_engine_progress()`, `crm_project_health()` | **Never typed.** Your 72% and per-project bars already have a source |
| Checklists | `work_checklist_items` — with `done_by`, `done_at` | Audits who ticked each item |
| Files | canonical `files` + `FilePreviewGrid` / `useFilePreviews` | Partner · project · task · comment all addressable |
| Comments, @mentions, screenshots | Communication + the rich-text mention model | |
| Activity | `activity_events`, append-only, trigger-written | |
| **Approvals** | **`partner_action_items`** + `my_partner_review()` — the same engine Marketing uses | **Do not build a second approval engine.** Approve / Request changes, note required on changes, routed back |
| Team | `partner_assignments` (person or team, live-dated) + `crm_projects.lead_id` / `team_id` | Eligibility vs. task responsibility already separated |
| **Time** | **`time_entries` carries `work_item_id` AND `partner_group_id`** | *"How many hours did this GHL build take?"* is answerable **today**. No second timer |
| Lifecycle | `crm_project_complete()`, `crm_project_archive()`, `crm_project_reopen()`, `crm_project_delete()` + `crm_project_deletion_blockers()` | **Permanent delete is owner-only and blocker-checked.** Preserved, untouched |
| Authorization | `crm_project_readable()` / `crm_project_writable()` / `assert_may_manage_crm_project()` | |
| Partner Portal projection | `my_partner_projects()`, `my_partner_requirements()` | Already partner-safe |
| Client requirements | `crm_client_requirements`, `crm_requirements`, `crm_satisfy_client_requirement()` | "Waiting for Requirements" has a real record behind it |

---

## EXTEND — small, canonical

1. **Phase.** The one real model decision, above. If stored: a `crm_phases`
   table (project, key, label, sort, started_at, completed_at) plus
   `work_items.crm_phase_id` and `crm_milestones.phase_id`. Phase templates
   hang off `crm_engine_templates` the way milestones already do. **Populate the
   unused `crm_work_unit_templates.phase` integer or drop it — do not leave a
   second, contradictory phase concept in the schema.**
2. **`start_date` on `work_items`.** Only `due_at` exists. One nullable column,
   shared with TalentOps (D-013).
3. **Estimated time.** Actual is derivable from `time_entries`. Estimated needs
   one column or a `workspace_fields` row. Shared with D-013.
4. **Revisions.** `crm_milestones` + `activity_events` + a rejected approval
   already express "Homepage, revision 2" without new tables. **Smallest
   canonical solution: a revision counter derived from rejected
   `partner_action_items` against that milestone.** Recommend not building a
   revision engine.
5. **Labels/tags** (from both mockups). No canonical home. `workspace_fields`
   is the nearest; a small shared label table if you want them filterable across
   partners and modules.

---

## DO NOT DUPLICATE — these stay the source of truth

`work_items` · `crm_milestones` · `crm_engine_templates` and the work-unit
template chain · `partner_action_items` (approvals) · `files` · `activity_events`
· `time_entries` · `partner_assignments` · the `crm_project_*` lifecycle
functions · `crm_project_readable/writable`.

**Specifically:** no `bes_crm_tasks`, no second approval engine, no second
timer, no second template system, no per-view task copies for List / Board /
Calendar / Timeline.

---

## GAPS — genuinely missing

| Gap | Size |
|---|---|
| **Phase as a first-class concept** | the one model decision |
| Second navigation pane, partner folders, partner workspace with 8 tabs | **frontend, large** |
| Board with drag-to-change-status | frontend |
| Calendar and Timeline views | frontend (Timeline has a dependency source already) |
| Workload by employee | frontend over existing data |
| Approvals as a dedicated view | frontend over `partner_action_items` |
| My Tasks / All Tasks with filters | frontend |
| `start_date`, estimated time, labels | 2–3 columns |

**The backend is nearly done. The frontend is the work.**

---

## Two corrections to the mockup, offered as facts

- **`crm_projects` currently holds 1 row, `crm_project_engines` 2.** The mockup
  shows Business Made Fair with five active projects. The module is built but
  barely populated — whatever is tested will need real projects created first.
- **Partner names in the sidebar are illustrative.** Lakeside Partners, Keystone
  & Associates, Thrive Solutions, Elevate Capital, Prime Consulting and Summit
  Enterprises are not partners in the system. The list is engagement-driven by
  design, so it will show exactly the partners holding a live BES CRM service.

---

## Where this sits

**Not started, and not scheduled.** It is a major feature expansion and a UI
redesign arriving during the pre-handoff stabilization freeze, alongside D-013
(TalentOps). Recorded as **D-014** in `DEFERRED_AGENCY_WORK.md`.

The two share three of the same extensions — `start_date`, estimated time,
labels — and the same principle: **one engine, three operating experiences.**

```
TalentOps          Partner → Project/List → Task → People → Workload
BES CRM            Partner → Build → PHASE → Milestone → Task → QA → Approval → Launch
Sales & Marketing  Partner → Campaign → Content → Calendar → Approval → Publish
```

If both are approved, they should be designed together and built in sequence,
so the shared extensions are made once.
