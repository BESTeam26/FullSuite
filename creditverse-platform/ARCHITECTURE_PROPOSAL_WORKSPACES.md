# Proposal — Custom Workspaces, TalentOps bridge, BES CRM visibility

**Status: Custom Workspaces foundation IMPLEMENTED (migrations 0027/0028, Phase 6);
TalentOps bridge IMPLEMENTED (migration 0029, Phase 7) as `workspace_shares` + `workspace_reach()`; BES CRM IMPLEMENTED (migration 0031, Phase 8) as a narrowed customer branch on work_items plus real surfaces on both sides.** Doctrine is recorded as
CLAUDE.md rule 17. Deviations from the text below: conflict 1 was already fixed
by migration 0024; `workspace_statuses` carries `canonical_stage` so the engine
keeps one stage vocabulary; the three open questions were answered as recorded
in BUILD_STATUS (list not workflow; Attention via the canonical stage only;
`crm` = BES CRM delivery).

The conclusion up front: the canonical engine already exists and is close to
sufficient. What blocks Custom Workspaces is not a missing engine but **three
fixed enums, one missing container, and one policy I broke**.

---

## What already fits, unchanged

| Asset | Why it works |
|---|---|
| `work_items` | Already carries scope, organization, assignee, stage, priority, due/completed dates, agency. This *is* the engine — no second one needed. |
| `time_entries`, `production_logs`, `eod_submissions` | Already keyed to employee + agency + date, already feed the tested EOD engine. |
| `activity_events` + visibility | Four audiences already enforced. BES CRM's "only what BES publishes" is `shared_with_partner` / `client_visible` versus `bes_internal` — the model already exists. |
| `fulfillment_engagements` | Already has **`bes_crm`** and **`talentops`** in `fulfillment_service`. The TalentOps bridge needs no new relationship concept. |
| `work_attention` view | Already the Attention surface. |
| `production_logs.division_id` | Free text, so a workspace id fits without a schema change. |

That is most of the diagram already built. The extension is genuinely small.

---

## Conflicts found

### 🔴 1. Organization members cannot create work at all — a regression I introduced

`can_write_work()` was written to allow `is_org_member(p_org)`, so the original
design intended organizations to own their work. Migration 0014 then tightened
the policy to:

```sql
with check (public.is_staff_of(agency_id) and public.can_write_work(scope, organization_id))
```

The `AND is_staff_of(...)` makes the `is_org_member` branch unreachable. **Only
BES staff can create or update a work item today.** Custom Workspaces are
defined by the organization owning execution, so this blocks the feature
outright.

This was my error while making agency scope real, not a pre-existing gap. It is
currently invisible because nothing in the UI creates work items yet.

*Fix:* restore the organization branch — `is_staff_of(agency_id) OR
is_org_member(organization_id)` — keeping the agency test for AGENCY-scope rows.
Small, and worth doing regardless of whether workspaces are built.

### 🔴 2. `work_stage` is a fixed enum

```sql
work_stage = 'Queued','Assigned','In Processing','Ready for QA','QA Review',
             'Completed','Blocked','Attention'
```

Per-workspace statuses are the headline customization request and an enum
cannot express them. This is the single largest schema conflict.

*Fix:* a `workspace_statuses` table (workspace, key, label, colour, order, an
`is_terminal` flag), and `work_items.status_id` alongside the existing `stage`.
Keep `stage` for CreditOps/FundingOps, which must stay strict; workspace items
carry `status_id`. Reporting reads `is_terminal` rather than matching strings.

### 🟡 3. `work_related_type` is a fixed enum

`'credit_case','funding_deal','project','support','fulfillment'` cannot express
organization-defined task types.

*Fix:* `workspace_item_types` rows plus `work_items.item_type_id`. `'project'`
already exists as the umbrella value for workspace rows.

### 🟡 4. No workspace / board / list container

`work_items` has no parent, so nothing can be grouped, permissioned or shared as
a unit — and the TalentOps bridge needs exactly that unit to authorize.

