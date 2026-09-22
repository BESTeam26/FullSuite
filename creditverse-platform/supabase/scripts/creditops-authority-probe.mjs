/**
 * Who may CHANGE a CreditOps file, proved against production.
 *
 * Dee's ladder, 2026-09-22:
 *
 *   Agent               their own department / team / partner scope
 *   Team Lead           the teams they lead
 *   Department Manager  the departments they hold a seat over
 *   Division Manager    the CreditOps division they hold a seat over
 *   CEO / COO           organization-wide VISIBILITY, not action
 *   Original Owner      organization-wide operational management, granted
 *                       EXPLICITLY — never inherited from a team
 *
 * And the two rules underneath it: "Admin Team / Management Team … must not
 * be authorization sources", and "Do NOT let this grant Payroll/Finance
 * automatically."
 *
 * Every case runs inside a transaction and is rolled back.
 *
 * Run: node supabase/scripts/creditops-authority-probe.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });
let pass = 0; const failures = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}\n       expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`); }
};
const one = (sql) => q.query(sql)[0];
const as = (u) => `set local role authenticated; do $c$ begin perform set_config('request.jwt.claims','{"sub":"${u}","role":"authenticated"}',true); end $c$;`;

const who = (email) => one(`select m.user_id u from agency_memberships m join profiles p on p.id=m.user_id
                             where p.email='${email}' and m.status='active'`)?.u ?? null;
const OWNER = who("dee@blessedempireservices.com");
const COO   = who("aaron@blessedempireservices.com");
const AGENT = who("jetmanugas.bes@gmail.com");
const DEPTMGR = one(`select s.user_id u from management_seats s join departments d on d.id=s.department_id
                      where s.seat='department_manager' and d.key='dispute' limit 1`)?.u ?? null;

const scope = (u) => one(`begin; ${as(u)}
  select coalesce((select string_agg(s::text, ',' order by s::text) from public.creditops_work_scope() s), '') v;
  rollback;`).v;
const can = (u, key) => one(`begin; ${as(u)} select public.agency_can('${key}') v; rollback;`).v;

console.log("\nTHE LADDER — who may CHANGE which queue\n");
check("1 · the Original Owner works every queue", scope(OWNER),
  "Bureau Calling,Complaints,Dispute,Onboarding,Support");
check("2 · …and holds the capability explicitly, not by being an admin",
  can(OWNER, "creditops.work.manage"), true);
check("3 · the COO may change nothing, however much they can see", scope(COO), "");
check("4 · …and does not hold the capability", can(COO, "creditops.work.manage"), false);
check("5 · an agent works only their own team's queues", scope(AGENT), "Onboarding,Support");
if (DEPTMGR) {
  check("6 · a department manager works the departments they hold a seat over",
    scope(DEPTMGR).includes("Dispute"), true);
} else { pass += 1; console.log("  ok   6 · (no dispute department manager seated — nothing to check)"); }

console.log("\nADMIN IS NOT AUTHORITY, AND A TEAM IS NOT EITHER\n");
{
  /* Aaron is agency_admin AND is_owner AND holds a chief_operations seat. If
     any of those three leaked authority, scope(COO) above would not be empty.
     This states the rule the other way round: the key opts out of the admin
     short-circuit, and every other key still opts in. */
  check("7 · the new key is not granted automatically to admins",
    one(`select admin_auto a from permission_keys where key='creditops.work.manage'`).a, false);
  check("8 · and every other key still resolves exactly as before",
    one(`select count(*)::int n from permission_keys where not admin_auto and key <> 'creditops.work.manage'`).n, 0);
  /* The Admin Team is a department of its own; it maps to no CreditOps queue,
     so sitting on it grants nothing. */
  check("9 · the Admin Team maps to no CreditOps queue",
    one(`select coalesce((select string_agg(s::text, ',') from public.creditops_departments_of(
           array(select d.id from departments d join teams t on t.department_id = d.id
                  where t.name ilike '%admin%' and t.archived_at is null)) s), '') v`).v, "");
}

console.log("\nMONEY STAYS SEPARATE\n");
for (const key of ["payroll.view", "payroll.manage", "finance.dashboard.view",
                   "partners.financials.view", "compensation.bes_cost.view", "billing.manage"]) {
  /* An agent holding no CreditOps capability must hold no money capability
     either — and, more to the point, the new grant must not have created one. */
  check(`10 · ${key} is not granted by working CreditOps`, can(AGENT, key), false);
}

console.log("\nTHE WRITERS REFUSE, NOT JUST THE SCREEN\n");
{
  const client = one(`select id from fulfillment_clients where coalesce(is_fixture,false)=false limit 1`).id;
  const attempt = (u, dept, status) => {
    try {
      q.query(`begin; ${as(u)}
        select public.set_client_department_status('${client}','${dept}','${status}',null,'probe');
        rollback;`);
      return "written";
    } catch (e) {
      const m = String(e.message);
      if (m.includes("do not work the")) return "refused";
      return `error: ${m.split("\n")[0].slice(0, 70)}`;
    }
  };
  check("11 · the owner may set a Dispute status", attempt(OWNER, "Dispute", "READY FOR PROCESSING"), "written");
  check("12 · the COO may not, despite seeing every file", attempt(COO, "Dispute", "READY FOR PROCESSING"), "refused");
  check("13 · an agent may set a status in their own queue", attempt(AGENT, "Support", "SUPPORT NEW"), "written");
  check("14 · …and is refused in a queue they do not work", attempt(AGENT, "Bureau Calling", "BC NEEDED"), "refused");

  const handoff = (u, from) => {
    try {
      q.query(`begin; ${as(u)}
        select public.handoff_client_departments('${client}','${from}',
          array['Complaints']::fulfillment_department[], array['CM NOT NEEDED']::text[], 'probe');
        rollback;`);
      return "handed off";
    } catch (e) {
      const m = String(e.message);
      if (m.includes("hand this file on from it")) return "refused";
      return `error: ${m.split("\n")[0].slice(0, 70)}`;
    }
  };
  check("15 · an agent hands work on FROM a queue they work, TO one they do not",
    handoff(AGENT, "Support"), "handed off");
  check("16 · …but cannot hand on from a queue that was never theirs",
    handoff(AGENT, "Bureau Calling"), "refused");
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
