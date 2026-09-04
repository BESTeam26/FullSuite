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

> Partly addressed: the CreditOps SaaS client list no longer carries its data
> inline — it reads `lib/clients/client-seed.ts` and is labelled "Sample data"
> in the interface. **Still outstanding:** those records remain a third shape of
> a person, unrelated to `FulfillmentClient` and `FundingClient`. Reconciling
> them onto the canonical record needs the Phase 6 backend. Do not extend them.

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

## 13. Code quality / no spaghetti code

**This project will be reviewed and maintained by a professional development team.**
Code must be easy to read, trace, debug, test, and hand off.

### Hard rules

- No spaghetti code.
- No giant files that mix unrelated responsibilities.
- No business logic buried inside UI components.
- No duplicated logic across pages.
- No deeply nested conditionals when clearer abstractions are possible.
- No mystery helper functions with unclear names.
- No hidden side effects.
- No circular dependencies.
- No copy/paste implementations for similar features.
- No temporary hacks that become permanent architecture.
- No commented-out dead code left behind.
- No meaningless names like `data2`, `tempFinal`, `handleThing`, `miscUtils`, `newVersion`.
- No files named `Final`, `Final2`, `Copy`, `New`, `Updated`, `Backup`, `Test2`, etc.

### Layers

Dependencies point **downward only**. A lower layer never imports an upper one.

```
UI / Components
  → application / use-case logic
    → domain / business logic
      → data / services / repositories
        → database / integrations
```

In this repository that maps to:

| Layer | Location |
|---|---|
| UI / Components | `src/components/`, `src/pages/` |
| Application / use-case | `src/lib/*-context.tsx`, `src/lib/data/use-*.ts` |
| Domain / business logic | `src/lib/bes-domain.ts`, `src/lib/dispute/`, `src/lib/fulfillment/*-domain.ts`, `src/lib/eod-production-engine.ts`, `src/lib/score-*.ts` |
| Data / repositories | `src/lib/data/` |
| Database / integrations | `supabase/migrations/`, `src/lib/supabase/` |

Keep each module focused on **one responsibility**.

### Prefer

- small readable functions
- descriptive names
- typed interfaces
- explicit inputs and outputs
- reusable domain services
- centralized permission logic
- centralized status / lifecycle logic
- centralized constants and enums where appropriate

### Comments

For complex logic, add short comments explaining **why** the rule exists — not
obvious line-by-line comments explaining what the code does.

### Traceability

Every important feature must be traceable from:

```
UI action → handler / use case → domain rule → data mutation → audit event
```

If any link in that chain is missing or cannot be pointed at, the feature is not done.

### Before adding new code

Check whether the same responsibility already exists elsewhere.

**If an implementation becomes difficult to explain simply, stop and refactor
before adding more features.**

Optimize for **maintainability and troubleshooting, not cleverness**.

A developer unfamiliar with this project should be able to inspect the codebase
later and understand where permissions, business rules, data access,
integrations, and UI behaviour live.

> Rule 5 states the separation requirement; this rule defines the standard the
> separation is held to and how it is verified at review time.

## 14. Performance first / no request waterfalls

**Performance is an architectural requirement, not a later optimization.**

This application previously suffered from excessive server, database and auth
round trips. **Do not recreate that architecture.**

### Hard rules

- Minimize network and database round trips.
- Avoid **sequential request waterfalls**.
- Never resolve authentication repeatedly during one request or navigation when
  the existing verified context can be safely reused.
- Resolve tenant, user, role, permissions, scope and assignments **once**, then
  reuse that authorization context.
- Never repeatedly query the same permissions or grants during one operation.
- **No N+1 queries.**
- Never query related records one-by-one when they can be fetched in a bounded
  or batched query.
- Fetch only the data required for the **currently visible screen**.
- Do **not** preload hidden tabs, unopened drawers, dialogs, secondary panels,
  or optional workflows.
- Lazy-load secondary or heavy functionality when requested.
- Do not fetch an entire tenant dataset to calculate a small dashboard metric.
- Use **server-side** filtering, sorting and pagination for large datasets.
- Use appropriate database indexes for common filters, joins, tenant scope,
  statuses, assignments and dates.
- Avoid duplicate API calls caused by multiple components independently
  requesting the same canonical data.
