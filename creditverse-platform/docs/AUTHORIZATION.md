# Authorization

**Authorization is decided in the database. The interface reflects it; it never
constitutes it.**

Hiding a button is presentation. If a user cannot use something, it must not
render **and** direct URL or API access must still deny it. Both layers, every
time.

## The chain

```
authenticated user
  → organization membership / agency membership
    → role
      → capability (permission key)
        → scope / assignment
          → entitlement
            → fulfillment engagement
              → record authorization
```

Default to **deny** when any link is unclear.

`organization_id` supplied by the frontend may **narrow** a query. It may never
**widen** one, and it is never proof of access.

## Roles

After migrations 0233/0234:

| Realm | Roles |
|---|---|
| Agency | `agency_admin`, `agency_user`, plus an **`is_owner`** flag |
| Organization | `org_admin`, `org_user` |

**Manager, team lead and agent are POSITIONS, not authority.** The old manager
rank became the `ops.manage` capability; team surfaces follow
`team_memberships.is_lead`. Retired enum values still exist in history and
always normalize to fail **safe** (owner → admin, ranks → user).

## The capability resolver

`resolve_agency_capability(p_key text)` is the single answer. 64 permission
keys; 11 of them owner-gated.

```
inactive membership                        → false
key is owner_gated                         → is_owner  OR  an explicit per-member grant
role is agency_owner / agency_admin        → true      (ungated keys only)
otherwise, first match wins:
    agency_member_permissions  (this person)
  → agency_profile_permissions (their access profile)
  → agency_role_permissions    (their role, this agency)
  → agency_role_permissions    (their role, platform default)
  → false
```

`agency_can('key')` is the boolean used in policies. `agency_can_all()` returns
the whole resolved set in one call, so the frontend resolves permissions **once
per session** rather than per component.

## Financial gating — read this twice

**Admin does not automatically mean financial access.**
**The Owner receives financial access.**
**A non-owner's financial access requires an explicit Owner grant.**

The admin short-circuit above applies **only to ungated keys**. For an
owner-gated key the resolver ignores role entirely and asks two questions: are
you the owner, or did the owner grant you this key by name?

The 11 owner-gated keys:

| Key | |
|---|---|
| `partners.invoices.view` / `partners.invoices.manage` | partner invoices |
| `partners.payments.record` | recording money received |
| `partners.revenue.record` | revenue entries |
| `expenses.view` / `expenses.manage` | agency expenses |
| `finance.dashboard.view` | the financial dashboard |
| `payroll.view` / `payroll.manage` | payroll |
| `billing.view` / `billing.manage` | the agency's own subscription |

**Do not weaken this.** It is the boundary Dee cares about most, and every
change to it must be deliberate and reviewed. `supabase/scripts/money-boundary-probe.mjs`
asserts it against the live database.

## Permanent Delete is Owner-only

`owner_delete_record(p_table, p_id, p_reason)` is the only path to a hard
delete, it requires the owner, and it demands a reason. Everything else
archives, voids or transitions. **History is the record** (`CLAUDE.md` rule 11).

## The helper functions

Policies call these rather than re-deriving rules. Never inline the logic; if a
rule needs to change it must change in one place.

| Function | Answers |
|---|---|
| `is_agency_staff()` | is the caller BES staff at all |
| `is_staff_of(agency)` / `is_manager_of(agency)` / `is_admin_of(agency)` | staff of a specific agency, at a rank |
| `is_owner_of(agency)` | the owner flag |
| `agency_can(key)` | the capability resolver, as a boolean |
| `is_org_member(org)` / `is_org_admin(org)` / `can_view_org(org)` | organization membership |
| `bes_engaged_with(org)` / `bes_may_fulfil(org, group, service)` | a **live** engagement exists |
| `engagement_is_live(...)` | the date/status test itself |
| `in_scope(...)` | narrows BES staff to the engagement's authorized team |
| `can_see_partner(group)` | owner/admin, or a live assignment by name, team, or managed department |
| `partner_group_of_user()` | the Partner a portal contact belongs to — **NULL** for a suspended contact or suspended/archived partner |
| `is_partner_contact_of(group)` | the portal side of a partner boundary |
| `channel_visible(id)` / `channel_writable(id)` / `channel_auditable(id)` | conversation access |
| `can_view_work(...)` / `can_view_activity(...)` | work and history |

`partner_group_of_user()` deserves attention: portal access ends in **one
place**. Suspend a contact or a partner and every portal read stops, rather than
each screen having to remember.

## Partner assignment scope

`can_see_partner(group)` is true when the caller is:

- an **admin or owner** of the agency, **or**
- staff with a live `partner_assignments` row that is
  - **to them by name**, or
  - **to a live team they are on**, or
  - **to a team in a department they manage**

An **unassigned** partner is visible to owner and admin alone — which is exactly
what makes an "Unassigned partners" screen worth having.

`channel_service_ok()` narrows further for service-scoped conversations: an
assignment that is account-wide **or** for that same service. A GHL implementer
cannot be pulled into a CreditOps processing thread.

## Partner Portal authorization

A portal contact is an ordinary Supabase auth user whose `partner_contacts` row
binds them to one partner. That row is their entire boundary.

Portal reads go through **`SECURITY DEFINER` projections** — `my_partner_clients()`,
`my_partner_client()`, `my_partner_services()`, `my_partner_agreements()`,
`my_partner_team()`, `my_partner_portal_summary()` and so on — each gated by
`partner_group_of_user()`, each returning a **whitelist** of partner-safe
columns.

**To extend what a partner can see, change the definer function. Never widen the
underlying RLS.** Widening a policy to serve one portal screen changes what
every other caller can reach.

What must never leave BES is listed in `docs/PARTNER-PORTAL.md`.

## Deliberately reachable without a session

Three functions are granted to `anon` on purpose — each is a token flow where
the person has no account yet, and each resolves its own token and returns
nothing for one that is wrong, used or expired:

- `invitation_preview(p_token)`
- `signature_request_preview(p_token)`
- `sign_document(p_token, …)`

They are named in `supabase/scripts/sql-contract-probe.mjs` so that adding a
fourth is a decision somebody writes down, not a probe quietly going green.

## Verifying a change

```bash
npm run probe:sql                                   # grants, overloads, search_path
node supabase/scripts/money-boundary-probe.mjs      # the financial boundary
node supabase/scripts/partner-messages-probe.mjs    # partner conversation isolation
node supabase/scripts/rls-matrix.mjs --phases=...   # the full policy matrix
```

The matrix is the heavy gate — 70 phases, ~1559 checks, about 11 minutes. Run
targeted phases while developing and the full matrix before a security release.
**Never push a migration while it runs.** A gate at 1540/1559 is **not** a pass.
