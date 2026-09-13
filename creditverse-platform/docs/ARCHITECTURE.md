# Architecture

## The shape

```
Browser (React SPA, static on Vercel)
        │  supabase-js, anon key
        ▼
Supabase PostgREST  ──►  Postgres + Row Level Security     ◄── the authority
        │                       ▲
        │                       │ SECURITY DEFINER helpers
        ├──► Supabase Auth      │
        ├──► Supabase Storage (bes-files, policy-gated)
        └──► Edge Functions (Deno) ──► Resend · Anthropic · Lob · Authorize.Net · GHL
                     ▲
                     │ pg_net + pg_cron
                     └── the database calls out on a schedule
```

There is **no application server**. The frontend is a static bundle. Every rule
that matters — tenancy, roles, capabilities, scope, assignment, entitlement,
engagement — is enforced in Postgres.

**Consequence:** a UI change can never be a security fix, and a migration can
be a security incident. Weight your review accordingly.

## Layers, and the direction dependencies point

Downward only. A lower layer never imports an upper one.

| Layer | Location |
|---|---|
| UI / components | `src/components/`, `src/pages/` |
| Application / use-case | `src/lib/*-context.tsx`, `src/lib/data/use-*.ts` |
| Domain / business logic | `src/lib/bes-domain.ts`, `src/lib/dispute/`, `src/lib/fulfillment/*-domain.ts`, `src/lib/partners/`, `src/lib/portal/`, `src/lib/eod-production-engine.ts`, `src/lib/score-*.ts` |
| Data / repositories | `src/lib/data/` |
| Database / integrations | `supabase/migrations/`, `supabase/functions/` |

Domain modules are pure: no React, no network. That is what makes the business
rules testable without a database, and it is why the 1787 unit tests are worth
having even though they cannot see the runtime failures described in
`docs/TESTING.md`.

## Tenancy: three relationships, never conflated

This is the distinction the whole platform rests on.

| | Relationship | What exists |
|---|---|---|
| 1 | **SaaS only** | The customer subscribes to BES software. Own organization, users, branding. **Not a BES Partner.** BES does not see their operational data |
| 2 | **SaaS + BES fulfillment** | Subscribes **and** separately buys BES fulfillment. Only this connects authorized organization data to BES's workspace |
| 3 | **Fulfillment without SaaS** | Hires BES for outsourcing while keeping their own CRM. A Partner with **no** organization |

Because model 3 exists, **BES Agency is operationally independent of
organizations, and a Partner is not a subclass of an organization.**

```
SaaS subscription        ≠  fulfillment authorization
fulfillment relationship ≠  ownership of the customer's whole organization
BES staff status         ≠  unrestricted customer-data access
```

The record that carries the authorization is `fulfillment_engagements`: the
agency, the partner (an organization **or** an `outsourcing_groups` row —
exactly one), the service in scope, status, effective dates, and an authorized
team. `bes_may_fulfil()`, `bes_engaged_with()` and `engagement_is_live()` read
it. When an engagement stops being live, access ends **by itself** — there is no
revocation job to forget.

## One canonical record, many authorized surfaces

There is no `organization_client` → `agency_client`, no `organization_task` →
`agency_work_order`, no `portal_invoice`. The Partner Portal and the BES screens
read the **same rows** through different policies.

`work_items_select` is the clearest example — one table, three audiences:

- BES reads an organization's work only under `bes_engaged_with()`, narrowed by `in_scope()`
- the organization's own people read the same rows through `org_scope_allows()`
- an organization reads BES-owned `bes_crm` work about itself through `subject_organization_id` + `is_org_admin` + `org_entitled`

**Two tables holding one truth is how one truth becomes several.** When a screen
needs a narrower shape, the answer is a view or a `SECURITY DEFINER` projection.

## Performance architecture

The application previously suffered from request waterfalls. The current shape,
verified rather than assumed:

- **Authorization resolves once per session.** `auth-context` fetches profile
  plus agency, org and external memberships in a single parallel batch, on auth
  state change only. Every consumer reads the cached context.
- **Organizations load in one bounded request** — one nested select returns
  organizations with businesses, entitlements and memberships.
- **Duplicate calls collapse by query key.** Reuse an existing key rather than
  inventing a near-duplicate. `["portal","services"]` serves both the Partner
  Portal's Services page and its Messages page for exactly this reason.
- **Signed URLs are batched per bucket** — a page of twenty document previews is
  one signing request, not twenty (`src/lib/data/use-file-previews.ts`).

The rule that matters most: **never read-modify-write across the network.** That
is not merely slow, it is a lost update. `updateOrganizationBranding` does a
`jsonb` merge in SQL for this reason.

## Frontend conventions

- **Theme:** a light operational workspace with dark branded navigation. The
  dark palette exists but is dormant; `:root` declares `color-scheme: light` so
  browser furniture stays light on a dark-mode machine. Do not enable dark mode
  for the workspace without being asked.
- **Routing:** `src/App.tsx`. Agency at `/app/*`, Partner Portal at
  `/partner/*`, public signing at `/sign/:token`.
- **Data access:** react-query throughout. Repositories in `src/lib/data/*.ts`,
  hooks in `src/lib/data/use-*.ts`.
- **`src/_archive/`** holds unrouted legacy screens, excluded from the bundle.
  Nothing imports from there. Do not delete it without classifying what it
  references — see `COMPLETION_REGISTER.md`.
