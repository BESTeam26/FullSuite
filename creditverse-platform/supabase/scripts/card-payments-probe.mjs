#!/usr/bin/env node
/**
 * Paying a partner invoice by card — proved against the live database.
 *
 * Dee named the bug that matters: "the one where a bug bills someone twice."
 * Most of what follows is that one bug, approached from every direction a
 * double charge actually arrives from — a double-clicked button, a retried
 * HTTP call, a replayed webhook, a sweep that runs twice, two callers racing.
 *
 * Every scenario builds its own partner, contact, invoice and card inside a
 * transaction that is ROLLED BACK. No real invoice is touched and nothing is
 * ever sent to Authorize.Net: the probe settles attempts directly, which is
 * precisely what the processor's answer does.
 *
 *   node supabase/scripts/card-payments-probe.mjs
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
/* The person who pays: a real profile who is not yet anybody's portal contact.
   `partner_contacts_user_idx` is unique on user_id, so reusing an account that
   already belongs to a partner would fail the fixture, not the rule. */
const PAYER = first(`select p.id from profiles p
   where not exists (select 1 from partner_contacts c where c.user_id = p.id)
     and not exists (select 1 from agency_memberships m where m.user_id = p.id)
   order by p.created_at limit 1`)?.id;
/* The outsider: a real contact of a DIFFERENT partner. */
const OUTSIDER = first(`select user_id, group_id from partner_contacts
   where user_id is not null and status = 'active' limit 1`);

if (!AGENCY || !PAYER || !OUTSIDER?.user_id) {
  console.log("FIXTURE FAILED: needs an agency, a profile who is not yet a portal contact, and one active portal contact.");
  console.log(`  agency=${AGENCY} payer=${PAYER} outsider=${OUTSIDER?.user_id}`);
  process.exit(1);
}

const G   = "c0dec0de-0000-4000-8000-000000000001"; // fixture partner
const INV = "c0dec0de-0000-4000-8000-000000000002"; // fixture invoice

/**
 * A partner with one $250 overdue invoice and PAYER as its portal contact.
 * Optionally a card, optionally autopay. Runs `action`, then rolls back.
 * Returns the rows of the last statement, or `{error}` if anything raised.
 */
