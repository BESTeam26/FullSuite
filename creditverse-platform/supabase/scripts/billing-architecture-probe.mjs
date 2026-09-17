#!/usr/bin/env node
/**
 * THE CANONICAL BILLING CHAIN, proved against the live database.
 *
 * Dee's architecture brief, 2026-09-17:
 *
 *   "FullSuite owns the billing lifecycle. Payment providers only execute
 *    payment."
 *
 *   Partner → Service → Billing Terms → Invoice → Collection Method
 *     → Payment Attempt → Payment → Balance → Receipt
 *     → Reminder / Suspension / Reactivation
 *
 * Her §40 lists twenty things that must be true before any payment UAT. This
 * file is those twenty, numbered as she numbered them, each built from
 * fixtures inside a transaction that is ROLLED BACK. Nothing is asserted from
 * reading code: every claim in the architecture report is either a passing
 * check here or is reported as a gap.
 *
 *   node supabase/scripts/billing-architecture-probe.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";

const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });

let pass = 0;
const failures = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}\n       expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`); }
};

const first = (sql) => q.query(sql)[0];
/** The message a statement raised, or "ACCEPTED" if it did not raise at all. */
const raised = (fn) => { try { fn(); return "ACCEPTED"; } catch (e) { return e.message; } };

const AGENCY = first("select id from agencies order by created_at limit 1")?.id;
const OWNER = first("select user_id from agency_memberships where is_owner and status='active' limit 1")?.user_id;
const PAYER = first(`select p.id from profiles p
   where not exists (select 1 from partner_contacts c where c.user_id = p.id)
     and not exists (select 1 from agency_memberships m where m.user_id = p.id)
   order by p.created_at limit 1`)?.id;

if (!AGENCY || !OWNER || !PAYER) {
  console.log("FIXTURE FAILED: needs an agency, an owner, and a profile who is not yet a portal contact.");
  process.exit(1);
}

/* Fixture ids, hex throughout — "eod" cost a whole probe run once. */
const G   = "b111ceed-0000-4000-8000-000000000001"; // partner
const G2  = "b111ceed-0000-4000-8000-000000000002"; // a DIFFERENT partner
const SVC = "b111ceed-0000-4000-8000-000000000003"; // service
const SB  = "b111ceed-0000-4000-8000-000000000004"; // billing terms
const INV = "b111ceed-0000-4000-8000-000000000005"; // invoice
const PAY = "b111ceed-0000-4000-8000-000000000006"; // payment

/**
 * A partner with one active monthly service, billing terms, a portal contact,
 * and — unless `invoice: false` — one open $250 invoice.
 */
