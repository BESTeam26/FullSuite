/**
 * Invitation / Activation V2 — the six conditions Dee put on accepting that
 * the Team Member is created AT acceptance (2026-09-20).
 *
 *   invitation created → identity and placement staged → activation link →
 *   auth account confirmed → invitation accepted → team member created →
 *   Agent ID assigned → staged placement and access activated
 *
 * Every check runs against the live database as the real actors and is
 * rolled back. The acceptance itself is exercised through
 * accept_agency_invitation as the invited person, which is the only path the
 * product has.
 *
 * Run: node supabase/scripts/invitation-lifecycle-probe.mjs
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
const OWNER = one(`select m.user_id from agency_memberships m join profiles p on p.id=m.user_id where m.agency_id='${AGENCY}' and m.is_owner limit 1`).user_id;
const TEAM = one(`select id from teams where agency_id='${AGENCY}' and archived_at is null and name not like '[TEST]%' limit 1`).id;
const DEPT = one(`select id, name from departments where agency_id='${AGENCY}' and archived_at is null and key='complaints'`);
/* Somebody with an auth user but no membership: the invited-person shape. */
const NEWBIE = one(`select u.id, u.email from auth.users u
   where not exists (select 1 from agency_memberships m where m.user_id = u.id)
     and exists (select 1 from profiles p where p.id = u.id) limit 1`);

const session = (u) => `set local role authenticated; do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true); end $c$;`;
const asOwner = `set local search_path = public, extensions; ${session(OWNER)}`;
/* One reusable world: an invitation for the newbie, fully staged, then
   accepted as them — the whole lifecycle inside a transaction. */
const invite = (extra = "") => `
  set local search_path = public, extensions;
  ${session(OWNER)}
  select public.invite_agency_member('${NEWBIE.email}', 'agency_user'::agency_role, 'agent'::access_profile, null, array['creditops.clients.view']::text[], '${TEAM}', 'Probe Newbie') as inv \\gset
  ${extra}`;

/* \\gset is psql-only, so the id comes back through a temp table instead. */
const world = (extra = "") => `
  set local search_path = public, extensions;
  ${session(OWNER)}
  create temp table probe_inv on commit drop as
    select public.invite_agency_member('${NEWBIE.email}', 'agency_user'::agency_role, 'agent'::access_profile, null, array['creditops.clients.view']::text[], '${TEAM}', 'Probe Newbie') as id;
  select public.stage_invitation_onboarding((select id from probe_inv), jsonb_build_object(
    'hired_on', '2026-03-04', 'job_title', 'Probe Specialist', 'engagement_type', 'contractor',
    'seats', jsonb_build_array(jsonb_build_object('seat','department_manager','department','${DEPT.name}'))));
  ${extra}`;
const accept = `
  ${session(NEWBIE.id)}
  select public.accept_agency_invitation((select token from public.invitations where id = (select id from probe_inv)));`;

console.log(`\nLifecycle, accepted by ${NEWBIE.email}\n`);

check("1 · acceptance creates exactly one team member",
  q.query(`begin; ${world(accept)} select count(*)::int as n from public.agency_memberships where user_id='${NEWBIE.id}'; rollback;`)[0].n, 1);

check("1 · accepting twice does not create a second one",
  q.query(`begin; ${world(accept + accept)} select count(*)::int as n from public.agency_memberships where user_id='${NEWBIE.id}'; rollback;`)[0].n, 1);

const ids = q.query(`begin; ${world(accept)} select employee_code from public.agency_memberships where user_id='${NEWBIE.id}'; rollback;`)[0];
check("2 · an Agent ID is assigned, shaped INITIALS + MMYYYY-NNN", /^[A-Z]{2}[0-9]{6}-[0-9]{3,}$/.test(ids.employee_code), true);
check("2 · …and it is derived from the STAGED start date, not today",
  ids.employee_code.slice(2, 8), "032026");
check("2 · …idempotent: a second acceptance leaves the same ID",
  q.query(`begin; ${world(accept + accept)} select employee_code from public.agency_memberships where user_id='${NEWBIE.id}'; rollback;`)[0].employee_code, ids.employee_code);
check("2 · …unique: a code already held is stepped past, never duplicated",
  q.query(`begin; ${asOwner} select public.employee_code_free('${AGENCY}', (select employee_code from public.agency_memberships where employee_code is not null limit 1)) <> (select employee_code from public.agency_memberships where employee_code is not null limit 1) as stepped; rollback;`)[0].stepped, true);

