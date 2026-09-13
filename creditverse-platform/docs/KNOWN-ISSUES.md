# Known incidents and regression protection

Every entry here is something that reached production, or nearly did, while
every automated check was green. They are recorded because the **failure class**
matters more than the individual bug, and because the defences that now exist
only make sense if you know what they were built against.

Format: what happened · why nothing caught it · the fix · what catches it now.

---

## 1. Ambiguous PostgREST relationship — Partner folders showed zero

**What happened.** The CreditOps partner tree rendered empty for every folder
while twenty live partners sat in the database. Dee found it: *"HOw I can add
clients in here now?"*

**Cause.** One select string:

```ts
.select("id,name,…,partner_contacts(full_name,is_primary)")
```

Two relationships connect `outsourcing_groups` and `partner_contacts`, so the
embed is ambiguous. PostgREST answers **PGRST201** and refuses the **whole
request** rather than choosing.

**Why nothing caught it.** The select is a **string**. `tsc` sees nothing; the
unit tests mock the data layer so the query is never issued; the build was
clean. The first thing that knew was Dee's screen.

**Fix.** Name the constraint:
`partner_contacts!partner_contacts_group_id_fkey(full_name,is_primary)`.
Two more of the same class were found and fixed in `positions.ts` and
`funding-domain.ts`. No data was lost.

**Regression coverage.** `npm run probe:shapes` — every embed in `src/` is sent
to the live API to be parsed. **53 shapes, 0 refused.**

---

## 2. `extensions.net.http_post` — a silent failure for four days

**What happened.** `ghl_outbound_dispatch()` ran every minute and sent nothing.
`cron.job_run_details` logged success the whole time.

**Cause.** `extensions.net.http_post` is a **three-part name**. Postgres reads it
as `database.schema.function`, so it parses, resolves to nothing, and fails at
run time — inside a function body, where nothing surfaces it. The bug had been
live since 2026-09-09.

**Why nothing caught it.** It is SQL inside a function. No type checker, no test
and no build step reads it, and the cron job's own status said "succeeded".

**Fix.** `net.http_post`. The same bug was found and fixed in the new billing
dispatcher before it shipped.

**Regression coverage.** `npm run probe:sql` fails if **any** function body in
`public` contains a three-part `net.` name, and separately checks that every
cron job's target function exists and is active.

---

## 3. Recurring invoices generated with a due date before the issue date

**What happened.** `billing_recurring_sweep` generated five real invoices **due
in the past**. The reminder sweep then did exactly what it should with an
overdue invoice and queued **fifteen escalating reminder emails to real
partners**.

Held within seconds. **Zero were sent.**

**Cause.** The schedule's period arithmetic could produce a due date earlier
than the issue date, and nothing forbade it.

**Fix.** A due date can never precede its issue date — **an invoice is never
born overdue**. The five invoices were repaired and the phantom reminder rows
deleted.

**Regression coverage.** Asserted in `billing-probe.mjs`. The queue-then-dispatch
architecture is itself part of the defence: the sweep only ever **queues**, so
there is a window in which a mistake is still recoverable.

---

## 4. A suspended Partner could not reach Billing

**What happened.** Suspension removed the pages a suspended partner most needs —
including the one where they could see what they owe.

**Fix.** Suspension removes **service** pages and keeps Overview, Actions
Needed, Messages, Billing, Agreements, Updates and Account Settings.
`whenSuspended` is a property of each nav item in `src/lib/portal/portal-nav.ts`.

**Regression coverage.** 10 tests on `navFor`, plus a live check that direct URL
access to a removed page is refused by the data layer rather than merely
unrouted.

---

## 5. An invoice could stay `Paid` without a payment supporting it

**What happened.** `partner_invoice_recompute` ended in `else v_current`. An
invoice hand-set to Paid, or left Paid after a refund, **stayed Paid** whatever
the ledger said.

**Fix.** The status is fully derived from the payment ledger; `paid` requires an
actual payment row. A status is not a place to record a fact the ledger does not
support.

**Regression coverage.** `billing-probe.mjs`, including the refund path.

---

## 6. Overpayment was counted twice

**What happened.** An invoice summed its payments without capping at its own
total, so a $25 overpayment sat on the invoice **and** on account credit. BES's
books were $25 better off than reality, per overpayment.

**Fix.** Payments are capped at the invoice total; the excess goes to account
credit only.

A related fault fixed at the same time: a receipt was composed **before**
reactivation ran, so it told the partner they were still suspended.
`lift_partner_suspension` now updates pending receipts.

