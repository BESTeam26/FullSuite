/**
 * The reward ledger, asked of the database.
 *
 * Dee, 2026-09-19: BES runs no leave bank — paid time is an EARNED reward,
 * tracked as credits with expiries. "One Birthday Reward = one benefit" is the
 * invariant with money behind it, so it is measured here rather than trusted
 * to a dialog. All four views (CLAUDE.md §20b).
 *
 * Run: node supabase/scripts/reward-credits-probe.mjs
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
const EXEC = one(`select m.user_id from agency_memberships m join profiles p on p.id=m.user_id
   where m.agency_id='${AGENCY}' and m.role='agency_admin' and m.status='active'
     and coalesce(p.is_fixture,false)=false limit 1`).user_id;
const AGENT = one(`select p.id from profiles p
    join agency_memberships m on m.user_id=p.id and m.status='active'
   where coalesce(p.is_fixture,false)=false and m.role='agency_user' and not m.is_owner
     and p.id <> '${EXEC}' limit 1`).id;
const TODAY = one("select (now() at time zone 'America/New_York')::date::text as d").d;

const tx = (sql) => {
  try { return { ok: true, rows: q.query(`begin; ${sql} rollback;`) }; }
  catch (e) { try { q.query("rollback;"); } catch { /* gone */ }
    return { ok: false, message: String(e.message ?? e).split("\n").find((l) => /ERROR|already|expired|Choose|needs|not your/.test(l)) ?? "refused" }; }
};
const asUser = (user, sql) => tx(`set local role authenticated;
  do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); end $c$;
  ${sql}`);

/** A birthday credit for the agent, live today. */
const withBirthday = (body) => tx(`
  insert into public.reward_credits (agency_id, user_id, kind, label, issued_on, expires_on)
  values ('${AGENCY}', '${AGENT}', 'birthday', 'Birthday Reward probe', '${TODAY}',
          (date_trunc('month','${TODAY}'::date) + interval '1 month - 1 day')::date);
  ${body}`);

console.log(`\nThe reward ledger · today ${TODAY}\n`);

console.log("BES runs no leave bank");
check("the leave-bank column is gone",
  one(`select count(*)::int as n from information_schema.columns
        where table_name='leave_types' and column_name='annual_days'`).n, 0);

console.log("\nOne reward, one benefit");
{
  const r = withBirthday(`
    set local role authenticated;
    do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${AGENT}","role":"authenticated"}', true); end $c$;
    select public.elect_birthday_reward(
      (select id from public.reward_credits where user_id='${AGENT}' and kind='birthday'), 'paid_day');
    select election, (consumed_at is not null) as consumed
      from public.reward_credits where user_id='${AGENT}' and kind='birthday';`);
  check("a paid birthday day can be elected", r.ok ? r.rows[0].election : r.message, "paid_day");
  check("…and consumes the credit", r.ok ? r.rows[0].consumed : false, true);

  const twice = withBirthday(`
    set local role authenticated;
    do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${AGENT}","role":"authenticated"}', true); end $c$;
    select public.elect_birthday_reward(
      (select id from public.reward_credits where user_id='${AGENT}' and kind='birthday'), 'paid_day');
    select public.elect_birthday_reward(
      (select id from public.reward_credits where user_id='${AGENT}' and kind='birthday'), 'work_premium');`);
  check("…and the 2x premium is then refused — never both", twice.ok, false);
  check("…with a reason somebody can act on", /already been used/.test(twice.message ?? ""), true);
}

console.log("\nThe premium is an explicit choice, not a loophole");
{
  /* Dee: "I would NOT automatically double-pay someone merely because they
     failed to submit birthday leave." Nothing grants it implicitly. */
  const r = withBirthday(`
    set local role authenticated;
    do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${AGENT}","role":"authenticated"}', true); end $c$;
    select public.elect_birthday_reward(
      (select id from public.reward_credits where user_id='${AGENT}' and kind='birthday'), 'work_premium');
    select election, consumed_for from public.reward_credits
     where user_id='${AGENT}' and kind='birthday';`);
  check("the 2x premium must be elected", r.ok ? r.rows[0].election : r.message, "work_premium");
  check("…and a worked premium books no day off", r.ok ? r.rows[0].consumed_for : "x", null);
  check("an invented election is refused",
    withBirthday(`select public.elect_birthday_reward(
      (select id from public.reward_credits where user_id='${AGENT}' and kind='birthday'), 'triple_pay');`).ok, false);
}

