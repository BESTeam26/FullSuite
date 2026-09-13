# Database

Supabase project `wiojlgkzxlaiajwwrzuj`. Postgres 15 with RLS, pg_cron, pg_net
and Supabase Vault.

| | |
|---|---|
| Migrations | **393**, forward-only, in `supabase/migrations/` |
| Tables in `public` | **212** — **211** with RLS enabled |
| Policies | **475** |
| Functions | **783**, of which **422** are `SECURITY DEFINER` |

The one table without RLS is `billing_reminder_schedule`: five rows of reminder
cadence (day 1, 2, 3, 5 warning, 7 final), `SELECT`-only to `authenticated`, no
tenant data. It is reference data, deliberately readable. Everything else is
protected.

## Working with migrations

**Run every command from `creditverse-platform/`, never from the git root.**

```bash
npx supabase migration list      # compare local history with remote
npx supabase db push --dry-run   # what would be applied
npx supabase db push             # apply
```

From the root, the CLI creates a root-level `supabase/.temp` holding link state
but **no migrations**; a later `db push` then reports every applied version as
missing. That reads exactly like drift and invites a `migration repair` which
would falsify a correct history. The root `/supabase/` path is git-ignored so a
stray copy cannot be committed. **Diagnose before repairing.**

Naming: `YYYYMMDDNNNNNN_snake_case_description.sql`. Sequence numbers continue
the existing series; the latest is `20260913003700`.

## Postgres rules this codebase learned the hard way

Each of these has cost a real debugging session. They are listed because they
are not obvious and they will bite again.

- **`ALTER TYPE … ADD VALUE` cannot be used in the transaction that adds it.**
  Put the new enum value in its own migration, use it in the next.
- **A defaulted parameter creates an OVERLOAD, not a replacement.** `create or
  replace function f(a, b)` after `f(a)` exists leaves *two* functions.
  PostgREST then refuses **every** call with "Could not choose the best
  candidate function". You must `drop function` the old signature explicitly.
  This has happened three times: `creditops_route_client`,
  `invite_agency_member`, and pre-empted for `billing_period_due`.
  **`npm run probe:sql` now catches it.**
- **`create or replace view` may only APPEND columns** — never rename or
  reorder. Drop and recreate for anything else.
- **`create or replace function` cannot change a `returns table` signature.**
  Drop it first. `visible_channels()` was changed this way twice.
- **A view needs `security_invoker = true`** or it runs with the definer's
  rights and silently bypasses RLS.
- **`ON CONFLICT` cannot infer a PARTIAL unique index** without repeating the
  index predicate in the conflict target.
- **`now()` is transaction-constant.** Two timestamps written in one
  transaction are equal, so a `>` comparison is a coin toss. The billing
  suspension check uses `>=` so a tie goes to the payment.
- **`extensions.net.http_post` is a THREE-PART NAME.** Postgres reads it as
  `database.schema.function`, so it parses and fails at run time, inside a
  function body, silently. The correct call is `net.http_post`.
  **`npm run probe:sql` now catches it.**
- **PostgREST embeds are ambiguous when two relationships connect the tables**
  (PGRST201) and it refuses the **whole request**. Name the constraint:
  `partner_contacts!partner_contacts_group_id_fkey(full_name)`.
  **`npm run probe:shapes` now catches it.**
- **Every `SECURITY DEFINER` function must pin `search_path`** — otherwise it
  runs with the caller's, and a table it names may not be the table its author
  meant. **`npm run probe:sql` now catches it.**
- **A function is reachable through TWO grants** — Supabase's grant to `anon`
  and Postgres's default grant to `PUBLIC`. Revoking one leaves the door open.
  **`npm run probe:sql` now catches it** for every function the app calls.

## Canonical records

The full list with "do not create another table for this" is in
`docs/ENGINEER-HANDOFF.md`. The structure behind the important ones:

### Partner

```
outsourcing_groups                  the Partner (the ACCOUNT)
 ├── partner_contacts               people at the partner; portal identity
 ├── partner_services               what they bought (commercial line)
 ├── partner_assignments            which BES people/teams work the account
 ├── partner_credentials            their systems, encrypted (see docs/SECURITY.md)
 └── fulfillment_engagements        what BES is AUTHORIZED to do (the access record)
```

`partner_services` is commercial; `fulfillment_engagements` is authorization.
They are separate because a service can be sold before it is authorized, and
authorization can end while the commercial history stays.

### Client

```
clients                             the PERSON — one identity, many services
 ├── fulfillment_clients            their CreditOps file
 │    └── client_department_statuses  the work, per department
 └── funding_clients                their FundingOps file
```

A client is a directory entry. The work lives in the service-specific file.
Do not add "CreditOps fields" to `clients`.

### Work

```
workspaces → workspace_boards → work_items
                                  ├── work_checklist_items
                                  ├── work_item_blockers
                                  └── work_item_field_values
```

`work_items` is the **only** generic task engine. Customization —
`workspace_statuses`, `workspace_fields`, `workspace_item_types` — is **rows**,
not tables and not enums. A workspace never gets its own task table.

CreditOps is the deliberate exception: its work lives in
`client_department_statuses` because its domain model is fixed and its
correctness depends on that. See `docs/CREDITOPS.md`.

### Money

```
partner_invoices ─── partner_invoice_lines
        │
        └── partner_payments                  → balance is DERIVED, never set
                    │
                    ├── partner_account_credit_ledger   MONEY  (amount_cents)
                    └── partner_credit_ledger           UNITS  (quantity)
```

Two ledgers, and they are never summed. See `docs/BILLING.md`.

### History

`activity_events` is **append-only** — there is no delete policy — and is
written by database triggers on stage, assignee and priority changes, so a
client cannot skip it. `audit_log` is the equivalent for administrative
changes, and since migration 0337 organization and entitlement changes write
their own rows from a trigger rather than from the browser.

## Generated types

```bash
npm run db:types
```

Regenerate after any schema change. `src/lib/supabase/database.types.ts` is
committed. Note that generated types **do not** validate embed strings or RPC
argument names — that is what the probes are for.