**Regression coverage.** `billing-probe.mjs` — 85 checks, including both.

---

## 7. Importer files used the wrong entity type

**What happened.** Imported documents were filed against the wrong entity type,
so they did not appear where they belonged.

**Fix.** The importer writes the canonical `entity_type`/`entity_id` pair for
the record it is actually importing against.

**Regression coverage.** Entity-type assertions in the import path's tests.
More broadly: **never infer ownership from a name or a label** — use the stable
id and the explicit relationship.

---

## 8. `log_audit` unreachable from the browser — no audit rows for four months

**What happened.** `src/lib/data/organizations.ts` called `log_audit` three
times: organization created, organization updated, entitlement toggled. **Not
one of them ever wrote a row.**

**Cause.** Migration 0004 revoked `log_audit` from every client role — correctly,
for a real exposure ("a probe with no membership wrote an arbitrary row into
`audit_log`"). Three legitimate callers went with it. The calls never checked
their error, so the failure was silent. `audit_log` confirms it: 
`organization.branding_updated` rows exist, because that path calls `log_audit`
from **inside** the database; `organization.created` has never appeared.

**Why nothing caught it.** An `.rpc()` name is a string, a missing `EXECUTE`
grant is invisible to the client, and the result was discarded.

**Fix (migration 0337).** A trigger on `organizations` and `product_entitlements`
writes the audit row where the change happens — it cannot be forged by a caller
or skipped by a screen. Re-granting `log_audit` would have reopened the original
exposure. A no-op update writes nothing; a real one writes `before` and `after`.
Both verified live. The three dead client calls were deleted.

**Regression coverage.** `npm run probe:sql` fails any `.rpc()` whose function
`authenticated` cannot execute.

---

## 9. `set_payroll_settings` and `crm_project_board` executable by PUBLIC

**What happened.** Both carried a `PUBLIC` `EXECUTE` grant.

**Assessment.** Neither was exploitable. `set_payroll_settings` refuses a caller
without `payroll.manage` — and `auth.uid()` is null for `anon`, so it fails
safe. `crm_project_board` is `SECURITY INVOKER`, so RLS answers for it.

**Fixed anyway (migration 0337).** Migrations 0003/0004 established the rule: a
function is reachable through **two** grants, and leaving one in place means the
door is already open the day somebody relaxes an internal check.

**Regression coverage.** `npm run probe:sql` fails any app-called function
reachable by `anon` or `PUBLIC`, with three documented token-flow exceptions.

---

## 10. `invite_agency_member` had two signatures

**What happened.** Dee: *"I am adding a member so why am i seeing all the pending
invitation on the pop up page"* — the dialog was showing an error, not a list.
PostgREST was answering "Could not choose the best candidate function" for
**every** call.

**Cause.** A parameter gained a default. `create or replace function` then
created a **second** function rather than replacing the first.

**Fix.** `drop function` the 5-argument form. The same trap was hit on
`creditops_route_client` and pre-empted on `billing_period_due`.

**Regression coverage.** `npm run probe:sql` fails any `.rpc()` name that
resolves to more than one function.

---

## 11. Two sender names on outbound email

Dee: *"why is that one email is from Blessed Empire Services and another is from
BES"*. Supabase Auth's `smtp_sender_name` was "BES" while application mail used
the agency record. Aligned, and `billing-email` now reads the name **from the
database** rather than a constant.

---

## 12. Mentions vanished from plain-text renderings

`docToPlainText` used `n.text ?? inline(n.content)` — a mention node has
neither, so it silently disappeared from notifications and search text.
Platform-wide, and pre-existing. Fixed to render `@${label}`.

---

## Open / accepted

| Item | Status |
|---|---|
| `billing_reminder_schedule` has no RLS | **Accepted.** Five rows of reminder cadence, `SELECT`-only to `authenticated`, no tenant data |
| Funding deal documents show as a list, not previews | **Deferred — D-012.** The query returns no `path` or `mime_type`; fixing it is FundingOps UI work during a pause |
| Referrals page | **Not modelled.** Nav slot exists and is conditional; the route redirects. D-006 |
| Authorize.Net webhook | **Deliberately not deployed** until a Signature Key exists |
| `chunk larger than 500 kB` build warning | Cosmetic; code-splitting is a documented future improvement |

The full deferred backlog is `DEFERRED_AGENCY_WORK.md`; live-use defects go in
`PILOT_ISSUES.md`.
