/**
 * Employee IDs and profile editing, from the four views.
 * Run: node supabase/scripts/member-profile-probe.mjs
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
const EXEC = one(`select m.user_id from agency_memberships m join profiles p on p.id=m.user_id where m.agency_id='${AGENCY}' and m.role='agency_admin' and m.status='active' and coalesce(p.is_fixture,false)=false order by m.is_owner desc limit 1`).user_id;
const AGENT = one(`select p.id from profiles p join agency_memberships m on m.user_id=p.id and m.status='active' where coalesce(p.is_fixture,false)=false and m.role='agency_user' and not m.is_owner and not exists (select 1 from team_memberships tm where tm.user_id=p.id and tm.is_lead) limit 1`).id;
const OTHER = one(`select p.id from profiles p join agency_memberships m on m.user_id=p.id and m.status='active' where coalesce(p.is_fixture,false)=false and p.id not in ('${EXEC}','${AGENT}') limit 1`).id;
const session = (u) => `set local role authenticated; do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true); end $c$;`;
const tryAs = (u, sql) => q.query(`begin; ${session(u)} do $c$ begin ${sql}; perform set_config('probe.r','ok',true); exception when others then perform set_config('probe.r', sqlstate, true); end $c$; select current_setting('probe.r', true) as r; rollback;`)[0].r;

console.log("\nEmployee IDs\n");
check("every membership has a code shaped INITIALS + MMYYYY-NNN", one("select count(*)::int as n from agency_memberships where employee_code !~ '^[A-Z]{2}[0-9]{6}-[0-9]{3,}$' or employee_code is null").n, 0);
check("codes are unique within the agency", one("select count(*)::int as n from (select agency_id, employee_code from agency_memberships group by 1,2 having count(*)>1) d").n, 0);
check("real people are numbered among real people (the first is 001)", one(`select employee_code from agency_memberships m join profiles p on p.id=m.user_id where coalesce(p.is_fixture,false)=false and m.agency_id='${AGENCY}' order by m.created_at, m.id limit 1`).employee_code.endsWith("-001"), true);
check("fixtures carry the FX prefix", one("select count(*)::int as n from agency_memberships m join profiles p on p.id=m.user_id where p.is_fixture and employee_code not like 'FX%'").n, 0);
check("a new membership is coded on insert (rolled back)", q.query(`begin; insert into public.agency_memberships (user_id, agency_id, role) values ('${OTHER}', '${AGENCY}', 'agency_user') on conflict do nothing; select count(*)::int as n from agency_memberships where user_id='${OTHER}' and employee_code is null; rollback;`)[0].n, 0);

console.log("\nWho may edit a profile\n");
const edit = (viewer, target) => tryAs(viewer, `perform public.set_member_profile('${target}', 'Probe Name', null, null, null, 'probe')`);
check("a person edits their own profile", edit(AGENT, AGENT), "ok");
check("an agent may not edit a colleague's profile", edit(AGENT, OTHER), "42501");
check("management edits a person in scope", edit(EXEC, OTHER), "ok");
check("an avatar must live in its owner's folder", tryAs(EXEC, `perform public.set_member_avatar('${OTHER}', '${AGENT}/x.png')`) === "ok", false);
check("management sets a photo in the right folder", tryAs(EXEC, `perform public.set_member_avatar('${OTHER}', '${OTHER}/x.png')`), "ok");
check("a manager's edit is audited with both values", q.query(`begin; ${session(EXEC)} select public.set_member_profile('${OTHER}', 'Probe Name', null, null, null, 'probe');
  select count(*)::int as n from activity_events where entity_type='profile' and entity_id='${OTHER}' and actor_id='${EXEC}' and previous_value is not null and new_value like '%Probe Name%'; rollback;`)[0].n, 1);
console.log(`\n${pass} passed, ${failures.length} failed`); failures.forEach((f) => console.log(`  - ${f}`));
process.exit(failures.length ? 1 : 0);
