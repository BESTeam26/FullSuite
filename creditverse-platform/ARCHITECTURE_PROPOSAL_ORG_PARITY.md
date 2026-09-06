# Proposal — Organization workspace parity, one Home, real roles

**Status: proposal, checked against the code on disk (2026-09-04). Nothing built.**

## What exists (verified)

- The **agency** CreditOps workspace (`pages/app/CreditOps.tsx`) is the
  DisputeFox + ClickUp surface: partner tree → `PartnerWorkspace` (9 views) →
  `FulfillmentClientsPanel` → `ClientWorkWorkspace` (department statuses,
  dispute engine, Complete Work, activity timeline, composer, documents). The
  agency FundingOps workspace mounts `FundingClientsPanel`,
  `FundingClientWorkspace`, `FundingDealWorkspace`.
- The **organization** view routes CreditOps to `pages/app/Operations.tsx` and
  FundingOps to `pages/app/Metro2.tsx`. Both are sample-data screens:
  hard-coded work ids (`WK-2207`…) and invented KPIs (94% QA rate, 1.8d
  turnaround). `pages/app/Clients.tsx` reads `lib/clients/client-seed.ts`,
  labelled sample.
- RLS already gives organization members their own `fulfillment_clients` and
  `funding_clients` rows (matrix: org.owner `fclients=2`, `fund=1`), and lets
  them post activity and files on records they can see. BES sees the same rows
  only under an engagement. Activity visibility (`bes_internal` /
  `organization_internal` / `shared_with_partner` / `client_visible`) already
  decides what each side reads.
- `CreditOpsAccessProvider` holds the role in **frontend state defaulting to
  "admin"**, changed via a "preview access control" switcher. Departments a
  person may log, and Management access, are therefore chosen in the browser.
  The database still enforces every write; the surface does not reflect real
  authorization.
- `CompleteWorkSection` logs **production** (BES's operational record) via
  `logProduction`; `production_logs_insert` requires `is_staff_of`, so an
  organization user's completion is refused today.
- `user_preferences` exists (pinned/recent organizations) — the natural home
  for per-user dashboard layout.

## Design

### 1. One Home
`/app/org/:orgPublicId` (already the landing) becomes the only Home for an
organization. It composes **sections per enabled module**, each derived from
live rows and linking into the module:
- CreditOps: clients by status, over-SLA, items awaiting consumer → Operations.
- FundingOps: deals by stage, stips open, funded → Pipeline.
- Workspaces: open items, overdue, per-workspace counts → Workspaces.
- Work: My Work, Attention.
- Reporting: whatever real report exists for the module; none invented.
Personalization: `user_preferences.dashboard_cards jsonb` — an ordered list of
card keys the user shows; unknown keys ignored; defaults = every card the
organization is entitled to. Reorder with up/down controls (no fake drag).

### 2. Sidebar (organization view)
```
Home
CREDITOPS        Clients · Operations (the workspace) · Reports
FUNDINGOPS       Pipeline (the workspace) · Reports
WORK             My Work · Workspaces · Attention
ORGANIZATION     Team · Settings
```
Groups render only for enabled modules. Collapse-to-rail toggle; drawer on
small screens (below `lg`). `Clients & Leads` moves under CreditOps.

### 3. Mount the real workspaces for the organization
- `/app/operations` → `PartnerWorkspace` with `scopeId = activeOrganization.id`
  and a partner object built from the organization (extracted to
  `components/dashboard/fulfillment/CreditOpsPartnerWorkspace.tsx`, exported;
  `CreditOps.tsx` keeps using it). The client list, client workspace, activity,
  composer and documents are the same components on the same rows.
- `/app/metro2` → the FundingOps workspace pieces the same way (client list,
  client workspace, deal workspace) scoped to the organization; the Metro 2
  demo content moves to the Knowledge Base where it is reference material.
- No new tables. No copies.

### 4. Real roles, one source
Replace the frontend role state with a resolver: for organization users the
role comes from `org_memberships.role` (org_admin/org_manager → full;
credit_processor/credit_qa/credit_support/… → their department set); for BES
staff from agency membership + scope. The "preview access control" switcher is
removed from live surfaces (kept only in demo mode, labelled). The database
remains the enforcement; the UI stops over-promising.

### 5. Completion semantics by author
- BES staff on an engaged record: unchanged — production row + activity.
- Organization user on their own record: **status change + activity + documents,
  no BES production** (production is BES's operational record). Complete Work
  for an organization author becomes "Record work" with the same action
  library, writing a `Work completed` activity event carrying the actions, and
  the status change. If Dee later wants organization-owned production/EOD, it
  is a separate counter, never BES's.

### 6. Resizing
Column-width drag on data tables that carry data (clients, deals, work
queues), persisted per user in `user_preferences.table_layouts jsonb`; drawer
and settings sheets get a draggable width. Nothing else.

## Verification plan
Matrix: org members read/write only their own clients and deals; BES sees them
only under an engagement; organization completion writes activity and no
production; role resolver matches membership for every fixture user. Browser:
as the two-organization fixture (Dee signs in), Home per organization,
sidebar per entitlement, CreditOps workspace on Lakeside's clients, record work,
dashboard personalization persists across reload.

---

## Superseded in part by the Organization Hub (2026-09-05)

The parity questions this document raised — should an organization have its
own People, Departments, Announcements, Knowledge and Files, or only the
CreditOps and FundingOps screens? — were answered by Dee's Organization Hub
doctrine, now **CLAUDE.md rule 18** and built in migrations 0072 and 0074–0079.

The answer is: yes, but as an entitled, switchable product layer, and over the
organization's own records. One Hub framework serves BES HQ and every
customer; three layers decide what each person sees (subscription, the
organization's own choice, the person's role). Read rule 18 first; anything
here that contradicts it is out of date.
