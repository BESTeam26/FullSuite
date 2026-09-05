# Proposal — Configurable organization role access

**Status: proposal (2026-09-04). Nothing built. Written after the workspace-parity
milestone was committed, per Dee's instruction to finish that first.**

## The ask

Role → department / view / responsibility mapping must be an **organization-level
setup with sensible defaults**, not BES assumptions in code. The Organization
Owner/Admin controls what each role can reach — only inside their organization
and only within the products they are entitled to. Role, Permission, Department,
Team, Scope and Assignment stay separate; a job title never determines data
access; nothing here may weaken RLS.

```
Product Entitlement → Organization Settings → Role/Permission → Team/Department → Assignment → Individual User
```

## What exists (verified on disk)

| Layer | Today |
|---|---|
| Product Entitlement | `product_entitlements` (per org, per product), `org_entitled()` |
| Organization Settings | `organizations.branding`, `organizations.workspace_views` (0045) — data, audited merge functions |
| Role | `org_memberships.role` (enum `org_role`), `agency_memberships.role` |
| Permission | **hard-coded** in `lib/fulfillment/ops-role-resolver.ts` → `CREDITOPS_ROLES` / `FUNDINGOPS_ROLES` (departments, edit-progress, management layer). Interface only; the database enforces rows, not departments |
| Team / Department | `departments` (agency-owned taxonomy), `teams` (agency or organization owned), `team_memberships`, `production_departments` (service → department keys) |
| Scope / Assignment | `access_scope` on agency memberships, `assigned_to`, `in_scope()` / `entity_visible()` in RLS |
| User | `profiles`, `auth.uid()` |

The gap is exactly one layer: **Permission is code**. Everything above and below
it is already data with RLS.

## Design

### 1. One table: `organization_role_access`

```
organization_id   uuid  → organizations
role              public.org_role
product           public.product_key            -- creditOps | fundingOps (configurable products)
departments       text[]  not null              -- keys ⊆ production_departments(service of product)
views             text[]  not null              -- ids ⊆ that product's workspace views; '{}' = every view the organization shows
can_log_work      boolean not null              -- false = read access to the departments listed
can_edit_progress boolean not null
can_access_management boolean not null          -- cross-record management layer inside the org
updated_by, updated_at
primary key (organization_id, role, product)
```

Rows exist **only when an owner changes something**. No row = platform default.
The defaults are the current resolver table, moved into one deterministic module
(`lib/fulfillment/role-access-defaults.ts`) and mirrored by a SQL function
`default_role_access(role, product)` so the database and the interface agree.
Deleting a row = "Reset to default".

### 2. Writes: one audited function, never the table

`set_organization_role_access(p_org, p_role, p_product, p_departments, p_views,
p_can_log_work, p_can_edit_progress, p_can_access_management)` — SECURITY
DEFINER, mirroring the branding / workspace-views merges:

- allowed to `is_org_owner_admin(p_org)` or `is_manager_of(agency)`; else 42501
- `org_entitled(p_org, p_product)` must hold; else 42501 (**cannot configure a
  product you do not have**)
- `p_departments ⊆ production_departments` for that product's service; `p_views ⊆`
  the product's view catalogue; unknown → 22023
- roles of the other product (e.g. a `funding_*` role for `creditOps`) → 22023
- `org_admin` / `org_manager` cannot be narrowed below "everything" for the
  organization's own products — the owner cannot lock themselves out
- audited: `organization.role_access_updated` with before/after

`reset_organization_role_access(p_org, p_role, p_product)` deletes the row under
the same authorization.

### 3. Reads: organization members read their own organization's rows

`organization_role_access_select`: `is_org_member(organization_id)` or agency
manager. No INSERT/UPDATE/DELETE policies — the functions are the only writers.

### 4. Resolution (interface) — the same chain, one more input

```
resolveOpsAccess({ agencyRole, orgRole, product, configured, organizationViews })
  agency staff   → agency defaults (BES's own operating rules; not org-configurable)
  org member     → configured row for (org, role, product) ?? default(role, product)
  no membership  → none
allowedViews = organizationViews (0045) ∩ (row.views || all)
```

`CreditOpsAccessProvider` / `FundingOpsAccessProvider` consume the resolved
definition; `CompleteWorkSection` offers only `departments` and only when
`can_log_work`; the partner workspace offers only `allowedViews`. `CREDITOPS_ROLES`
shrinks to the default-definition catalogue; nothing else in the UI changes.

### 5. What this does — and does not — enforce

- **Does not touch a single existing policy.** Row visibility stays exactly
  `entitlement → membership → scope → assignment → record`. A role-access row can
  only *narrow* what the interface offers on rows the person can already see.
- **Optional hardening (phase 2, separate proposal if wanted):** the activity
  insert that records an organization author's "Work completed" could check
  `department ∈ resolved departments` in a trigger, so a client that bypasses the
  interface cannot log a department its role was not given. Recorded, not built.
- **Never an authorization *widening*:** a row cannot grant a product the
  organization lacks (checked), cannot reach another organization (primary key +
  function authorization), cannot change `org_memberships.role`, teams,
  assignments or scope — those stay their own layers.

### 6. Settings UI (organization view → "Roles & access")

One card per role that applies to an entitled product (Credit Processor, QA,
Support, Sales, Complaints, Bureau Caller; Funding Processor, Doc Reviewer,
Underwriter, Sales, Support). Each card: department checkboxes (from
`production_departments`), view checkboxes (from the view catalogue, minus what
the organization already hides), three switches (log work / read only, edit
progress, management layer), "Default" badge when no row exists, "Reset to
default". Owner/admin edits; everyone else sees it read-only. Every control is a
real write.

## Verification plan (matrix phase 15)

Owner sets a row → visible to a member of that org, not to another org's member;
organization manager / agent / other org's owner / BES agent refused (42501); BES
manager allowed; product not entitled refused; unknown department, unknown view,
wrong-product role refused (22023); narrowing `org_admin` refused; reset deletes;
all earlier phases unchanged (no policy touched). Browser: as the two-organization
fixture, give Credit Processor Support only → Complete Work offers Support only;
hide Dispute Queue for QA → the tab is gone for QA, present for the owner.

## Migrations

One migration: table, select policy, `default_role_access()`, the two functions,
grants/revokes. Frontend: defaults module + resolver change + settings section +
data layer. Types regenerated by hand as before.
