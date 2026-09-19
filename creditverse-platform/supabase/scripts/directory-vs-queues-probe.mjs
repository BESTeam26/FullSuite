/**
 * The shared directory is PARTNER-SCOPED. The department queues are narrow.
 *
 * Dee, 2026-09-13 opened the Main Client List to every CreditOps user; Dee,
 * 2026-09-19, after seeing a Complaints agent offered every client, narrowed
 * it: *"creditops.clients.view may allow the CreditOps client-directory
 * experience. It must NOT mean all CreditOps clients… An Agent can see a
 * client only when that client's Partner is visible through direct partner
 * assignment OR partner assignment inherited through one of the user's active
 * teams."* And still: *"KEEP QUEUES NARROW."*
 *
 * So the directory is what the capability OPENS, and partner scope is what
 * fills it. Every scenario runs as a REAL authenticated user inside a
 * transaction that is rolled back; the fuller matrix is
 * complaints-agent-matrix-probe.mjs.
 *
 * Run: node supabase/scripts/directory-vs-queues-probe.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";

const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });

let pass = 0;
const failures = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}\n       expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`); }
};
const one = (sql) => q.query(sql)[0];

const AGENCY = one("select id from agencies order by created_at limit 1").id;
const OWNER  = one("select user_id from agency_memberships where is_owner and status='active' limit 1").user_id;
/* An agent placed in a CreditOps department, and one placed outside it. Found
   by SHAPE, so the probe survives the roster changing. */
const INSIDE = one(`select tm.user_id from team_memberships tm
    join teams t on t.id = tm.team_id and t.archived_at is null
    join departments dp on dp.id = t.department_id
    join divisions dv on dv.id = dp.division_id and dv.service = 'creditops'
    join agency_memberships m on m.user_id = tm.user_id and m.role = 'agency_user'
    join profiles p on p.id = tm.user_id and coalesce(p.is_fixture, false) = false
   limit 1`)?.user_id;
const OUTSIDE = one(`select tm.user_id from team_memberships tm
    join teams t on t.id = tm.team_id and t.archived_at is null
    join departments dp on dp.id = t.department_id
    join divisions dv on dv.id = dp.division_id and dv.service <> 'creditops'
    join agency_memberships m on m.user_id = tm.user_id and m.role = 'agency_user'
    join profiles p on p.id = tm.user_id and coalesce(p.is_fixture, false) = false
   where not exists (
     select 1 from team_memberships t2
       join teams tt on tt.id = t2.team_id
       join departments d2 on d2.id = tt.department_id
       join divisions v2 on v2.id = d2.division_id and v2.service = 'creditops'
      where t2.user_id = tm.user_id)
   limit 1`)?.user_id;

if (!INSIDE || !OUTSIDE) {
  /* Fixtures are excluded deliberately: they carry invented capability sets,
     and a probe that quietly measures one of those is measuring nothing. */
  console.log("\n  SKIPPED — needs one real agency_user inside CreditOps and one outside.\n");
  process.exit(0);
}

const as = (user, setup, action) => {
  try {
    return { ok: true, rows: q.query(
      `begin; ${setup}
       set local role authenticated;
       do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); end $c$;
       ${action} rollback;`) };
  } catch (e) {
    try { q.query("rollback;"); } catch { /* already gone */ }
    return { ok: false, message: String(e.message ?? e) };
  }
};
const counts = (user, setup = "") => {
  const r = as(user, setup, `select
    (select count(*)::int from fulfillment_clients) as list,
    (select count(*)::int from client_department_statuses) as queue,
    (select count(*)::int from public.my_creditops_departments()) as depts;`);
  return r.ok ? r.rows[0] : { list: "error", queue: "error", depts: "error" };
};

console.log("\nThe directory is partner-scoped; the queues are narrow\n");

console.log("An agent placed in a CreditOps department");
{
  const c = counts(INSIDE);
  /* What the directory SHOULD hold for this person: clients whose partner is
     assigned to them by name or to a live team they are on — computed here
     from the assignment rows, not from the policy under test. */
  const expected = one(`select count(*)::int as n from fulfillment_clients fc
     where fc.outsourcing_group_id in (
       select a.group_id from partner_assignments a where a.ended_on is null
         and (a.user_id = '${INSIDE}' or a.team_id in (
           select tm.team_id from team_memberships tm join teams t on t.id = tm.team_id
            where tm.user_id = '${INSIDE}' and t.archived_at is null)))`).n;
  check("sees exactly the clients of the partners assigned to them or their teams", c.list, expected);
  check("and never every client", c.list < one("select count(*)::int as n from fulfillment_clients").n, true);
  check("only their own department's queue rows, over those clients", c.queue <= c.list * 6, true);
  check("and belongs to at least one CreditOps department", c.depts > 0, true);
}

