# Engineer Handoff — BES FullSuite

**Prepared 2026-09-13, from the current production state.** Nothing in this
package changed production behaviour; it documents what is running.

---

## What this system is

BES FullSuite is the internal and Partner-facing operating platform for
Blessed Empire Services.

It currently contains:

- **Agency HQ**
- **CreditOps**
- **FundingOps**
- **BES CRM**
- **TalentOps**
- **Sales & Marketing**
- **Partner Portal**
- **Communication**
- **Billing / Finance**
- **Teams / Access / Assignments**

It is a **single-agency** platform, not a multi-agency or reseller product. One
BES Agency HQ; unlimited customer organizations and BES Partners beneath it.

---

## Scale, so you know what you are taking on

| | |
|---|---|
| Migrations applied | **393**, all forward-only |
| Tables in `public` | **212** — 211 with RLS enabled |
| RLS policies | **475** |
| Functions in `public` | **783**, of which **422** are `SECURITY DEFINER` |
| Scheduled jobs (pg_cron) | **10** |
| Edge Functions | **14** |
| Unit tests | **1787** |
| Frontend | React 18 · TypeScript · Vite · Tailwind · shadcn/ui |
| Backend | Supabase — Postgres, Auth, RLS, Storage, Edge Functions |
| Hosting | Vercel, static build from `creditverse-platform/` |

**The authorization logic is in the database, not in the frontend.** That is the
single most important thing to internalise before changing anything. A React
change cannot secure this application and cannot break its security either —
but a migration can do both.

---

## Read these first, in this order

1. **`CLAUDE.md`** (repository root) — the permanent project rules. Not
   advisory: they are the constraints the codebase was built under, and they
   explain *why* several things are shaped the way they are.
2. **`docs/ARCHITECTURE.md`** — the shape of the system.
3. **`docs/AUTHORIZATION.md`** — how access is decided. Read before touching
   any policy or definer function.
4. **`docs/TESTING.md`** — **why `npm test` is not a sufficient gate.**
5. **`docs/KNOWN-ISSUES.md`** — the incidents that shaped the current defences.

---

## THE GATE — read this before you ship anything

```bash
npm test && npm run build && npm run probe
```

**`npm test`, `tsc` and `npm run build` are NOT sufficient gates for this
application.** All three can be perfectly green while production is broken.

They cannot see:

| What breaks | Why the build cannot see it |
|---|---|
| PostgREST query strings | `.select("a,b!fk(c)")` is a **string**. TypeScript never parses it |
| SQL function signatures | An `.rpc("fn", {...})` is a string plus an object |
| Function **overloads** | Adding a default parameter creates a *second* function; PostgREST then refuses **every** call |
| `EXECUTE` grants | A function nobody may execute looks identical in the client |
| `SECURITY DEFINER` + `search_path` | A runtime property of the function, not of the call |
| `pg_cron` job targets | A string in a database table |
| `pg_net` calls | `extensions.net.http_post` parses fine and fails silently, forever |

**`npm run probe` covers exactly those.** It is two scripts:

- `npm run probe:shapes` — extracts every PostgREST embed in `src/` and asks
  the live API to parse it. **Currently: 53 shapes, 0 refused.**
- `npm run probe:sql` — extracts every `.rpc()` call and checks it against
  `pg_proc`: one candidate function, arguments it actually has, all required
  ones supplied, `authenticated` may execute it, no accidental `anon`/PUBLIC
  grant. Then it checks every cron target exists, every `SECURITY DEFINER`
  function pins `search_path`, and no function body carries a three-part
  `net.` name. **Currently: 205 contracts, 0 failing.**

Plus three live acceptance probes, each running as **real authenticated users**
inside rolled-back transactions:

```bash
node supabase/scripts/partner-messages-probe.mjs   # 14/14
node supabase/scripts/billing-probe.mjs            # 85/85
node supabase/scripts/marketing-module-probe.mjs   # 48/48
```

