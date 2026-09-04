# Development test data

Real database-backed records so the application can be driven through actual
Auth, RLS, permissions, entitlements and fulfillment engagements — not frontend
placeholder arrays.

**This is development data, not staging.** It lives in the current development
database alongside the existing records.

## How to spot it

Every test record is marked three ways, so it can never be confused with a real
one at a glance or in a query:

| | Marker |
|---|---|
| Display names | begin `[TEST]` |
| Accounts | `@bes.test` — a reserved, undeliverable domain |
| Record ids | begin `dddddddd-` |

```sql
-- everything the seed created
select * from public.fulfillment_clients where id::text like 'dddddddd-%';
select * from auth.users where email like '%@bes.test';
```

## Re-running

`supabase/migrations/20260903001900_dev_test_data.sql`. Ids come from
`dev_uuid('stable key')`, so running it again **updates the same rows** rather
than creating a second set. Passwords and user ids are never rewritten.

**There is no reset or teardown, deliberately.** A seed that deletes rows is one
bad predicate away from destroying real work (rule 11). To start over, remove
the test rows by hand using the markers above.

**Remove before production:** this migration, `20260903001500`/`001600`/`001700`
(the seed helper), and the `dev_seed_user` / `dev_uuid` functions.

---

## Test identities

Password for every account: **`DevTest!2026`**

### BES Agency HQ

| Sign in as | Role | What it is for |
|---|---|---|
| `bes.owner@bes.test` | `agency_owner` | Full BES access — the "super admin" case |
| `bes.admin@bes.test` | `agency_admin` | Can delete; admin-only surfaces |
| `bes.manager@bes.test` | `agency_manager` | Can manage partners and engagements |
| `bes.lead@bes.test` | `agency_team_lead` | Between manager and agent |
| `bes.credit@bes.test` | `agency_agent` | CreditOps agent; **assigned** 4 clients |
| `bes.funding@bes.test` | `agency_agent` | FundingOps agent; assigned 2 funding clients |
| `bes.restricted@bes.test` | `agency_agent` | Assigned **nothing** — the empty-state case |

### Customer organizations

| Sign in as | Organization | Role |
|---|---|---|
| `org.owner@bes.test` | Lakeside Partners | `org_admin` |
| `org.manager@bes.test` | Lakeside Partners | `org_manager` |
| `org.lead@bes.test` | Lakeside Partners | `org_manager`, team scope "Team Alpha" |
| `org.agent@bes.test` | Lakeside Partners | `credit_processor`, assigned-only |
| `org.brm@bes.test` | Lakeside Partners | **external** `brm` |
| `org2.owner@bes.test` | Northgate Credit Co | `org_admin` — exists to prove isolation |

`org2.owner` is the account that makes tenant isolation testable. Without a
second customer, "Organization A cannot see Organization B" cannot be observed
from the interface at all.

---

## Partners and relationships

| Partner | SaaS entitlements | BES fulfillment engagement | Demonstrates |
|---|---|---|---|
| **Northgate Credit Co** | CreditOps | CreditOps, active | CreditOps-only org |
| **Harbor Capital Group** | FundingOps | FundingOps, active | FundingOps-only org |
| **Cedar Financial** | CreditOps + FundingOps | **CreditOps only** | Entitled to both, BES hired for one |
| **Ironwood Self-Serve** | CreditOps + FundingOps | **none** | SaaS-only: BES has *no* operational access |
| **Lakeside Partners** | CreditOps + FundingOps | CreditOps **and** FundingOps | Full SaaS + fulfillment |
| **Summit Outsourcing** | *no SaaS tenant* | CreditOps, active | Fulfillment without SaaS |

**Cedar and Ironwood are the two that matter.** Cedar proves per-service
authorization — BES sees its CreditOps clients and not its FundingOps ones.
Ironwood proves a subscription is not a fulfillment authorization.

## Records created

7 CreditOps clients (7 statuses, 3 rounds, assigned and unassigned, both
partner modes) · 3 department-status rows · 3 FundingOps clients · 3 businesses
· 3 funding files · 3 lender deals · 3 work items (3 stages, 3 priorities) ·
4 authored notes, one per visibility level · plus every system activity event
the triggers wrote while inserting the above.

Modest on purpose. The point is coverage of *states*, not volume — enough to
exercise tables, filters, empty states and workflows without slowing anything
down.

---

## Verified

Checked against the live database with real signed-in sessions, not assertions:

| | Result |
|---|---|
| All 13 accounts sign in | ✅ |
| BES agent sees agency-wide records | ✅ 17 credit, 3 funding, 10 orgs |
| Lakeside admin sees only Lakeside | ✅ 2 credit, 1 funding, 1 org |
| Northgate admin sees only Northgate | ✅ 2 credit, 0 funding, 1 org |
| **Customer cannot see BES internal notes** | ✅ sees shared + client-visible only |
| Unrelated organization sees another's activity | ✅ 0 rows |

---

## Requested but not seeded, because the feature does not exist yet

Recorded rather than faked — building product to satisfy test data would be
backwards.

| Asked for | Status |
|---|---|
| **Teams** | No `teams` table. `org_memberships.team_scope` is a free-text column; `org.lead@` carries `"Team Alpha"` in it. A real team model does not exist. |
| **Org "Owner"** | No `org_owner` role. `org_admin` is the highest, so Owner and Admin are the same account type today. |
| **Org "Team Lead"** | No org-level team-lead role. Mapped to `org_manager` plus a `team_scope`. |
| **BES "Super Admin"** | No role above `agency_owner`. |
| **BES assigned-only restriction** | `agency_memberships` has no `assigned_only` column. A BES agent can *read* agency-wide; assignment only restricts **updates**. `bes.restricted@` therefore tests empty assignment, not restricted reading. |
| **Sales Partner** | `external_role` has both `brm` and `sales_partner`; only `brm` is seeded, as no surface consumes either yet. |

---

## Pages still using GHL placeholder data

These render frontend arrays, not the database. Listed so they can be converted
during UI work — and so a figure on screen is never mistaken for a real record.

| File | Placeholder | Notes |
|---|---|---|
| `pages/app/Clients.tsx` | `sampleClients` | Already labelled "Sample data" in the interface |
| `pages/app/CreditOps.tsx` | `seedFulfillmentClients` | Partner tree is live; page-level client counts are not |
| `pages/app/FundingOps.tsx` | `seedFundingClients` | Client list and Deal List are live |
| `fulfillment/CreditOpsDashboardView.tsx` | `seedFulfillmentClients` | Dashboard metrics |
| `fulfillment/CreditOpsTreeSidebar.tsx` | `seedFulfillmentClients` | Client **counts** only; the partner list is live |
| `fulfillment/FulfillmentClientsPanel.tsx` | `seedOutsourcingGroups` | Group cards |
| `fulfillment/FundingClientWorkspace.tsx` | seed businesses/files | Client detail |
| `fulfillment/FundingClientWorkWorkspace.tsx` | seed businesses/files | Client detail |
| `fulfillment/FundingDealWorkspace.tsx` | seed businesses/files | Deal detail |
| `fulfillment/FundingDealSectionsA/B.tsx` | `funding-deal-data` | Deal sub-sections |
| `fulfillment/FundingOpsDashboardView.tsx` | seed clients/deals | Dashboard metrics |

**Already live and safe to test against real data:** CreditOps client list and
queues, the client work timeline, FundingOps client list and Deal List, partner
trees in both divisions, My Time, End of Day, Sub-Accounts, Reporting charts.
