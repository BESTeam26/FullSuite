#!/usr/bin/env node
/**
 * The Finance module, proved against the live database.
 *
 * Dee's rule for this module, 2026-09-17: "Agency Admin alone does NOT grant
 * financial access… UI hiding is not security. Verify direct database/API
 * access."
 *
 * So most of this probe is the same question asked three ways: as the owner,
 * as a real agency admin who holds no money grant, and as an ordinary agent.
 * Every Finance read is a database function, and every one of them is called
 * directly here — the way somebody with a console and a session token would,
 * with no screen in between.
 *
 *   node supabase/scripts/finance-probe.mjs
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

const OWNER = first("select user_id from agency_memberships where is_owner and status='active' limit 1")?.user_id;
/* A real admin with NO money grant of their own. Bryan holds an explicit
   payroll grant — a delegation the owner actually made — so using him would
   test his grant rather than the rule. */
const ADMIN = first(`select am.user_id from agency_memberships am
   where am.role = 'agency_admin' and not coalesce(am.is_owner, false) and am.status = 'active'
     and not exists (select 1 from agency_member_permissions amp
                      join permission_keys pk on pk.key = amp.key and pk.owner_gated
                     where amp.membership_id = am.id and amp.allowed)
   limit 1`)?.user_id;
const AGENT = first(`select user_id from agency_memberships
   where role = 'agency_user' and status = 'active' limit 1`)?.user_id;

if (!OWNER || !ADMIN || !AGENT) {
  console.log("FIXTURE FAILED: needs an owner, an admin with no money grant, and an agent.");
  console.log(`  owner=${OWNER} admin=${ADMIN} agent=${AGENT}`);
  process.exit(1);
}

/** Run as a real signed-in person, in a transaction that is rolled back. */
const as = (user, sql) => {
  try {
    return { rows: q.query(`begin; set local role authenticated;
      do $c$ begin perform set_config('request.jwt.claims','{"sub":"${user}","role":"authenticated"}',true); end $c$;
      ${sql} rollback;`) };
  } catch (e) { return { error: e.message }; }
};
const refused = (user, sql) => {
  const r = as(user, sql);
  if (!r.error) return "ALLOWED";
  return /42501/.test(r.error) ? "refused" : `OTHER ERROR: ${r.error.split("\n")[0].slice(0, 90)}`;
};
const value = (user, sql) => {
  const r = as(user, sql);
  return r.error ? { error: r.error.split("\n")[0].slice(0, 90) } : r.rows[0];
};

/* Every Finance read, called the way a console would call it. */
const READS = [
  ["finance_overview", "select jsonb_typeof(finance_overview(9)) as t;"],
  ["finance_payments", "select count(*)::int as n from finance_payments(10, null, null);"],
  ["finance_unmatched_payments", "select jsonb_array_length(finance_unmatched_payments()) as n;"],
];

console.log("\nTHE FINANCE MODULE");

console.log("\n  Who may read the money");
for (const [name, sql] of READS) {
  check(`1 — the owner may call ${name}`, !value(OWNER, sql)?.error, true);
}
for (const [name, sql] of READS) {
  check(`2 — an admin with no money grant is refused ${name}`, refused(ADMIN, sql), "refused");
}
for (const [name, sql] of READS) {
  check(`3 — an ordinary agent is refused ${name}`, refused(AGENT, sql), "refused");
}

console.log("\n  Matching a payment");
check("4 — matching is refused to an admin with no money grant",
  refused(ADMIN, `select match_partner_payment(
    '00000000-0000-4000-8000-000000000001'::uuid, '00000000-0000-4000-8000-000000000002'::uuid, null);`),
  "refused");

/* The owner passes the capability check and then hits the real rule: the
   payment does not exist. That is the correct refusal and a different one. */
check("5 — the owner passes the capability check and is stopped by the facts",
  (() => {
    const r = as(OWNER, `select match_partner_payment(
      '00000000-0000-4000-8000-000000000001'::uuid, '00000000-0000-4000-8000-000000000002'::uuid, null);`);
    return r.error?.includes("That payment does not exist") ? "the payment does not exist" : (r.error ?? "ALLOWED").split("\n")[0].slice(0, 60);
  })(),
  "the payment does not exist");

