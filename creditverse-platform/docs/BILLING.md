# Billing

**FullSuite is the billing source of truth.** Not a spreadsheet, not the payment
provider, not GHL.

## The canonical model

```
Invoice  →  Payment Ledger  →  Balance  →  Reminder  →  Suspension  →  Reactivation
```

Each arrow is derived from the one before it. Nothing in that chain is
hand-set.

| Concept | Table |
|---|---|
| Invoice | `partner_invoices` |
| Invoice lines | `partner_invoice_lines` |
| Payments | `partner_payments` |
| Billing schedule | `partner_billing_schedule` |
| Billing model per partner | `partner_billing_models`, `partner_service_billing` |
| Reminders issued | `partner_invoice_reminders` |
| Reminder cadence (config) | `billing_reminder_schedule` |
| Email queue | `billing_email_outbox` |
| Suspensions | `partner_suspensions`, `partner_suspension_invoices` |
| Payment methods / channels | `partner_payment_methods`, `partner_payment_channels` |
| **Account Credit — MONEY** | `partner_account_credit_ledger` (`amount_cents`) |
| **Processing Credits — UNITS** | `partner_credit_ledger` (`quantity`) |

## The two ledgers are not the same ledger

> **Account Credit = MONEY.** Dollars the partner has with BES — an
> overpayment, a refund, a goodwill adjustment. Column: `amount_cents`.
>
> **Processing Credits = UNITS.** Rounds or client-processing allowances they
> bought. Column: `quantity`.

**They are never added together, never displayed as one number, and never
stored in one table.** Dee named this as the distinction to lock before going
further, and it is the easiest thing in the system to get wrong because both
are called "credits" in conversation.

## An invoice's state is derived

`partner_invoice_recompute()` recalculates status from the payment ledger. Three
bugs found and fixed here, all worth knowing:

- The function once ended in `else v_current` — so an invoice hand-set to Paid,
  or left Paid after a refund, **stayed Paid** regardless of the ledger. Closed.
- **Overpayment was counted twice**: the invoice summed payments without capping
  at its total, so $25 sat on the invoice *and* on account credit. Now capped;
  the excess goes to account credit only.
- **An invoice is never born overdue.** A due date can no longer precede its
  issue date — see `docs/KNOWN-ISSUES.md`.

`paid` requires an actual payment row. A status is not a place to record a fact
the ledger does not support.

## The reminder engine

Invoice-balance driven, **not "N days elapsed"**. `billing_reminder_sweep()`
runs hourly and asks what is actually outstanding.

| Day | Stage | Says |
|---|---|---|
| 1 | `day_1` | Payment reminder |
| 2 | `day_2` | Second reminder |
| 3 | `day_3` | Third reminder |
| 5 | `day_5_warning` | Payment warning — still unpaid |
| 7 | `day_7_final` | **Final** — service will be placed on hold |

The day-7 message says, in the same breath, that **nothing is deleted**. That is
true and it is deliberate: a partner who fears losing their data stops talking
to you. Dee, 2026-09-13: *"Do not say data will be deleted. It will not be."*

**A settled invoice stops the email** — a reminder already queued for an invoice
that has since been paid is not sent.

## Email delivery

The sweep **queues**; it does not send.

```
billing_reminder_sweep()  → writes billing_email_outbox rows (in transaction)
billing_email_dispatch()  → pg_net → billing-email Edge Function → Resend
```

An HTTP call has no business inside the sweep's transaction: a slow provider
would hold a lock on the invoice table and a failed one would roll back a
reminder that had already been decided.

Idempotency is `dedupe_key`, unique on the outbox; only `pending` and `failed`
rows are claimed. Running the dispatcher twice in a minute sends nothing twice.

The Edge Function authenticates with a Vault secret compared in **constant
time** (a `!==` on a secret leaks its prefix to anyone patient enough to
measure). It reads the sender name from the **agency record**, not a constant —
hard-coding it is how one email said "Blessed Empire Services" and the next said
"BES".

Delivery state is carried on the reminder row itself, so "was this one emailed?"
is answered without a join.

## Suspension and reactivation

Nonpayment suspension is real: it stops work. `billing_reactivation_sweep()`
lifts it when the balance settles, and `lift_partner_suspension()` updates any
pending receipt so it tells the truth about reactivation.

**Suspension removes work from active queues without deleting history.** The
partner keeps Billing, Agreements, Messages, Updates, Actions Needed and Account
Settings in their portal — the pages they need in order to fix the situation.

A tie in timestamps goes to the payment: the check uses `>=` because `now()` is
transaction-constant.

## Recurring invoices

`billing_recurring_sweep()` runs daily at 05:10 UTC and generates invoices from
`partner_billing_schedule`. Conflict handling repeats the partial-index
predicate, because `ON CONFLICT` cannot infer one.

**This sweep once generated five real invoices due in the past**, which
immediately queued fifteen escalating reminder emails. Held within seconds, zero
sent. See `docs/KNOWN-ISSUES.md`.

## Manual payment and matching

Wise and PayPal are recorded manually. A payment that cannot be matched to an
invoice goes to **Payment Matching Review** rather than being guessed at, and
the receipt says plainly that it has not yet been matched.

**Never store a raw card number, CVV, PayPal password or Wise password.**
Payment *methods* record how to pay, not credentials.

## Finance

**Management → Finance** (`/app/finance`) is one place to see **every invoice
across every partner** — the Invoices tab. Same records as the partner's own
Billing page and the portal's; one invoice, three views, never a copy.

Finance is **Owner-gated**, along with every partner-money capability. Admin is
not financial access. See `docs/AUTHORIZATION.md`.

## Authorize.Net

**PRODUCTION CHARGING IS OFF.** See `docs/INTEGRATIONS.md` for what exists and
what is still required. Do not enable live charging without Dee's explicit,
separate approval.

## Verification

```bash
node supabase/scripts/billing-probe.mjs          # 85 live checks
node supabase/scripts/money-boundary-probe.mjs   # the owner-gating boundary
```