*Fix:* two tables. `workspaces` (organization, name, icon, colour, entitlement
key) and `workspace_boards` (workspace, name, view kind). `work_items` gains
`workspace_id` and `board_id`, both nullable so CreditOps and FundingOps are
untouched.

### 🟡 5. No custom fields

*Fix:* `workspace_fields` (workspace, key, label, type, options, order) plus a
`work_item_field_values` row per item/field. Deliberately not a `jsonb` blob on
`work_items`: a column-per-workspace is unqueryable, and a blob cannot be
filtered or reported on without scanning.

### 🟡 6. Entitlement vocabulary is short two keys

`product_key` is `('creditOps','fundingOps','diyCredit','oi','crm')`. There is no
key for Custom Workspaces or TalentOps, and `'crm'` is ambiguous — it does not
say whether it means BES CRM delivery or a customer CRM product.

*Fix:* add `'workspaces'` and `'talentOps'`; document `'crm'` as BES CRM
delivery visibility.

### 🟢 7. BES CRM and TalentOps are placeholder screens

Both pages exist (233 and 232 lines) with **zero** database access. Nothing to
conflict with — but also nothing to build on. They are presentation only.

---

## Proposed extension, smallest form

Five tables and four columns. No new engine, no second permission system.

```
workspaces                (organization, name, icon, colour)
  └── workspace_boards    (workspace, name, view kind)
  └── workspace_statuses  (workspace, key, label, colour, order, is_terminal)
  └── workspace_item_types(workspace, key, label, icon)
  └── workspace_fields    (workspace, key, label, type, options, order)

work_items  + workspace_id, board_id, status_id, item_type_id   (all nullable)
work_item_field_values    (work_item, field, value)
```

Nullable columns are the point: a CreditOps work item leaves them NULL and
behaves exactly as it does today. One table, two modes, no fork.

### TalentOps bridge — no new concept needed

```
workspace_shares (workspace_id, engagement_id, board_id?, access)
```

One row says "this workspace, or this board, is visible to BES under this
TalentOps engagement." `bes_may_fulfil(org, group, 'talentops')` already gates
it, and the existing work-item policy gains one branch: *or this item's
workspace is shared under a live TalentOps engagement.*

No task is copied. BES sees the organization's canonical work item, and time,
production and EOD flow through the tables that already exist.

### BES CRM — an ownership flag, not a new module

A BES CRM project is an AGENCY-scope work item with `subject_organization_id`
set to the customer. It needs no customer-editable surface, so:

- **Reads:** the customer sees only `activity_events` BES published at
  `shared_with_partner` or `client_visible`, plus files BES marked shared.
  That machinery is built.
- **Writes:** the customer may add comments and upload documents. Everything
  else — status, assignment, dates, completion, production — stays BES-only,
  which is what the *current* work-item policy already does.

The strict-BES-ownership case is therefore the one that needs **least** new
code. The customer-collaboration surface is a comment at
`organization_internal`/`shared_with_partner` and a file upload, both of which
already have models.

---

## Sequencing, if approved

1. **Fix conflict 1 on its own.** It is a live authorization defect and should
   not wait for a feature.
2. Entitlement keys (conflict 6) — additive, unblocks module gating.
3. Workspace container + statuses + types (conflicts 2–4) — the core.
4. Custom fields (conflict 5).
5. TalentOps `workspace_shares` bridge.
6. BES CRM surfaces, which mostly compose existing parts.

Steps 3–6 are each roughly the size of Phase 4 or 5.

## Open questions for you

1. **Should a Custom Workspace work item appear in Attention and EOD by
   default?** It shares the engine, so it can. My assumption is yes for EOD
   production, and Attention only when a due date or blocked status exists.
2. **Do workspace statuses need a workflow, or just a list?** A list is far
   simpler; "which statuses may follow which" is a real feature but doubles the
   model.
3. **Does `'crm'` today mean BES CRM delivery, or a customer-facing CRM
   product?** It changes whether the key is reused or replaced.

**Nothing implemented. Awaiting your direction.**