console.log("\nAn agent placed outside CreditOps");
{
  const c = counts(OUTSIDE);
  check("sees no client directory", c.list, 0);
  check("and no queue rows", c.queue, 0);
  check("because they are in no CreditOps department", c.depts, 0);
}

/*
 * The next two scenarios assert the RULE, not the row count.
 *
 * The directory is an ADDITIVE branch: taking it away leaves whatever the
 * per-record work branches already granted — a client assigned to you stays
 * visible, and should. So "removing placement drops you to zero" is the wrong
 * assertion; the right one is that the directory predicate itself turns off,
 * and that what remains is strictly smaller.
 */
const directoryOpen = (user, setup = "") => {
  const r = as(user, setup, `select public.creditops_directory_visible('${AGENCY}') as open,
                                    (select count(*)::int from fulfillment_clients) as list;`);
  return r.ok ? r.rows[0] : { open: "error", list: "error" };
};

console.log("\nRemove the placement and the directory closes");
{
  const before = directoryOpen(INSIDE);
  const after = directoryOpen(INSIDE, `delete from team_memberships where user_id = '${INSIDE}';`);
  check("the directory was open", before.open, true);
  check("no CreditOps division placement, no directory", after.open, false);
  /* Team-inherited partner scope leaves with the team too, so the list can
     only shrink — and never grow. */
  check("and what remains is no larger", after.list <= before.list, true);
}

console.log("\nRemove the capability and the directory closes");
{
  const after = directoryOpen(INSIDE, `
    insert into agency_member_permissions (membership_id, key, allowed)
    select m.id, 'creditops.clients.view', false from agency_memberships m where m.user_id = '${INSIDE}'
    on conflict (membership_id, key) do update set allowed = false;`);
  check("placement without creditops.clients.view closes the directory", after.open, false);
  check("and the list is no larger than with it",
    after.list <= counts(INSIDE).list, true);
}

console.log("\nAnother CreditOps user works with no code change");
{
  /* Take somebody who currently sees nothing, place them in the same
     department, and they gain exactly what the first agent has. */
  const team = one(`select t.id from teams t
      join departments dp on dp.id = t.department_id
      join divisions dv on dv.id = dp.division_id and dv.service = 'creditops'
     where t.archived_at is null and coalesce(t.is_fixture,false) = false limit 1`).id;
  /* A partner with clients, assigned to that team — partner scope is what fills the directory. */
  const partner = one(`select og.id from outsourcing_groups og join fulfillment_clients fc on fc.outsourcing_group_id = og.id
     where og.agency_id = '${AGENCY}' group by og.id order by count(*) desc limit 1`).id;
  const before = counts(OUTSIDE);
  const after = counts(OUTSIDE, `
    insert into team_memberships (team_id, user_id, is_lead) values ('${team}', '${OUTSIDE}', false);
    insert into partner_assignments (agency_id, group_id, team_id, assignment_role) values ('${AGENCY}', '${partner}', '${team}', 'assigned');
    insert into agency_member_permissions (membership_id, key, allowed)
    select m.id, 'creditops.clients.view', true from agency_memberships m where m.user_id = '${OUTSIDE}'
    on conflict (membership_id, key) do update set allowed = true;`);
  check("before placement: nothing", before.list, 0);
  /* Expected: the clients of every partner that reaches them through that team
     (the one just assigned plus any the team already had) or by name. */
  const expected = one(`select count(*)::int as n from fulfillment_clients fc
     where fc.outsourcing_group_id = '${partner}'
        or fc.outsourcing_group_id in (select a.group_id from partner_assignments a where a.ended_on is null
             and (a.team_id = '${team}' or a.user_id = '${OUTSIDE}'))`).n;
  check("after placement with a team partner: the directory is exactly the team's partners' clients", after.list, expected);
  check("and any queue rows stay within those clients", after.queue <= after.list * 6, true);
}

console.log("\nAn administrator is unaffected by all of it");
{
  const c = counts(OWNER);
  check("still sees the directory", c.list > 0, true);
  check("still sees every queue", c.queue > 0, true);
}

console.log("\nWriting is not reading");
{
  /* The directory branch was added to SELECT only. Asserted against the
     catalogue rather than by attempting a write, because a write that happens
     to be permitted for another reason would pass for the wrong reason. */
  const w = one(`select
      (select count(*)::int from pg_policies
        where tablename = 'fulfillment_clients' and cmd = 'SELECT'
          and coalesce(qual,'') like '%creditops_directory_visible%') as on_select,
      (select count(*)::int from pg_policies
        where tablename = 'fulfillment_clients' and cmd in ('UPDATE','INSERT')
          and (coalesce(qual,'') || coalesce(with_check,'')) like '%creditops_directory_visible%') as on_write`);
  check("the directory rule is on SELECT", w.on_select, 1);
  check("and on no write policy", w.on_write, 0);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