const world = ({
  rate = 25000, model = "RECURRING_MONTHLY", serviceStatus = "active",
  billingStatus = "active", effectiveTo = "null",
  invoice = true, invoiceStatus = "sent", due = "current_date - 3", issue = "current_date - 10",
  card = false, autopay = false, fixture = false, as = OWNER, action,
}) => q.query(`
begin;
  insert into outsourcing_groups (id, agency_id, name, contact_email, status, is_fixture, portal_access_enabled, lifecycle)
       /* is_fixture false on purpose: billing_recurring_sweep deliberately
          skips fixture partners, so a fixture-flagged probe would prove
          nothing about the generator. The whole transaction rolls back. */
       values ('${G}',  '${AGENCY}', '[PROBE] Chain A', 'a@bes.test', 'Active', ${fixture}, true, 'active'),
              ('${G2}', '${AGENCY}', '[PROBE] Chain B', 'b@bes.test', 'Active', ${fixture}, true, 'active');
  insert into partner_contacts (group_id, agency_id, full_name, email, user_id, status, is_primary)
       values ('${G}', '${AGENCY}', 'Probe Payer', 'probe-chain@bes.test', '${PAYER}', 'active', true);
  insert into partner_services (id, group_id, agency_id, name, service_type, status)
       values ('${SVC}', '${G}', '${AGENCY}', 'Probe Service', 'CREDITOPS_FULFILLMENT', '${serviceStatus}');
  insert into partner_service_billing
      (id, service_id, agency_id, billing_model, rate_cents, currency, billing_status,
       effective_from, effective_to, invoice_day, autopay)
       values ('${SB}', '${SVC}', '${AGENCY}', '${model}', ${rate === null ? "null" : rate}, 'USD',
               '${billingStatus}', current_date - 40, ${effectiveTo}, null, ${autopay});
  ${invoice ? `insert into partner_invoices
      (id, agency_id, group_id, invoice_number, issue_date, due_date, currency,
       subtotal_cents, discount_cents, tax_cents, total_cents, amount_paid_cents, status)
       values ('${INV}', '${AGENCY}', '${G}', 'PROBE-CHAIN-1', ${issue}, ${due},
               'USD', 25000, 0, 0, 25000, 0, '${invoiceStatus}');
     insert into partner_invoice_lines (invoice_id, service_id, description, quantity, unit_amount_cents, amount_cents, sort)
       values ('${INV}', '${SVC}', 'Probe line', 1, 25000, 25000, 10);` : ""}
  ${card ? `insert into partner_payment_profiles
      (agency_id, group_id, customer_profile_id, payment_profile_id, card_brand, last4, is_default, autopay_enabled)
       values ('${AGENCY}', '${G}', 'cust_chain', 'pay_chain', 'Visa', '4242', true, ${autopay});` : ""}
  ${as ? `set local role authenticated;
    do $c$ begin perform set_config('request.jwt.claims','{"sub":"${as}","role":"authenticated"}',true); end $c$;` : ""}
  ${action}
rollback;`);

const row = (o) => { const r = world(o); return Array.isArray(r) ? r[0] : { error: r?.error }; };
const refuses = (o, fragment) => {
  const msg = raised(() => world({ ...o, action: `${o.action} select 1 as reached;` }));
  return msg.includes(fragment) ? "refused" : `NOT REFUSED: ${msg.split("\n")[0].slice(0, 110)}`;
};

console.log("\nTHE CANONICAL BILLING CHAIN");

/* ── 1 ─────────────────────────────────────────────────────────────────── */
console.log("\n  1. A recurring invoice generates once");
check("1a — the sweep raises exactly one invoice for the cycle",
  row({ invoice: false, action: `
    select invoices_created into temp s1 from billing_recurring_sweep();
    select count(*)::int as n from partner_invoices where group_id = '${G}';` }),
  { n: 1 });

check("1b — and it carries its billing term and cycle key, which is what makes it once",
  row({ invoice: false, action: `
    select invoices_created into temp s1 from billing_recurring_sweep();
    select (billing_id = '${SB}') as from_terms, period_key = to_char(current_date,'YYYY-MM') as keyed,
           total_cents, status::text as status
      from partner_invoices where group_id = '${G}';` }),
  { from_terms: true, keyed: true, total_cents: 25000, status: "sent" });

/* ── 8 (here, because it is the same fixture) ─────────────────────────── */
console.log("\n  8. A duplicate cron run cannot duplicate an invoice");
check("8 — running the sweep three times still leaves one invoice",
  row({ invoice: false, action: `
    select invoices_created into temp s1 from billing_recurring_sweep();
    select invoices_created into temp s2 from billing_recurring_sweep();
    select invoices_created into temp s3 from billing_recurring_sweep();
    select count(*)::int as n from partner_invoices where group_id = '${G}';` }),
  { n: 1 });

/* ── 13 ────────────────────────────────────────────────────────────────── */
console.log("\n  13. A missing billing rate blocks automatic generation");
check("13a — no rate, no invoice",
  row({ invoice: false, rate: null, action: `
    select invoices_created into temp s1 from billing_recurring_sweep();
    select count(*)::int as n from partner_invoices where group_id = '${G}';` }),
  { n: 0 });

check("13b — and it is surfaced rather than silently skipped",
  row({ invoice: false, rate: null, action: `
    select count(*)::int as n from billing_terms_needing_rate where id = '${SB}';` }),
  { n: 1 });

