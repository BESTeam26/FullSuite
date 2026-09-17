# The canonical billing chain

**Status: LOCKED. Approved by Dee, 2026-09-17.**

Payment UAT has not started — it is blocked on one missing key (§7).
Production charging is off. Sandbox charging has not been exercised.

Dee's rule, 2026-09-17, which everything below serves:

> **FullSuite owns the billing lifecycle. Payment providers only execute payment.**

---

## 1. The chain (§38)

```
Partner  (outsourcing_groups)
  │
  ├── Billing contact ─────────── partner_contacts · partner_billing_email()
  │
  ▼
Service Engagement  (partner_services)
  │
  ▼
Billing Terms  (partner_service_billing — effective-dated, never overwritten)
  │
  ├──────────────────────────┬───────────────────────────┐
  ▼                          ▼                           ▼
Recurring generator     Manual invoice            Instalment plan
billing_recurring_sweep   createInvoice()      partner_billing_schedule
  │  cron 05:10 daily        Finance UI              → becomes an invoice
  │  one per (billing_id, period_key)
  └──────────────────────────┴───────────────────────────┘
                             │
                             ▼
              CANONICAL INVOICE  (partner_invoices + partner_invoice_lines)
                 invoice_number   unique per agency, from a sequence
                 due_date         >= issue_date, by constraint
                 status           written ONLY by partner_invoice_recompute
                 balance          invoice_balance_cents() — derived, always
                             │
                             ▼
              Collection method  invoice_collection_method()  ← derived
                 ├── card_one_time   Accept.js nonce, no card kept
                 ├── card_on_file    partner_payment_profiles
                 ├── autopay         same card, separate consent
                 ├── paypal          manual rail
                 ├── wise            manual rail
                 └── manual          bank transfer, other
                             │
                             ▼
              PAYMENT ATTEMPT  (partner_card_charges)
                 idempotency_key   unique — a retry is not a second charge
                 provider_txn_id   unique — an event is recorded once
                 status            pending · approved · declined
                                   held_for_review · error · UNKNOWN
                             │
                   ┌─────────┴─────────┐
                   ▼                   ▼
             Authorize.Net        Manual confirmation
             (sandbox today)      Finance records it
                   │                   │
                   └─────────┬─────────┘
                             ▼
              CANONICAL PAYMENT LEDGER  (partner_payments)
                 the ONLY source of "collected"
                             │
                             ▼
              partner_payments_sync_invoice  → partner_invoice_recompute
                             │
      ┌──────────┬───────────┼────────────┬──────────────┐
      ▼          ▼           ▼            ▼              ▼
   Receipt   Account     Reminder     Suspension    Reactivation
             credit      engine       (partner      (billing_
  (billing_  (partner_   day 1/2/3/   lifecycle)    reactivation_
   email_    account_    5/7 final)                  sweep)
   outbox)   credit_
             ledger)
```

Finance, the Partner profile, the Partner Portal and Reports are **views of this
one chain**. There is no `portal_invoices`, no provider-specific invoice copy,
and no second recurring scheduler.

**Processing credits (`partner_credit_ledger`) sit outside this diagram entirely.**
They are rounds, not money. That ledger has no money column at all, and no
figure in Finance touches it.

---

## 2. Inspection (§39)

31 billing tables, 82 functions, 10 triggers, 5 cron jobs, 9 views, 6 Edge
Functions.

### FINAL SOURCE OF TRUTH

| Concern | Canonical | Notes |
|---|---|---|
| Partner | `outsourcing_groups` | `lifecycle` carries suspended/archived |
| Service | `partner_services` | |
| Billing terms | `partner_service_billing` | effective-dated; a rate change inserts, never overwrites |
| Invoice | `partner_invoices` + `partner_invoice_lines` | one table for every creation path |
| Balance | `invoice_balance_cents()` | derived, never stored independently |
| Payment attempt | `partner_card_charges` | card only; manual payment has no attempt phase |
| Payment | `partner_payments` | the only source of "collected" |
| Account credit (money) | `partner_account_credit_ledger` | |
| Processing credits (units) | `partner_credit_ledger` | not money, never in AR |
| Reminders | `partner_invoice_reminders` | unique on (invoice, stage) |
| Suspension | `partner_suspensions` + `partner_suspension_invoices` | episodes, not a flag |
| Exceptions | `billing_attention` view | the only exception projection |
| Unmatched money | `payment_matching_review` view | |
| Email | `billing_email_outbox` | one row per message that should exist |

