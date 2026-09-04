# Staging test coverage

What the staging seed environment must be able to demonstrate, with real signed-in
users rather than assertions in a unit test.

Unit tests prove the rules are written correctly. Staging proves they hold for a
real person holding a real session — which is the only claim that matters before
anything goes live. Nothing here is built yet; this is the specification the
staging seed has to satisfy.

---

## Seed accounts required

The environment needs at least one signed-in user per role, because most of the
rules below are invisible from a BES account:

| Account | Belongs to | Purpose |
|---|---|---|
| `bes.owner@` | BES Agency HQ, `agency_owner` | Full BES view |
| `bes.agent@` | BES Agency HQ, `agency_agent` | Assignment and scope limits |
| `orgA.admin@` | Organization A, `org_admin` | Customer-side view |
| `orgA.staff@` | Organization A, member | Customer-side, non-admin |
| `orgB.admin@` | Organization B, `org_admin` | Cross-tenant isolation |

Organization B exists **only** to prove that A cannot see it. Without a second
customer account, tenant isolation is untested no matter how many unit tests pass.

## Seed relationships required

| Partner | Model | Engagement |
|---|---|---|
| Organization A | SaaS + BES fulfillment | active, **CreditOps only** |
| Organization B | SaaS only | **none** |
| External Partner C | Fulfillment without SaaS | active CreditOps, no `organization_id` |

Organization A must be entitled to **both** CreditOps and FundingOps as software
while BES is engaged for **CreditOps only**. That combination is the one a single
boolean could not express, and it is where per-service authorization actually
gets exercised.

---

## 1. Activity visibility — all four levels, real users

Each level must be posted by a real account and then **looked for from every
other account**. Posting is half a test; the other half is who fails to see it.

| # | Scenario | Expected |
|---|---|---|
| 1.1 | `bes.owner@` posts **BES Internal** on an Org A client | Visible to BES accounts. **Invisible to `orgA.admin@`** |
| 1.2 | `orgA.admin@` posts **Organization Internal** | Visible to Org A accounts. Visible to BES **only** because a CreditOps engagement is active |
| 1.3 | Either side posts **Shared with Partner** | Visible to BES **and** Org A |
| 1.4 | Either side posts **Client Visible** | Visible to BES and Org A; reserved for the client portal when it exists |
| 1.5 | `orgB.admin@` opens any of the above | **Nothing visible** — different organization |
| 1.6 | Composer default, every account | **BES Internal** for BES, **Organization Internal** for org users. Never a shared level |
| 1.7 | `bes.owner@` attempts Organization Internal | Option **not offered**; a direct API call is **refused by RLS** |
| 1.8 | `orgA.admin@` attempts BES Internal | Option **not offered**; direct call **refused** |
| 1.9 | Post at each level, then sign out and back in | Visibility **persists** and the badge still matches |
| 1.10 | Pause Org A's CreditOps engagement, then re-read as BES | Only **BES Internal** entries remain; the rest disappear |
| 1.11 | Resume the engagement | Full timeline returns |

**1.10 is the one to watch.** It is the difference between visibility that is
enforced and visibility that is decoration.

## 2. Fulfillment relationship — the three models

| # | Scenario | Expected |
|---|---|---|
| 2.1 | BES opens Org A CreditOps clients | Visible |
| 2.2 | BES opens Org A **FundingOps** clients | **Denied** — entitled to the software, BES not engaged for the service |
| 2.3 | BES opens Org B (SaaS only) client data | **Denied**, both services |
| 2.4 | BES opens Partner C records | Visible — model 3, no organization involved |
| 2.5 | Set an engagement's `effective_to` to yesterday | Access ends, without editing status |
| 2.6 | Org A staff open their own clients | Visible regardless of any BES engagement |

## 3. Tenant isolation

| # | Scenario | Expected |
|---|---|---|
| 3.1 | `orgA.admin@` requests an Org B record by id | **Denied** |
| 3.2 | `orgA.admin@` lists clients | Only Org A's |
| 3.3 | `orgA.admin@` reads `production_logs`, `time_entries`, `eod_submissions`, `webhook_endpoints` | **Denied** — BES internal operations |
| 3.4 | Any org user reads another organization's `activity_events` | **Denied** |

## 4. Entitlement

| # | Scenario | Expected |
|---|---|---|
| 4.1 | Org B (FundingOps only) opens `/app/operations` by URL | Refusal screen, not an empty module |
| 4.2 | Sidebar for each organization | Only entitled modules listed |
| 4.3 | Disable an entitlement, reload | Module disappears from nav **and** its records stop being served |

## 5. Audit and history

| # | Scenario | Expected |
|---|---|---|
| 5.1 | Change a client's status | Activity row written with actor, before and after |
| 5.2 | Attempt to edit an audit row's values | **Refused** — `permission denied` |
| 5.3 | Attempt to delete an audit row | **Refused** |
| 5.4 | Delete an organization holding clients | **Refused**; archive is the supported path |
| 5.5 | Delete an emptied organization | Its audit rows **survive**, agency attribution intact |

---

## Known limitations to re-test once built

- **No end-client account exists yet.** `CLIENT_VISIBLE` is enforced in the
  database but cannot be verified from a client session until the borrower
  portal has authentication. Until then 1.4 only proves BES and the organization
  can see it — not that a client can.
- **Assignment is read-only** pending the Workforce directory, so scope-by-
  assignment cannot be exercised.
- **The deal timeline is still in-memory**; deal comments do not yet reach
  `activity_events`, so section 1 applies to client timelines only.