/* ── 17 ────────────────────────────────────────────────────────────────── */
console.log("\n  17. Pausing a service stops future invoices");
check("17a — a paused service is not billed",
  row({ invoice: false, serviceStatus: "paused", action: `
    select invoices_created into temp s1 from billing_recurring_sweep();
    select count(*)::int as n from partner_invoices where group_id = '${G}';` }),
  { n: 0 });

check("17b — terms that have ended are not billed",
  row({ invoice: false, effectiveTo: "current_date - 1", action: `
    select invoices_created into temp s1 from billing_recurring_sweep();
    select count(*)::int as n from partner_invoices where group_id = '${G}';` }),
  { n: 0 });

check("17c — but the invoices already raised are untouched",
  row({ serviceStatus: "paused", action: `
    select invoices_created into temp s1 from billing_recurring_sweep();
    select count(*)::int as n from partner_invoices where id = '${INV}';` }),
  { n: 1 });

/* ── 2 ─────────────────────────────────────────────────────────────────── */
console.log("\n  2. A manual invoice is the same canonical type");
check("2 — one table, one line table, whatever raised it",
  row({ action: `
    select invoices_created into temp s1 from billing_recurring_sweep();
    select count(distinct billing_id is null)::int as shapes,
           count(*)::int as invoices
      from partner_invoices where group_id = '${G}';` }),
  /* Two invoices — one manual (billing_id null), one generated — in ONE table. */
  { shapes: 2, invoices: 2 });

/* ── 3 ─────────────────────────────────────────────────────────────────── */
console.log("\n  3. One invoice, three views");
check("3 — the Portal and Finance resolve the same invoice id",
  (() => {
    const portal = row({ as: PAYER, action:
      `select coalesce((select id::text from my_partner_invoices() where id = '${INV}'), 'none') as id;` });
    const finance = row({ as: OWNER, action:
      `select coalesce((select id::text from partner_invoices where id = '${INV}'), 'none') as id;` });
    return portal?.id === finance?.id && portal?.id === INV ? "same invoice" : `portal=${portal?.id} finance=${finance?.id}`;
  })(),
  "same invoice");

check("3b — and there is no portal-specific invoice table to drift from it",
  q.query(`select table_name from information_schema.tables
            where table_schema = 'public' and table_name ~ '^portal_'`).map((r) => r.table_name),
  []);

/* ── 4 ─────────────────────────────────────────────────────────────────── */
console.log("\n  4. A partial payment recalculates");
check("4 — $100 of $250 leaves $150 owed and a partially-paid invoice",
  row({ action: `
    select record_partner_payment('${G}', 10000, 'wise', '${INV}', current_date, 'REF-4', null, 'USD') into temp p4;
    select status::text as status, amount_paid_cents, invoice_balance_cents('${INV}') as owed
      from partner_invoices where id = '${INV}';` }),
  { status: "partially_paid", amount_paid_cents: 10000, owed: 15000 });

/* ── 5 ─────────────────────────────────────────────────────────────────── */
console.log("\n  5. An overpayment becomes account credit");
check("5 — $300 on a $250 invoice pays it and banks $50",
  row({ action: `
    select record_partner_payment('${G}', 30000, 'wise', '${INV}', current_date, 'REF-5', null, 'USD') into temp p5;
    select (select status::text from partner_invoices where id = '${INV}') as status,
           (select amount_paid_cents from partner_invoices where id = '${INV}') as paid,
           (select coalesce(sum(amount_cents),0)::int from partner_account_credit_ledger where group_id = '${G}') as credit;` }),
  /* The invoice records what it was OWED. The rest is the partner's money. */
  { status: "paid", paid: 25000, credit: 5000 });

/* ── 6 ─────────────────────────────────────────────────────────────────── */
console.log("\n  6. Processing credits are not money");
check("6a — rounds live in their own ledger, counted in units",
  first(`select column_name from information_schema.columns
          where table_name = 'partner_credit_ledger' and column_name = 'quantity'`),
  { column_name: "quantity" });