A change to policies, definer functions or grants also warrants the RLS matrix
(`supabase/scripts/rls-matrix.mjs`) — see `docs/TESTING.md`.

---

## CANONICAL SOURCES — do not create another table for these

The most expensive mistake available in this codebase is adding a second table
for something that already has one. Several modules read the same record
through different authorized views; that is deliberate and it is the reason the
Partner Portal and the BES screens can never disagree.

| Concept | Canonical source | |
|---|---|---|
| **Partner** | `outsourcing_groups` | **DO NOT CREATE ANOTHER TABLE FOR THIS** |
| **Partner service engagement** | `partner_services` (commercial) + `fulfillment_engagements` (authorization) | **DO NOT CREATE ANOTHER TABLE FOR THIS** |
| **Partner module visibility** | derived from a **live** `fulfillment_engagements` row — never stored as a flag | **DO NOT CREATE ANOTHER TABLE FOR THIS** |
| **Partner assignments** | `partner_assignments` | **DO NOT CREATE ANOTHER TABLE FOR THIS** |
| **Client** | `clients` (the person) → `fulfillment_clients` (CreditOps file), `funding_clients` (FundingOps file) | **DO NOT CREATE ANOTHER TABLE FOR THIS** |
| **CreditOps department work** | `client_department_statuses` | **DO NOT CREATE ANOTHER TABLE FOR THIS** |
| **Individual department assignment** | `client_department_statuses.assigned_to` | **DO NOT CREATE ANOTHER TABLE FOR THIS** |
| **Generic workspaces / tasks** | `workspaces` → `workspace_boards` → `work_items` | **DO NOT CREATE ANOTHER TASK ENGINE** |
| **Campaigns** | `campaigns`, with content as `work_items` | **DO NOT CREATE ANOTHER TABLE FOR THIS** |
| **Files** | `files` + Supabase Storage (`bes-files`) | **DO NOT CREATE ANOTHER TABLE FOR THIS** |
| **Activity / comments** | `activity_events` (append-only, trigger-written) | **DO NOT CREATE ANOTHER TABLE FOR THIS** |
| **Communication** | `channels` → `messages` (+ `channel_members`, `message_reactions`, `message_pins`) | **DO NOT CREATE ANOTHER MESSAGE STORE** |
| **Invoices** | `partner_invoices` + `partner_invoice_lines` | **DO NOT CREATE ANOTHER TABLE FOR THIS** |
| **Payments** | `partner_payments` | **DO NOT CREATE ANOTHER TABLE FOR THIS** |
| **Account Credit (MONEY)** | `partner_account_credit_ledger` (`amount_cents`) | **DO NOT CREATE ANOTHER TABLE FOR THIS** |
| **Processing Credits (UNITS)** | `partner_credit_ledger` (`quantity`) | **DO NOT CREATE ANOTHER TABLE FOR THIS** |
| **Agreements / signatures** | `document_templates` → `document_instances` → `signature_requests` | **DO NOT CREATE ANOTHER TABLE FOR THIS** |
| **Partner Actions** | `partner_action_items` | **DO NOT CREATE ANOTHER TABLE FOR THIS** |
| **Announcements** | `announcements`, surfaced through Communication | **DO NOT CREATE ANOTHER TABLE FOR THIS** |

If a screen needs a different shape of one of these, the answer is a **view or
a `SECURITY DEFINER` projection**, never a copy. Details in
`docs/DATABASE.md`.

---

## The distinctions you must be able to explain

Dee's bar for owning this platform, and it is a fair one. If these are not
clear to you, start with `docs/ARCHITECTURE.md` and `docs/MODULES.md`:

- **Partner** vs **organization** — a Partner is a commercial relationship
  (`outsourcing_groups`); an organization is a SaaS tenant (`organizations`).
  A company can be either, both, or one without the other.