console.log("\nRewards expire, and nobody mints their own");
{
  const expired = tx(`
    insert into public.reward_credits (agency_id, user_id, kind, label, issued_on, expires_on)
    values ('${AGENCY}', '${AGENT}', 'birthday', 'Old birthday', '${TODAY}'::date - 400, '${TODAY}'::date - 370);
    set local role authenticated;
    do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${AGENT}","role":"authenticated"}', true); end $c$;
    select public.elect_birthday_reward(
      (select id from public.reward_credits where user_id='${AGENT}' and label='Old birthday'), 'paid_day');`);
  check("an expired reward cannot be spent", expired.ok, false);

  check("an agent cannot insert a reward for themselves",
    asUser(AGENT, `insert into public.reward_credits (agency_id, user_id, kind, label, expires_on)
      values ('${AGENCY}', '${AGENT}', 'attendance', 'Self-awarded', '${TODAY}'::date + 90);`).ok, false);
  /* A CLOSED quarter. Dee, 2026-09-19: "Do NOT grant continuously during the
     quarter. Evaluate at quarter close." */
  const CLOSED = one(`select (extract(year from (now() at time zone 'America/New_York') - interval '6 months'))::text
    || '-Q' || (floor((extract(month from (now() at time zone 'America/New_York') - interval '6 months')::int - 1) / 3) + 1)::text as q`).q;
  const RUNNING = one(`select (extract(year from (now() at time zone 'America/New_York')))::text
    || '-Q' || (floor((extract(month from (now() at time zone 'America/New_York'))::int - 1) / 3) + 1)::text as q`).q;

  check("a quarter still running cannot be rewarded",
    asUser(EXEC, `select public.grant_attendance_reward('${AGENT}', '${RUNNING}');`).ok, false);
  check("an agent cannot issue an attendance reward",
    asUser(AGENT, `select public.grant_attendance_reward('${AGENT}', '${CLOSED}');`).ok, false);
  check("an executive can, once the quarter has closed",
    asUser(EXEC, `select public.grant_attendance_reward('${AGENT}', '${CLOSED}');`).ok, true);
  check("…and a re-run grants nothing rather than erroring",
    asUser(EXEC, `select public.grant_attendance_reward('${AGENT}', '${CLOSED}');
      select public.grant_attendance_reward('${AGENT}', '${CLOSED}') is null as second;`)
      .rows?.[0]?.second, true);
  check("a nonsense quarter is refused",
    asUser(EXEC, `select public.grant_attendance_reward('${AGENT}', 'last year');`).ok, false);

  /* Correcting a CLOSED, rewarded quarter must flag the reward, never remove
     it — "a spent reward is a payment that happened". */
  const flagged = q.query(`begin;
    set local role authenticated;
    do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${EXEC}","role":"authenticated"}', true); end $c$;
    select public.grant_attendance_reward('${AGENT}', '${CLOSED}');
    select public.record_attendance_correction('${AGENT}',
      (date_trunc('quarter', (now() at time zone 'America/New_York') - interval '6 months')::date + 10),
      'ncns', 'Found after the quarter closed');
    select needs_review, (review_reason is not null) as explained,
           (consumed_at is null) as still_unspent
      from public.reward_credits where user_id='${AGENT}' and kind='attendance';
    rollback;`);
  check("a late correction flags the reward for review", flagged[0]?.needs_review, true);
  check("…with a reason a manager can act on", flagged[0]?.explained, true);
  check("…and does not delete it", flagged[0]?.still_unspent, true);
}

console.log("\nThe birthday grant is automatic and idempotent");
{
  const r = tx(`select public.grant_birthday_rewards('${TODAY}') as first;
    select public.grant_birthday_rewards('${TODAY}') as second;`);
  check("running it twice grants nothing the second time", r.ok ? r.rows[0].second : "error", 0);
  const dup = tx(`
    insert into public.reward_credits (agency_id, user_id, kind, label, issued_on, expires_on)
    values ('${AGENCY}', '${AGENT}', 'birthday', 'A', '${TODAY}', '${TODAY}'),
           ('${AGENCY}', '${AGENT}', 'birthday', 'B', '${TODAY}', '${TODAY}');`);
  check("two birthday rewards in one year are impossible", dup.ok, false);
}