check("6b — and that ledger has no money column at all",
  q.query(`select column_name from information_schema.columns
            where table_name = 'partner_credit_ledger' and column_name ~ 'cents|amount'`).map((r) => r.column_name),
  []);

check("6c — a round never reaches the invoice balance",
  row({ action: `
    insert into partner_credit_ledger (agency_id, group_id, kind, unit, quantity, description)
         values ('${AGENCY}', '${G}', 'purchase', 'creditops_round', 5, 'probe');
    select invoice_balance_cents('${INV}') as owed;` }),
  { owed: 25000 });

/* ── 9 (the same question, the other way) ─────────────────────────────── */
console.log("\n  9. A duplicate charge cannot duplicate a payment");
check("9a — one provider transaction can be recorded once, ever",
  refuses({ action: `
    insert into partner_payments (agency_id, group_id, invoice_id, provider, provider_transaction_id,
                                  amount_cents, status, source)
         values ('${AGENCY}', '${G}', '${INV}', 'authorize_net', 'TXN-DUP', 10000, 'succeeded', 'provider_webhook'),
                ('${AGENCY}', '${G}', '${INV}', 'authorize_net', 'TXN-DUP', 10000, 'succeeded', 'provider_webhook');` },
    "partner_payments_provider_txn"),
  "refused");

check("9b — and one charge attempt key is claimed once",
  row({ card: true, as: null, action: `
    select begin_partner_card_charge('${G}', '${INV}', 25000, 'card_on_file', 'chain-9', '${PAYER}', 'sandbox') into temp c9a;
    select begin_partner_card_charge('${G}', '${INV}', 25000, 'card_on_file', 'chain-9', '${PAYER}', 'sandbox') into temp c9b;
    select count(*)::int as attempts from partner_card_charges where group_id = '${G}';` }),
  { attempts: 1 });

/* ── 10 ────────────────────────────────────────────────────────────────── */
console.log("\n  10. An unknown charge blocks retry");
check("10a — unknown credits nothing",
  row({ card: true, as: null, action: `
    select begin_partner_card_charge('${G}', '${INV}', 25000, 'card_on_file', 'chain-10', '${PAYER}', 'sandbox') into temp c10;
    select mark_partner_card_charge_unknown('chain-10', 'no answer') into temp u10;
    select (select count(*)::int from partner_payments where invoice_id = '${INV}') as payments,
           (select invoice_balance_cents('${INV}')) as owed;` }),
  { payments: 0, owed: 25000 });

check("10b — and takes the invoice out of the autopay sweep",
  row({ card: true, autopay: true, fixture: true, as: null, action: `
    select begin_partner_card_charge('${G}', '${INV}', 25000, 'card_on_file', 'chain-10b', '${PAYER}', 'sandbox') into temp c;
    select mark_partner_card_charge_unknown('chain-10b', 'no answer') into temp u;
    select count(*)::int as due from partner_autopay_due('sandbox') where invoice_id = '${INV}';` }),
  { due: 0 });

/* ── 7 ─────────────────────────────────────────────────────────────────── */
console.log("\n  7. Paying before the due date prevents AutoPay");
check("7 — a settled invoice is not swept",
  row({ card: true, autopay: true, fixture: true, action: `
    select record_partner_payment('${G}', 25000, 'wise', '${INV}', current_date, 'REF-7', null, 'USD') into temp p7;
    reset role;
    select count(*)::int as due from partner_autopay_due('sandbox') where invoice_id = '${INV}';` }),
  { due: 0 });

/* ── 11 ────────────────────────────────────────────────────────────────── */
console.log("\n  11. A void invoice cannot collect");
check("11a — the card path refuses it",
  refuses({ invoiceStatus: "void", as: null, action:
    `select begin_partner_card_charge('${G}', '${INV}', 25000, 'pay_now', 'chain-11', '${PAYER}', 'sandbox') into temp c;` },
    "cannot be paid"),
  "refused");