- **Engagement** — the record that *authorizes* BES to work on something. A
  SaaS subscription never grants it.
- **Workspace** vs **work item** — a workspace is a configurable container the
  customer owns; a work item is one unit of work in the single canonical engine.
- **Department work** vs **work item** — CreditOps work lives in
  `client_department_statuses`, a fixed domain model; generic work lives in
  `work_items`. They are not the same engine, on purpose.
- **Partner assignment** vs **team membership** — an assignment says who works
  *this account*; membership says which team someone is on. Assignment can be
  to a person **or** to a team.
- **Capability** — a permission key resolved by `resolve_agency_capability()`;
  not a role name.
- **Invoice** vs **payment** — an invoice is what is owed; a payment is money
  received. The invoice's state is **derived** from its payments, never set.
- **Account Credit** vs **Processing Credit** — money versus units. Different
  tables, different columns, never summed together.

---

## Policy in force

- **Feature development is stopped.** The platform is in live validation
  (`LIVE_VALIDATION_CHECKLIST.md`).
- **Authorize.Net production charging is OFF** and stays off until Dee
  approves it in writing, separately. See `docs/INTEGRATIONS.md`.
- **A human technical lead is the deployment gatekeeper.** AI assistance may
  continue to write code; it is not the final authority on whether production
  is safe.
- **Permanent Delete is Owner-only.** Financial surfaces are Owner-gated;
  admin is not financial access. See `docs/AUTHORIZATION.md`.

---

## Where everything lives

```
BES-Platform/                       git root
├── CLAUDE.md                       permanent project rules — read first
├── vercel.json                     build, SPA rewrites, security headers
└── creditverse-platform/           THE APPLICATION — run every command here
    ├── src/
    │   ├── components/             UI
    │   ├── pages/                  routed screens
    │   └── lib/
    │       ├── data/               data access (repositories + react-query hooks)
    │       ├── auth/               client-side authorization context
    │       ├── dispute/  fulfillment/  partners/  portal/  crm/   domain logic
    │       └── supabase/           client + generated types
    ├── supabase/
    │   ├── migrations/             393 files, forward-only
    │   ├── functions/              15 Edge Functions
    │   └── scripts/                probes and the RLS matrix
    └── docs/                       this package
```

---

## The handoff package

| Document | What it answers |
|---|---|
| `docs/ARCHITECTURE.md` | How the system is shaped and why |
| `docs/DATABASE.md` | Canonical records, the rules of a migration |
| `docs/AUTHORIZATION.md` | Who may do what, and where that is decided |
| `docs/SECURITY.md` | The security model and its current posture |
| `docs/MODULES.md` | What each module is and who owns execution |
| `docs/CREDITOPS.md` | Queues, statuses, routing, SLA |
| `docs/SALES-MARKETING.md` | Content lifecycle, campaigns, approvals |
| `docs/PARTNER-PORTAL.md` | Pages, partner-safe projections, what must never leak |
| `docs/BILLING.md` | Invoices → payments → balance → reminder → suspension |
| `docs/COMMUNICATION.md` | Channels, DMs, threads, `visible_channels()` |
| `docs/INTEGRATIONS.md` | Resend, Anthropic, Lob, Authorize.Net, GHL, ClickUp |
| `docs/BACKGROUND-JOBS.md` | Every scheduled job, its failure mode |
| `docs/DEPLOYMENT.md` | How code reaches production, and how to roll back |
| `docs/ENVIRONMENT.md` | Every variable and secret **name** |
| `docs/TESTING.md` | The gate, and what each layer can and cannot catch |
| `docs/KNOWN-ISSUES.md` | Incidents, fixes, and the regression coverage each produced |
| `docs/DECISIONS.md` | Product and architecture decisions that are settled |
| `docs/ACCESS-CHECKLIST.md` | Accounts a new engineer needs, at what level |
| `docs/FIRST-WEEK.md` | A five-day onboarding plan |