- Share and cache request data **deliberately** when safe.
- **Parallelize** independent requests when multiple requests are genuinely necessary.
- Prefer well-shaped queries and endpoints that return what the screen needs,
  rather than many tiny dependent requests.
- Do not over-fetch large objects, files, activity histories, documents or
  relationships when only summaries are currently needed.

### Target interaction pattern

```
User action
  → resolve authorization context
    → minimal bounded data request(s)
      → render
        → lazy-load secondary data only when requested
```

### Never

```
User action
  → auth
  → auth again
  → permissions
  → permissions again
  → record
  → per-record enrichment
  → hidden tab queries
  → modal queries
  → duplicate related queries
  → render
```

### Pre-completion inspection

Before completing any significant page or feature, inspect its data-loading path for:

1. duplicate requests
2. sequential waterfalls
3. N+1 queries
4. unnecessary hidden data
5. excessive payload size
6. unnecessary rerenders
7. repeated authorization or database resolution

**Do not trade security or correctness for speed.** Optimize the architecture so
security, correctness and performance work together.

**If a proposed implementation creates excessive back-and-forth calls, STOP and
redesign the data flow before implementing it.**

> Current state, verified rather than assumed:
>
> - **Authorization resolves once per session.** `auth-context` fetches profile
>   plus agency, org and external memberships in a **single parallel batch**, on
>   auth state change only — not per request, per route or per component. Every
>   consumer reads the cached context.
> - **Organizations load in one bounded request.** A single nested select returns
>   organizations with their businesses, entitlements and memberships; user
>   preferences load in parallel alongside it. No per-organization follow-ups.
> - **Duplicate calls are collapsed by query key.** `useAttention` is called by
>   both the HQ dashboard and its attention panel; the shared key
>   `["work","attention"]` means one request serves both. Reuse existing keys
>   rather than inventing near-duplicates.
>
> Fixed: `updateOrganizationBranding` no longer reads, merges in memory, then
> writes. It calls one `jsonb` merge in SQL. The round trip was the smaller
> half — read-modify-write across a network is a **lost update**, where two
> people editing different fields silently discard one of the changes. Treat
> that shape as a correctness bug, not just a slow one.
>
> Rule 7 states the performance requirements; this rule defines the request
> patterns that satisfy them and the inspection that proves it.

## 15. Visual contrast, hover, focus and interaction states

All UI elements must remain readable and visually clear in **every state** —
buttons, badges, pills, tabs, cards, inputs, dropdowns, menus, table rows and
cells, links, icons, tooltips, banners, modals, selected rows, active
navigation, and disabled/loading states.

### Hard contrast rules

- Never white/light text on white/light backgrounds.
- Never dark text on dark backgrounds.
- Never let an inherited text colour become unreadable on a different surface.
- Coloured buttons and badges must set an intentional, readable foreground.
- Muted text must still be readable.
- Disabled states must remain legible.
- Do not rely on borders or colour differences that are too subtle to see.

### Hover

Hover must **improve** clarity, never reduce it.

- Text and icons stay readable; foreground keeps contrast against the new background.
- Do not turn a light button into another light surface with white text.
- Do not turn a dark element into a dark surface with dark text.
- Do not make content disappear or hide important labels.
- No abrupt layout shifts, and no dimension changes that move neighbouring elements.
- No aggressive scaling.

Prefer a small background change, slight border emphasis, subtle shadow, or a
minor translate — with a smooth transition and stable layout.

### Focus

Keyboard focus must be **clearly visible**.

- Never remove focus indication without replacing it.
- The focus ring must contrast with the surrounding surface.
- Focus must not make text unreadable.
- Focused elements stay distinguishable.

### Active / selected

Active sidebar items, selected tabs, rows, filters and toggles must be obvious
**and** readable. Never a selected state where the text or icon disappears, or
where background and foreground converge.

### Disabled

Disabled does **not** mean invisible. A disabled control stays readable, looks
inactive, keeps sufficient contrast, and never looks broken or missing.

### Loading

Loading preserves layout. No flashing text, no disappearing controls, no major
layout shift, no unreadable skeletons.

### Light / dark

Every interaction state must work in **both** themes where both are supported.
Never assume a hover colour that only works in one.

### Design tokens