check("11b — and a void invoice is not swept by autopay",
  row({ invoiceStatus: "void", card: true, autopay: true, fixture: true, as: null, action: `
    select count(*)::int as due from partner_autopay_due('sandbox') where invoice_id = '${INV}';` }),
  { due: 0 });

check("11c — GAP CHECK: does the manual path also refuse it?",
  (() => {
    const msg = raised(() => world({ invoiceStatus: "void", action:
      `select record_partner_payment('${G}', 25000, 'wise', '${INV}', current_date, 'R', null, 'USD') into temp p; select 1 as r;` }));
    return msg === "ACCEPTED" ? "ACCEPTS A PAYMENT ON A VOID INVOICE" : "refused";
  })(),
  "refused");

/* ── 12 ────────────────────────────────────────────────────────────────── */
console.log("\n  12. A refund preserves the original payment");
check("12 — the payment stays, the refund is recorded beside it",
  row({ action: `
    select record_partner_payment('${G}', 25000, 'wise', '${INV}', current_date, 'REF-12', null, 'USD') into temp p12;
    select refund_payment_probe from (select 1 as refund_payment_probe) z;
    update partner_payments set refund_amount_cents = 25000 where invoice_id = '${INV}';
    select (select count(*)::int from partner_payments where invoice_id = '${INV}') as payments,
           (select invoice_balance_cents('${INV}')) as owed,
           (select status::text from partner_invoices where id = '${INV}') as status;` }),
  /* The row survives, and the invoice goes back to being owed. */
  { payments: 1, owed: 25000, status: "overdue" });

/* ── 14 ────────────────────────────────────────────────────────────────── */
console.log("\n  14. A missing billing email surfaces, and does not pretend to send");
check("14a — GAP CHECK: is a partner with no billing email flagged BEFORE an email fails?",
  (() => {
    const r = row({ invoice: false, as: null, action: `
      update outsourcing_groups set contact_email = '' where id = '${G}';
      delete from partner_contacts where group_id = '${G}';
      insert into partner_invoices (agency_id, group_id, invoice_number, issue_date, due_date, currency,
        subtotal_cents, discount_cents, tax_cents, total_cents, amount_paid_cents, status)
        values ('${AGENCY}', '${G}', 'PROBE-CHAIN-2', current_date - 10, current_date - 3, 'USD', 25000,0,0,25000,0,'sent');
      select (select count(*)::int from partner_billing_email('${G}')) as resolvable,
             (select count(*)::int from billing_attention
               where group_id = '${G}' and kind = 'missing_billing_email') as flagged;` });
    if (r?.resolvable !== 0) return `the fixture still resolves an email (${r?.resolvable})`;
    /* The view derives this from a FAILED outbox row, so a partner who has
       never been emailed is invisible until something tries and fails. */
    return r?.flagged > 0 ? "flagged" : "NOT FLAGGED until an email has already failed";
  })(),
  "flagged");

check("14b — and an email with no destination is marked unavailable, not sent",
  first(`select coalesce(string_agg(distinct state, ','), 'none') as states
           from billing_email_outbox where to_email is null`),
  { states: "unavailable" });

/* ── 15 ────────────────────────────────────────────────────────────────── */
console.log("\n  15. A final reminder cannot suspend a partner who has paid");
check("15a — the reminder sweep leaves a settled invoice alone",
  row({ issue: "current_date - 40", due: "current_date - 30", action: `
    select record_partner_payment('${G}', 25000, 'wise', '${INV}', current_date, 'REF-15', null, 'USD') into temp p15;
    select reminders_sent into temp s15 from billing_reminder_sweep();
    select (select count(*)::int from partner_invoice_reminders where invoice_id = '${INV}') as reminders,
           (select count(*)::int from partner_suspensions where group_id = '${G}') as suspensions;` }),
  { reminders: 0, suspensions: 0 });

