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
check("engagement_type accepts only employee|contractor", tryAs(EXEC, `update public.agency_memberships set engagement_type='volunteer' where user_id='${AGENT}'`), "23514");
check("an agent cannot set their own engagement type (RLS: zero rows touched)", q.query(`begin; ${session(AGENT)} update public.agency_memberships set engagement_type = case when engagement_type = 'contractor' then 'employee' else 'contractor' end where user_id='${AGENT}' returning 1; rollback;`).length, 0);
check("an agent reads their own engagement type", q.query(`begin; ${session(AGENT)} select count(*)::int as n from public.agency_memberships where user_id='${AGENT}'; rollback;`)[0].n, 1);
check("an executive's change is audited with previous and new value (rolled back)", q.query(`begin; ${session(EXEC)} update public.agency_memberships set engagement_type='contractor' where user_id='${AGENT}'; select count(*)::int as n from public.activity_events where entity_type='profile' and entity_id='${AGENT}' and field='engagement_type' and new_value='contractor'; rollback;`)[0].n, 1);

check("every membership has a code shaped INITIALS + MMYYYY-NNN", one("select count(*)::int as n from agency_memberships where employee_code !~ '^[A-Z]{2}[0-9]{6}-[0-9]{3,}$' or employee_code is null").n, 0);
check("codes are unique within the agency", one("select count(*)::int as n from (select agency_id, employee_code from agency_memberships group by 1,2 having count(*)>1) d").n, 0);
check("real people are numbered among real people by join date (the first is 001)", one(`select employee_code from agency_memberships m join profiles p on p.id=m.user_id where coalesce(p.is_fixture,false)=false and m.agency_id='${AGENCY}' order by coalesce(m.hired_on::timestamptz, m.created_at), m.id limit 1`).employee_code.endsWith("-001"), true);
check("fixtures carry the FX prefix", one("select count(*)::int as n from agency_memberships m join profiles p on p.id=m.user_id where p.is_fixture and employee_code not like 'FX%'").n, 0);
check("a new membership is coded on insert (rolled back)", q.query(`begin; insert into public.agency_memberships (user_id, agency_id, role) values ('${OTHER}', '${AGENCY}', 'agency_user') on conflict do nothing; select count(*)::int as n from agency_memberships where user_id='${OTHER}' and employee_code is null; rollback;`)[0].n, 0);

console.log("\nPrivate records and payout accounts (four views)\n");
const LEAD = one(`select tm.user_id from team_memberships tm join agency_memberships m on m.user_id=tm.user_id and m.status='active' and m.role='agency_user' join profiles p on p.id=tm.user_id where tm.is_lead and coalesce(p.is_fixture,false)=false and tm.user_id<>'${AGENT}' limit 1`)?.user_id ?? null;
const countAs = (u, sql) => q.query(`begin; ${session(u)} select count(*)::int as n from (${sql}) x; rollback;`)[0].n;
check("an agent reads their own private record only", countAs(AGENT, `select 1 from member_private_records where user_id<>'${AGENT}'`), 0);
check("an agent cannot record their own date of birth", tryAs(AGENT, `insert into public.member_private_records (user_id, agency_id, date_of_birth) values ('${AGENT}', '${AGENCY}', '2000-01-01') on conflict (user_id) do update set date_of_birth = excluded.date_of_birth`), "42501");
check("an agent may keep their own emergency contact current", tryAs(AGENT, `insert into public.member_private_records (user_id, agency_id, emergency_contact_name) values ('${AGENT}', '${AGENCY}', 'Probe Contact') on conflict (user_id) do update set emergency_contact_name = excluded.emergency_contact_name`), "ok");
if (LEAD) check("a team lead reads no colleague's private record", countAs(LEAD, `select 1 from member_private_records where user_id<>'${LEAD}'`), 0);
check("an executive reads private records in scope", countAs(EXEC, `select 1 from member_private_records`) > 0, true);
check("an executive's date of birth entry is audited and projects the greeting month/day (rolled back)", q.query(`begin; ${session(EXEC)} insert into public.member_private_records (user_id, agency_id, date_of_birth) values ('${AGENT}', '${AGENCY}', '2000-02-03') on conflict (user_id) do update set date_of_birth = excluded.date_of_birth; select (select count(*)::int from activity_events where entity_id='${AGENT}' and field='date_of_birth' and new_value='2000-02-03') as audited, (select birth_month||'-'||birth_day from profiles where id='${AGENT}') as md; rollback;`)[0], {audited: 1, md: "2-3"});
check("an agent reads their own payout account only", countAs(AGENT, `select 1 from member_payout_accounts where user_id<>'${AGENT}'`), 0);
if (LEAD) check("a team lead reads no payout account but their own", countAs(LEAD, `select 1 from member_payout_accounts where user_id<>'${LEAD}'`), 0);
check("payroll capability reads payout accounts", countAs(EXEC, `select 1 from member_payout_accounts`) > 0, true);
check("a payout change is audited with the last four digits only", q.query(`begin; ${session(EXEC)} insert into public.member_payout_accounts (user_id, agency_id, method, provider, account_number) values ('${AGENT}', '${AGENCY}', 'gcash', 'GCash', '09991234567') on conflict (user_id) do update set account_number = excluded.account_number; select new_value from activity_events where entity_id='${AGENT}' and field='payout_account' order by created_at desc limit 1; rollback;`)[0].new_value, "gcash GCash ••••4567");
check("nobody reads staged onboarding through the API", tryAs(EXEC, `perform 1 from public.invitation_onboarding`), "42501");
check("a hire date change recomputes the Employee ID month (rolled back)", q.query(`begin; ${session(EXEC)} update public.agency_memberships set hired_on='2026-03-15' where user_id='${AGENT}'; select substr(employee_code, 3, 6) as mmyyyy from agency_memberships where user_id='${AGENT}'; rollback;`)[0].mmyyyy, "032026");

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
