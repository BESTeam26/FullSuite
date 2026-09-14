# `in_scope()` — old vs new

**Phase 3, step one.** `in_scope_next()` is deployed and **called by nothing**.
Production behaviour is unchanged. This is the matrix you asked to see before
the swap.

Both functions were called with **identical inputs, as the same authenticated
user**, inside transactions that were rolled back. Shapes that do not exist in
production were constructed inside the rollback, so every case is measured
rather than predicted.

Reproduce with `node supabase/scripts/in-scope-matrix.mjs`.

---

## The matrix

| # | Shape | Old | New | Expected | Changed |
|---|---|---|---|---|---|
| 1 | Agency Admin | `true` | `true` | `true` | — |
| 2 | User, one Division | `false` | **`true`** | `true` | **CHANGED** |
| 3 | User, two Divisions | `false` | **`true`** | `true` | **CHANGED** |
| 4 | User, one Department | `false` | **`true`** | `true` | **CHANGED** |
| 5 | User, multiple Departments | `false` | **`true`** | `true` | **CHANGED** |
| 6 | User, one Team | `false` | **`true`** | `true` | **CHANGED** |
| 7 | User, multiple Teams | `false` | **`true`** | `true` | **CHANGED** |
| 8 | Personally assigned record | `true` | `true` | `true` | — |
| 9 | Assigned, no placement at all | `true` | `true` | `true` | — |
| 10 | Creator / self | `false` | `false` | `false` | — |
| 11 | Team Lead | `true` | `true` | `true` | — |
| 12 | Removed membership | `false` | `false` | `false` | — |
| 13 | Inactive (archived) team | `false` | `false` | `false` | — |
| 14 | No organizational placement | `false` | `false` | `false` | — |
| 15 | Not agency staff at all | `false` | `false` | `false` | — |
| **16** | **CreditOps user, TalentOps record** | `false` | `false` | `false` | — |
| **17** | **CreditOps user, FundingOps record** | `false` | `false` | `false` | — |
| **18** | **Same division, another department's team** | `false` | `false` | `false` | — |
| **19** | **Placed, record has no division or team** | `false` | `false` | `false` | — |
| **20** | **Record assigned to somebody else** | `false` | `false` | `false` | — |

**Every change is a widening (2–7), and every denial holds (12–20).**

Rows 16–20 are the ones that matter. Since all six changes grant, the real
question is not whether the new model grants — it is whether it grants anything
it should not. **It does not.** A CreditOps user reaches no TalentOps record, no
FundingOps record, no other department's team, nothing when there is nothing to
match on, and nothing assigned to somebody else.

### Why 2–7 change

All six are the same cause. The test user's `scope` is `assigned`, **a value
`in_scope` has no branch for**, so the old function returned `false` for every
organizational question regardless of where the person actually works. The new
function derives placement from live membership, so it answers `true` for the
division, department and teams they are genuinely in.

This is not the new model being generous. It is the old enum denying access
that your model says people should have: *"Agency User → access derived from
Division / Department / Team."*

Row 3 is worth noting separately: **the enum could hold one division. Rowell
holds two.** Derivation expresses that; a single column never could.

### Row 10, and the one judgement call

`self` scope granted creator access. Making `p_creator = auth.uid()`
unconditional would be defensible — you made the record, you can see it — but
it is a **widening**, and you said not to widen because the new model is
cleaner. So the new function **omits it**. Nobody holds `scope = 'self'` today,
so nothing changes. **If you want creator access as a standing rule, say so and
it is one line.**

### Two enum values are dropped, both with zero holders

- **`agency`** — always-true. Every holder today is an `agency_admin`, and
  line 1 (`is_admin_of`) already carries them. A **non-admin** holding it would
  lose everything; there are none.
- **`self`** — as above.

---

## What it does to real people

The new logic was pointed at `in_scope` **inside a transaction and rolled
back**, then every real person was measured across five gated surfaces.

| Person | Role | Clients | Queue | Work items | Production | Funding |
|---|---|---|---|---|---|---|
| Alliana Catcha | user | 0 | 0 | 0 | 0 | 0 |
| Bryan Breva | admin | 19 | 30 | 23 | 38 | 3 |
| Dee Gallardo | admin | 19 | 30 | 23 | 38 | 3 |
| Dian Gallardo | admin | 19 | 30 | 23 | 38 | 3 |
| **Ivan L. Olympia** | user | 19 | 5 | **0 → 2** | 0 | 0 |
| Rowell Christian Pena | admin | 19 | 30 | 23 | 38 | 3 |

> ### One cell changes out of thirty.

**Alliana unchanged at zero everywhere.** **Every admin unchanged.** **Rowell's
oversight unchanged, and finance still refused.** Ivan's client list and
department queue — the two Phase 2 stabilised — **unchanged at 19 and 5**.

### The single delta, examined

Ivan gains **two work items**, both `[TEST]` fixtures, both `division =
creditops`:

| Title | Division | Team | Why he gains it |
|---|---|---|---|
| `[TEST] Round 2 dispute prep` | creditops | Team Daniel | division branch |
| `[TEST] Bureau escalation` | creditops | Team Ally | division branch |

They belong to **other teams, in other departments**. He reaches them because
he is a CreditOps user and they are CreditOps work — the *division* layer of
your model, not the department layer.

**This is what the old `scope = 'division'` would have granted** had anyone set
it. It is the intended layer, restored.

**It is also the one thing worth your explicit word**, because it is a real
grant to a real person. Two readings are defensible:

1. **Keep it.** `work_items` is the generic work engine, not the CreditOps
   department queue — that queue is `client_department_statuses`, and Phase 2
   already holds Ivan to his own 5 rows there. Division-level visibility of
   division work is your model working.
2. **Narrow it.** If a CreditOps agent should only ever see *their department's*
   work items, the division branch comes out and department/team/assignee carry
   it. Ivan would go back to 0.

**Recommendation: keep it.** Your own layering names Division as a level of
access, the department queue is separately and correctly narrow, and the only
rows affected today are two fixtures.

---

## Status

- `in_scope_next()` deployed, **called by nothing**
- `in_scope()` **unchanged** — the 25 callers see no difference
- `scope`, `scope_division`, `scope_department_id` **untouched**, deprecated in
  documentation only
- Full gate green

**Nothing is promoted. Awaiting your word on the one delta.**