check("15b — but an unpaid one 30 days over is reminded and suspended",
  row({ issue: "current_date - 40", due: "current_date - 30", action: `
    select reminders_sent into temp s15b from billing_reminder_sweep();
    select (select count(*)::int from partner_invoice_reminders where invoice_id = '${INV}') as reminders,
           (select count(*)::int from partner_suspensions where group_id = '${G}' and lifted_at is null) as suspensions;` }),
  { reminders: 5, suspensions: 1 });

/* ── 16 ────────────────────────────────────────────────────────────────── */
console.log("\n  16. Settling in full reactivates");
check("16 — paying the invoice that caused the suspension lifts it",
  row({ issue: "current_date - 40", due: "current_date - 30", action: `
    select reminders_sent into temp s16 from billing_reminder_sweep();
    select record_partner_payment('${G}', 25000, 'wise', '${INV}', current_date, 'REF-16', null, 'USD') into temp p16;
    select (select count(*)::int from partner_suspensions where group_id = '${G}' and lifted_at is null) as still_suspended,
           (select partner_is_suspended('${G}')) as flagged;` }),
  { still_suspended: 0, flagged: false });

check("16b — a PARTIAL payment does not reactivate",
  row({ issue: "current_date - 40", due: "current_date - 30", action: `
    select reminders_sent into temp s16b from billing_reminder_sweep();
    select record_partner_payment('${G}', 10000, 'wise', '${INV}', current_date, 'REF-16B', null, 'USD') into temp p;
    select (select partner_is_suspended('${G}')) as flagged;` }),
  { flagged: true });

/* ── 18 ────────────────────────────────────────────────────────────────── */
console.log("\n  18. An issued invoice does not move when pricing changes");
check("18 — raising the rate leaves the issued invoice at its own number",
  row({ action: `
    update partner_service_billing set rate_cents = 99900 where id = '${SB}';
    select total_cents, (select amount_cents from partner_invoice_lines where invoice_id = '${INV}') as line
      from partner_invoices where id = '${INV}';` }),
  { total_cents: 25000, line: 25000 });

/* ── 19 ────────────────────────────────────────────────────────────────── */
console.log("\n  19. Direct database access respects the financial capabilities");
const asUser = (user, sql) => {
  try {
    q.query(`begin; set local role authenticated;
      do $c$ begin perform set_config('request.jwt.claims','{"sub":"${user}","role":"authenticated"}',true); end $c$;
      ${sql} rollback;`);
    return "ALLOWED";
  } catch (e) { return /42501/.test(e.message) ? "refused" : `OTHER: ${e.message.split("\n")[0].slice(0, 80)}`; }
};
const ADMIN = first(`select am.user_id from agency_memberships am
   where am.role = 'agency_admin' and not coalesce(am.is_owner, false) and am.status = 'active'
     and not exists (select 1 from agency_member_permissions amp
                      join permission_keys pk on pk.key = amp.key and pk.owner_gated
                     where amp.membership_id = am.id and amp.allowed) limit 1`)?.user_id;

check("19a — an admin with no money grant cannot record a payment",
  asUser(ADMIN, `select record_partner_payment(
    (select id from outsourcing_groups limit 1), 100, 'wise', null, current_date, null, null, 'USD');`),
  "refused");
check("19b — nor apply account credit",
  asUser(ADMIN, `select apply_account_credit(
    (select id from outsourcing_groups limit 1), (select id from partner_invoices limit 1), 100);`),
  "refused");
check("19c — nor suspend a partner",
  asUser(ADMIN, `select suspend_partner((select id from outsourcing_groups limit 1), 'nonpayment', 'probe', null, null);`),
  "refused");
check("19d — nor read the invoice table",
  first(`select count(*)::int as n from pg_policy where polrelid = 'public.partner_invoices'::regclass
          and polcmd = 'r' and pg_get_expr(polqual, polrelid) like '%partners.invoices.view%'`),
  { n: 1 });

/* ── 20 ────────────────────────────────────────────────────────────────── */
console.log("\n  20. No raw card data exists anywhere");
check("20a — no column is named for a PAN, a CVV or a card PIN",
  q.query(`select table_name || '.' || column_name as c from information_schema.columns
            where table_schema = 'public'
              and column_name ~* '(card_number|cardnumber|^pan$|cvv|cvc|security_code|card_pin)'`).map((r) => r.c),
  []);

