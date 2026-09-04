# Proposal — Team and Assignment Scope foundation

**Status: IMPLEMENTED in migration `20260904000100`, with deviations noted below.**
See `AUTHORIZATION_MAP.md` for the measured result.

Deviations from this proposal, and why:
- **No `divisions` table.** `fulfillment_service` is already the canonical
  service identity used by engagements and activity; a second table would have
  duplicated it. Division scope points at the enum.
- **`departments` IS a table**, because department identity is split across two
  enums today and a scope must reference one stable id, never a label.
- **`teams` serves both sides** (`agency_id` xor `organization_id`) — one team
  system, per rule 17.
- **Managers backfilled to `agency`, not `division`.** `is_manager_of` already
  granted agency-wide escalation on production, time and EOD; narrowing a real
  role is a policy decision. The fixture manager demonstrates division scope.
- **Roster ≠ ceiling.** Team membership alone widens nothing; `scope = 'team'`
  does. A lead supervises their team regardless of ceiling.
- Unassigned team queue: visible to `team`/`department`/`division`/`agency`,
  never to `assigned` or `self`. Decided explicitly.

The finding up front: **the scope model already exists — on the wrong half of the
schema.** Workforce records (`time_entries`, `production_logs`,
`eod_submissions`) are already scoped *self, escalating to manager*. Operational
records (clients, files, work items) have an **engagement** gate but no
**person** gate, so any BES agent reads everything BES may reach.

So this is less "design an authorization model" than "extend a pattern that is
already here, and give it an org structure to hang on."

---

## 1. What exists and should be reused

### The scope pattern, already correct on workforce data

```sql
-- time_entries, production_logs, eod_submissions
using (public.is_staff_of(agency_id)
       and (employee_id = auth.uid() or public.is_manager_of(agency_id)))
```

That is **Self + manager escalation**, working today. It is the shape every
operational table needs; it simply was never applied to them.

### Assignment already uses stable ids

| Table | Column |
|---|---|
| `fulfillment_clients` | `assigned_agent_id → profiles` |
| `funding_clients` | `assigned_agent_id → profiles` |
| `funding_files` | `assigned_agent_id → profiles` |
| `work_items` | `assigned_to → profiles` |
| `client_department_statuses` | `assignee_id → profiles` |
| `funding_department_statuses` | `assignee_id → profiles` |

Every one is a foreign key to a person, never a name or an email. Rule 4 is
already satisfied — assignment scope can be built on these as they stand.

### Historical attribution is already safe

`activity_events` and `production_logs` denormalise `actor_name` / `employee_id`
at write time and are append-only. Reassigning a client today does **not** move
who did the work, and nothing proposed here changes that.

### The authorization chain and its helpers

`is_staff_of`, `is_manager_of`, `is_admin_of`, `bes_may_fulfil`,
`org_has_product`, `can_view_activity`, `is_org_member`, `is_org_admin`. These
are the composition points; new scope logic should slot into them rather than
appear inline in ~85 policies.

---

## 2. What is missing

| Missing | Evidence |
|---|---|
| **Division / Department / Team as org units** | No `divisions`, `departments` or `teams` tables. `fulfillment_department` and `funding_department` are enums describing *what kind of work* a row is, not *who owns it*. `production_logs.division_id` is free text defaulting `'creditops'`. |
| **Team membership** | None. `team_scope` is a free-text column on `org_memberships` and does not exist on `agency_memberships` at all. |
| **Any scope on agency membership** | `agency_memberships` is `(user_id, agency_id, role)`. No scope, no team, no `assigned_only`. |
| **Permission as a distinct concept** | There is no `permissions` table. "Role + Permission" is really role-only: helpers test role names directly. |
| **Assignment scope on reads** | Operational SELECT policies never mention `assigned_to` / `assigned_agent_id`. |

### The concrete defect

An `agency_agent` — the test account `bes.credit@bes.test` — reads **17
CreditOps clients, 3 FundingOps clients and every funding file**, because
`fulfillment_clients_select` asks only whether BES may fulfil for the partner,
never whether *this person* is on the work. Verified against the live database.

---

## 3. Proposed schema — smallest canonical form

Four tables, two columns, one enum. One structure serving every module.

```
divisions            (agency, key, name)                    -- CreditOps, FundingOps, TalentOps, BES CRM, Workspaces
  └── departments    (division, key, name)                  -- Dispute, Onboarding, Underwriting, …
        └── teams    (department, name)                     -- the unit people actually belong to
              └── team_memberships (team, user, role, is_lead)
```

- **Users may belong to several teams** — `team_memberships` is a join table,
  not a column, which is why free-text `team_scope` cannot serve.
- **Divisions and departments are reference rows**, not enums, so Custom
  Workspaces can register one later without a migration.
- The existing `fulfillment_department` / `funding_department` enums stay where
  they are: they classify *work*, and conflating them with *org units* is what
  would create two team systems.

### Scope on the membership, not on the table

```sql
create type public.access_scope as enum (
  'agency', 'division', 'department', 'team', 'assigned', 'self'
);

alter table public.agency_memberships
  add column scope       public.access_scope not null default 'assigned',
  add column scope_ref   uuid;   -- division / department / team id when relevant
```

Default `'assigned'` is deliberate: **default deny**. A new agent sees their own
work until someone widens them.

Suggested mapping, not enforced by the enum:

