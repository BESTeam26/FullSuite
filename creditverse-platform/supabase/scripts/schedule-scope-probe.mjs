/**
 * Work schedules, from all four views — reads AND writes.
 *
 * Dee, 2026-09-19: "each tab proving both UI scope and backend scope." The
 * Schedule tab lists managed_people(); this proves the rows and the writer
 * agree with that list. Two views BES has nobody in today are BUILT (§20b),
 * inside transactions that roll back.
 *
 * Run: node supabase/scripts/schedule-scope-probe.mjs
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

/* A schedule row for EVERY active person, so a view with nothing to see is
   distinguishable from a view that is denied. Built, then rolled back. */
const seedAll = `insert into public.work_schedules (agency_id, user_id, shift_start, shift_end, effective_from)
  select m.agency_id, m.user_id, '09:00', '18:00', date '2020-01-01' from public.agency_memberships m
    join public.profiles p on p.id = m.user_id
   where m.status='active' and coalesce(p.is_fixture, false) = false
  on conflict (user_id, effective_from) do nothing;`;
/* Fixture accounts are excluded on purpose: managed_people() hides them from
   every roster, so a schedule row for one would read as "outside scope". */

const session = (viewer) => `set local role authenticated;
  do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${viewer}","role":"authenticated"}', true); end $c$;`;

/* How many OTHER people's schedules a viewer can read, and whether that is
   exactly the set managed_people() names. */
const readAs = (viewer, setup = "") => {
  const r = q.query(`begin; ${seedAll} ${setup} ${session(viewer)}
    select count(distinct user_id) filter (where user_id <> '${viewer}')::int as others,
           bool_or(user_id = '${viewer}') as sees_self,
           count(distinct user_id) filter (where user_id <> '${viewer}'
             and user_id not in (select user_id from public.managed_people()))::int as outside_scope
      from public.work_schedules;
    rollback;`)[0];
  return { others: r.others, self: r.sees_self ?? false, outsideScope: r.outside_scope };
};

/* Whether a viewer may SET a schedule for a target: "ok" or the SQLSTATE. */
const writeAs = (viewer, target, setup = "") => {
  const r = q.query(`begin; ${setup} ${session(viewer)}
    do $c$ begin
      perform public.set_work_schedule('${target}', '{1,2,3,4,5}', '09:00', '18:00', 60, 30, 5, 'America/New_York', date '2030-01-01');
      perform set_config('probe.result', 'ok', true);
    exception when others then
      perform set_config('probe.result', sqlstate, true);
    end $c$;
    select current_setting('probe.result', true) as result;
    rollback;`)[0];
  return r.result;
};

const active = q.query(`select m.user_id from agency_memberships m join profiles p on p.id=m.user_id
   where m.status='active' and coalesce(p.is_fixture,false)=false`).map((r) => r.user_id);
const ACTIVE = active.length;
const someoneElse = active.find((id) => id !== AGENT && id !== EXEC) ?? EXEC;

console.log("\nAgent\n");
check("reads only their own schedule", readAs(AGENT), { others: 0, self: true, outsideScope: 0 });
check("cannot set anybody's schedule, including their own", writeAs(AGENT, AGENT), "42501");

console.log("\nExecutive\n");
const exec = readAs(EXEC);
check("reads everybody's schedule", exec.others >= ACTIVE - 1 && exec.outsideScope === 0, true);
check("sets a schedule for anybody", writeAs(EXEC, someoneElse), "ok");

/* A lead, built: the agent made lead of one real team. */
const team = one(`select t.id, d.division::text as division
  from teams t join departments d on d.id=t.department_id
 where t.archived_at is null and coalesce(t.is_fixture,false)=false
   and exists (select 1 from team_memberships tm join agency_memberships m on m.user_id=tm.user_id and m.status='active'
                where tm.team_id=t.id and tm.user_id <> '${AGENT}')
 order by (select count(*) from team_memberships tm where tm.team_id=t.id) desc limit 1`);
const asLead = `insert into public.team_memberships (team_id, user_id, is_lead) values ('${team.id}', '${AGENT}', true)
  on conflict (team_id, user_id) do update set is_lead = true;`;
const teammate = one(`select tm.user_id from team_memberships tm join agency_memberships m on m.user_id=tm.user_id and m.status='active'
   where tm.team_id='${team.id}' and tm.user_id <> '${AGENT}' limit 1`).user_id;

console.log("\nTeam lead (built)\n");
const lead = readAs(AGENT, asLead);
check("reads their team's schedules and nothing outside it", lead.others > 0 && lead.outsideScope === 0, true);
check("reads their own too", lead.self, true);
check("does not SET a teammate's schedule — reading a team is not managing it", writeAs(AGENT, teammate, asLead), "42501");

/* A division manager, built: ops.manage scoped to one division. */
const asDivMgr = `update public.agency_memberships set scope='division', scope_division='${team.division}'
    where user_id='${AGENT}' and agency_id='${AGENCY}';
  insert into public.agency_member_permissions (membership_id, key, allowed)
    select m.id, 'ops.manage', true from public.agency_memberships m where m.user_id='${AGENT}' and m.agency_id='${AGENCY}'
  on conflict (membership_id, key) do update set allowed = true;`;
const outsideDivision = one(`select m.user_id from agency_memberships m join profiles p on p.id=m.user_id
   where m.status='active' and coalesce(p.is_fixture,false)=false and m.user_id <> '${AGENT}'
     and not exists (select 1 from team_memberships tm join teams t on t.id=tm.team_id and t.archived_at is null
                       join departments d on d.id=t.department_id
                      where tm.user_id=m.user_id and d.division::text='${team.division}') limit 1`)?.user_id;

console.log(`\nDivision manager (built, ${team.division})\n`);
const div = readAs(AGENT, asDivMgr);
check("reads their division's schedules and nothing outside it", div.others > 0 && div.outsideScope === 0, true);
check("…which is fewer than everybody", div.others < ACTIVE - 1, true);
check("sets a schedule inside the division", writeAs(AGENT, teammate, asDivMgr), "ok");
if (outsideDivision) check("cannot set a schedule outside the division", writeAs(AGENT, outsideDivision, asDivMgr), "42501");
else { failures.push("no person outside the division to test against"); console.log("  FAIL nobody outside the division to test against"); }

console.log(`\n${pass} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  - ${f}`));
process.exit(failures.length ? 1 : 0);