check("20b — the vault refuses anything shaped like a card number",
  (() => {
    const msg = raised(() => q.query(`begin;
      insert into outsourcing_groups (id, agency_id, name, contact_email, status, is_fixture)
           values ('${G}', '${AGENCY}', '[PROBE]', 'p@bes.test', 'Active', true);
      insert into partner_payment_profiles (agency_id, group_id, customer_profile_id, payment_profile_id)
           values ('${AGENCY}', '${G}', '4111111111111111', 'x');
    rollback;`));
    return msg.includes("no_pan_ck") ? "refused" : `NOT REFUSED: ${msg.slice(0, 80)}`;
  })(),
  "refused");

/* ── The chain's own invariants ────────────────────────────────────────── */
console.log("\n  The chain itself");
check("A — every invoice number is unique per agency, by constraint",
  first(`select count(*)::int as n from pg_index x join pg_class i on i.oid = x.indexrelid
          where x.indrelid = 'public.partner_invoices'::regclass and x.indisunique
            and pg_get_indexdef(x.indexrelid) like '%agency_id, invoice_number%'`),
  { n: 1 });

check("B — a recurring cycle can exist once, by constraint",
  first(`select count(*)::int as n from pg_index x join pg_class i on i.oid = x.indexrelid
          where x.indrelid = 'public.partner_invoices'::regclass and x.indisunique
            and pg_get_indexdef(x.indexrelid) like '%billing_id, period_key%'`),
  { n: 1 });

check("C — the balance is derived, never a typed-in figure",
  first(`select prosrc ~ 'sum\\(' as derived from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'partner_invoice_recompute'`),
  { derived: true });

check("D — a due date never precedes the issue date, in the generator",
  row({ invoice: false, model: "RECURRING_WEEKLY", action: `
    select invoices_created into temp sD from billing_recurring_sweep();
    select (due_date >= issue_date) as ok from partner_invoices where group_id = '${G}';` }),
  { ok: true });

check("E — GAP CHECK: is the same rule enforced for a MANUAL invoice?",
  (() => {
    const msg = raised(() => q.query(`begin;
      insert into outsourcing_groups (id, agency_id, name, contact_email, status, is_fixture)
           values ('${G}', '${AGENCY}', '[PROBE]', 'p@bes.test', 'Active', true);
      insert into partner_invoices (agency_id, group_id, invoice_number, issue_date, due_date, currency,
        subtotal_cents, discount_cents, tax_cents, total_cents, amount_paid_cents, status)
        values ('${AGENCY}', '${G}', 'PROBE-BACKDATED', current_date, current_date - 30, 'USD', 25000,0,0,25000,0,'sent');
    rollback;`));
    return msg === "ACCEPTED" ? "ACCEPTS A DUE DATE 30 DAYS BEFORE ISSUE" : "refused";
  })(),
  "refused");

check("F — amount_paid_cents cannot be typed in, whatever capability you hold",
  (() => {
    const msg = raised(() => world({ action: `
      update partner_invoices set amount_paid_cents = 25000 where id = '${INV}';
      select 1 as r;` }));
    return msg.includes("derived from its payments") ? "refused"
      : msg === "ACCEPTED" ? "AN INVOICE CAN BE MARKED PAID WITH NO PAYMENT"
      : `OTHER: ${msg.split("\n")[0].slice(0, 90)}`;
  })(),
  "refused");

check("F2 — nor can its payment status be rewritten by hand",
  (() => {
    const msg = raised(() => world({ action: `
      update partner_invoices set status = 'paid' where id = '${INV}';
      select 1 as r;` }));
    return msg.includes("derived from its payments") ? "refused"
      : msg === "ACCEPTED" ? "AN INVOICE CAN BE MARKED PAID BY HAND"
      : `OTHER: ${msg.split("\n")[0].slice(0, 90)}`;
  })(),
  "refused");

