# Simplifying the authorization model

**Dee, 2026-09-13:** *"Before changing production data, report how the existing
`scope` column can be migrated or reduced without breaking current
authorization."*

**Nothing was changed to produce this report.** It is a read of the live
database and the source.

---

## The headline

> **Every layer you described already exists as canonical data. `scope` does not
> add information — it *duplicates* it, less accurately, in one enum.**

The organizational hierarchy is already complete and already type-compatible:

```
team_memberships → teams.department_id → departments.division_id → divisions.service
```

`divisions.service` is a `fulfillment_service` — **the same type** as
`scope_division` and the same type `in_scope(p_division …)` is passed. Derived
from real membership rows today, with no schema change at all:

| Person | Derived division | Derived department |
|---|---|---|
| Alliana Catcha | `talentops` | Dedicated Support |
| Ivan L. Olympia | `creditops` | Complaints & Mailing |
| Dian Gallardo | `creditops` | Client Success / Support |
| Rowell Christian Pena | `bes_crm`, `talentops` | GHL / CRM Operations, Staff Management |
| Dee Gallardo, Bryan Breva | — (on no team) | — |

Rowell holding **two** divisions is worth noting: the derived model supports
multiple placements natively. A single `scope` enum never could.

So this is mostly a **removal**, not a build.

---

## What `scope` actually does today

`in_scope(p_agency, p_division, p_team, p_assignee, p_creator)` returns true if
**any** of these hold:

1. `is_admin_of(p_agency)` — checked **first**, before `scope` is read at all
2. `p_assignee = auth.uid()` — the record is assigned to you
3. the `scope` enum branch
4. `is_team_lead_of(p_team)` — supervision

Branch 3 is the only place `scope` is consulted:

| value | what it tests | already answered elsewhere by |
|---|---|---|
| `agency` | always true | **line 1** — every holder is an admin |
| `division` | `p_division = m.scope_division` | `divisions.service` via team membership |
| `department` | the record's team is in `m.scope_department_id` | `teams.department_id` via team membership |
| `team` | **reads `team_memberships` directly** | itself — the enum adds nothing |
| `assigned` | **no branch. Falls to `else false`** | **line 2**, unconditionally |
| `self` | `p_creator = auth.uid()` | could be line 2's sibling |

Read that table twice. `agency` is redundant with line 1. `assigned` is
redundant with line 2 **and broken**. `team` already reads the membership table
it is supposedly gating. Only `division` and `department` carry anything, and
both are derivable.

### Live distribution — the migration is small

| scope | profile | people |
|---|---|---|
| `agency` | manager / — | **4** (all `agency_admin`) |
| `assigned` | agent | **2** (Alliana, Ivan) |

The four on `agency` are admins, so **line 1 already carries them** — their
`scope` value changes nothing today. The two on `assigned` are the two agents,
and `assigned` grants nothing. **So `scope` is currently doing no useful work
for any real person**, which is exactly why Ivan sees an empty Main Client List.

### Blast radius

**13 policies** — `fulfillment_clients` (select/insert/update), `funding_clients`
(×3), `work_items` (×3), `production_logs` (×2), `crm_projects`,
`workspace_shares`.

**12 functions** — `can_work_fulfillment_client`, `can_write_work_item`,
`channel_shared_with_bes`, `client_birthdays`, `client_visible`,
`credit_client_writable`, `crm_create_project`, `crm_project_readable`,
`crm_template_readable`, `file_bes_in_scope`, `file_reviewer`,
`workspace_reach`.

`in_scope` is a core primitive. It must change **in place**, keeping its
signature, so none of those 25 call sites are touched.

---

## The five questions, and where each is answered

| Your question | Canonical answer today | Status |
|---|---|---|
| **Who are you?** | `agency_memberships.role` (`agency_admin` / `agency_user`) + `is_owner` | ✅ exists |
| **What division can you enter?** | `team_memberships → teams → departments → divisions.service` | ✅ derivable, not stored |
| **What departments are you in?** | `teams.department_id` | ✅ exists |
| **What teams are you on?** | `team_memberships` | ✅ exists |
| **Which partners may you work?** | `partner_assignments` via `can_see_partner()` | ✅ exists |
| **What capabilities?** | `resolve_agency_capability()` over `permission_keys` | ✅ exists |
| **Is this record yours?** | `p_assignee` / `p_creator` / `is_team_lead_of` | ✅ exists |

**Nothing new is required.** One helper is worth adding, because it is asked
everywhere and derived nowhere:

```sql
my_divisions() → setof fulfillment_service   -- from live team memberships
my_departments() → setof uuid
```

Both `SECURITY DEFINER`, pinned, cached per statement — the same shape as
`can_see_partner()`.

---

## The CreditOps Main Client List must leave `in_scope` entirely

This is the actual cause of Ivan's empty screen, and it is a **modelling** error
rather than a value error.

