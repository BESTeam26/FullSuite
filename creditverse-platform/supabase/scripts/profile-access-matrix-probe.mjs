/**
 * Two experiences, one record — Dee's access matrix, 2026-09-19.
 * Agent · Team Lead · Division Manager · Executive, each built in a rolled-back
 * transaction and measured against the REAL policies. No names.
 * Run: node supabase/scripts/profile-access-matrix-probe.mjs
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
const OWNER = one(`select user_id from agency_memberships where agency_id='${AGENCY}' and is_owner and status='active' limit 1`).user_id;
const AGENT = one(`select p.id from profiles p join agency_memberships m on m.user_id=p.id and m.status='active' where coalesce(p.is_fixture,false)=false and m.role='agency_user' and not m.is_owner and not exists (select 1 from team_memberships tm where tm.user_id=p.id and tm.is_lead) and not exists (select 1 from agency_member_permissions ap join agency_memberships mm on mm.id=ap.membership_id where mm.user_id=p.id and ap.allowed and ap.key in ('ops.manage','payroll.view','payroll.manage','team.manage','team.permissions','partners.assignments','settings.manage')) limit 1`).id;
const OTHER = one(`select p.id from profiles p join agency_memberships m on m.user_id=p.id and m.status='active' where coalesce(p.is_fixture,false)=false and p.id not in ('${OWNER}','${AGENT}') limit 1`).id;
const team = one(`select t.id, d.division::text as division from teams t join departments d on d.id=t.department_id where t.archived_at is null and coalesce(t.is_fixture,false)=false
   and exists (select 1 from team_memberships tm join agency_memberships m on m.user_id=tm.user_id and m.status='active' where tm.team_id=t.id and tm.user_id<>'${AGENT}') limit 1`);
const TEAMMATE = one(`select tm.user_id from team_memberships tm join agency_memberships m on m.user_id=tm.user_id and m.status='active' where tm.team_id='${team.id}' and tm.user_id<>'${AGENT}' limit 1`).user_id;
const OUTSIDER = one(`select m.user_id from agency_memberships m join profiles p on p.id=m.user_id where m.status='active' and coalesce(p.is_fixture,false)=false and m.user_id not in ('${AGENT}','${OWNER}')
   and not exists (select 1 from team_memberships tm join teams t on t.id=tm.team_id join departments d on d.id=t.department_id where tm.user_id=m.user_id and d.division::text='${team.division}') limit 1`)?.user_id;
const session = (u) => `set local role authenticated; do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true); end $c$;`;
const as = (u, sql, setup = "") => q.query(`begin; ${setup} ${session(u)} ${sql}; rollback;`)[0];
const tryAs = (u, sql, setup = "") => q.query(`begin; ${setup} ${session(u)} do $c$ begin ${sql}; perform set_config('probe.r','ok',true); exception when others then perform set_config('probe.r', sqlstate, true); end $c$; select current_setting('probe.r', true) as r; rollback;`)[0].r;
const asLead = `insert into public.team_memberships (team_id, user_id, is_lead) values ('${team.id}', '${AGENT}', true) on conflict (team_id, user_id) do update set is_lead = true;`;
/* Since D-021 (AD-008) a manager's reach comes from a SEAT, not from the
   scope column — which is now only a legacy ceiling nothing authorizes on.
   The persona is built the way the product builds it. */
const asDivMgr = `insert into public.management_seats (agency_id, user_id, seat, division_id, reason)
    select '${AGENCY}', '${AGENT}', 'division_manager', dv.id, 'probe'
      from public.divisions dv where dv.agency_id='${AGENCY}' and dv.service='${team.division}' and dv.archived_at is null;
  insert into public.agency_member_permissions (membership_id, key, allowed) select m.id, 'ops.manage', true from public.agency_memberships m where m.user_id='${AGENT}' and m.agency_id='${AGENCY}' on conflict (membership_id, key) do update set allowed = true;`;
const n = (u, sql, setup) => as(u, `select count(*)::int as n from ${sql}`, setup).n;

console.log("\nAgent");
check("own profile — ALLOW", n(AGENT, `profiles where id='${AGENT}'`), 1);
check("edit permitted self-service fields — ALLOW", tryAs(AGENT, `perform public.set_member_profile('${AGENT}', 'Probe Agent', null, null, null, 'probe')`), "ok");
check("own Agent ID view — ALLOW", as(AGENT, `select employee_code is not null as has from agency_memberships where user_id='${AGENT}'`).has, true);
check("Agent ID edit — DENY", tryAs(AGENT, `update public.agency_memberships set employee_code='XX-0000-99' where user_id='${AGENT}'`) === "ok" && as(AGENT, `select employee_code as c from agency_memberships where user_id='${AGENT}'`).c === "XX-0000-99", false);
check("performance weighting (management intelligence) — DENY", n(AGENT, "performance_policy"), 0);
check("QA sampling / reward exceptions — DENY", n(AGENT, "reward_sweep_exceptions where user_id is distinct from auth.uid()"), 0);
check("compensation — DENY", n(AGENT, "member_pay_rates"), 0);
check("access administration — DENY (others' grants)", n(AGENT, `agency_member_permissions ap join agency_memberships m on m.id=ap.membership_id where m.user_id<>'${AGENT}'`), 0);
check("another team member's management records — DENY (goals, corrections, production)", n(AGENT, `(select user_id from member_goals where user_id<>'${AGENT}' union all select user_id from attendance_corrections where user_id<>'${AGENT}' union all select employee_id from production_logs where employee_id<>'${AGENT}') x`), 0);
check("managed_people() is empty", n(AGENT, "public.managed_people()"), 0);

console.log("\nTeam Lead (built)");
check("authorized team member's operational records — ALLOW", n(AGENT, `public.managed_people() where user_id='${TEAMMATE}'`, asLead), 1);
check("performance weighting — ALLOW (reads the machinery)", n(AGENT, "performance_policy", asLead), 1);
check("unrelated team member — DENY", OUTSIDER ? n(AGENT, `public.managed_people() where user_id='${OUTSIDER}'`, asLead) : 0, 0);
check("compensation — DENY unless explicitly granted", n(AGENT, "member_pay_rates", asLead), 0);
check("access administration — DENY unless explicitly granted", n(AGENT, `agency_member_permissions ap join agency_memberships m on m.id=ap.membership_id where m.user_id<>'${AGENT}'`, asLead), 0);

console.log("\nDivision Manager (built)");
check("legitimate division workforce — ALLOW", n(AGENT, `public.managed_people() where user_id='${TEAMMATE}'`, asDivMgr), 1);
check("outside the division — DENY", OUTSIDER ? n(AGENT, `public.managed_people() where user_id='${OUTSIDER}'`, asDivMgr) : 0, 0);
check("compensation still independently gated — DENY", n(AGENT, "member_pay_rates", asDivMgr), 0);

console.log("\nExecutive (owner)");
check("organization-wide workforce — ALLOW", n(OWNER, "public.managed_people()") > 1, true);
check("performance weighting — ALLOW", n(OWNER, "performance_policy"), 1);
check("Agent ID change by the owner — ALLOW and audited", (() => {
  const r = q.query(`begin; ${session(OWNER)} update public.agency_memberships set employee_code='ZZ-0926-99' where user_id='${OTHER}';
    select count(*)::int as n from activity_events where entity_type='profile' and action='Employee ID changed' and entity_id='${OTHER}'; rollback;`)[0].n; return r; })(), 1);

console.log(`\n${pass} passed, ${failures.length} failed`); failures.forEach((f) => console.log(`  - ${f}`));
process.exit(failures.length ? 1 : 0);