### REUSE AS-IS

`partner_invoices`, `partner_invoice_lines`, `partner_payments`,
`partner_service_billing`, `partner_billing_models`, `partner_invoice_reminders`,
`billing_reminder_schedule`, `partner_suspensions`,
`partner_suspension_invoices`, `partner_account_credit_ledger`,
`partner_credit_ledger`, `billing_email_outbox`, `partner_payment_methods`,
`partner_payment_channels`, `partner_billing_schedule`, `agency_expenses`,
`agency_expense_templates`, `payroll_cutoffs`, `payroll_settings`,
`invoice_balance_cents`, `next_invoice_number`, `billing_period_*`,
`apply_account_credit`, `lift_partner_suspension`, `billing_reactivation_sweep`,
`partner_billing_email`, the `my_partner_*` portal readers, and the
`billing_attention` / `payment_matching_review` / `billing_terms_needing_rate`
views.

### EXTENDED (this session)

- `billing_recurring_sweep` — skips paused services and suspended partners; queues the invoice email
- `partner_invoice_recompute` — now the single writer of paid total and status
- `record_partner_payment` — refuses a void invoice
- `suspend_partner` — gated on the session, not on an argument
- `mark_overdue_invoices` — no longer writes; asks the recompute
- `billing_attention` — proactive missing-billing-email, plus `payment_unknown` and `autopay_failed`
- `billing_email_outbox` — new `invoice` kind
- `finance_overview` — reads `billing_attention` instead of re-deriving it

### ADDED (this session, no new tables)

`invoice_collection_method()`, `invoice_is_overdue()`, `queue_invoice_email()`,
`partner_invoices_guard_derived()`, and the `due_date >= issue_date` constraint.

### DUPLICATES RETIRED

| Retired | Because |
|---|---|
| `finance_unmatched_payments()` | duplicated the `payment_matching_review` view — I wrote it without checking |
| Attention derived in TypeScript | duplicated `billing_attention` — dashboard and queue could disagree |
| `match_partner_payment(uuid, uuid)` | a duplicate of the 3-arg original; made every call ambiguous |

### SEPARATE, NOT DUPLICATE

`organization_subscriptions`, `payment_methods`, `payment_transactions` and the
`payments` Edge Function are the **SaaS subscription** side — a different
customer paying for software, not a partner paying for fulfilment. All empty.
They share a processor and nothing else, and must not be merged (rule 16).

### CONFLICTING LOGIC FOUND

| | Conflict | Resolved |
|---|---|---|
| §4 | Two writers of invoice status, oscillating on a late part-paid invoice | One writer |
| §5 | `amount_paid_cents` directly writable | Refused by trigger |
| §30 | Pausing a service did not stop billing | Sweep checks service status |
| — | Account credit counted as collected revenue | Excluded from cash figures |

---

## 3. Acceptance (§40)

`node supabase/scripts/billing-architecture-probe.mjs` — **55 checks, all pass.**
Every one builds its own partner, service, terms, contact and invoice inside a
transaction that is rolled back. Nothing was sent to Authorize.Net.

All twenty of Dee's criteria pass, plus nine invariants of the chain itself.

Alongside: billing 89 · card payments 65 · Finance 27 · certification 41 ·
money boundary 6 · sql-contract 225. 1974 unit tests.

---

## 4. Decided: `overdue` stays stored

**Dee, 2026-09-17: "Keep `overdue` stored for now. Do NOT refactor it to fully
derived before payment UAT."**

The correctness rule is satisfied — one authoritative writer controls invoice
payment status. `invoice_is_overdue()` remains the canonical predicate for
reads and logic where the derived answer is the right one, but no 15-function /
4-view refactor is opened for tidiness.

**Deferred:** evaluate the derived-`overdue` migration after billing/payment
UAT and production stabilization. Recorded in `DEFERRED_AGENCY_WORK.md`.

The rule as it stands:

- `paid` — nothing owed
- `partially_paid` — something paid, something owed
- `overdue` — **nothing** paid and past due
- `sent` — nothing paid, not yet due

So "partially paid" outranks "overdue" on the same invoice. Every query that
looks for money owed reads all three together, and Finance's ageing is computed
from `due_date`, never from this column.