const scenario = ({ card = false, autopay = false, total = 25000, status = "sent",
                    due = "current_date - 3", portal = true, lifecycle = "active",
                    as = null, action }) => q.query(`
begin;
  insert into outsourcing_groups (id, agency_id, name, contact_email, status, is_fixture,
                                  portal_access_enabled, lifecycle)
       values ('${G}', '${AGENCY}', '[PROBE] Card Fixture', 'probe-card@bes.test', 'Active', true,
               ${portal}, '${lifecycle}');
  insert into partner_contacts (group_id, agency_id, full_name, email, user_id, status, is_primary)
       values ('${G}', '${AGENCY}', 'Probe Payer', 'probe-payer@bes.test', '${PAYER}', 'active', true);
  insert into partner_invoices
      (id, agency_id, group_id, invoice_number, issue_date, due_date, currency,
       subtotal_cents, discount_cents, tax_cents, total_cents, amount_paid_cents, status)
  values ('${INV}', '${AGENCY}', '${G}', 'PROBE-CARD-1', current_date - 10, ${due},
          'USD', ${total}, 0, 0, ${total}, 0, '${status}');
  ${card ? `insert into partner_payment_profiles
      (agency_id, group_id, customer_profile_id, payment_profile_id, card_brand,
       last4, exp_month, exp_year, is_default, autopay_enabled)
    values ('${AGENCY}', '${G}', 'cust_probe_1', 'pay_probe_1', 'Visa', '4242', 12, 2030,
            true, ${autopay});` : ""}
  ${as ? `set local role authenticated;
    do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${as}","role":"authenticated"}', true); end $c$;` : ""}
  ${action}
rollback;`);

const row = (opts) => scenario(opts)[0];
/** Did the action raise for the stated reason? The whole answer, so a failure
    prints WHY it was not refused rather than just "NOT REFUSED". */
const refuses = (opts, fragment) => {
  const msg = raised(() => scenario({ ...opts, action: `${opts.action} select 1 as reached;` }));
  return msg.includes(fragment) ? "refused" : `NOT REFUSED: ${msg}`;
};

const begin = (amount, kind, key, actor = `'${PAYER}'`, environment = "sandbox") =>
  `select begin_partner_card_charge('${G}', '${INV}', ${amount}, '${kind}', '${key}', ${actor}, '${environment}') into temp t_${key.replace(/[^a-z0-9]/gi, "")};`;
const settle = (key, status, txn) =>
  `select settle_partner_card_charge('${key}', '${status}', ${txn ? `'${txn}'` : "null"}, '1', 'Approved') into temp s_${key.replace(/[^a-z0-9]/gi, "")};`;

console.log("\nPAYING A PARTNER INVOICE BY CARD");

/* ── The invoice moves, and moves exactly once ─────────────────────────── */

console.log("\n  The invoice");
check("1 — an approved charge marks the invoice paid",
  row({ action: `${begin(25000, "pay_now", "p1")} ${settle("p1", "approved", "TXN-1")}
    select status::text, amount_paid_cents from partner_invoices where id = '${INV}';` }),
  { status: "paid", amount_paid_cents: 25000 });

check("2 — a partial payment leaves a balance, not a paid invoice",
  row({ action: `${begin(10000, "pay_now", "p2")} ${settle("p2", "approved", "TXN-2")}
    select status::text, amount_paid_cents, invoice_balance_cents('${INV}') as owed
      from partner_invoices where id = '${INV}';` }),
  { status: "partially_paid", amount_paid_cents: 10000, owed: 15000 });

check("3 — one approved charge produces exactly one payment row",
  row({ action: `${begin(25000, "pay_now", "p3")} ${settle("p3", "approved", "TXN-3")}
    select count(*)::int as payments from partner_payments where invoice_id = '${INV}';` }),
  { payments: 1 });

/* ── The bug Dee named ─────────────────────────────────────────────────── */

console.log("\n  Billing somebody twice");
check("4 — the same idempotency key starts one charge, not two",
  row({ action: `${begin(25000, "pay_now", "p4")}
    select (begin_partner_card_charge('${G}', '${INV}', 25000, 'pay_now', 'p4', '${PAYER}')->>'already')::boolean as retry,
           (select count(*)::int from partner_card_charges where group_id = '${G}') as attempts;` }),
  { retry: true, attempts: 1 });

check("5 — settling the same attempt twice credits the invoice once",
  row({ action: `${begin(25000, "pay_now", "p5")} ${settle("p5", "approved", "TXN-5")}
    select (settle_partner_card_charge('p5', 'approved', 'TXN-5', '1', 'Approved')->>'already_settled')::boolean as replay,
           (select amount_paid_cents from partner_invoices where id = '${INV}') as paid,
           (select count(*)::int from partner_payments where invoice_id = '${INV}') as payments;` }),
  { replay: true, paid: 25000, payments: 1 });

check("6 — one provider transaction cannot be recorded against two attempts",
  refuses({ action: `${begin(10000, "pay_now", "p6a")} ${begin(10000, "pay_now", "p6b")}
    ${settle("p6a", "approved", "TXN-6")} ${settle("p6b", "approved", "TXN-6")}` },
    "partner_card_charges_provider_txn"),
  "refused");

check("7 — a second autopay sweep is a retry, because the key comes from the invoice",
  row({ card: true, autopay: true, action: `
    select begin_partner_card_charge('${G}', d.invoice_id, d.amount_cents, 'autopay', d.idempotency_key, null, 'sandbox')
      into temp a1 from partner_autopay_due('sandbox') d where d.invoice_id = '${INV}';
    select begin_partner_card_charge('${G}', d.invoice_id, d.amount_cents, 'autopay', d.idempotency_key, null, 'sandbox')
      into temp a2 from partner_autopay_due('sandbox') d where d.invoice_id = '${INV}';
    select count(*)::int as attempts from partner_card_charges where group_id = '${G}';` }),
  { attempts: 1 });

check("8 — the invoice's paid total is recomputed, never added to by hand",
  row({ action: `${begin(10000, "pay_now", "p8a")} ${settle("p8a", "approved", "TXN-8A")}
    ${begin(15000, "pay_now", "p8b")} ${settle("p8b", "approved", "TXN-8B")}
    select amount_paid_cents, status::text from partner_invoices where id = '${INV}';` }),
  { amount_paid_cents: 25000, status: "paid" });

/* ── A decline is not a payment ────────────────────────────────────────── */

console.log("\n  Declines");
/* The invoice keeps the status it already had. `partner_invoice_recompute`
   runs on a PAYMENT; a decline is not one, so nothing about the invoice
   changes — which is the assertion. */
check("9 — a declined charge creates no payment and does not move the invoice",
  row({ action: `${begin(25000, "pay_now", "p9")} ${settle("p9", "declined", null)}
    select (select count(*)::int from partner_payments where invoice_id = '${INV}') as payments,
           (select status::text from partner_invoices where id = '${INV}') as status;` }),
  { payments: 0, status: "sent" });

check("10 — a declined attempt can be retried under a new key",
  row({ action: `${begin(25000, "pay_now", "p10a")} ${settle("p10a", "declined", null)}
    ${begin(25000, "pay_now", "p10b")} ${settle("p10b", "approved", "TXN-10")}
    select status::text, amount_paid_cents from partner_invoices where id = '${INV}';` }),
  { status: "paid", amount_paid_cents: 25000 });

check("11 — an error from the processor is recorded, and pays nothing",
  row({ action: `${begin(25000, "pay_now", "p11")} ${settle("p11", "error", null)}
    select (select status from partner_card_charges where idempotency_key = 'p11') as charge,
           (select count(*)::int from partner_payments where invoice_id = '${INV}') as payments;` }),
  { charge: "error", payments: 0 });

/* ── Who may pay ───────────────────────────────────────────────────────── */

console.log("\n  Who may pay");
check("12 — another partner's contact cannot pay this partner's invoice",
  refuses({ action: begin(25000, "pay_now", "p12", `'${OUTSIDER.user_id}'`) }, "cannot pay for this partner"),
  "refused");

check("13 — nobody at all cannot pay",
  refuses({ action: begin(25000, "pay_now", "p13", "null") }, "cannot pay for this partner"),
  "refused");

check("14 — an invoice cannot be paid under the wrong partner",
  refuses({ action: `select begin_partner_card_charge('${OUTSIDER.group_id}', '${INV}', 25000, 'pay_now', 'p14', '${OUTSIDER.user_id}') into temp t14;` },
    "different partner"),
  "refused");

check("15 — a void invoice cannot be paid",
  refuses({ status: "void", action: begin(25000, "pay_now", "p15") }, "cannot be paid"), "refused");

check("16 — a draft invoice cannot be paid",
  refuses({ status: "draft", action: begin(25000, "pay_now", "p16") }, "cannot be paid"), "refused");

check("17 — the portal cannot overpay an invoice",
  refuses({ action: begin(30000, "pay_now", "p17") }, "more than the"), "refused");

check("18 — a zero or negative amount is refused",
  refuses({ action: begin(0, "pay_now", "p18") }, "needs an amount"), "refused");

check("19 — an already-paid invoice cannot be paid again",
  refuses({ action: `${begin(25000, "pay_now", "p19a")} ${settle("p19a", "approved", "TXN-19")} ${begin(25000, "pay_now", "p19b")}` },
    "cannot be paid"),
  "refused");

/* ── Autopay is its own consent ────────────────────────────────────────── */

console.log("\n  Autopay");
check("20 — a card on file is not autopay",
  row({ card: true, autopay: false, action: `select count(*)::int as due from partner_autopay_due('sandbox') where invoice_id = '${INV}';` }),
  { due: 0 });

check("21 — autopay on, with a card, makes a due invoice sweepable",
  row({ card: true, autopay: true, action: `select amount_cents, idempotency_key from partner_autopay_due('sandbox') where invoice_id = '${INV}';` }),
  { amount_cents: 25000, idempotency_key: `autopay:sandbox:${INV}:25000` });

check("22 — autopay does not sweep an invoice that is not yet due",
  row({ card: true, autopay: true, due: "current_date + 7", action: `select count(*)::int as due from partner_autopay_due('sandbox') where invoice_id = '${INV}';` }),
  { due: 0 });

check("23 — autopay does not sweep a void invoice",
  row({ card: true, autopay: true, status: "void", action: `select count(*)::int as due from partner_autopay_due('sandbox') where invoice_id = '${INV}';` }),
  { due: 0 });

check("24 — an autopay charge is refused when autopay is off",
  refuses({ card: true, autopay: false, action: begin(25000, "autopay", "p24", "null", "sandbox") }, "not switched on"), "refused");

check("25 — autopay cannot be switched on without a card",
  refuses({ as: PAYER, action: `select set_partner_autopay('${G}', true) into temp t25;` }, "needs a card"), "refused");

check("25b — the partner's own contact CAN switch autopay on once a card is saved",
  row({ card: true, as: PAYER, action: `
    select set_partner_autopay('${G}', true) into temp t25b;
    select autopay_enabled from partner_payment_profiles where group_id = '${G}';` }),
  { autopay_enabled: true });

check("25c — an outsider cannot switch autopay on for somebody else's partner",
  refuses({ card: true, as: OUTSIDER.user_id, action: `select set_partner_autopay('${G}', true) into temp t25c;` },
    "cannot change autopay"),
  "refused");

check("26 — a card-on-file charge is refused when there is no card",
  refuses({ action: begin(25000, "card_on_file", "p26") }, "No card on file"), "refused");

check("27 — an unknown kind of charge is refused",
  refuses({ action: begin(25000, "whatever", "p27") }, "Unknown kind"), "refused");

check("27b — a partner whose portal access is OFF cannot pay by card",
  refuses({ portal: false, action: begin(25000, "pay_now", "p27b") }, "cannot pay for this partner"),
  "refused");

check("27c — a suspended partner is not autopaid",
  row({ card: true, autopay: true, lifecycle: "suspended",
        action: `select count(*)::int as due from partner_autopay_due('sandbox') where invoice_id = '${INV}';` }),
  { due: 0 });

/* ── What is never stored ──────────────────────────────────────────────── */

console.log("\n  What is never stored");
const raises = (sql, fragment) => {
  const msg = raised(() => q.query(`begin;
      insert into outsourcing_groups (id, agency_id, name, contact_email, status, is_fixture)
           values ('${G}', '${AGENCY}', '[PROBE] Card Fixture', 'probe-card@bes.test', 'Active', true);
      ${sql}
    rollback;`));
  return msg.includes(fragment) ? "refused" : `NOT REFUSED: ${msg}`;
};

check("28 — the vault refuses anything shaped like a card number",
  raises(`insert into partner_payment_profiles (agency_id, group_id, customer_profile_id, payment_profile_id)
               values ('${AGENCY}', '${G}', '4111111111111111', 'pay_x');`, "no_pan_ck"),
  "refused");

check("29 — last4 must be four digits or nothing",
  raises(`insert into partner_payment_profiles (agency_id, group_id, customer_profile_id, payment_profile_id, last4)
               values ('${AGENCY}', '${G}', 'cust_x', 'pay_x', '4242424242424242');`, "last4"),
  "refused");

check("30 — there is no column anywhere for a card number, a CVV or a card PIN",
  first(`select count(*)::int as n from information_schema.columns
          where table_schema = 'public'
            and column_name ~* '(card_number|cardnumber|^pan$|cvv|cvc|security_code|card_pin)'`),
  { n: 0 });

check("31 — a partner has one default card, not several",
  raises(`insert into partner_payment_profiles (agency_id, group_id, customer_profile_id, payment_profile_id, is_default)
               values ('${AGENCY}', '${G}', 'cust_a', 'pay_a', true),
                      ('${AGENCY}', '${G}', 'cust_b', 'pay_b', true);`, "partner_payment_profiles_one_default"),
  "refused");

/* ── Not reachable from a browser ──────────────────────────────────────── */

console.log("\n  Reachability");
const grants = (fn) => first(
  `select coalesce(string_agg(distinct grantee, ','), 'nobody') as who
     from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name = '${fn}'
      and grantee in ('authenticated', 'anon', 'PUBLIC')`).who;

check("32 — begin_partner_card_charge is not callable from a browser", grants("begin_partner_card_charge"), "nobody");
check("33 — settle_partner_card_charge is not callable from a browser", grants("settle_partner_card_charge"), "nobody");
check("34 — save_partner_card_profile is not callable from a browser", grants("save_partner_card_profile"), "nobody");
check("35 — partner_autopay_due is not callable from a browser", grants("partner_autopay_due"), "nobody");
check("36 — set_partner_autopay IS callable: it is the partner's own switch", grants("set_partner_autopay"), "authenticated");

check("37 — the vault and the attempt ledger are read-only to a browser",
  first(`select coalesce(string_agg(distinct privilege_type, ',' order by privilege_type), 'none') as p
           from information_schema.table_privileges
          where table_schema = 'public' and grantee = 'authenticated'
            and table_name in ('partner_payment_profiles', 'partner_card_charges')`),
  { p: "SELECT" });

/* ── What a settled charge sets off ────────────────────────────────────── */

console.log("\n  What a settled charge sets off");
check("38 — a receipt is queued, through the outbox a manual payment already uses",
  row({ action: `${begin(25000, "pay_now", "p38")} ${settle("p38", "approved", "TXN-38")}
    select count(*)::int as receipts from billing_email_outbox where group_id = '${G}' and kind = 'receipt';` }),
  { receipts: 1 });

check("39 — the charge is linked to the payment it produced",
  row({ action: `${begin(25000, "pay_now", "p39")} ${settle("p39", "approved", "TXN-39")}
    select (c.payment_id = p.id) as linked, p.provider::text as provider, p.source, p.reconciliation_state
      from partner_card_charges c join partner_payments p on p.id = c.payment_id
     where c.idempotency_key = 'p39';` }),
  { linked: true, provider: "authorize_net", source: "provider_webhook", reconciliation_state: "matched" });

check("40 — the payment carries the provider's transaction id, for reconciliation",
  row({ action: `${begin(25000, "pay_now", "p40")} ${settle("p40", "approved", "TXN-40")}
    select provider_transaction_id from partner_payments where invoice_id = '${INV}';` }),
  { provider_transaction_id: "TXN-40" });

check("41 — settling an attempt that was never started raises, rather than paying",
  (() => {
    const msg = raised(() => q.query(`select settle_partner_card_charge('never-started', 'approved', 'TXN-X', '1', 'ok');`));
    return msg.includes("No such charge attempt") ? "refused" : `NOT REFUSED: ${msg}`;
  })(),
  "refused");

/* ── Dee's brief, 2026-09-17 ───────────────────────────────────────────── */

console.log("\n  Timeout after the gateway accepted");
check("42 — a lost answer is UNKNOWN, not failed, and credits nothing",
  row({ action: `${begin(25000, "pay_now", "p42")}
    select mark_partner_card_charge_unknown('p42', 'no answer') into temp u42;
    select (select status from partner_card_charges where idempotency_key = 'p42') as charge,
           (select count(*)::int from partner_payments where invoice_id = '${INV}') as payments,
           (select status::text from partner_invoices where id = '${INV}') as invoice;` }),
  { charge: "unknown", payments: 0, invoice: "sent" });

check("43 — autopay will not touch an invoice with an UNKNOWN attempt against it",
  row({ card: true, autopay: true, action: `${begin(25000, "card_on_file", "p43")}
    select mark_partner_card_charge_unknown('p43', 'no answer') into temp u43;
    select count(*)::int as due from partner_autopay_due('sandbox') where invoice_id = '${INV}';` }),
  { due: 0 });

check("44 — autopay will not touch an invoice with an attempt still PENDING",
  row({ card: true, autopay: true, action: `${begin(25000, "card_on_file", "p44")}
    select count(*)::int as due from partner_autopay_due('sandbox') where invoice_id = '${INV}';` }),
  { due: 0 });

check("45 — marking a settled charge unknown does not undo it",
  row({ action: `${begin(25000, "pay_now", "p45")} ${settle("p45", "approved", "TXN-45")}
    select (mark_partner_card_charge_unknown('p45', 'late timeout')->>'already_settled')::boolean as ignored,
           (select status from partner_card_charges where idempotency_key = 'p45') as charge,
           (select amount_paid_cents from partner_invoices where id = '${INV}') as paid;` }),
  { ignored: true, charge: "approved", paid: 25000 });

console.log("\n  Sandbox cannot charge unattended");
/* The rule changed on 2026-09-17 so that AutoPay could be rehearsed at all.
   It is not "sandbox is forbidden" — it is that the two environments see
   DISJOINT sets of partners, which is the property that actually protects
   real money. Both directions are asserted. */
check("46 — a sandbox sweep cannot autopay a REAL partner",
  (() => {
    const msg = raised(() => q.query(`
      begin;
        insert into outsourcing_groups (id, agency_id, name, contact_email, status, is_fixture, portal_access_enabled, lifecycle)
             values ('${G}', '${AGENCY}', '[PROBE] Real', 'real@bes.test', 'Active', false, true, 'active');
        insert into partner_invoices (id, agency_id, group_id, invoice_number, issue_date, due_date, currency,
             subtotal_cents, discount_cents, tax_cents, total_cents, amount_paid_cents, status)
             values ('${INV}', '${AGENCY}', '${G}', 'PROBE-REAL', current_date - 10, current_date - 3, 'USD', 25000,0,0,25000,0,'sent');
        insert into partner_payment_profiles (agency_id, group_id, customer_profile_id, payment_profile_id, is_default, autopay_enabled)
             values ('${AGENCY}', '${G}', 'c', 'p', true, true);
        select begin_partner_card_charge('${G}', '${INV}', 25000, 'autopay', 'p46', null, 'sandbox');
      rollback;`));
    return msg.includes("only rehearse against a [TEST] partner") ? "refused" : `NOT REFUSED: ${msg.slice(0, 80)}`;
  })(),
  "refused");

check("46b — and a production sweep cannot autopay a [TEST] partner",
  refuses({ card: true, autopay: true, action: begin(25000, "autopay", "p46b", "null", "production") },
    "does not charge a [TEST] partner in production"),
  "refused");

check("46c — the two environments see disjoint invoices, by construction",
  (() => {
    const r = q.query(`
      begin;
        insert into outsourcing_groups (id, agency_id, name, contact_email, status, is_fixture, portal_access_enabled, lifecycle)
             values ('${G}', '${AGENCY}', '[PROBE] Test', 't@bes.test', 'Active', true, true, 'active');
        insert into partner_invoices (id, agency_id, group_id, invoice_number, issue_date, due_date, currency,
             subtotal_cents, discount_cents, tax_cents, total_cents, amount_paid_cents, status)
             values ('${INV}', '${AGENCY}', '${G}', 'PROBE-TEST', current_date - 10, current_date - 3, 'USD', 25000,0,0,25000,0,'sent');
        insert into partner_payment_profiles (agency_id, group_id, customer_profile_id, payment_profile_id, is_default, autopay_enabled)
             values ('${AGENCY}', '${G}', 'c', 'p', true, true);
        select (select count(*)::int from partner_autopay_due('sandbox') where invoice_id = '${INV}') as in_sandbox,
               (select count(*)::int from partner_autopay_due('production') where invoice_id = '${INV}') as in_production;
      rollback;`);
    return JSON.stringify(r[0]);
  })(),
  JSON.stringify({ in_sandbox: 1, in_production: 0 }));

check("46d — and a sandbox key can never collide with the production one",
  (() => {
    const r = q.query(`
      begin;
        insert into outsourcing_groups (id, agency_id, name, contact_email, status, is_fixture, portal_access_enabled, lifecycle)
             values ('${G}', '${AGENCY}', '[PROBE] Test', 't@bes.test', 'Active', true, true, 'active');
        insert into partner_invoices (id, agency_id, group_id, invoice_number, issue_date, due_date, currency,
             subtotal_cents, discount_cents, tax_cents, total_cents, amount_paid_cents, status)
             values ('${INV}', '${AGENCY}', '${G}', 'PROBE-TEST', current_date - 10, current_date - 3, 'USD', 25000,0,0,25000,0,'sent');
        insert into partner_payment_profiles (agency_id, group_id, customer_profile_id, payment_profile_id, is_default, autopay_enabled)
             values ('${AGENCY}', '${G}', 'c', 'p', true, true);
        select idempotency_key like 'autopay:sandbox:%' as scoped
          from partner_autopay_due('sandbox') where invoice_id = '${INV}';
      rollback;`);
    return r[0];
  })(),
  { scoped: true });

check("47 — a charge must say which Authorize.Net it went to",
  refuses({ action: begin(25000, "pay_now", "p47", `'${PAYER}'`, "whatever") }, "which Authorize.Net"), "refused");

check("48 — a sandbox payment says so on its own record",
  row({ action: `${begin(25000, "pay_now", "p48")} ${settle("p48", "approved", "TXN-48")}
    select notes like '%SANDBOX TEST%' as flagged from partner_payments where invoice_id = '${INV}';` }),
  { flagged: true });

check("49 — a production payment carries no such warning",
  row({ action: `${begin(25000, "pay_now", "p49", `'${PAYER}'`, "production")} ${settle("p49", "approved", "TXN-49")}
    select notes like '%SANDBOX%' as flagged from partner_payments where invoice_id = '${INV}';` }),
  { flagged: false });

check("50 — autopay is not armed until Dee puts the approval in the vault",
  first("select partner_autopay_is_armed() as armed"), { armed: false });

console.log("\n  Consent");
check("51 — switching autopay on records who did it and when",
  row({ card: true, as: PAYER, action: `
    select set_partner_autopay('${G}', true) into temp c51;
    select autopay_enabled, autopay_enabled_by = '${PAYER}' as by_them,
           autopay_enabled_at is not null as stamped
      from partner_payment_profiles where group_id = '${G}';` }),
  { autopay_enabled: true, by_them: true, stamped: true });

check("52 — switching it off does not erase who once switched it on",
  row({ card: true, as: PAYER, action: `
    select set_partner_autopay('${G}', true) into temp c52a;
    select set_partner_autopay('${G}', false) into temp c52b;
    select autopay_enabled, autopay_enabled_by is not null as remembered
      from partner_payment_profiles where group_id = '${G}';` }),
  { autopay_enabled: false, remembered: true });

console.log("\n  Paying early beats autopay");
check("53 — an invoice paid before its due date is not swept",
  row({ card: true, autopay: true, action: `${begin(25000, "card_on_file", "p53")} ${settle("p53", "approved", "TXN-53")}
    select count(*)::int as due from partner_autopay_due('sandbox') where invoice_id = '${INV}';` }),
  { due: 0 });

check("54 — a partially paid invoice is swept for the balance, not the total",
  row({ card: true, autopay: true, action: `${begin(10000, "card_on_file", "p54")} ${settle("p54", "approved", "TXN-54")}
    select amount_cents from partner_autopay_due('sandbox') where invoice_id = '${INV}';` }),
  { amount_cents: 15000 });

console.log("\n  Webhook replay");
check("55 — the same provider event cannot be recorded twice",
  raises(`insert into partner_payment_events (provider_event_id, event_type)
               values ('evt-probe-1', 'net.authorize.payment.authcapture.created'),
                      ('evt-probe-1', 'net.authorize.payment.authcapture.created');`,
    "partner_payment_events_once"),
  "refused");

check("56 — webhook events are not writable from a browser",
  first(`select coalesce(string_agg(distinct privilege_type, ',' order by privilege_type), 'none') as p
           from information_schema.table_privileges
          where table_schema = 'public' and grantee = 'authenticated'
            and table_name = 'partner_payment_events'`),
  { p: "SELECT" });

check("57 — only a delegated finance user can read them",
  first(`select pg_get_expr(pol.polqual, pol.polrelid) as using_clause
           from pg_policy pol where pol.polrelid = 'public.partner_payment_events'::regclass`)
    .using_clause.includes("partners.payments.record") ? "owner-gated" : "NOT GATED",
  "owner-gated");

check("58 — mark_partner_card_charge_unknown is not callable from a browser",
  grants("mark_partner_card_charge_unknown"), "nobody");
check("59 — partner_autopay_is_armed is not callable from a browser",
  grants("partner_autopay_is_armed"), "nobody");
check("60 — partner_autopay_dispatch is not callable from a browser",
  grants("partner_autopay_dispatch"), "nobody");

check("61 — the autopay sweep is scheduled, and inert until it is armed",
  first(`select schedule from cron.job where jobname = 'partner-autopay-sweep'`),
  { schedule: "20 6 * * *" });

console.log(`\n${failures.length ? "FAILURES" : "ALL PASS"} — ${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
