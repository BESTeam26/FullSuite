# Modules

The question each module answers is **who owns execution**. That is the
distinction to protect; everything else follows from it.

| Module | Owns execution | Customer may configure | Status |
|---|---|---|---|
| **Agency HQ** | BES | — | Live; functionally frozen |
| **CreditOps** | BES, under an engagement | No — the domain model is fixed | Live |
| **FundingOps** | BES, under an engagement | No — the domain model is fixed | **Paused, not removed** |
| **BES CRM** | BES | No — controlled visibility only | Live |
| **TalentOps** | The organization, staffed by BES | Scope of what BES may see | Live |
| **Sales & Marketing** | BES, in a workspace | Yes — statuses and fields are rows | Live (V1 complete) |
| **Custom Workspaces** | **The organization** | Yes, extensively | Engine live |
| **Partner Portal** | — (a surface, not a module) | — | Live; in validation |
| **Communication** | Shared | — | Live |
| **Billing / Finance** | BES | — | Live; Authorize.Net charging OFF |
| **Organization Hub** | The organization | Yes, per module | Partial |

## CreditOps and FundingOps are PAUSED, not removed

Dee, 2026-09-08, and it is permanent:

> CreditOps and FundingOps are paused for development. They are not being
> removed. BES Agency HQ is being finished first so the same canonical
> organization ↔ agency foundation can support them when development resumes.

CreditOps is in daily use; FundingOps has no new feature work. **A pause is not
licence to remove the foundation.** Never remove `fulfillment_engagements`,
`bes_may_fulfil()`, `bes_engaged_with()`, `engagement_is_live()`, `in_scope()`,
the canonical `work_items` engine, or the department/handoff/production/EOD
chain.

Before removing anything fulfillment-shaped, classify it: live consumers,
archived consumers, domain purpose, legacy or canonical — and **keep it if there
is any doubt**. A worked example of doing this correctly is in
`COMPLETION_REGISTER.md`.

## Custom Workspaces

The flexible operating layer for everything that is not strictly CreditOps or
FundingOps — the replacement for Monday, ClickUp or Asana.

```
Workspace → Board / List → Work Item
  → Assignment · Status · Due Date · Checklist · Files
  → Comments / Activity · Completion
  → Production · EOD · Reporting
```

An organization may personalize the name, icon, colour, statuses, fields,
columns, work types, views, priorities, assignees, checklists, comments,
KPI targets and permissions.

**One engine underneath, always.** Customization is **data** — statuses, fields
and types are rows. **Never let a workspace invent its own task engine.**

## TalentOps is the bridge, not a second copy

```
Organization Custom Workspace
  → active TalentOps engagement
    → authorized workspace / project / work scope shared to BES
      → BES sees ONLY that scope
```

The organization never re-creates its tasks inside BES. One canonical work
record; BES sees it only when a live service relationship authorizes access.

## BES CRM is BES-owned delivery

A BES-managed project-delivery module for CRM, GHL, automation, website and
funnel implementation. Not a customer-editable workspace.

The organization **may**: view approved progress, milestones and published
activity; upload requested documents and resources; comment; access shared
files.

The organization may **not**: change status, move work items, assign BES staff,
change due dates, mark BES work complete, edit production records, or see
internal QA, management notes, or BES workforce data.

**Association is not publication.** A BES CRM record touching a customer's
project does not become theirs to read — only what BES explicitly shares is
visible.

### The tracker may be detailed; the workspace must be simple

`BES_GHL_Full_Infrastructure_Build_Tracker.xlsx` has 140 rows. **They are not
140 tasks.** Every source row is preserved and mapped to one of: a Work Unit, a
checklist action, an acceptance criterion, a prerequisite, a client
requirement, a QA check, an automation rule, a reference, or optional scope.

A project is composed of the **engines the partner actually bought**. Website
only means website work. Do not instantiate irrelevant work and mark eighty
units "not applicable".

Readiness comes from per-unit dependencies, never from a phase counter. One
WAITING unit must not freeze a project. Full design:
`ARCHITECTURE_PROPOSAL_BES_CRM_BUILD_OS.md`.

## Organization Hub

Three layers of control, all three required before a person sees a module:

```
PRODUCT ENTITLED  and  ORGANIZATION ENABLED  and  USER AUTHORIZED
```

BES sets the entitlement; the organization chooses which modules it runs; the
person's own role, department, team and scope decide what they see.

**An organization toggle must never activate an unpurchased product** — the
entitlement check lives in the database writer, not the interface. A module the
organization is not entitled to is offered as an **upgrade**, never as a toggle
that quietly does nothing.

Modules are **rows** (`hub_modules`, `organization_hub_modules`), not code
branches.

Packages: Hub Core · Hub Operations · Hub Performance · Hub AI. Plans: Build →
Core; Grow → +Operations; Scale → +Performance; AI is usage-metered on top.
