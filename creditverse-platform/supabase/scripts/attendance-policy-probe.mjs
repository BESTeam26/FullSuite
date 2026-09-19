/**
 * The attendance policy, asked of the database as all FOUR views.
 *
 * Dee's standing rule, 2026-09-19 (CLAUDE.md §20b): agent, team lead, division
 * manager, executive — every time. This file exists because applying that rule
 * to my own migration found a real hole in it an hour after writing it down:
 * the first version let anybody with `ops.manage` reprice the whole company,
 * which includes a manager scoped to one division.
 *
 * Run: node supabase/scripts/attendance-policy-probe.mjs
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

/* The four views, chosen by SHAPE so they stay true as real people change. */
const EXEC = one(`select m.user_id from agency_memberships m join profiles p on p.id = m.user_id
   where m.agency_id='${AGENCY}' and m.role='agency_admin' and m.status='active'
     and coalesce(p.is_fixture,false)=false limit 1`)?.user_id;
const LEAD = one(`select distinct tm.user_id from team_memberships tm
    join profiles p on p.id = tm.user_id
    join agency_memberships m on m.user_id = tm.user_id and m.status='active'
    join teams t on t.id = tm.team_id and t.archived_at is null
   where tm.is_lead and coalesce(p.is_fixture,false)=false
     /* A lead who is ONLY a lead. Picking any lead found an admin who happens
        to lead a team, and "a team lead cannot change the policy" then failed
        against somebody who is also an executive — the probe measuring the
        wrong person, not the rule being wrong. */
     and m.role = 'agency_user' and not m.is_owner
     and tm.user_id is distinct from '${EXEC}' limit 1`)?.user_id;
const AGENT = one(`select p.id from profiles p
    join agency_memberships m on m.user_id = p.id and m.status='active'
   where coalesce(p.is_fixture,false)=false and m.role='agency_user' and not m.is_owner
     and not exists (select 1 from team_memberships tm where tm.user_id = p.id and tm.is_lead)
   limit 1`)?.id;

const as = (user, sql) => {
  try {
    return { ok: true, rows: q.query(`begin;
      set local role authenticated;
      do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); end $c$;
      ${sql} rollback;`) };
  } catch (e) {
    try { q.query("rollback;"); } catch { /* gone */ }
    return { ok: false, message: String(e.message ?? e).split("\n")[0] };
  }
};
/** Did the update actually land? RLS refuses by matching no rows, not by error. */
const canEdit = (user) => {
  const r = as(user, `update public.attendance_policy set late_penalty = 0.75
                       where agency_id = '${AGENCY}';
    select late_penalty::text as p from public.attendance_policy where agency_id = '${AGENCY}';`);
  return r.ok ? r.rows[0]?.p === "0.75" : false;
};
const canRead = (user) => {
  const r = as(user, `select count(*)::int as n from public.attendance_policy where agency_id='${AGENCY}';`);
  return r.ok ? r.rows[0].n === 1 : false;
};

/*
 * A view with nobody in it is NOT a pass. Dee's rule is "test all" — a probe
 * that quietly skips the team lead because none happened to match its query
 * reports green while covering three of four.
 */
const missing = Object.entries({ agent: AGENT, executive: EXEC })
  .filter(([, id]) => !id).map(([view]) => view);

console.log("\nThe attendance policy, from all four views\n");
if (missing.length > 0) {
  console.log(`  SKIPPED — no real account matches: ${missing.join(", ")}.`);
  console.log("  The team lead and division manager are built below.\n");
  failures.push(`no account to measure the ${missing.join(" / ")} view`);
}

console.log("Every employee can READ the rules their score is made of");
if (AGENT) check("an agent reads the policy", canRead(AGENT), true);
if (LEAD) check("a team lead reads the policy", canRead(LEAD), true);
if (EXEC) check("an executive reads the policy", canRead(EXEC), true);

console.log("\nOnly company-wide authority may CHANGE them");
if (AGENT) check("an agent cannot change the policy", canEdit(AGENT), false);
if (LEAD) check("a team lead cannot change the policy — they correct days, not prices",
  canEdit(LEAD), false);
