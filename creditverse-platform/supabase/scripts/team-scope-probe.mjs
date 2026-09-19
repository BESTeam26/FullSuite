/**
 * Team Management scope, from all four views.
 *
 * Dee, 2026-09-19: "each tab proving both UI scope and backend scope."
 * `managed_people()` is the backend half; every tab lists exactly this set.
 * Two views BES has nobody in today are BUILT (§20b).
 *
 * Run: node supabase/scripts/team-scope-probe.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";

const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });
let pass = 0; const failures = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}\n       expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`); }
};
const one = (sql) => q.query(sql)[0];
const AGENCY = one("select id from agencies order by created_at limit 1").id;
const EXEC = one(`select m.user_id from agency_memberships m join profiles p on p.id=m.user_id
   where m.agency_id='${AGENCY}' and m.role='agency_admin' and m.status='active' and coalesce(p.is_fixture,false)=false limit 1`).user_id;
const AGENT = one(`select p.id from profiles p join agency_memberships m on m.user_id=p.id and m.status='active'
   where coalesce(p.is_fixture,false)=false and m.role='agency_user' and not m.is_owner
     and not exists (select 1 from team_memberships tm where tm.user_id=p.id and tm.is_lead) limit 1`).id;
const ACTIVE = one(`select count(*)::int as n from agency_memberships m join profiles p on p.id=m.user_id
   where m.status='active' and coalesce(p.is_fixture,false)=false`).n;

const scopeAs = (viewer, setup = "") => {
  const r = q.query(`begin; ${setup}
    set local role authenticated;
    do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${viewer}","role":"authenticated"}', true); end $c$;
    select count(*)::int as n, bool_or(user_id = '${viewer}') as includes_self from public.managed_people();
    rollback;`)[0];
  return { n: r.n, self: r.includes_self ?? false };
};

console.log("\nWho is in my management scope\n");
check("an agent manages nobody", scopeAs(AGENT), { n: 0, self: false });
check("an executive manages everybody except themselves", scopeAs(EXEC), { n: ACTIVE - 1, self: false });

/* A lead, built: the agent made lead of one real team. */
const team = one(`select t.id, d.division::text as division,
    (select count(*)::int from team_memberships tm join profiles p on p.id=tm.user_id
       join agency_memberships m on m.user_id=tm.user_id and m.status='active'
      where tm.team_id=t.id and coalesce(p.is_fixture,false)=false and tm.user_id <> '${AGENT}') as others
  from teams t join departments d on d.id=t.department_id
 where t.archived_at is null and coalesce(t.is_fixture,false)=false
   and exists (select 1 from team_memberships tm where tm.team_id=t.id and tm.user_id <> '${AGENT}')
 order by others desc limit 1`);
const asLead = `insert into public.team_memberships (team_id, user_id, is_lead) values ('${team.id}', '${AGENT}', true)
  on conflict (team_id, user_id) do update set is_lead = true;`;
check("a (built) team lead manages exactly their team, not themselves", scopeAs(AGENT, asLead), { n: team.others, self: false });

/* A division manager, built: ops.manage scoped to one division. */
const inDivision = one(`select count(distinct tm.user_id)::int as n from team_memberships tm
    join teams t on t.id=tm.team_id and t.archived_at is null join departments d on d.id=t.department_id
    join profiles p on p.id=tm.user_id join agency_memberships m on m.user_id=tm.user_id and m.status='active'
   where d.division::text='${team.division}' and coalesce(p.is_fixture,false)=false and tm.user_id <> '${AGENT}'`).n;
const asDivMgr = `update public.agency_memberships set scope='division', scope_division='${team.division}'
    where user_id='${AGENT}' and agency_id='${AGENCY}';
  insert into public.agency_member_permissions (membership_id, key, allowed)
    select m.id, 'ops.manage', true from public.agency_memberships m where m.user_id='${AGENT}' and m.agency_id='${AGENCY}'
  on conflict (membership_id, key) do update set allowed = true;`;
check(`a (built) division manager manages the ${team.division} division only`, scopeAs(AGENT, asDivMgr), { n: inDivision, self: false });
check("…which is fewer than everybody", inDivision < ACTIVE - 1, true);

console.log(`\n${pass} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  - ${f}`));
process.exit(failures.length ? 1 : 0);
