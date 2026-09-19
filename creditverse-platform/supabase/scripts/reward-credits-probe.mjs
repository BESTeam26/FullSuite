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

check("nothing survived the probe",
  one("select count(*)::int as n from public.reward_credits").n, 0);

console.log(`\n${pass} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  - ${f}`));
process.exit(failures.length ? 1 : 0);