| Role | Typical scope |
|---|---|
| `agency_owner`, `agency_admin` | `agency` |
| `agency_manager` | `division` or `department` |
| `agency_team_lead` | `team` |
| `agency_agent` | `assigned` |

Role and scope stay separate on purpose. A manager who should only see one
division is `agency_manager` + `division`; the role says what they may *do*, the
scope says what they may *see*.

---

## 4. RLS changes — one helper, not 85 edits

```sql
-- Does the caller's scope reach this record?
create function public.in_scope(
  p_agency uuid,
  p_assignee uuid,     -- the record's assignee, if any
  p_team uuid          -- the record's owning team, if any
) returns boolean
```

Resolution order — first match wins, most-open first:

1. `agency` → true for the caller's own agency
2. `division` / `department` → the record's team rolls up to the caller's scope ref
3. `team` → the record's team is one of the caller's teams
4. `assigned` → `p_assignee = auth.uid()`
5. `self` → only rows the caller authored
6. otherwise **false**

Each operational SELECT then gains one conjunct:

```sql
using (
  public.bes_may_fulfil(organization_id, outsourcing_group_id, 'creditops')
  and public.in_scope(agency_id, assigned_agent_id, team_id)     -- new
  or (public.org_has_product(...) and public.is_org_member(organization_id))
)
```

**Engagement and scope are both required, and answer different questions.**
Engagement: *may BES touch this organization's data for this service?* Scope:
*which BES people?* Neither substitutes for the other.

Records also need an owning team, so team-scoped users see unassigned work in
their queue: `fulfillment_clients.team_id`, `funding_clients.team_id`,
`work_items.team_id` — all nullable.

---

## 5. Migration implications

- **Additive.** New tables, nullable columns, a defaulted enum column.
- **The default is the risk.** `scope` defaulting to `'assigned'` would
  immediately narrow every existing agency user, including Dee. The migration
  must **backfill owners and admins to `'agency'` in the same transaction**, or
  the first person to log in afterwards sees an empty application.
- Existing enums and department values are untouched.
- No data is moved or deleted; historical attribution is unaffected.

## 6. Impact on the test users

| Account | Today | After |
|---|---|---|
| `bes.owner@` / `bes.admin@` | everything | unchanged — `agency` |
| `bes.manager@` | everything | `division` — needs a division assigned |
| `bes.lead@` | everything | `team` — needs a team |
| `bes.credit@` | 17 clients | ~4 — the ones assigned to them |
| `bes.restricted@` | 17 clients | **0** — finally a real restricted account |
| `org.*@` | unchanged | unchanged — organization scope is separate |

`bes.restricted@` currently proves nothing, because it reads everything. After
this it becomes the account that actually tests restricted access. The seed
needs teams and division assignments added at the same time.

## 7. Performance

The risk is real and avoidable.

- **`in_scope()` must be `STABLE`**, so Postgres evaluates it once per statement
  rather than per row.
- **Resolve the caller's scope once**, not per record: a small
  `my_scope()` returning `(scope, scope_ref, team_ids[])`, then set-based
  `= ANY(team_ids)` checks. No correlated subquery per row.
- **Index for it:** `(agency_id, team_id)` and `(agency_id, assigned_agent_id)`
  on each operational table.
- The frontend already resolves authorization once per session in
  `auth-context`; team memberships join that single batch — no new round trip
  and no N+1 (rule 14).

A team-scoped read becomes an index scan on `team_id`, which is *cheaper* than
today's agency-wide scan, not more expensive.

## 8. How this supports Custom Workspaces and TalentOps

This is the foundation those need, which is why it should come first.

- **Custom Workspaces** register as a `division`; each workspace's boards map to
  `teams`. Workspace permissions become team membership — no fourth permission
  system, satisfying rule 17's "one engine underneath".
- **TalentOps** is the case that proves the design: a BES agent placed into a
  customer's workspace needs *engagement* (may BES staff this organization?) and
  *scope* (which BES person, on which board?). The proposed
  `workspace_shares → team` link is exactly that pairing.
- **BES CRM** already works: BES-owned execution plus scope, with customer
  visibility handled by the activity model already built.
- **My Work, Time, Production, EOD, QA, Attention, Reporting** all read the same
  `in_scope()`, so a team lead's reporting narrows automatically instead of each
  surface re-deriving scope.

---

## Recommended sequencing

1. **Restore organization write access to `work_items`** — the live defect from
   the previous proposal, independent of this work.
2. Divisions / departments / teams / memberships (empty structure, no behaviour).
3. Seed the structure and assign the test users, so step 4 is observable.
4. `access_scope` + `in_scope()` + backfill owners to `agency`.
5. Apply the conjunct to CreditOps and FundingOps reads; verify with the test
   accounts.
6. Extend to work items, files, attention and reporting.

Steps 4–5 are where behaviour changes and where the backfill must be right.

## Open questions

1. **Should a team-scoped user see *unassigned* work in their team's queue?** I
   have assumed yes — otherwise nobody can pick work up. It is why records need
   a `team_id` rather than relying on assignment alone.
2. **Is "Division" a real BES org unit, or just CreditOps/FundingOps/etc.?** If
   the latter, `divisions` may be reference data rather than a managed table.
3. **Do you want a real `permissions` table**, or is role + scope enough? Today
   "Permission" is not modelled at all; adding it is a larger change than
   everything above and I would not do it unless a concrete need exists.

**Nothing implemented. Awaiting your direction.**
