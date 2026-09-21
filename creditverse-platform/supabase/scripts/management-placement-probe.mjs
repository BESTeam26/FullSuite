/**
 * D-021 — management placement is scope. Eight personas, one rule each.
 * Run: node supabase/scripts/management-placement-probe.mjs
 *
 * Every write is rolled back. Seats the fixtures do not hold are granted
 * INSIDE the transaction so the persona exists only for the length of the
 * check. Real people (Bryan, JM, the Tech Support login) are read as
 * themselves, read-only, because their capabilities are the thing under test.
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });
let pass = 0; const failures = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  ok   ${name}`); } else { failures.push(name); console.log(`  FAIL ${name}\n       expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`); }
};
const one = (sql) => q.query(sql)[0];
const U = Object.fromEntries(q.query(`select email, id from profiles where email in ('bes.credit@bes.test','bes.lead@bes.test','bes.manager@bes.test','bes.funding@bes.test','bes.restricted@bes.test','probe.agent@bes.test','lordvrye.bes@gmail.com','navalesjorelynmae.bes@gmail.com','wecare@blessedempireservices.com')`).map((r) => [r.email, r.id]));
const AG = one("select id from agencies order by created_at limit 1").id;
const CREDITOPS = one(`select id from divisions where agency_id='${AG}' and service='creditops' and archived_at is null`).id;
/* By KEY, never by name: a department renamed in Settings must not break the
   probe, exactly as it must not drop somebody out of their own queue. The
   name moved to "Dispute Department" on 2026-09-21 and this line was the only
   thing that noticed. */
const DISPUTE = one(`select id from departments where agency_id='${AG}' and key='dispute' and division='creditops' and archived_at is null`).id;
const CEDAR = one(`select id from fulfillment_clients where name='[TEST] Cleo Chan'`).id;   // Team B, Onboarding
const LAKESIDE = one(`select id from fulfillment_clients where name='[TEST] Evan Ellis'`).id; // Team A, Dispute
const session = (u) => `set local role authenticated; do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true); end $c$;`;
const as = (u, sql, seed = "") => q.query(`begin; ${seed} ${session(u)} ${sql}; rollback;`)[0];
const seat = (u, kind, div, dept) => `insert into public.management_seats (agency_id, user_id, seat, division_id, department_id, reason) values ('${AG}','${u}','${kind}',${div ? `'${div}'` : "null"},${dept ? `'${dept}'` : "null"},'probe');`;
const S = `select
  (select count(*)::int from public.fulfillment_clients where archived_at is null) as clients,
  (select count(*)::int from public.fulfillment_clients where id='${CEDAR}') as cedar,
  (select count(*)::int from public.fulfillment_clients where id='${LAKESIDE}') as lakeside,
  (select count(*)::int from public.work_items) as work,
  (select count(*)::int from public.workspaces where module='talentops') as talentops_ws,
  (select count(*)::int from public.member_pay_rates) as pay_rates,
  (select count(*)::int from public.payslips) as payslips,
  (select count(*)::int from public.member_payout_accounts where user_id <> auth.uid()) as others_payout,
  public.agency_can('payroll.view') as payroll_view,
  (public.agency_can('compensation.agent_rate.view') or public.agency_can('compensation.bes_cost.view') or public.agency_can('compensation.arrangement.manage')) as compensation_view,
  public.agency_can('finance.dashboard.view') as finance_view,
  public.agency_can('expenses.view') as expenses_view,
  public.agency_can('partners.invoices.manage') as invoices_manage`;
/* What BES may reach at all: an owner's count. An organization-held client
   with no live engagement is invisible to every BES person, admin included
   (rule 16) — so "everything" is measured against the owner, never the table. */
const total = as(one("select id from profiles where email='bes.owner@bes.test'").id, S).clients;

console.log("\nAgent (bes.credit — Team A, assigned scope)\n");
let r = as(U["bes.credit@bes.test"], S);
check("sees the Dispute department's queue (Lakeside on Team A)", r.lakeside, 1);
check("does not see another department's client (Cedar, Onboarding)", r.cedar, 0);
check("sees no pay rates, payslips or anyone else's payout account", [r.pay_rates, r.payslips, r.others_payout], [0, 0, 0]);
check("holds no money capability", [r.payroll_view, r.compensation_view, r.finance_view], [false, false, false]);

console.log("\nTeam Lead (bes.lead — leads Team A)\n");
r = as(U["bes.lead@bes.test"], S);
check("reaches Team A's client without an individual assignment", r.lakeside, 1);
check("does not reach Onboarding's client", r.cedar, 0);
check("no pay rates, payslips, payout accounts", [r.pay_rates, r.payslips, r.others_payout], [0, 0, 0]);

