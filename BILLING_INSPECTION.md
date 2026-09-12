# Partner Billing Engine — what already exists, and what is actually missing

Inspection only, 2026-09-13, as Dee asked: *"First inspect current FullSuite
structures… Tell me what can be reused. Then build the smallest canonical
extension. Do not create duplicate invoice/payment tables if FullSuite already
has them."*

**Headline: FullSuite already owns billing.** The canonical tables, the enums,
the invoice numbering, the totals recalculation and the payment→invoice link
all exist and are very close to the model in the brief. They are also almost
empty — 1 invoice, 0 payments — so this is a foundation to build on, not a
migration of live money.

---

## 1. Reuse as-is

| What | Where | Note |
|---|---|---|
| Invoice | `partner_invoices` | `invoice_number`, issue/due date, subtotal / discount / tax / total / **`amount_paid_cents`**, status, provider, `external_invoice_id`, `sent_at` / `paid_at` / `voided_at`. Already the "FullSuite owns the invoice, provider ids hang off it" shape |
| Line items | `partner_invoice_lines` | description, quantity, unit label, unit amount, links to service and schedule |
| **Payment ledger** | `partner_payments` | provider, `provider_transaction_id`, amount, `paid_on`, status, method, source, **`reconciled_at`**, **`reconciliation_state`**, `refund_amount_cents`, `recorded_by`. The reconciliation columns the brief asks for are already here |
| Installments / schedule | `partner_billing_schedule` | `kind`, `sequence`, `due_on`, amount, status, `invoice_id` |
| Billing terms per service | `partner_service_billing` | payment channel, frequency, invoice day, rate, **`autopay`**, `effective_from`/`to`, `superseded_by`. 7 live rows |
| Catalogues | `partner_billing_models`, `partner_payment_channels` | rows, not enums — new models need no migration |
| Totals | `partner_invoice_recompute(invoice)` | recalculates an invoice from its lines and payments |
| Ledger → invoice | `partner_payment_touches_invoice()` trigger | a payment already updates its invoice. **Balance is derived, not typed** — §7 is largely satisfied |
| Numbering | `next_invoice_number(agency)` | `INV-####` per agency |
| Scheduler | pg_cron, 6 jobs live | `due_date_sweep`, `sla_sweep`, `payroll_auto_sweep` are the idempotent-sweep pattern §27 needs. Reuse it; do not invent a second scheduler |
| Money boundary | owner-gated capabilities | The six partner-money keys are already owner-only, proved by `money-boundary-probe.mjs`. §25 is done |
| Card handling | `supabase/functions/payments` | Accept.js nonce → customer profile → charge. **No PAN, no CVV ever reaches the server or the database.** §26 is already satisfied for cards |

### Enums that already match the brief

- `partner_invoice_status` — `draft · scheduled · sent · partially_paid · paid · overdue · void · cancelled`
- `partner_payment_provider` — includes **`wise`** and **`paypal_personal`** already
- `partner_payment_status` — `pending · succeeded · failed · refunded`
- `partner_billing_authority` — `bes · authorize_net_arb · ghl · paypal · manual` (already models *who collects*)
- `partner_lifecycle` — already has `suspended`

---

## 2. The gaps — this is the actual build

Ordered by what blocks what.

| # | Gap | Size |
|---|---|---|
| 1 | **Suspension does nothing.** Zero RLS policies reference `lifecycle`. A suspended partner's work is in every queue, every My Work, every assignment sweep, exactly as before. §17 and §18 are entirely unbuilt — and they are the heart of the brief | Large |
| 2 | **No reminder engine.** `mark_overdue_invoices()` exists but **is not scheduled** and only flips a status. No Day 1/2/3/5/7 sequence, no idempotency store, no delivery | Large |
| 3 | **No partner credit ledger.** `ai_credit_ledger` is per-organization AI credits — a different thing. §11 needs `partner_credit_ledger` with derived balance | Medium |
| 4 | **No recurring invoice generation.** `partner_service_billing` records the terms; nothing turns them into invoices on a schedule | Medium |
| 5 | **Authorize.Net is organization-scoped, not partner-scoped.** It charges `organization_subscriptions` via `payment_methods` / `payment_transactions`. Partners need their own profile link. **No webhook endpoint at all**, no ARB recurring, no refunds | Large |
| 6 | **No Payment Matching Review** (§23) | Small |
| 7 | **Partner Portal has no Billing** (§24) | Medium |
| 8 | **No manual payment recording UI** for Wise / PayPal — the ledger accepts it; nothing writes it (§4, §5, §22) | Small |
| 9 | `partner_invoice_status` has no **`refunded`** (§12) | Trivial |
| 10 | **No reactivation path** (§20) — restoring held work through each module's own routing | Medium |

---

## 3. Two things I could not inspect, and will not guess

**Wise and PayPal account capability.** There are no Wise or PayPal credentials
in this platform, so I cannot test from here what Dee's Personal accounts
actually expose. Her own finding stands and the design follows it: **manual
recording first for both**, over the canonical ledger that already exists. If
a supported API path appears later it automates reconciliation *into* that
ledger rather than replacing it.

**Authorize.Net webhook signing.** `AUTHNET_ENV` is read by the payments
function but no signature key is configured, and secrets are not readable from
here. A webhook endpoint is worthless until that key exists — §6 says verify
the signature, and an endpoint that skips verification is an open door that
credits invoices.

---

## 4. Recommended order

1. **Refunded status + partner credit ledger** — small, unblocks §11 and §12
2. **Suspension as a real state**, and what it does to queues and My Work — the
   heart of the brief, and the one that changes agents' daily work
3. **Reminder engine** on the existing sweep pattern, with idempotency
4. **Recurring invoice generation** from `partner_service_billing`
5. **Manual payment recording** (Wise, PayPal, bank, other) + Payment Matching Review
6. **Partner Portal → Billing**, including the suspended view that still lets them pay
7. **Authorize.Net for partners** — profiles, ARB, webhook, reconciliation — last,
   because it needs credentials and is the only part that can double-charge

Steps 1–6 need nothing from outside the platform. Step 7 needs keys.

---

## 5. Do not

- Do not create a second invoice or payment table. They exist and are correct.
- Do not let a provider status become FullSuite's invoice vocabulary (§12).
- Do not store a typed balance. It is derived today; keep it derived (§7).
- Do not delete assignment rows to clear a suspended partner from a queue (§18).
  Hold the work; keep the history.
- Do not build PayPal or Wise API automation against a Personal account (§5).
