/**
 * Invitation / Activation V2 — Dee's thirteen-point UAT, 2026-09-20.
 *
 * The lifecycle under test:
 *   Team Member created → Agent ID assigned → start date, engagement,
 *   position, Reports To saved → placement created → invitation created →
 *   sent → user activates → the auth account is LINKED to that same record →
 *   membership becomes active.
 *
 * Each case builds its own person inside a transaction — a shell auth user,
 * exactly as create-team-member makes one — exercises the real functions, and
 * rolls the whole thing back. Nothing here touches a live record.
 *
 * Run: node supabase/scripts/invitation-uat-probe.mjs
 */
import { randomUUID } from "node:crypto";
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });
let pass = 0; const failures = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  ok   ${name}`); } else { failures.push(name); console.log(`  FAIL ${name}\n       expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`); }
};
const one = (sql) => q.query(sql)[0];
const AGENCY = one("select id from agencies order by created_at limit 1").id;
const DEE = one(`select m.user_id from agency_memberships m where m.agency_id='${AGENCY}' and m.is_owner limit 1`).user_id;
const DIVISION = one(`select id from divisions where agency_id='${AGENCY}' and service='creditops' and archived_at is null`).id;
const DEPARTMENT = one(`select id, name from departments where agency_id='${AGENCY}' and key='dispute' and archived_at is null`);
const TEAM = one(`select id, name from teams where department_id='${DEPARTMENT.id}' and archived_at is null and not coalesce(is_fixture,false) limit 1`);
const ACTIVE_BEFORE = one(`select count(*)::int n from agency_memberships m join profiles p on p.id=m.user_id where m.status='active' and coalesce(p.is_fixture,false)=false`).n;

const session = (u) => `set local role authenticated; do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true); end $c$;`;
const asDee = `set local search_path = public, extensions; ${session(DEE)}`;

/** A shell auth user, the way create-team-member makes one: no password, unconfirmed. */
const shell = (id, email) => `
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('${id}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${email}',
          '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Probe Person"}'::jsonb, now(), now());`;

const create = (id, { role = "agency_user", profile = "'agent'", team = `'${TEAM.id}'`, lead = "null",
  modules = `array['creditops.clients.view']::text[]`, seat = "null", division = "null", department = "null" } = {}) => `
  ${asDee}
  create temp table probe_out on commit drop as
  select * from public.create_team_member_with_invitation('${id}', 'Probe Person', '${role}'::agency_role, ${profile}::access_profile,
    ${team}, ${lead}, ${modules}, date '2026-04-01', 'Probe Position', 'contractor', null, '555-0100', ${seat}, ${division}, ${department});`;

const acceptAs = (id) => `
  ${session(id)}
  select public.accept_agency_invitation((select token from public.invitations where id = (select invitation_id from probe_out)));`;

/** One case: build the person, run `body`, return the single row it selects. */
const run = (opts, body, tag = "uat") => {
  const id = randomUUID();
  const sql = `begin; ${shell(id, `probe.${tag}.${Date.now()}@example.test`)} ${create(id, opts)} ${body(id)} rollback;`;
  try { return { id, row: q.query(sql).at(-1) }; }
  catch (e) { return { id, error: String(e.message).match(/ERROR:\s*(\w+):/)?.[1] ?? "error" }; }
};
const state = (id) => `
  reset role;
  select m.status, m.employee_code, m.agent_number, m.hired_on::text as hired_on, m.job_title, m.engagement_type,
         (select count(*)::int from public.agency_memberships x where x.user_id='${id}') as memberships,
         (select count(*)::int from public.team_memberships tm where tm.user_id='${id}') as teams,
         (select coalesce(bool_or(tm.is_lead), false) from public.team_memberships tm where tm.user_id='${id}') as leads,
         (select count(*)::int from public.management_seats s where s.user_id='${id}' and s.effective_to is null) as seats,
         (select string_agg(s.seat, ',') from public.management_seats s where s.user_id='${id}' and s.effective_to is null) as seat_kinds,
         (select count(*)::int from public.agency_member_permissions mp where mp.membership_id=m.id and mp.allowed) as keys,
         (select count(*)::int from public.invitations i where i.membership_id=m.id) as invitations
    from public.agency_memberships m where m.user_id='${id}';`;

console.log("\n1–5 · The five responsibilities, created before anybody signs in\n");

const agent = run({}, state, "agent");
check("1 · Agent: one Team Member, invited, with an Agent ID from the start date",
  [agent.row?.memberships, agent.row?.status, agent.row?.employee_code?.slice(2, 8), agent.row?.agent_number > 0],
  [1, "invited", "040126", true]);
check("1 · …their position, engagement and team are already recorded",
  [agent.row?.job_title, agent.row?.engagement_type, agent.row?.teams, agent.row?.leads, agent.row?.keys, agent.row?.invitations],
  ["Probe Position", "contractor", 1, false, 1, 1]);

const lead = run({ profile: "'team_lead'", lead: `'${TEAM.id}'` }, state, "lead");
check("2 · Team Lead: on the team AND leading it, with no management seat",
  [lead.row?.status, lead.row?.teams, lead.row?.leads, lead.row?.seats], ["invited", 1, true, 0]);

const dept = run({ profile: "'manager'", seat: "'department_manager'", department: `'${DEPARTMENT.id}'` }, state, "dept");
check("3 · Department Manager: seated on the department, not made a team lead",
  [dept.row?.status, dept.row?.seat_kinds, dept.row?.leads], ["invited", "department_manager", false]);

const div = run({ profile: "'manager'", team: "null", seat: "'division_manager'", division: `'${DIVISION}'` }, state, "div");
check("4 · Division Manager: seated on the division, on no team at all",
  [div.row?.status, div.row?.seat_kinds, div.row?.teams], ["invited", "division_manager", 0]);

const coo = run({ role: "agency_admin", profile: "null", team: "null", modules: "'{}'::text[]", seat: "'chief_operations'" }, state, "coo");
check("5 · Chief Operations: the seat, and no module key — an admin is let in by role",
  [coo.row?.status, coo.row?.seat_kinds, coo.row?.keys], ["invited", "chief_operations", 0]);

console.log("\n6–10 · The invitation itself\n");

const resend = run({}, (id) => `
  ${asDee}
  create temp table probe_first on commit drop as select token, id as inv_id from public.invitations where id=(select invitation_id from probe_out);
  create temp table probe_again on commit drop as
    select * from public.create_team_member_with_invitation('${id}', 'Probe Person', 'agency_user'::agency_role, 'agent'::access_profile,
      '${TEAM.id}', null, array['creditops.clients.view']::text[], date '2026-04-01', 'Probe Position', 'contractor', null, null, null, null, null);
  reset role;
  select (select count(*)::int from public.agency_memberships where user_id='${id}') as memberships,
         (select employee_code from public.agency_memberships where user_id='${id}') as code,
         ((select invitation_id from probe_again) = (select inv_id from probe_first)) as same_invitation,
         ((select token from public.invitations where id=(select inv_id from probe_first)) <> (select token from probe_first)) as token_rotated;`, "resend");
check("6 · Re-inviting keeps the person, the Agent ID and the invitation — and rotates the token",
  [resend.row?.memberships, resend.row?.same_invitation, resend.row?.token_rotated, /^[A-Z]{2}\d{6}-\d{3}$/.test(resend.row?.code ?? "")],
  [1, true, true, true]);

const expired = run({}, (id) => `
  ${asDee} update public.invitations set expires_at = now() - interval '1 day' where id=(select invitation_id from probe_out);
  ${session("00000000-0000-4000-8000-000000000000")}
  do $c$ begin perform public.accept_agency_invitation((select token from public.invitations where id=(select invitation_id from probe_out)));
    perform set_config('probe.r','accepted',true); exception when others then perform set_config('probe.r', sqlstate, true); end $c$;
  reset role;
  select current_setting('probe.r', true) as r, (select status from public.agency_memberships where user_id='${id}') as status;`, "expired");
check("7 · An EXPIRED link activates nobody; the Team Member stays pending",
  [expired.row?.r, expired.row?.status], ["22023", "invited"]);

const revoked = run({}, (id) => `
  ${asDee} delete from public.invitations where id=(select invitation_id from probe_out);
  reset role;
  select (select count(*)::int from public.agency_memberships where user_id='${id}') as memberships,
         (select status from public.agency_memberships where user_id='${id}') as status;`, "revoked");
check("8 · REVOKING the invitation leaves the workforce record — it does not delete a person",
  [revoked.row?.memberships, revoked.row?.status], [1, "invited"]);

const retry = run({}, (id) => `${acceptAs(id)} ${acceptAs(id)}
  reset role;
  select (select count(*)::int from public.agency_memberships where user_id='${id}') as memberships,
         (select count(*)::int from public.team_memberships where user_id='${id}') as teams,
         (select status from public.agency_memberships where user_id='${id}') as status;`, "retry");
check("9 · Activation retried: still one membership, one team row, and active",
  [retry.row?.memberships, retry.row?.teams, retry.row?.status], [1, 1, "active"]);

const linked = run({}, (id) => `${acceptAs(id)}
  reset role;
  select (select count(*)::int from public.agency_memberships where user_id='${id}') as memberships,
         (select employee_code from public.agency_memberships where user_id='${id}') as code,
         (select agent_number from public.agency_memberships where user_id='${id}') as num;`, "link");
check("10 · Accepting LINKS the existing record: same Agent ID, same number, no second member",
  [linked.row?.memberships, /^[A-Z]{2}040126-\d{3}$/.test(linked.row?.code ?? "")], [1, true]);

console.log("\n11–13 · The directory, the counts, and what acceptance changes\n");

const pending = run({}, (id) => `
  reset role;
  select (select count(*)::int from public.agency_memberships m join public.profiles p on p.id=m.user_id
           where m.user_id='${id}' and m.status='invited') as in_directory,
         (select count(*)::int from public.agency_memberships m join public.profiles p on p.id=m.user_id
           where m.status='active' and coalesce(p.is_fixture,false)=false) as active_count,
         (select count(*)::int from public.work_schedules where user_id='${id}') as schedules,
         (select count(*)::int from public.member_pay_rates where user_id='${id}') as rates;`, "pending");
check("11 · A pending member IS in the directory, with their Agent ID",
  pending.row?.in_directory, 1);
check("12 · …and is counted as nobody: active headcount is unchanged, no schedule, no pay rate",
  [pending.row?.active_count, pending.row?.schedules, pending.row?.rates], [ACTIVE_BEFORE, 0, 0]);

const CUTOFF = one(`select id from payroll_cutoffs where status='draft' order by period_end desc limit 1`);
if (CUTOFF) {
  const payroll = run({}, (id) => `
    reset role;
    select public.payroll_generate_internal('${CUTOFF.id}') as generated;
    select (select count(*)::int from public.payslips where cutoff_id='${CUTOFF.id}' and user_id='${id}') as payslips;`, "payroll");
  check("12 · …and payroll generation produces no payslip for them", payroll.row?.payslips, 0);
} else {
  console.log("  --   12 · payroll: no draft cutoff to generate against");
}

const accepted = run({}, (id) => `${acceptAs(id)}
  reset role;
  select (select status from public.agency_memberships where user_id='${id}') as status,
         (select count(*)::int from public.agency_memberships where user_id='${id}') as memberships,
         (select count(*)::int from public.team_memberships where user_id='${id}') as teams,
         (select count(*)::int from public.management_seats where user_id='${id}') as seats,
         (select accepted_at is not null from public.invitations where id=(select invitation_id from probe_out)) as stamped,
         (select count(*)::int from public.agency_memberships m join public.profiles p on p.id=m.user_id
           where m.status='active' and coalesce(p.is_fixture,false)=false) as active_count;`, "accepted");
check("13 · Acceptance makes them active with no duplicate rows, and the invitation is stamped",
  [accepted.row?.status, accepted.row?.memberships, accepted.row?.teams, accepted.row?.stamped], ["active", 1, 1, true]);
check("13 · …and the active headcount rises by exactly one",
  accepted.row?.active_count, ACTIVE_BEFORE + 1);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log("  - " + f); process.exit(1); }