Your locked rule: *"All authorized CreditOps users may see the Main Client List
— from CreditOps division access + `creditops.clients.view`. NOT from partner
assignment, NOT from department, NOT from team."*

But `fulfillment_clients_select` gates the directory with
`in_scope(agency_id, 'creditops', team_id, assigned_agent_id, created_by)` —
a **per-record work** test. A directory is not work. That is why every scope
below `division` returns zero:

| Ivan's scope | Main Client List | Department work |
|---|---|---|
| `assigned` | **0** | 0 |
| `team` | **0** | 0 |
| `department` | **0** | 0 |
| `division` | 18 | 29 |
| `agency` | 18 | 29 |

**Setting agents to `division` would hide this by widening them** — your point 7,
and you are right to refuse it. The correct fix is to give the directory its own
predicate:

```sql
create function creditops_directory_visible(p_agency uuid) returns boolean as $$
  select public.is_admin_of(p_agency)
      or (  'creditops' in (select public.my_divisions())
        and public.agency_can('creditops.clients.view'));
$$;
```

and add it as an **OR branch** to `fulfillment_clients_select`. Additive: it can
only reveal the shared directory to authorized CreditOps staff, and takes
nothing from anyone. **Department queues keep `in_scope`** — they are work, and
must stay narrow.

---

## What `assigned` should mean

Your definition, and it is the right one: *"the record/partner/work item is
explicitly assigned to this user through the canonical assignment
relationship"* — **not** "this user may only ever see things assigned to them,
everywhere."

That is already what line 2 of `in_scope` does, **unconditionally, for
everybody**. So `assigned` does not need a branch — it needs to stop being a
scope at all. Closing the defect means **removing the value**, not implementing
it.

---

## Migration, in four safe phases

Each phase is separately deployable and separately reversible. No phase removes
access before its replacement is proven.

### Phase 1 — derive, and prove the derivation matches (no behaviour change)
Add `my_divisions()` and `my_departments()`. Add a probe asserting that, for
every real member, the derived division/department set matches what their
current `scope` grants, or is **wider only where the current value is broken**
(the two `assigned` agents). **Nothing is wired in.** Pure measurement.

### Phase 2 — unblock the directory (additive only)
Add `creditops_directory_visible()` and OR it into `fulfillment_clients_select`.
**Ivan can work.** Nobody loses anything. This alone clears the P1 that blocks
UAT, and it does it without touching a single person's `scope`.

### Phase 3 — teach `in_scope` to derive (behaviour-preserving)
Rewrite branch 3 to consult derived membership instead of the enum, keeping the
signature and all 25 call sites untouched:

```
is_admin_of                          (unchanged, line 1)
or p_assignee = auth.uid()           (unchanged, line 2 — this IS "assigned")
or p_creator  = auth.uid()           (was `self`)
or p_division in my_divisions()      (was `division`, now derived)
or record's team's department in my_departments()   (was `department`)
or record's team in my team memberships             (was `team`)
or is_team_lead_of(p_team)           (unchanged, line 4)
```

The enum stops being read. **`scope` still exists and still validates** — this
phase is reversible by one `create or replace`.

### Phase 4 — retire the column
Once phases 1–3 are green across the full matrix, drop `scope`, `scope_division`
and `scope_department_id`. **This is the only irreversible step**, and it should
wait until after UAT.

---

## Risk

| | |
|---|---|
| **Widening** | Phase 2 is additive by construction. Phase 3 must be proven equivalent per person before it lands — the Phase 1 probe is what proves it |
| **Narrowing** | The four admins are carried by line 1, not by `scope`. Verified |
| **Multi-placement** | Rowell already derives two divisions. The enum could only hold one — the derived model is *more* correct, and slightly wider for him. Worth your explicit sign-off |
| **People on no team** | Dee and Bryan derive nothing. Both are admins, so line 1 carries them. **A non-admin on no team would derive nothing and see nothing** — which is correct, and is why teams must be set before invitations go out |
| **Blast radius** | 13 policies + 12 functions, none of which need editing if the signature holds |

## Verification at each phase

```bash
npm test && npm run build && npm run probe
node supabase/scripts/creditops-routing-probe.mjs      # 45
node supabase/scripts/talentops-probe.mjs              # 18
node supabase/scripts/person-independence-probe.mjs    # 12
node supabase/scripts/rls-matrix.mjs                   # the full 70-phase gate
```

The matrix is mandatory before Phase 4, and before Phase 3 reaches production.

---

## Recommendation

**Do Phase 2 now.** It is additive, it clears the P1 that stops eight CreditOps
employees working the moment they accept, and it needs no decision about the
model. Phases 1 and 3 follow during stabilization; Phase 4 waits until after
UAT, because dropping a column is the one step that cannot be undone in an
afternoon.

**Awaiting your word before changing anything.**