console.log("\nDepartment Manager (bes.funding + a Dispute seat granted in-transaction; on no team)\n");
r = as(U["bes.funding@bes.test"], S, seat(U["bes.funding@bes.test"], "department_manager", null, DISPUTE));
check("reaches the whole Dispute department without team membership", r.lakeside, 1);
check("does not reach Onboarding (Cedar)", r.cedar, 0);
check("the seat grants no money", [r.pay_rates, r.payslips, r.payroll_view, r.compensation_view], [0, 0, false, false]);
const before = as(U["bes.funding@bes.test"], S);
check("…and without the seat the same person reaches neither", [before.lakeside, before.cedar], [0, 0]);

console.log("\nDivision Manager (bes.manager — CreditOps seat, no team, no partner assignment)\n");
r = as(U["bes.manager@bes.test"], S);
check("reaches every live CreditOps client (Lakeside and Cedar)", [r.lakeside, r.cedar], [1, 1]);
check("reaches at least the fixture division's clients", r.clients >= 2, true);
check("does not reach a TalentOps workspace", r.talentops_ws, 0);
check("no pay rates, no payslips, no money capability", [r.pay_rates, r.payslips, r.payroll_view, r.compensation_view, r.finance_view], [0, 0, false, false, false]);
check("may write a department status for a division client", (() => { try { return as(U["bes.manager@bes.test"], `select public.set_client_department_status('${LAKESIDE}','Support','billing issue',null,null) as r`).r !== undefined; } catch { return false; } })(), true);

console.log("\nChief Operations (bes.restricted + a chief_operations seat in-transaction)\n");
r = as(U["bes.restricted@bes.test"], S, seat(U["bes.restricted@bes.test"], "chief_operations"));
/* At least everything an owner reaches — the fixture also holds an own
   assignment on a self-serve organization's client the owner has no
   engagement with, which is the assignment rule, not the seat. */
check("reaches at least everything an owner reaches", r.clients >= total && r.lakeside === 1 && r.cedar === 1, true);
check("reaches TalentOps workspaces too", r.talentops_ws > 0, true);
check("still no payroll, compensation or finance", [r.pay_rates, r.payslips, r.payroll_view, r.compensation_view, r.finance_view, r.expenses_view], [0, 0, false, false, false, false]);

console.log("\nManaging Partner (Bryan — workforce + payroll + compensation, no finance)\n");
r = as(U["lordvrye.bes@gmail.com"], S);
check("reads pay rates and payslips", [r.pay_rates > 0, r.payroll_view, r.compensation_view], [true, true, true]);
check("reads others' payout accounts (payroll capability)", r.others_payout > 0, true);
check("holds no company finance capability", [r.finance_view, r.expenses_view], [false, false]);

console.log("\nExecutive Assistant (JM — partners, invoicing, collections; no payroll)\n");
r = as(U["navalesjorelynmae.bes@gmail.com"], S);
check("may manage partner invoices", r.invoices_manage, true);
check("holds no payroll or compensation capability", [r.payroll_view, r.compensation_view], [false, false]);
check("reads no pay rates, payslips or others' payout accounts", [r.pay_rates, r.payslips, r.others_payout], [0, 0, 0]);

console.log("\nAdmin alone (Tech Support Team — agency_admin, no grants)\n");
r = as(U["wecare@blessedempireservices.com"], S);
check("admin reaches operations", r.clients, total);
check("admin alone grants zero payroll", [r.pay_rates, r.payslips, r.payroll_view, r.compensation_view], [0, 0, false, false]);

console.log("\nSeats are administered, never self-granted\n");
const tryAs = (u, sql) => q.query(`begin; ${session(u)} do $c$ begin ${sql}; perform set_config('probe.r','ok',true); exception when others then perform set_config('probe.r', sqlstate, true); end $c$; select current_setting('probe.r', true) as r; rollback;`)[0].r;
check("an agent cannot grant themselves a seat", tryAs(U["bes.credit@bes.test"], `insert into public.management_seats (agency_id, user_id, seat, division_id) values ('${AG}','${U["bes.credit@bes.test"]}','division_manager','${CREDITOPS}')`), "42501");
check("a division manager cannot grant seats either", tryAs(U["bes.manager@bes.test"], `insert into public.management_seats (agency_id, user_id, seat, department_id) values ('${AG}','${U["bes.credit@bes.test"]}','department_manager','${DISPUTE}')`), "42501");
check("a seat grant by an admin is audited (rolled back)", q.query(`begin; ${session(U["wecare@blessedempireservices.com"])} ${seat(U["bes.credit@bes.test"], "department_manager", null, DISPUTE)} select count(*)::int as n from public.activity_events where entity_id='${U["bes.credit@bes.test"]}' and field='management_seat' and created_at >= now() - interval '5 seconds'; rollback;`)[0].n, 1);
check("the department's manager projection follows the seat (rolled back)", q.query(`begin; ${session(U["wecare@blessedempireservices.com"])} ${seat(U["bes.credit@bes.test"], "department_manager", null, DISPUTE)} select (manager_id='${U["bes.credit@bes.test"]}') as m from public.departments where id='${DISPUTE}'; rollback;`)[0].m, true);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log("  - " + f); process.exit(1); }
