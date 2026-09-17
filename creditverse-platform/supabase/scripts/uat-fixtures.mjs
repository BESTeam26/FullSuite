#!/usr/bin/env node
/**
 * The [TEST] world for Authorize.Net sandbox UAT.
 *
 * Dee, 2026-09-17: "Use only clearly marked [TEST] Partner/invoice/payment
 * records. Do not touch real open invoices."
 *
 * So this creates them, and nothing else does. Every partner it makes is named
 * `[TEST] …`, carries `is_fixture = true`, and uses an address at `bes.test` —
 * a reserved TLD that cannot receive mail, so a receipt or an invoice queued
 * against one of these can never reach a real person.
 *
 * `is_fixture` is load-bearing, not decoration:
 *
 *   - `billing_recurring_sweep` skips fixture partners entirely, so these
 *     never appear in the real monthly run
 *   - `partner_autopay_due('sandbox')` returns ONLY fixture partners, and
 *     `partner_autopay_due('production')` returns only real ones
 *
 * Commands:
 *
 *   node supabase/scripts/uat-fixtures.mjs create   build the [TEST] world
 *   node supabase/scripts/uat-fixtures.mjs show     what exists right now
 *   node supabase/scripts/uat-fixtures.mjs destroy  remove it, and only it
 *
 * `destroy` deletes by the fixture flag AND the `[TEST] ` name prefix AND the
 * fixed ids below — three conditions, because a delete against money tables
 * that gets its WHERE clause wrong is not something you find out about later.
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";

const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });

const first = (sql) => q.query(sql)[0];
const AGENCY = first("select id from agencies order by created_at limit 1")?.id;
if (!AGENCY) { console.log("No agency. Nothing to do."); process.exit(1); }

/* Fixed ids so a rerun is idempotent and `destroy` knows exactly what to take.
   Hex only — "test" is not hex, and a probe once lost eight checks to that.

   The invoice ids are written out rather than derived from the partner's.
   The first version built them with `id.replace(/.$/, "a")`, which changes
   only the LAST character — so all five collided on one id and four invoices
   were silently swallowed by `on conflict do nothing`. The fixture reported
   success and created one invoice. The invoice NUMBER had the same fault, and
   the (agency_id, invoice_number) unique index caught that one loudly, which
   is the difference between a constraint and a hope. */
const ID = {
  payNow:    "7e57c0de-0000-4000-8000-000000000001",
  onFile:    "7e57c0de-0000-4000-8000-000000000002",
  autopay:   "7e57c0de-0000-4000-8000-000000000003",
  manual:    "7e57c0de-0000-4000-8000-000000000004",
  suspended: "7e57c0de-0000-4000-8000-000000000005",
};
const GROUPS = Object.values(ID);

/** Each partner exists to exercise one row of Dee's UAT order. */
const WORLD = [
  { id: ID.payNow,    invoice: "7e57c0de-0000-4000-8000-00000000a001", name: "[TEST] Pay This Invoice", why: "1 · one-time card, no card kept",        cents: 12500, dueIn: 7,   card: false, autopay: false },
  { id: ID.onFile,    invoice: "7e57c0de-0000-4000-8000-00000000a002", name: "[TEST] Card On File",     why: "2, 3 · save a card, then charge it",     cents: 42500, dueIn: 5,   card: false, autopay: false },
  { id: ID.autopay,   invoice: "7e57c0de-0000-4000-8000-00000000a003", name: "[TEST] AutoPay",          why: "4 · unattended sweep, sandbox only",     cents: 25000, dueIn: -1,  card: true,  autopay: true  },
  { id: ID.manual,    invoice: "7e57c0de-0000-4000-8000-00000000a004", name: "[TEST] Manual Rails",     why: "7, 8 · partial, overpayment, matching",  cents: 30000, dueIn: 10,  card: false, autopay: false },
  { id: ID.suspended, invoice: "7e57c0de-0000-4000-8000-00000000a005", name: "[TEST] Suspension",       why: "15 · reminders, suspension, reactivate", cents: 18000, dueIn: -40, card: false, autopay: false },
];

const sql = (strings, ...values) => strings.reduce((out, s, i) => out + s + (values[i] ?? ""), "");