console.log("\nAn extension is an audited exception");
{
  check("a manager may extend, with a reason",
    withBirthday(`set local role authenticated;
      do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${EXEC}","role":"authenticated"}', true); end $c$;
      select public.extend_reward_credit(
        (select id from public.reward_credits where user_id='${AGENT}' and kind='birthday'),
        '${TODAY}'::date + 30, 'BES declined the dates twice for coverage');`).ok, true);
  check("…never without one",
    withBirthday(`set local role authenticated;
      do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${EXEC}","role":"authenticated"}', true); end $c$;
      select public.extend_reward_credit(
        (select id from public.reward_credits where user_id='${AGENT}' and kind='birthday'),
        '${TODAY}'::date + 30, '');`).ok, false);
  check("…and an agent may not extend their own",
    withBirthday(`set local role authenticated;
      do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${AGENT}","role":"authenticated"}', true); end $c$;
      select public.extend_reward_credit(
        (select id from public.reward_credits where user_id='${AGENT}' and kind='birthday'),
        '${TODAY}'::date + 30, 'I would like longer please');`).ok, false);
}

console.log("\nWho may see a reward");
{
  const other = one(`select p.id from profiles p
      join agency_memberships m on m.user_id=p.id and m.status='active'
     where coalesce(p.is_fixture,false)=false and m.role='agency_user' and not m.is_owner
       and p.id <> '${AGENT}' and p.id <> '${EXEC}'
       and not exists (select 1 from team_memberships tm where tm.user_id=p.id and tm.is_lead)
     limit 1`)?.id;
  const seen = (viewer) => withBirthday(`set local role authenticated;
      do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${viewer}","role":"authenticated"}', true); end $c$;
      select count(*)::int as n from public.reward_credits where user_id='${AGENT}';`);
  check("the owner of the reward sees it", seen(AGENT).rows?.[0]?.n, 1);
  check("an executive sees it", seen(EXEC).rows?.[0]?.n, 1);
  if (other) check("an unrelated colleague does not", seen(other).rows?.[0]?.n, 0);
  else failures.push("no unrelated colleague to measure the privacy rule");
}

/*
 * Dee's acceptance items 6, 7, 13, 14, 15 — evidence and the four views.
 * The two views BES has nobody in today (division manager, non-admin lead)
 * are BUILT, as the standing rule requires; a view only covered when somebody
 * happens to hold it is not covered.
 */
console.log("\nEvidence of the decision");
{
  const CLOSED = one(`select (extract(year from (now() at time zone 'America/New_York') - interval '6 months'))::text
    || '-Q' || (floor((extract(month from (now() at time zone 'America/New_York') - interval '6 months')::int - 1) / 3) + 1)::text as q`).q;
  /* No role, no claims: exactly how the sweep calls it. */
  const auto = tx(`select public.grant_attendance_reward('${AGENT}', '${CLOSED}', 'sweep', 20, '{"baseline":15}'::jsonb) as id;
    select source_quarter, issued_automatically, final_score::text as score,
           (policy_snapshot is not null) as snap, (evaluated_at is not null) as evaluated,
           (expires_on - issued_on) as ttl
      from public.reward_credits where user_id='${AGENT}' and kind='attendance';`);
  const row = auto.ok ? auto.rows[0] : null;
  check("6. the source quarter is stored", row?.source_quarter, CLOSED);
  check("7. a session-less grant is marked automatic", row?.issued_automatically, true);
  check("…with the final score frozen as evidence", row?.score, "20.00");
  check("…and the policy it was judged under", row?.snap, true);
  check("…and when it was evaluated", row?.evaluated, true);
  check("5. it expires 90 days after issue", row?.ttl, 90);
  const manual = asUser(EXEC, `select public.grant_attendance_reward('${AGENT}', '${CLOSED}') as id;
    select issued_automatically from public.reward_credits where user_id='${AGENT}' and kind='attendance';`);
  check("…while a manager's grant is not marked automatic", manual.ok ? manual.rows[0].issued_automatically : "error", false);
}