check("6 — there is exactly ONE match_partner_payment, so a call is not ambiguous",
  q.query(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'match_partner_payment'`)[0].n,
  1);

check("7 — a payment cannot be matched to another partner's invoice",
  (() => {
    /* Built and rolled back: two partners, a payment on one, an invoice on the
       other. The money belongs to whoever sent it. */
    const A = "c0dec0de-0000-4000-8000-00000000000a";
    const B = "c0dec0de-0000-4000-8000-00000000000b";
    const P = "c0dec0de-0000-4000-8000-00000000000c";
    const I = "c0dec0de-0000-4000-8000-00000000000d";
    const AG = first("select id from agencies order by created_at limit 1").id;
    const r = as(OWNER, `
      set local role postgres;
      insert into outsourcing_groups (id, agency_id, name, contact_email, status, is_fixture)
           values ('${A}', '${AG}', '[PROBE] A', 'a@bes.test', 'Active', true),
                  ('${B}', '${AG}', '[PROBE] B', 'b@bes.test', 'Active', true);
      insert into partner_payments (id, agency_id, group_id, provider, amount_cents, status, reconciliation_state)
           values ('${P}', '${AG}', '${A}', 'wise', 25000, 'succeeded', 'review_required');
      insert into partner_invoices (id, agency_id, group_id, invoice_number, issue_date, due_date,
             currency, subtotal_cents, discount_cents, tax_cents, total_cents, amount_paid_cents, status)
           values ('${I}', '${AG}', '${B}', 'PROBE-X', current_date, current_date, 'USD', 25000, 0, 0, 25000, 0, 'sent');
      set local role authenticated;
      do $c$ begin perform set_config('request.jwt.claims','{"sub":"${OWNER}","role":"authenticated"}',true); end $c$;
      select match_partner_payment('${P}'::uuid, '${I}'::uuid, null);`);
    return r.error?.includes("different partner") ? "refused" : (r.error ?? "ALLOWED").split("\n")[0].slice(0, 70);
  })(),
  "refused");

console.log("\n  The overview is a projection, not a copy");
const o = value(OWNER, "select finance_overview(9) as d;")?.d;
check("8 — it returns the sections the screen needs",
  o ? Object.keys(o).sort() : null,
  ["attention", "collected_this_month", "expenses_this_month", "months", "open_invoices",
   "partner_names", "recent_payments", "today"]);

/* The defect this catches: the attention lists returned bare group ids, so 22
   "a live service has no billing rate" rows rendered with "—" where the
   partner should be. A queue of problems nobody can pick up. */
check("8b — every partner the attention lists mention has a name to show",
  (() => {
    const names = o?.partner_names ?? {};
    const mentioned = [
      ...(o?.attention?.autopay_failed ?? []),
      ...(o?.attention?.missing_terms ?? []),
      ...(o?.attention?.suspended ?? []),
      ...(o?.open_invoices ?? []).map((i) => i.group_id),
    ];
    return mentioned.filter((g) => !names[g]);
  })(),
  []);

check("9 — the chart window has one point per month, none missing",
  o?.months?.length, 9);

check("10 — every open invoice it reports really is open",
  (() => {
    const ids = (o?.open_invoices ?? []).map((i) => `'${i.id}'`);
    if (ids.length === 0) return "none open";
    const bad = first(`select count(*)::int as n from partner_invoices
       where id in (${ids.join(",")})
         and (status not in ('sent','overdue','partially_paid') or invoice_balance_cents(id) <= 0)`).n;
    return bad === 0 ? "all open" : `${bad} are not`;
  })(),
  (o?.open_invoices ?? []).length === 0 ? "none open" : "all open");

check("11 — outstanding equals the sum of the invoice balances, not their face value",
  (() => {
    const reported = (o?.open_invoices ?? []).reduce((s, i) => s + Number(i.balance_cents), 0);
    const actual = first(`select coalesce(sum(invoice_balance_cents(id)), 0)::bigint as n
       from partner_invoices where status in ('sent','overdue','partially_paid')
         and invoice_balance_cents(id) > 0`).n;
    return reported === Number(actual) ? "agrees with the ledger" : `${reported} vs ${actual}`;
  })(),
  "agrees with the ledger");

check("12 — it writes nothing: the function is STABLE",
  first(`select provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'finance_overview'`),
  { provolatile: "s" });

console.log("\n  Reachability");
const grants = (fn) => first(
  `select coalesce(string_agg(distinct grantee, ','), 'nobody') as who
     from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name = '${fn}'
      and grantee in ('authenticated', 'anon', 'PUBLIC')`).who;

check("13 — finance_overview is reachable by a signed-in person, and gates itself",
  grants("finance_overview"), "authenticated");
check("14 — finance_payments the same", grants("finance_payments"), "authenticated");
check("15 — finance_unmatched_payments the same", grants("finance_unmatched_payments"), "authenticated");
check("16 — match_partner_payment the same", grants("match_partner_payment"), "authenticated");
check("17 — none of them is reachable by anon or PUBLIC",
  ["finance_overview", "finance_payments", "finance_unmatched_payments", "match_partner_payment"]
    .filter((f) => /anon|PUBLIC/.test(grants(f))),
  []);

console.log("\n  The capability keys the screen reads exist in the database");
check("18 — every key the Finance navigation gates on is a real permission key",
  (() => {
    const used = ["finance.dashboard.view", "billing.view", "billing.manage",
      "partners.invoices.view", "partners.invoices.manage", "partners.payments.record",
      "expenses.view", "payroll.view", "payroll.manage"];
    const known = new Set(q.query("select key from permission_keys").map((r) => r.key));
    return used.filter((k) => !known.has(k));
  })(),
  []);

check("19 — and every one of them is owner-gated, so an admin does not inherit it",
  q.query(`select key from permission_keys
            where key in ('finance.dashboard.view','billing.view','billing.manage',
                          'partners.invoices.view','partners.invoices.manage',
                          'partners.payments.record','expenses.view','payroll.view','payroll.manage')
              and not owner_gated`).map((r) => r.key),
  []);

console.log(`\n${failures.length ? "FAILURES" : "ALL PASS"} — ${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
