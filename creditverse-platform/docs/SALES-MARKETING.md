# Sales & Marketing

**V1 is complete. Feature work here is stopped** unless Dee reopens it.

## It runs on the generic engine — there is no marketing backend

```
workspaces  →  workspace_boards  →  work_items
```

A marketing workspace is a `workspaces` row. A piece of content is a
`work_items` row. Its statuses are `workspace_statuses` rows and its extra
fields are `workspace_fields` rows with values in `work_item_field_values`.

**There is no `marketing_task`, no `content_item`, no second task engine, and
there must never be one.** Everything the module needed — assignment, due dates,
checklists, comments, activity, attention, production, EOD, reporting — already
existed on `work_items`, which is why the module is thin.

Two kinds of marketing workspace:

- **BES Internal Marketing** — agency-owned, BES's own marketing.
- **Per-partner marketing** — auto-provisioned from a live marketing engagement.
  Partners are listed A→Z.

## The content status ladder

Live, from `workspace_statuses` (position → label → canonical stage → terminal):

| # | Key | Label | Canonical stage | Terminal |
|---|---|---|---|---|
| 10 | `backlog` | Backlog | Queued | no |
| 20 | `todo` | To Do | Assigned | no |
| 30 | `in_progress` | In Progress | In Processing | no |
| 35 | `changes_requested` | Changes Requested | In Processing | no |
| 40 | `waiting` | Blocked | Blocked | no |
| 50 | `internal_review` | For Internal Review | Ready for QA | no |
| 60 | `partner_approval` | For Partner Approval | QA Review | no |
| 65 | **`approved_scheduled`** | **Approved / Scheduled** | QA Review | **no** |
| 70 | **`published`** | **Published** | Completed | **YES** |
| 75 | `completed` | Completed | Completed | yes |
| 80 | `archived` | Archived | Completed | yes |

### The rule that matters most

> **Approval is not publication.**
> **Approved / Scheduled is NOT Completed.**
> **Published is the terminal state for content.**

Dee, 2026-09-13, correcting an earlier implementation:

> Do NOT mark content as Completed merely because the Partner approved it.
> Approval is not publication. Published should be a separate later state.

`approved_scheduled` is deliberately **not terminal**. A partner approving a
post means BES may now schedule it; the work is finished when it **goes out**.
Any change that collapses these two states is a regression, and it is asserted
in `supabase/scripts/marketing-module-probe.mjs`.

`changes_requested` (35) is the other half: a partner asking for changes sends
the item **back to the person who made it**, with their note on the task. A
comment is required in that direction — asking for changes without saying what
to change is a round trip nobody can act on.

## Content Calendar

Month / Week / List views over the workspace's content, with filters. A content
item carries its own marketing fields (channel, format, scheduled date, asset
links) as `workspace_fields`, not as columns on `work_items`.

`+ Create Content` opens the same drawer the calendar uses, so there is one
editor, not two.

## Campaigns

`campaigns` groups content for a purpose and a period. Content belongs to a
campaign by reference; the content item stays a `work_items` row.

Campaigns are readable and writable by authorized staff — a migration once
created the table with RLS and policies but only `grant select`, so nobody
could create one. That is fixed; if you add a table, **grant the DML you
intend**, not just select.

## Partner approval

Approval is the generalized partner-action path, shared with CreditOps:

```
work item reaches `partner_approval`
  → a partner_action_items row appears in the Partner Portal
    → partner Approves           → approved_scheduled  (NOT completed)
    → partner Requests changes   → changes_requested + their note on the task
```

The portal calls `my_partner_review(...)` for a marketing approval and the
CreditOps confirmation path for a CreditOps action. They are **different
database calls because they are different acts** — answering a marketing
approval through the CreditOps path would mark it done and move nothing.

## Importing a content plan

**Paste / CSV import.** Paste rows from a spreadsheet or upload a CSV; the
importer maps columns to content fields and creates `work_items`.

**There is no Google Sheets live sync, deliberately.** Dee, 2026-09-13:

> Do NOT build Google Sheets live sync yet. FullSuite should be the source of
> truth once the content plan is imported.

Import is a one-way door on purpose. Adding a live sync would make the
spreadsheet a second source of truth for content state, and the approval
lifecycle above is exactly the thing that cannot have two sources.

## Access

Roniel and Kaori have Sales & Marketing access. Kaori stays **out of active
CreditOps Support capacity** — the marketing role does not add her to Support
queues.

## Verification

```bash
node supabase/scripts/marketing-module-probe.mjs     # 48 checks, including one
                                                     # work item walked through
                                                     # the entire lifecycle
```
