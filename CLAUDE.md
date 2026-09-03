# BES Platform — Project Rules

**These are permanent project rules. They override default behaviour and convenience.**
They apply to every file in this repository, every phase of the build, and every session.

When a rule conflicts with speed, the rule wins. When a rule is unclear in a
specific case, stop and ask rather than choosing the permissive interpretation.

**Project layout:** the application lives in `creditverse-platform/`. The backend
schema lives in `creditverse-platform/supabase/`. Current state and build order
are recorded in `creditverse-platform/BUILD_STATUS.md`.

---

## 1. Security first

- Tenant / sub-account isolation is **mandatory**.
- **Never rely on hidden UI for security.** Hiding a button is presentation, not protection.
- Authorization must be enforced in **data and API access**, not only in the interface.
- **Default to deny** when permission, role, scope, tenant, or assignment is unclear.
- Never expose secrets, passwords, tokens, private keys, SSNs, or sensitive files
  in logs, error messages, or frontend code.

> Enforced today by Row Level Security on every table, with `SECURITY DEFINER`
> helpers (`is_agency_staff`, `is_org_member`, `is_org_admin`, `can_view_org`,
> `can_view_work`). A UI change is never a sufficient security fix on its own.
>
> Learned the hard way in migrations 0003/0004: a function can be reachable by
> anonymous callers through **two** independent grants — Supabase's grant to
> `anon` and Postgres's default grant to `PUBLIC`. Revoking one leaves the door
> open. Verify against a live database; a clean parse proves nothing.

## 2. One canonical data model

- Do **not** create duplicate users, clients, businesses, cases, deals, files,
  activities, or work records just because multiple modules or views need them.
- Views and dashboards must query **canonical records**.
- CreditOps and FundingOps agency views may be **different surfaces of the same
  SaaS record** when connected — not copies of it.
- Manual external-system records remain clearly marked by **provenance**
  (`saas_pulled` vs `outsourcing_only`; `bes_saas_synced` vs `agency_manual`).

> Known outstanding violation: `pages/app/Clients.tsx` carries its own inline
> client array unrelated to `FulfillmentClient` and `FundingClient`. One person
> can appear under three shapes. This must be reconciled, not extended.

## 3. User and permission logic

Authorization is:

```
Role + Permission + Scope + Assignment
```

- Do **not** reduce permissions to role-name checks.
- A user may belong to **multiple departments or teams** where authorized.
- If a user cannot use something, **do not render it**.
- Direct URL or API access must **still deny it**. Both layers, every time.

## 4. Relationships

- Preserve **explicit** entity relationships.
- Never infer ownership or access from display names or email addresses alone.
- Use **stable IDs and foreign-key relationships**.
- **Historical attribution must not change** when current assignments change.
  Who did the work then stays who did the work, after reassignment.

## 5. No entangled code

- Keep **domain logic** separate from UI.
- Keep **data access** separate from components.
- Keep **permissions centralized**.
- Do not duplicate business rules across pages.
- Do not create giant components containing UI + database + permissions + calculations.
- Prefer small, reusable modules with a clear single responsibility.

> Current separation: domain logic in `src/lib/`, data access in `src/lib/data/`,
> authorization in the database plus `src/lib/auth/`. Components consume, never
> re-implement.

## 6. No duplicate or dead files

Before creating a new component, service, type, hook, utility, or model:

- **search for an existing implementation**
- reuse or improve it when appropriate
- do **not** create `V2`, `Final`, `New`, `Copy`, `Backup`, `Updated`, or parallel
  implementations of the same thing
- remove obsolete code **only after confirming it is unused**

> Unrouted legacy screens are parked in `src/_archive/` rather than deleted, and
> are excluded from the bundle. Nothing imports from there.

## 7. Performance

Prioritize fast load and responsive operations.

- fetch only the data needed for the **current view**
- **no N+1 queries**
- do not load hidden tabs
- lazy-load heavy modules
- paginate or virtualize large lists
- avoid unnecessary rerenders
- cache deliberately, not accidentally
- **indexes must support common production queries**
- **do not fetch an entire tenant dataset to calculate one card**

## 8. Visual integrity

- **Preserve the existing GHL AI Studio visual design** unless explicitly asked
  to change it.
- Do not casually replace layouts or components.
- No white text on light surfaces; no dark text on dark surfaces.
- No overlapping or clipped charts, labels, tables, menus, or controls.
- Responsive layouts must remain usable at supported widths.

## 9. Business logic

Critical calculations, permissions, lifecycle transitions, matching, production,
EOD, and compliance rules must be **deterministic code**.

AI may assist with explanation and drafting, but must **never** become the source
of truth for a deterministic decision.

> Deterministic engines already exist and are unit-tested: `lib/dispute/*`,
> `eod-production-engine.ts`, `score-*.ts`, `progress-report-logic.ts`.
> Extend these rather than re-deriving rules inside a component.

## 10. Auditability

Meaningful mutations must preserve:

- **actor**
- **timestamp**
- **tenant / context**
- **record**
- **previous value and new value** where applicable

Do **not** create noisy audit events for harmless UI actions.

> `activity_events` is append-only (no delete policy) and is written by database
> triggers on stage, assignee, and priority changes, so history cannot be skipped
> by a client.

## 11. Data safety

- Never silently overwrite historical operational records.
- Prefer **archive / void / status transitions** where history matters.
- Destructive actions require **explicit authorization and confirmation**.

## 12. Build discipline

Before implementing:

1. **inspect existing code**
2. **identify the canonical implementation**
3. **understand downstream relationships**
4. **make the smallest coherent change**
5. **run typecheck, build, and tests**
6. **report what changed and any remaining risk**

Report honestly: if something is unverified, say so. If a test fails, show the
output. Never describe seed or sample data as if it were real operational data —
label it in the interface.