Use semantic tokens — background, foreground, muted foreground, primary /
primary-foreground, secondary / secondary-foreground, accent / accent-foreground,
destructive / destructive-foreground, border, focus ring. Do not scatter
hardcoded text/background combinations across components.

### Visual QA before completion

Inspect, every time: **default, hover, focus, active/selected, disabled,
loading, and both themes.** If any state produces poor contrast, hidden content,
clipping, overlap or layout shift, fix it before reporting completion.

**Visual polish is not complete until every interactive state is readable,
stable, obvious and consistent at first glance.**

> This is the rule that catches what a screenshot of the default state hides.
> A control that reads perfectly at rest can still be unusable the moment a
> keyboard user tabs to it or a pointer hovers it.
>
> Rule 8 protects the existing GHL AI Studio design from being casually
> replaced; this rule governs how that design must behave once a user touches
> it. They are not in tension: preserving a layout does not license leaving a
> hover state that erases its own label.

## 16. Platform and tenancy architecture (permanent doctrine)

```
BES Platform
  → One BES Agency HQ
    → Unlimited Customer Organizations / Sub-Accounts
      → Organization Users
        → Modular Product Entitlements
```

**BES is NOT a multi-agency or reseller platform.** Customers may refer new
customers to BES, but they cannot create agencies, resell, or repackage the
platform. **Do not redesign the platform for multiple agencies.**

### Customer organizations

Each has its own `organization_id`, users and memberships, roles and
permissions, teams and assignments, branding, enabled modules, configuration,
internal KPI definitions and targets, and configurable operational rules where
permitted.

Module access is **entitlement-driven**, and entitlement is enforced in data
access, not only in the interface:

| Organization | Entitled to |
|---|---|
| A | CreditOps + FundingOps + Operations |
| B | FundingOps + Operations |
| C | CreditOps only |

**Do not render a module the organization is not entitled to use** — and do not
serve its records either.

### One source of truth

Do **not** create duplicate copies of the same client, business, case, funding
deal, work item, document or operational record merely because BES Agency HQ and
a sub-account both need to see it.

When both contexts are authorized, use **one canonical record with controlled
views and scoped access**:

```
Canonical Client Record
  → visible in the Customer Organization
  → visible in BES Agency HQ when BES provides fulfillment
```

If BES updates an authorized shared record the customer sees the same current
state, and the reverse. **Build around canonical shared data + scoped access,
not duplicated records + constant synchronization.**

Every meaningful change preserves: audit history, actor, source/context of the
change, timestamp, organization, assignment, and previous/new values where
applicable.

### KPI ownership

Customer internal KPIs and BES fulfillment KPIs are **not** automatically the
same.

- A customer organization **may** define its own internal KPIs, targets and rules.
- BES Agency HQ defines BES operational and fulfillment KPIs.
- Where BES provides fulfillment, **BES owns the KPIs that measure BES
  performance**; the customer cannot modify those definitions or targets, but
  may still define separate internal KPIs for its own team.

Both calculate actual performance from **canonical operational data**. Never
duplicate operational records to support a different KPI definition.

### Fulfillment is not subscription

An organization subscription and a BES fulfillment relationship are **separate
concepts**. A company may use SaaS only, SaaS plus BES fulfillment, or eligible
modules without BES fulfillment.

**BES Agency HQ access to an organization's operational records depends on the
authorized fulfillment/service relationship and permissions** — not on being BES
staff alone.

### Security

`organization_id` is the primary SaaS tenant boundary. Enforce, in order:

```
authenticated user
  → organization membership
    → role
      → permission
        → scope / assignment
          → entitlement
            → record authorization
```

**Never trust an `organization_id` supplied by the frontend as proof of access.**
It may narrow a query; it may never widen one. BES Agency HQ privileges must be
explicitly authorized and audited.

### Branding

Organizations may customize approved branding — logo, colours, organization
identity, and appropriate customer-facing presentation. **Brand customization
does not create another agency or a reseller platform.**

> On the agency layer that already exists: `agency_id` columns and the
> `is_staff_of(agency)` helpers are a **safety net, not a reseller feature**.
> There is one agency row and there is meant to be one. They stay because
> defence in depth costs nothing here and a blanket "is staff anywhere" check
> is the weaker default — but no work should be done to support a second
> agency, and `organization_id` is the boundary that matters.
