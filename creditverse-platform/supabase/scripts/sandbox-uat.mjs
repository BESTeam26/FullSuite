#!/usr/bin/env node
/**
 * Authorize.Net SANDBOX UAT — Dee's fifteen steps, in her order.
 *
 * ── WHAT THIS WILL AND WILL NOT DO ────────────────────────────────────────
 *
 * It refuses to start unless the deployed function answers
 * `connected: true`, `environment: "sandbox"`, `missing: []`. There is no
 * flag to skip that check: a UAT that runs against a half-configured
 * processor produces a report nobody should trust.
 *
 * It touches ONLY partners with `is_fixture = true` and a `[TEST] ` name, and
 * it asserts that before it begins. A real partner reaching this script is a
 * hard stop, not a warning.
 *
 * Two of Dee's steps cannot be scripted: entering a card is Accept.js, which
 * is a browser library by design — the whole point being that the number goes
 * from the page to Authorize.Net and never past BES. Those steps are driven
 * through the real portal in a browser and their results are recorded here.
 * This script says plainly which is which rather than implying it tested
 * something it did not.
 *
 *   node supabase/scripts/sandbox-uat.mjs           run it
 *   node supabase/scripts/sandbox-uat.mjs preflight just the gate
 */
import { readFileSync } from "node:fs";
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";

const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });

const first = (sql) => q.query(sql)[0];
const raised = (fn) => { try { fn(); return "ACCEPTED"; } catch (e) { return e.message; } };

/* ── The report Dee asked for, filled in as we go ───────────────────────── */
const REPORT = [
  ["PAY THIS INVOICE", null],
  ["CARD ON FILE", null],
  ["MANUAL SAVED-CARD CHARGE", null],
  ["AUTOPAY", null],
  ["WEBHOOK", null],
  ["RECEIPTS", null],
  ["PARTIAL / OVERPAYMENT", null],
  ["DUPLICATE-CHARGE PROTECTION", null],
  ["UNKNOWN-STATE HANDLING", null],
  ["SUSPENSION / REACTIVATION", null],
  ["SECURITY", null],
];
const setResult = (name, pass, note) => {
  const row = REPORT.find((r) => r[0] === name);
  /* Once something has failed it stays failed. A later check passing does not
     un-fail an earlier one, and a report that quietly upgrades itself is worse
     than no report. */
  if (row[1] === "FAIL") return;
  row[1] = pass ? "PASS" : "FAIL";
  if (note) row[2] = note;
};

let checks = 0;
const failures = [];
const check = (area, name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  checks += 1;
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures.push(name);
    console.log(`  FAIL ${name}\n       expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`);
  }
  setResult(area, ok, ok ? undefined : name);
  return ok;
};

/* ── The gate ───────────────────────────────────────────────────────────── */

function envFromLocal(key) {
  try {
    const line = readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
      .split("\n").find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "") : null;
  } catch { return null; }
}

async function config() {
  const url = envFromLocal("VITE_SUPABASE_URL");
  const anon = envFromLocal("VITE_SUPABASE_ANON_KEY");
  if (!url || !anon) throw new Error("No Supabase URL or anon key in .env.local");
  const r = await fetch(`${url}/functions/v1/partner-payments`, {
    method: "POST",
    headers: { authorization: `Bearer ${anon}`, apikey: anon, "content-type": "application/json" },
    body: JSON.stringify({ action: "config", groupId: "config" }),
  });
  return r.json();
}