else if (AGENT) {
  /* BES has no non-admin team lead today, so one is BUILT — the same reason
     the division manager is. A view that is only covered when somebody happens
     to hold the role is a view that is not covered. */
  const built = q.query(`begin;
    insert into public.team_memberships (team_id, user_id, is_lead)
         select t.id, '${AGENT}', true from public.teams t
          where t.agency_id = '${AGENCY}' and t.archived_at is null
            and coalesce(t.is_fixture,false) = false limit 1
    on conflict (team_id, user_id) do update set is_lead = true;
    set local role authenticated;
    do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${AGENT}","role":"authenticated"}', true); end $c$;
    update public.attendance_policy set late_penalty = 0.75 where agency_id = '${AGENCY}';
    select late_penalty::text as p,
           public.may_set_agency_policy('${AGENCY}') as may_set_policy,
           (select count(*)::int from public.attendance_policy where agency_id='${AGENCY}') as can_read
      from public.attendance_policy where agency_id = '${AGENCY}';
    rollback;`);
  check("a (built) team lead reads the policy", built[0]?.can_read, 1);
  check("…and cannot change it — they correct days, not prices",
    built[0]?.may_set_policy, false);
  check("…and the value is untouched", built[0]?.p, "0.25");
}
if (EXEC) check("an executive can change the policy", canEdit(EXEC), true);

/*
 * The division manager: `ops.manage` but scoped to one division. Built here
 * because BES has none today — a rule that is only tested when somebody
 * happens to exist is a rule that is not tested.
 */
console.log("\nA division manager has authority over PEOPLE, not over policy");
if (AGENT) {
  const scoped = q.query(`begin;
    update public.agency_memberships
       set scope = 'division', scope_division = 'creditops'
     where user_id = '${AGENT}' and agency_id = '${AGENCY}';
    /* Keyed on the MEMBERSHIP, not on (agency, user) — read from the table
       rather than assumed from the shape of the others. */
    insert into public.agency_member_permissions (membership_id, key, allowed)
         select m.id, 'ops.manage', true from public.agency_memberships m
          where m.user_id = '${AGENT}' and m.agency_id = '${AGENCY}'
    on conflict (membership_id, key) do update set allowed = true;
    set local role authenticated;
    do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${AGENT}","role":"authenticated"}', true); end $c$;
    select public.is_manager_of('${AGENCY}') as manages,
           public.may_set_agency_policy('${AGENCY}') as may_set_policy;
    rollback;`);
  check("…they DO hold management authority", scoped[0]?.manages, true);
  check("…and still may not touch company-wide policy", scoped[0]?.may_set_policy, false);
}

console.log("\nAnd the values survived the probe");
const now = one(`select late_penalty::text as late, baseline::text as base,
                        max_points::text as max from public.attendance_policy where agency_id='${AGENCY}'`);
check("late is still the seeded 0.25", now.late, "0.25");
check("baseline is still 15", now.base, "15.00");
check("ceiling is still 20", now.max, "20.00");

console.log("\nThe shape cannot be broken");
{
  const bad = (sql) => {
    try { q.query(`begin; ${sql} rollback;`); return false; }
    catch { try { q.query("rollback;"); } catch { /* gone */ } return true; }
  };
  check("a ladder that is not descending is refused",
    bad(`update public.attendance_policy set band_good = 19 where agency_id='${AGENCY}';`), true);
  check("a baseline above the ceiling is refused",
    bad(`update public.attendance_policy set baseline = 25 where agency_id='${AGENCY}';`), true);
  check("a malformed streak tier is refused",
    bad(`update public.attendance_policy set streak_tiers = '[{"days":30}]'::jsonb where agency_id='${AGENCY}';`), true);
  check("a tier with no days is refused",
    bad(`update public.attendance_policy set streak_tiers = '[{"days":0,"points":1,"badge":"x"}]'::jsonb where agency_id='${AGENCY}';`), true);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  - ${f}`));
process.exit(failures.length ? 1 : 0);