console.log("\nThe four views, on rewards");
{
  /* Two subjects in DIFFERENT divisions, chosen by shape. */
  const inDiv = one(`select tm.user_id, d.division::text as division from team_memberships tm
      join teams t on t.id = tm.team_id and t.archived_at is null and coalesce(t.is_fixture,false)=false
      join departments d on d.id = t.department_id
      join profiles p on p.id = tm.user_id and coalesce(p.is_fixture,false)=false
      join agency_memberships m on m.user_id = tm.user_id and m.status='active'
     where tm.user_id not in ('${EXEC}', '${AGENT}') limit 1`);
  const outDiv = inDiv ? one(`select tm.user_id from team_memberships tm
      join teams t on t.id = tm.team_id and t.archived_at is null and coalesce(t.is_fixture,false)=false
      join departments d on d.id = t.department_id
      join profiles p on p.id = tm.user_id and coalesce(p.is_fixture,false)=false
      join agency_memberships m on m.user_id = tm.user_id and m.status='active'
     where d.division::text <> '${inDiv.division}' and tm.user_id not in ('${EXEC}', '${AGENT}', '${inDiv.user_id}') limit 1`) : null;

  if (!inDiv || !outDiv) {
    failures.push("no two people in different divisions to measure division scope");
    console.log("  SKIPPED — need people on teams in two different divisions.");
  } else {
    const seed = `
      insert into public.reward_credits (agency_id, user_id, kind, label, issued_on, expires_on)
      values ('${AGENCY}', '${inDiv.user_id}', 'attendance', 'In-division reward', '${TODAY}', '${TODAY}'::date + 90),
             ('${AGENCY}', '${outDiv.user_id}', 'attendance', 'Other-division reward', '${TODAY}', '${TODAY}'::date + 90),
             ('${AGENCY}', '${AGENT}', 'attendance', 'Agent own reward', '${TODAY}', '${TODAY}'::date + 90);`;
    const labelsSeen = (setup, viewer) => {
      const r = tx(`${seed} ${setup}
        set local role authenticated;
        do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${viewer}","role":"authenticated"}', true); end $c$;
        select string_agg(label, '|' order by label) as seen from public.reward_credits;`);
      return r.ok ? (r.rows[0].seen ?? "") : `error: ${r.message}`;
    };

    check("12. an agent sees only their own reward", labelsSeen("", AGENT), "Agent own reward");
    check("…and cannot issue one",
      asUser(AGENT, `select public.grant_attendance_reward('${inDiv.user_id}', '2025-Q4');`).ok, false);

    const asDivisionManager = `
      update public.agency_memberships set scope='division', scope_division='${inDiv.division}'
       where user_id='${AGENT}' and agency_id='${AGENCY}';
      insert into public.agency_member_permissions (membership_id, key, allowed)
        select m.id, 'ops.manage', true from public.agency_memberships m
         where m.user_id='${AGENT}' and m.agency_id='${AGENCY}'
      on conflict (membership_id, key) do update set allowed = true;`;
    check("14. a division manager sees their division's reward and their own — not the other division's",
      labelsSeen(asDivisionManager, AGENT), "Agent own reward|In-division reward");

    const asLead = `
      insert into public.team_memberships (team_id, user_id, is_lead)
        select tm.team_id, '${AGENT}', true from public.team_memberships tm
         where tm.user_id='${inDiv.user_id}' limit 1
      on conflict (team_id, user_id) do update set is_lead = true;`;
    check("13. a team lead sees their team member's reward and their own — nobody else's",
      labelsSeen(asLead, AGENT), "Agent own reward|In-division reward");
    check("…and cannot mint a reward",
      tx(`${asLead} set local role authenticated;
        do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${AGENT}","role":"authenticated"}', true); end $c$;
        select public.grant_attendance_reward('${inDiv.user_id}', '2025-Q4');`).ok, false);

    check("15. an executive sees all three", labelsSeen("", EXEC), "Agent own reward|In-division reward|Other-division reward");
  }
}

check("nothing survived the probe",
  one("select count(*)::int as n from public.reward_credits").n, 0);

console.log(`\n${pass} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  - ${f}`));
process.exit(failures.length ? 1 : 0);