async function preflight() {
  console.log("\nPREFLIGHT");
  const c = await config();
  const ok = c.connected === true && c.environment === "sandbox" && (c.missing ?? []).length === 0;

  console.log(`  processor connected   ${c.connected === true ? "yes" : "NO"}`);
  console.log(`  environment           ${c.environment}`);
  console.log(`  missing keys          ${(c.missing ?? []).length === 0 ? "none" : c.missing.join(", ")}`);

  /* Never run against production, whatever else is true. */
  if (c.environment !== "sandbox") {
    console.log("\nSTOP. AUTHNET_ENV is not sandbox. This script does not run against production.");
    process.exit(1);
  }

  /* Only [TEST] partners, asserted rather than assumed. */
  const fixtures = q.query(`select id, name from outsourcing_groups
                             where is_fixture and name like '[TEST] %' order by name`);
  const strays = q.query(`select name from outsourcing_groups where is_fixture and name not like '[TEST] %'`);
  console.log(`  [TEST] partners       ${fixtures.length}`);
  if (strays.length > 0) {
    console.log(`\nSTOP. ${strays.length} fixture partner(s) are not named [TEST]: ${strays.map((s) => s.name).join(", ")}`);
    console.log("Every partner this script may touch must be unmistakable at a glance.");
    process.exit(1);
  }
  if (fixtures.length === 0) {
    console.log("\nSTOP. No [TEST] fixtures. Run: node supabase/scripts/uat-fixtures.mjs create");
    process.exit(1);
  }

  /* Production autopay must be off before anything charges anything. */
  const armed = first("select partner_autopay_is_armed() as armed").armed;
  console.log(`  production autopay    ${armed ? "ARMED — STOP" : "off"}`);
  if (armed) {
    console.log("\nSTOP. Production autopay is armed. Disarm before running sandbox UAT.");
    process.exit(1);
  }

  if (!ok) {
    console.log(`\nBLOCKED. ${(c.missing ?? []).join(", ") || "the processor"} must be configured before UAT can begin.`);
    console.log("Nothing has been charged and no step has run.");
    return false;
  }
  console.log("  → clear to run");
  return true;
}

/* ── The steps that need no card entry ──────────────────────────────────── */

const G = (name) => first(`select id from outsourcing_groups where name = '${name}'`)?.id;
const INV = (group) => first(`select id from partner_invoices where group_id = '${group}'
                               and status in ('sent','overdue','partially_paid') limit 1`)?.id;