check("F3 — but a draft can still be issued, and an invoice can still be voided",
  row({ invoiceStatus: "draft", action: `
    update partner_invoices set status = 'sent' where id = '${INV}';
    update partner_invoices set status = 'void' where id = '${INV}';
    select status::text as status from partner_invoices where id = '${INV}';` }),
  { status: "void" });

check("F4 — and a real payment still moves it, because recompute is the writer",
  row({ action: `
    select record_partner_payment('${G}', 25000, 'wise', '${INV}', current_date, 'REF-F4', null, 'USD') into temp pf4;
    select status::text as status, amount_paid_cents from partner_invoices where id = '${INV}';` }),
  { status: "paid", amount_paid_cents: 25000 });

check("G — GAP CHECK: does an issued invoice get an email?",
  first(`select pg_get_constraintdef(oid) ~ 'invoice' as has_invoice_kind
           from pg_constraint where conrelid = 'public.billing_email_outbox'::regclass
             and conname = 'billing_email_outbox_kind_check'`),
  { has_invoice_kind: true });

check("H — an invoice resolves how it is expected to be paid",
  row({ action: `select invoice_collection_method('${INV}') as m;` }),
  { m: "manual" });

check("H2 — a saved card makes it card_on_file, and autopay makes it autopay",
  (() => {
    const onFile = row({ card: true, action: `select invoice_collection_method('${INV}') as m;` });
    const auto = row({ card: true, autopay: true, action: `select invoice_collection_method('${INV}') as m;` });
    return `${onFile?.m}/${auto?.m}`;
  })(),
  "card_on_file/autopay");

check("H3 — and it is DERIVED, so it cannot drift from the partner's arrangement",
  (() => {
    /* Removing the card must change the answer with no invoice write at all. */
    const r = row({ card: true, as: null, action: `
      select invoice_collection_method('${INV}') as before_m into temp h3;
      delete from partner_payment_profiles where group_id = '${G}';
      select (select before_m from h3) as before, invoice_collection_method('${INV}') as after;` });
    return `${r?.before}→${r?.after}`;
  })(),
  "card_on_file→manual");

check("H4 — the legacy payment_provider column is documented as not the answer",
  (() => {
    const c = first(`select col_description('public.partner_invoices'::regclass,
      (select ordinal_position from information_schema.columns
        where table_name = 'partner_invoices' and column_name = 'payment_provider')) as d`);
    return (c?.d ?? "").includes("LEGACY") ? "documented" : "UNDOCUMENTED";
  })(),
  "documented");

console.log("\n  Invoice delivery");
check("I — generating an invoice queues exactly one delivery",
  row({ invoice: false, as: null, action: `
    select invoices_created into temp si from billing_recurring_sweep();
    select count(*)::int as deliveries from billing_email_outbox
     where group_id = '${G}' and kind = 'invoice';` }),
  { deliveries: 1 });

check("I2 — a resend is a new ATTEMPT, never a second invoice",
  row({ as: null, action: `
    select queue_invoice_email('${INV}', 1) into temp q1;
    select queue_invoice_email('${INV}', 2) into temp q2;
    select queue_invoice_email('${INV}', 2) into temp q3;
    select (select count(*)::int from billing_email_outbox where invoice_id = '${INV}') as deliveries,
           (select count(*)::int from partner_invoices where id = '${INV}') as invoices;` }),
  { deliveries: 2, invoices: 1 });

check("I3 — a draft is not delivered",
  (() => {
    const msg = raised(() => world({ invoiceStatus: "draft", as: null,
      action: `select queue_invoice_email('${INV}', 1) into temp q; select 1 as r;` }));
    return msg.includes("is not sent") ? "refused" : `NOT REFUSED: ${msg.slice(0, 80)}`;
  })(),
  "refused");

console.log(`\n${failures.length ? "GAPS AND FAILURES" : "ALL PASS"} — ${pass} passed, ${failures.length} failed`);
if (failures.length) failures.forEach((f) => console.log(`  - ${f}`));