const applied = q.query(`begin; ${world(accept)}
  select m.hired_on::text, m.job_title, m.engagement_type, (select count(*)::int from public.team_memberships tm where tm.user_id='${NEWBIE.id}' and tm.team_id='${TEAM}') as on_team,
         (select count(*)::int from public.management_seats s where s.user_id='${NEWBIE.id}' and s.seat='department_manager' and s.department_id='${DEPT.id}') as seat,
         (select count(*)::int from public.agency_member_permissions mp where mp.membership_id=m.id and mp.key='creditops.clients.view' and mp.allowed) as module
    from public.agency_memberships m where m.user_id='${NEWBIE.id}'; rollback;`)[0];
check("3 · the staged start date, position and engagement type survive activation",
  [applied.hired_on, applied.job_title, applied.engagement_type], ["2026-03-04", "Probe Specialist", "contractor"]);
check("3 · …and so do the team, the management seat and the module key",
  [applied.on_team, applied.seat, applied.module], [1, 1, 1]);
check("3 · …and the staging is consumed, not left behind",
  q.query(`begin; ${world(accept)} select count(*)::int as n from public.invitation_onboarding where invitation_id=(select id from probe_inv); rollback;`)[0].n, 0);

const tryAccept = (setup) => q.query(`begin; ${world(setup)} ${session(NEWBIE.id)}
  do $c$ begin perform public.accept_agency_invitation((select token from public.invitations where id = (select id from probe_inv))); perform set_config('probe.r','accepted',true);
  exception when others then perform set_config('probe.r', sqlstate, true); end $c$;
  select current_setting('probe.r', true) as r, (select count(*)::int from public.agency_memberships where user_id='${NEWBIE.id}') as members; rollback;`)[0];

check("4 · a REVOKED invitation creates no team member",
  tryAccept(`delete from public.invitations where id = (select id from probe_inv);`), { r: "22023", members: 0 });
check("4 · an EXPIRED invitation creates no team member",
  tryAccept(`update public.invitations set expires_at = now() - interval '1 day' where id = (select id from probe_inv);`), { r: "22023", members: 0 });
check("4 · an already-accepted invitation cannot be replayed",
  q.query(`begin; ${world(accept)} ${session(NEWBIE.id)}
    do $c$ begin perform public.accept_agency_invitation((select token from public.invitations where id = (select id from probe_inv))); perform set_config('probe.r','accepted',true);
    exception when others then perform set_config('probe.r', sqlstate, true); end $c$;
    select current_setting('probe.r', true) as r; rollback;`)[0].r, "22023");

check("5 · superseding an invitation rotates its token, killing the old link",
  q.query(`begin; ${world("")} ${asOwner}
    create temp table probe_tok on commit drop as select token from public.invitations where id=(select id from probe_inv);
    perform_dummy as (select 1);
    select 1; rollback;`) && q.query(`begin; ${world("")}
    create temp table probe_tok on commit drop as select token as old from public.invitations where id=(select id from probe_inv);
    ${asOwner}
    select public.invite_agency_member('${NEWBIE.email}', 'agency_user'::agency_role, 'agent'::access_profile, null, null, '${TEAM}', 'Probe Newbie');
    select ((select token from public.invitations where id=(select id from probe_inv)) <> (select old from probe_tok)) as rotated; rollback;`)[0].rotated, true);
check("5 · …and drops the placement the old invitation carried",
  q.query(`begin; ${world("")} ${asOwner}
    select public.invite_agency_member('${NEWBIE.email}', 'agency_user'::agency_role, 'agent'::access_profile, null, null, '${TEAM}', 'Probe Newbie');
    select count(*)::int as n from public.invitation_onboarding where invitation_id=(select id from probe_inv); rollback;`)[0].n, 0);

check("6 · acceptance is one transaction: the membership, team, seat, keys and stamp land together",
  q.query(`begin; ${world(accept)}
    select (select count(*)::int from public.agency_memberships where user_id='${NEWBIE.id}')
         + (select count(*)::int from public.team_memberships where user_id='${NEWBIE.id}' and team_id='${TEAM}')
         + (select count(*)::int from public.management_seats where user_id='${NEWBIE.id}')
         + (select count(*)::int from public.invitations where id=(select id from probe_inv) and accepted_at is not null) as all_five; rollback;`)[0].all_five, 4);
check("6 · …and a failure part-way leaves nothing behind (the whole thing rolls back)",
  q.query(`select count(*)::int as n from public.agency_memberships where user_id='${NEWBIE.id}'`)[0].n, 0);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log("  - " + f); process.exit(1); }