function create() {
  const statements = ["begin;"];
  for (const p of WORLD) {
    const invoice = p.invoice;
    statements.push(sql`
      insert into outsourcing_groups
        (id, agency_id, name, contact_email, status, is_fixture, portal_access_enabled, lifecycle)
      values ('${p.id}', '${AGENCY}', '${p.name}', '${p.id.slice(0, 8)}@bes.test',
              'Active', true, true, 'active')
      on conflict (id) do update set name = excluded.name, is_fixture = true,
              portal_access_enabled = true, lifecycle = 'active';

      insert into partner_contacts (group_id, agency_id, full_name, email, status, is_primary)
      select '${p.id}', '${AGENCY}', 'UAT Contact', '${p.id.slice(0, 8)}@bes.test', 'active', true
       where not exists (select 1 from partner_contacts where group_id = '${p.id}');

      /* An invoice per partner, issued ten days before it is due so the
         due_date >= issue_date constraint is satisfied for the overdue one. */
      insert into partner_invoices
        (id, agency_id, group_id, invoice_number, issue_date, due_date, currency,
         subtotal_cents, discount_cents, tax_cents, total_cents, amount_paid_cents, status, notes)
      values ('${invoice}', '${AGENCY}', '${p.id}', 'TEST-${p.invoice.slice(-4).toUpperCase()}',
              current_date + ${p.dueIn} - 10, current_date + ${p.dueIn}, 'USD',
              ${p.cents}, 0, 0, ${p.cents}, 0, 'sent',
              '[TEST] UAT fixture — ${p.why}')
      on conflict (id) do nothing;

      insert into partner_invoice_lines
        (invoice_id, description, quantity, unit_label, unit_amount_cents, amount_cents, sort)
      select '${invoice}', '[TEST] UAT line', 1, 'cycle', ${p.cents}, ${p.cents}, 10
       where not exists (select 1 from partner_invoice_lines where invoice_id = '${invoice}');
    `);
    if (p.card) {
      /* A placeholder vault row so the AutoPay partner is sweepable before a
         real sandbox card is saved. The ids are obviously not Authorize.Net's;
         saving a real sandbox card through the portal replaces this row. */
      statements.push(sql`
        insert into partner_payment_profiles
          (agency_id, group_id, customer_profile_id, payment_profile_id, card_brand, last4,
           exp_month, exp_year, is_default, autopay_enabled)
        values ('${AGENCY}', '${p.id}', 'uat_placeholder_cust', 'uat_placeholder_pay',
                'Visa', '4242', 12, 2030, true, ${p.autopay})
        on conflict (group_id) where is_default do nothing;
      `);
    }
  }
  statements.push("commit;");
  q.query(statements.join("\n"));

  /* Counted back, not assumed. The first version of this script reported
     success while silently creating one invoice out of five. */
  const made = first(`select count(*)::int as n from partner_invoices
                       where id in (${WORLD.map((p) => `'${p.invoice}'`).join(",")})`).n;
  if (made !== WORLD.length) {
    console.log(`FIXTURE INCOMPLETE: expected ${WORLD.length} invoices, found ${made}.`);
    process.exitCode = 1;
  } else {
    console.log("Created the [TEST] world.\n");
  }
  show();
}

function show() {
  const rows = q.query(`
    select g.name, g.is_fixture,
           (select count(*)::int from partner_invoices i where i.group_id = g.id) as invoices,
           coalesce((select sum(public.invoice_balance_cents(i.id))
                       from partner_invoices i where i.group_id = g.id), 0)::bigint as owed,
           (select count(*)::int from partner_payment_profiles p where p.group_id = g.id) as cards,
           coalesce((select bool_or(p.autopay_enabled) from partner_payment_profiles p where p.group_id = g.id), false) as autopay,
           (select count(*)::int from partner_card_charges c where c.group_id = g.id) as attempts,
           (select count(*)::int from partner_payments pm where pm.group_id = g.id) as payments
      from outsourcing_groups g
     where g.id in (${GROUPS.map((g) => `'${g}'`).join(",")})
     order by g.name`);

  if (rows.length === 0) { console.log("No [TEST] fixtures exist."); return; }
  console.log("PARTNER                        INV   OWED    CARD  AUTOPAY  ATTEMPTS  PAYMENTS");
  for (const r of rows) {
    console.log(
      `${r.name.padEnd(30)} ${String(r.invoices).padStart(3)}  ` +
      `${("$" + (Number(r.owed) / 100).toFixed(2)).padStart(8)}  ` +
      `${(r.cards > 0 ? "yes" : "—").padStart(4)}  ${(r.autopay ? "ON" : "off").padStart(7)}  ` +
      `${String(r.attempts).padStart(8)}  ${String(r.payments).padStart(8)}`);
  }

  /* The safety property, restated every time somebody looks. */
  const leak = first(`select count(*)::int as n from partner_autopay_due('sandbox') d
                       join outsourcing_groups g on g.id = d.group_id where not g.is_fixture`);
  console.log(`\nSandbox autopay would touch ${leak.n} real partner(s) — must be 0.`);
  const real = first(`select count(*)::int as n from partner_autopay_due('production')`);
  console.log(`Production autopay would charge ${real.n} invoice(s), and is switched off.`);
}

function destroy() {
  const ids = GROUPS.map((g) => `'${g}'`).join(",");
  /* Three conditions, deliberately. A delete on money tables with one
     mistaken clause is not a thing you discover later. */
  const guard = `g.id in (${ids}) and g.is_fixture and g.name like '[TEST] %'`;
  const doomed = q.query(`select g.id from outsourcing_groups g where ${guard}`).map((r) => `'${r.id}'`);
  if (doomed.length === 0) { console.log("Nothing to remove."); return; }

  q.query(`
    begin;
      delete from partner_card_charges where group_id in (${doomed.join(",")});
      delete from partner_payments where group_id in (${doomed.join(",")});
      delete from partner_account_credit_ledger where group_id in (${doomed.join(",")});
      delete from billing_email_outbox where group_id in (${doomed.join(",")});
      delete from partner_invoice_reminders where group_id in (${doomed.join(",")});
      delete from partner_suspension_invoices where suspension_id in
        (select id from partner_suspensions where group_id in (${doomed.join(",")}));
      delete from partner_suspensions where group_id in (${doomed.join(",")});
      delete from partner_invoice_lines where invoice_id in
        (select id from partner_invoices where group_id in (${doomed.join(",")}));
      delete from partner_invoices where group_id in (${doomed.join(",")});
      delete from partner_payment_profiles where group_id in (${doomed.join(",")});
      delete from partner_contacts where group_id in (${doomed.join(",")});
      delete from outsourcing_groups where id in (${doomed.join(",")});
    commit;`);
  console.log(`Removed ${doomed.length} [TEST] partner(s) and everything attached to them.`);
}

const command = process.argv[2] ?? "show";
if (command === "create") create();
else if (command === "destroy") destroy();
else if (command === "show") show();
else { console.log("Usage: uat-fixtures.mjs create | show | destroy"); process.exit(1); }