---

## 4b. Permanent invariants (accepted)

These are locked. A change to any of them is an architecture change, not a fix.

| # | Invariant | Enforced by |
|---|---|---|
| 1 | A paused service generates no new invoices | `billing_recurring_sweep` |
| 2 | A due date can never precede its issue date | `partner_invoices_due_after_issue_ck` |
| 3 | A void invoice cannot collect, by any path | `begin_partner_card_charge`, `record_partner_payment` |
| 4 | Payment state cannot be forged by editing `amount_paid_cents` | `partner_invoices_guard_derived` |
| 5 | Issuing an invoice queues a real delivery | `queue_invoice_email` |
| 6 | A missing billing contact surfaces before an email fails | `billing_attention` |
| 7 | Collection method is explicit | `invoice_collection_method()` |
| 8 | Suspension cannot bypass authorization with a null actor | `suspend_partner`, gated on `auth.uid()` |
| 9 | One writer of invoice status | `partner_invoice_recompute` |
| 10 | Applying account credit is not fresh collected revenue | `finance_overview` |
| 11 | One Billing Attention projection | `billing_attention` view |
| 12 | One Payment Matching projection | `payment_matching_review` view |
| 13 | One `match_partner_payment` | 3-arg form only |
| 14 | Signed-out callers cannot execute protected functions | explicit `revoke ... from public` |
| 15 | **[TEST] data never enters a financial figure** | `is_fixture` honoured in reporting |
| 16 | **Sandbox and production autopay see disjoint partners** | `partner_autopay_due(environment)` |

15 and 16 were added after approval, to make UAT possible without risking real
money. Both are asserted by probes.

---

## 5. Not built, and not pretended

- **Proration.** A mid-cycle price change affects future invoices only. Issued invoices do not move. There is no proration and nothing claims there is (§29).
- **Credit notes.** Corrections are void + reissue, or account credit. No adjustment-note document.
- **Refunds through the provider.** `refund_amount_cents` records a refund; nothing calls Authorize.Net to issue one.
- **Usage-based invoicing (§3C).** `partner_credit_ledger` records rounds, but no generator turns them into invoice lines.
- **ARB.** Deliberately not used. One billing clock (§12).
- **Company-wide payment-method and billing settings pages.** Configured per partner today; the Finance sections say so rather than showing an empty page.

---

## 7. UAT prerequisites — one item outstanding

Measured against the live project, not assumed:

| Prerequisite | State |
|---|---|
| `AUTHNET_ENV` | **sandbox** ✓ |
| `AUTHNET_API_LOGIN_ID` | set ✓ |
| `AUTHNET_TRANSACTION_KEY` | set ✓ |
| `AUTHNET_SIGNATURE_KEY` | set ✓ (was already there since 2026-09-05) |
| **`AUTHNET_PUBLIC_CLIENT_KEY`** | **MISSING — this is the blocker** |
| `AUTOPAY_DISPATCH_SECRET` | not set; needed only for the cron-driven sweep |
| Production charging | OFF |
| AutoPay production switch | OFF (`partner_autopay_enabled` absent from the vault) |

Confirmed by asking the deployed function, which answers:

```json
{"connected": false, "environment": "sandbox",
 "missing": ["AUTHNET_PUBLIC_CLIENT_KEY"]}
```

`AUTHNET_PUBLIC_CLIENT_KEY` is Dee's to fetch: Authorize.Net → Account →
Settings → Security Settings → **Manage Public Client Key**. It is public by
design — Accept.js puts it in the page — and it is the only thing standing
between here and step 1 of UAT.

## 8. The [TEST] world

`node supabase/scripts/uat-fixtures.mjs create` builds five partners, each for
one row of the UAT order. Every one is named `[TEST] …`, carries
`is_fixture = true`, and uses a `bes.test` address, which is a reserved TLD that
cannot receive mail.

`is_fixture` is load-bearing: the recurring generator skips them, sandbox
autopay sees only them, production autopay never does, and no figure in Finance
counts them. `uat-fixtures.mjs destroy` removes them and only them, matched on
three conditions.

**Caution that still applies:** a sandbox charge is approved without money
moving. Against a `[TEST]` invoice that is the point. Against a real one it
would mark it paid and email a real receipt — which is why the fixtures exist
and why sandbox autopay cannot reach a real partner.