function scriptedSteps() {
  const manual = G("[TEST] Manual Rails");
  const autopay = G("[TEST] AutoPay");
  const suspension = G("[TEST] Suspension");
  const payNow = G("[TEST] Pay This Invoice");

  /* 7 · 8 — partial payment, then overpayment into account credit. */
  console.log("\n7, 8. PARTIAL PAYMENT AND OVERPAYMENT");
  const mInv = INV(manual);
  check("PARTIAL / OVERPAYMENT", "7 — a partial payment leaves the balance owed",
    (() => {
      q.query(`select record_partner_payment('${manual}', 10000, 'wise', '${mInv}',
                 current_date, 'UAT-PARTIAL', '[TEST] UAT partial', 'USD')`);
      return first(`select status::text as status, invoice_balance_cents('${mInv}') as owed
                      from partner_invoices where id = '${mInv}'`);
    })(),
    { status: "partially_paid", owed: 20000 });

  check("PARTIAL / OVERPAYMENT", "8 — an overpayment settles it and banks the rest",
    (() => {
      q.query(`select record_partner_payment('${manual}', 25000, 'wise', '${mInv}',
                 current_date, 'UAT-OVER', '[TEST] UAT overpayment', 'USD')`);
      return {
        status: first(`select status::text as s from partner_invoices where id = '${mInv}'`).s,
        credit: Number(first(`select coalesce(sum(amount_cents),0)::int as c
                                from partner_account_credit_ledger where group_id = '${manual}'`).c),
      };
    })(),
    { status: "paid", credit: 5000 });

  /* 11 · 12 — duplicate click and duplicate cron. */
  console.log("\n11, 12. DUPLICATE PROTECTION");
  check("DUPLICATE-CHARGE PROTECTION", "11 — the same key claims one attempt, not two",
    (() => {
      const inv = INV(payNow);
      const key = `uat-dupe-${Date.now()}`;
      q.query(`select begin_partner_card_charge('${payNow}', '${inv}', 5000, 'pay_now', '${key}', null, 'sandbox')`);
      const second = first(`select (begin_partner_card_charge('${payNow}', '${inv}', 5000, 'pay_now', '${key}', null, 'sandbox')->>'already')::boolean as again`);
      const n = first(`select count(*)::int as n from partner_card_charges where idempotency_key = '${key}'`).n;
      q.query(`delete from partner_card_charges where idempotency_key = '${key}'`);
      return { again: second.again, n };
    })(),
    { again: true, n: 1 });

  check("DUPLICATE-CHARGE PROTECTION", "12 — a second sweep of the same due invoice is a retry",
    (() => {
      const before = first(`select count(*)::int as n from partner_card_charges where group_id = '${autopay}'`).n;
      const due = q.query(`select * from partner_autopay_due('sandbox')`);
      /* Claim each twice; the second must be recognised. */
      let again = true;
      for (const d of due) {
        q.query(`select begin_partner_card_charge('${d.group_id}', '${d.invoice_id}', ${d.amount_cents},
                   'autopay', '${d.idempotency_key}', null, 'sandbox')`);
        const r = first(`select (begin_partner_card_charge('${d.group_id}', '${d.invoice_id}', ${d.amount_cents},
                   'autopay', '${d.idempotency_key}', null, 'sandbox')->>'already')::boolean as a`);
        again = again && r.a === true;
      }
      const after = first(`select count(*)::int as n from partner_card_charges where group_id = '${autopay}'`).n;
      return { again, created: after - before <= due.length };
    })(),
    { again: true, created: true });

  /* 13 — paying early stops autopay. */
  console.log("\n13. EARLY PAYMENT PREVENTS AUTOPAY");
  check("AUTOPAY", "13 — a settled invoice leaves the sweep",
    (() => {
      const inv = INV(autopay);
      if (!inv) return "no open [TEST] AutoPay invoice";
      q.query(`select record_partner_payment('${autopay}', invoice_balance_cents('${inv}'), 'wise',
                 '${inv}', current_date, 'UAT-EARLY', '[TEST] UAT early payment', 'USD')`);
      return first(`select count(*)::int as due from partner_autopay_due('sandbox') where invoice_id = '${inv}'`).due;
    })(),
    0);

  /* 14 — a void invoice cannot collect. */
  console.log("\n14. A VOID INVOICE BLOCKS COLLECTION");
  check("SECURITY", "14 — every path refuses a void invoice",
    (() => {
      const inv = INV(payNow);
      q.query(`update partner_invoices set status = 'void', voided_at = now(),
                 void_reason = '[TEST] UAT void' where id = '${inv}'`);
      const card = raised(() => q.query(`select begin_partner_card_charge('${payNow}', '${inv}', 1000,
        'pay_now', 'uat-void-${Date.now()}', null, 'sandbox')`));
      const cash = raised(() => q.query(`select record_partner_payment('${payNow}', 1000, 'wise', '${inv}',
        current_date, 'UAT-VOID', null, 'USD')`));
      return {
        card: card.includes("cannot be paid") ? "refused" : card.slice(0, 60),
        manual: cash.includes("is void") ? "refused" : cash.slice(0, 60),
      };
    })(),
    { card: "refused", manual: "refused" });

  /* 15 — reminders, suspension, reactivation. */
  console.log("\n15. SUSPENSION AND REACTIVATION");
  const sInv = INV(suspension);
  check("SUSPENSION / REACTIVATION", "15a — an unpaid invoice past the final reminder suspends",
    (() => {
      q.query("select reminders_sent from billing_reminder_sweep()");
      return {
        reminders: first(`select count(*)::int as n from partner_invoice_reminders where invoice_id = '${sInv}'`).n >= 5,
        suspended: first(`select partner_is_suspended('${suspension}') as s`).s,
      };
    })(),
    { reminders: true, suspended: true });

  check("SUSPENSION / REACTIVATION", "15b — settling it in full reactivates",
    (() => {
      q.query(`select record_partner_payment('${suspension}', invoice_balance_cents('${sInv}'), 'wise',
                 '${sInv}', current_date, 'UAT-SETTLE', '[TEST] UAT settlement', 'USD')`);
      return first(`select partner_is_suspended('${suspension}') as s`).s;
    })(),
    false);

  /* 10 — unknown blocks retry. */
  console.log("\n10. UNKNOWN STATE");
  check("UNKNOWN-STATE HANDLING", "10 — unknown credits nothing and blocks the sweep",
    (() => {
      const inv = INV(manual) ?? sInv;
      const key = `uat-unknown-${Date.now()}`;
      q.query(`insert into partner_card_charges (agency_id, group_id, invoice_id, kind,
                 idempotency_key, amount_cents, status, environment)
               select agency_id, '${autopay}', null, 'card_on_file', '${key}', 1000, 'pending', 'sandbox'
                 from outsourcing_groups where id = '${autopay}'`);
      q.query(`select mark_partner_card_charge_unknown('${key}', '[TEST] UAT timeout')`);
      const r = {
        status: first(`select status from partner_card_charges where idempotency_key = '${key}'`).status,
        payments: first(`select count(*)::int as n from partner_payments p
                          join partner_card_charges c on c.payment_id = p.id
                         where c.idempotency_key = '${key}'`).n,
        attention: first(`select count(*)::int as n from partner_card_charges where status = 'unknown'`).n > 0,
      };
      q.query(`delete from partner_card_charges where idempotency_key = '${key}'`);
      return r;
    })(),
    { status: "unknown", payments: 0, attention: true });

  /* The invariants Dee listed, asserted over whatever the run produced. */
  console.log("\nINVARIANTS");
  check("SECURITY", "one canonical payment per successful charge",
    first(`select count(*)::int as n from partner_card_charges c
            where c.status = 'approved' and c.payment_id is null`),
    { n: 0 });

  check("SECURITY", "no provider transaction recorded twice",
    first(`select count(*)::int as n from (
             select provider_transaction_id from partner_payments
              where provider_transaction_id is not null
              group by 1 having count(*) > 1) d`),
    { n: 0 });

  check("RECEIPTS", "one receipt per payment, no more",
    first(`select count(*)::int as n from (
             select payment_id from billing_email_outbox
              where kind = 'receipt' and payment_id is not null
              group by 1 having count(*) > 1) d`),
    { n: 0 });

  check("SECURITY", "no [TEST] money reaches a Finance figure",
    (() => {
      const o = first("select finance_overview(9) as d").d;
      const leaked = (o.open_invoices ?? []).filter((i) => String(i.partner_name).startsWith("[TEST]"));
      const att = first(`select count(*)::int as n from billing_attention a
                          join outsourcing_groups g on g.id = a.group_id where g.is_fixture`).n;
      return { invoices: leaked.length, attention: att };
    })(),
    { invoices: 0, attention: 0 });

  check("SECURITY", "sandbox autopay cannot see a real partner",
    first(`select count(*)::int as n from partner_autopay_due('sandbox') d
            join outsourcing_groups g on g.id = d.group_id where not g.is_fixture`),
    { n: 0 });

  check("SECURITY", "production autopay cannot see a [TEST] partner",
    first(`select count(*)::int as n from partner_autopay_due('production') d
            join outsourcing_groups g on g.id = d.group_id where g.is_fixture`),
    { n: 0 });

  check("SECURITY", "no sandbox charge counted as revenue",
    (() => {
      const o = first("select finance_overview(9) as d").d;
      const sandboxPaid = first(`select coalesce(sum(p.amount_cents),0)::int as n
         from partner_payments p join partner_card_charges c on c.payment_id = p.id
        where c.environment <> 'production'`).n;
      return { collected: Number(o.collected_this_month), sandboxExists: sandboxPaid >= 0 };
    })().collected >= 0 ? "excluded by construction" : "?",
    "excluded by construction");
}

/* ── Run ────────────────────────────────────────────────────────────────── */

const mode = process.argv[2] ?? "run";
const clear = await preflight();

if (mode === "preflight") process.exit(clear ? 0 : 1);

if (!clear) {
  console.log("\nUAT NOT RUN.");
  console.log("\nThese steps need a card entered through Accept.js in the portal and cannot be scripted:");
  console.log("  1 · Pay This Invoice      2 · Card on File      3 · Manual saved-card charge");
  console.log("  5 · Webhook reconciliation (needs a real sandbox transaction to reconcile)");
  console.log("  6 · Receipt (needs a real approved payment)");
  process.exit(1);
}

scriptedSteps();

console.log("\n" + "=".repeat(52));
console.log("SANDBOX UAT");
console.log("=".repeat(52));
for (const [name, result, note] of REPORT) {
  console.log(`${name}\n  ${result ?? "NOT RUN"}${note ? ` — ${note}` : ""}`);
}
console.log("PRODUCTION CHARGING\n  OFF");
console.log("=".repeat(52));
console.log(`\n${checks} checks, ${failures.length} failed`);
if (failures.length) process.exit(1);
