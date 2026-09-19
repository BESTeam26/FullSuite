/**
 * The Complaints & Mailing Agent access matrix — Dee, 2026-09-19.
 *
 * "WHAT WORK CAN I DO? Department / Team placement. WHO CAN I DO IT FOR?
 * Partner assignment / team-derived Partner assignment. WHAT EXACT RECORD
 * CAN I ACT ON? Client/work-item scope. All three must pass."
 *
 * The shape is BUILT, never assumed, inside a transaction that rolls back:
 * a real Agency User is placed on the Complaints & Mailing team; Partner A
 * is assigned to that team; Partner B has no assignment reaching them. Every
 * check runs as that user (jwt claims), against the real policies — the
 * preview is not the security test. No names are hardcoded: the agent is
 * whoever fits the shape; the partners are whichever hold clients.
 *
 * Run: node supabase/scripts/complaints-agent-matrix-probe.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });
let pass = 0; const failures = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  ok   ${name}`); } else { failures.push(name); console.log(`  FAIL ${name}\n       expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`); }
};
const one = (sql) => q.query(sql)[0];
const AGENCY = one("select id from agencies order by created_at limit 1").id;
const AGENT = one(`select p.id from profiles p join agency_memberships m on m.user_id=p.id and m.status='active'
   where coalesce(p.is_fixture,false)=false and m.role='agency_user' and not m.is_owner
     and not exists (select 1 from team_memberships tm where tm.user_id=p.id and tm.is_lead)
     and not exists (select 1 from partner_assignments pa where pa.user_id=p.id and pa.ended_on is null) limit 1`).id;
const TEAM = one(`select t.id from teams t join departments d on d.id=t.department_id where d.key='complaints' and t.archived_at is null and coalesce(t.is_fixture,false)=false and t.agency_id='${AGENCY}' limit 1`).id;
/* Partner A and B: two groups with clients; B must not reach the agent through any assignment. */
const partners = q.query(`select og.id, og.name, count(fc.id)::int as clients from outsourcing_groups og join fulfillment_clients fc on fc.outsourcing_group_id=og.id and fc.archived_at is null
   where og.agency_id='${AGENCY}' group by og.id, og.name order by clients desc limit 3`);
const A = partners[0], B = partners.find((p) => p.id !== A.id);
const clientsOf = (g) => one(`select count(*)::int as n from fulfillment_clients where outsourcing_group_id='${g}' and archived_at is null`).n;
const ALL = one("select count(*)::int as n from fulfillment_clients where archived_at is null").n;

const shape = `
  insert into public.team_memberships (team_id, user_id, is_lead) values ('${TEAM}', '${AGENT}', false) on conflict (team_id, user_id) do update set is_lead=false;
  delete from public.partner_assignments where team_id='${TEAM}' and group_id='${B.id}';
  insert into public.partner_assignments (agency_id, group_id, team_id, assignment_role) values ('${AGENCY}', '${A.id}', '${TEAM}', 'assigned');
  delete from public.partner_assignments where user_id='${AGENT}';`;
const session = `set local role authenticated; do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${AGENT}","role":"authenticated"}', true); end $c$;`;
const as = (sql) => q.query(`begin; ${shape} ${session} ${sql}; rollback;`);
const tryAs = (sql) => q.query(`begin; ${shape} ${session} do $c$ begin ${sql}; perform set_config('probe.r','ok',true); exception when others then perform set_config('probe.r', sqlstate, true); end $c$; select current_setting('probe.r', true) as r; rollback;`)[0].r;

console.log(`\nShape: agent on the Complaints & Mailing team · Partner A "${A.name}" (${A.clients} clients) assigned to the team · Partner B "${B.name}" (${B.clients} clients) unrelated · ${ALL} clients in all\n`);
console.log("Partners");
check("directly/team-assigned Partner A — ALLOW", as(`select count(*)::int as n from outsourcing_groups where id='${A.id}'`)[0].n, 1);
check("unrelated Partner B — DENY", as(`select count(*)::int as n from outsourcing_groups where id='${B.id}'`)[0].n, 0);
check("the partner directory is only the assigned ones", as("select count(*)::int as n from outsourcing_groups")[0].n, 1);

console.log("\nMain Client List (scoped)");
check("clients under Partner A — ALLOW", as(`select count(*)::int as n from fulfillment_clients where outsourcing_group_id='${A.id}' and archived_at is null`)[0].n, clientsOf(A.id));
check("clients under Partner B — DENY", as(`select count(*)::int as n from fulfillment_clients where outsourcing_group_id='${B.id}' and archived_at is null`)[0].n, 0);
check("the list is not every CreditOps client", as("select count(*)::int as n from fulfillment_clients where archived_at is null")[0].n < ALL, true);

console.log("\nQueues (department ∩ partner)");
const depts = as("select department::text as d, count(*)::int as n from client_department_statuses group by 1 order by 1");
check("only the Complaints queue is visible", depts.map((r) => r.d), depts.length ? ["Complaints"] : []);
check("and only over Partner A's clients", as(`select count(*)::int as n from client_department_statuses s join fulfillment_clients c on c.id=s.client_id where c.outsourcing_group_id='${B.id}'`)[0].n, 0);
check("Onboarding / Dispute / Support / Bureau Calling queues — DENY", as("select count(*)::int as n from client_department_statuses where department::text <> 'Complaints'")[0].n, 0);

console.log("\nMutations");
const clientA = one(`select id from fulfillment_clients where outsourcing_group_id='${A.id}' and archived_at is null limit 1`).id;
const clientB = one(`select id from fulfillment_clients where outsourcing_group_id='${B.id}' and archived_at is null limit 1`).id;
const log = (client) => `insert into public.production_logs (agency_id, employee_id, division_id, service, department_key, client_id, production_unit_type, production_unit_quantity, actions, work_date)
  values ('${AGENCY}', '${AGENT}', 'creditops', 'creditops', 'Complaints', '${client}', 'file', 1, array['Complaint Filed'], current_date)`;
check("logging Complaints work on a Partner A client — ALLOW", tryAs(log(clientA)), "ok");
check("logging work on a Partner B client — DENY", tryAs(log(clientB)) === "ok", false);

console.log(`\n${pass} passed, ${failures.length} failed`); failures.forEach((f) => console.log(`  - ${f}`));
process.exit(failures.length ? 1 : 0);
