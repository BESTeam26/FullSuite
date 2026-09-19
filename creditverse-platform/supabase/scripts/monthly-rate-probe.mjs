/**
 * Monthly pay packages — the derivation, the share, and who may see it.
 *
 * Dee, 2026-09-19: enter a monthly package, the system derives the hourly
 * rate. Everything below runs inside transactions that roll back; the
 * schedules and rates it needs are BUILT, never assumed.
 *
 * Run: node supabase/scripts/monthly-rate-probe.mjs
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
const PAYROLL = one(`select m.user_id from agency_memberships m join profiles p on p.id=m.user_id
   where m.agency_id='${AGENCY}' and m.status='active' and coalesce(p.is_fixture,false)=false
     and exists (select 1 from agency_member_permissions ap where ap.membership_id=m.id and ap.key='payroll.manage' and ap.allowed)
   limit 1`).user_id;
const AGENT = one(`select p.id from profiles p join agency_memberships m on m.user_id=p.id and m.status='active'
   where coalesce(p.is_fixture,false)=false and m.role='agency_user' and not m.is_owner
     and not exists (select 1 from team_memberships tm where tm.user_id=p.id and tm.is_lead)
     and not exists (select 1 from agency_member_permissions ap join agency_memberships mm on mm.id=ap.membership_id
                      where mm.user_id=p.id and ap.key in ('payroll.view','payroll.manage') and ap.allowed)
   limit 1`).id;
const SUBJECT = one(`select m.user_id from agency_memberships m join profiles p on p.id=m.user_id
   where m.status='active' and coalesce(p.is_fixture,false)=false and m.user_id not in ('${PAYROLL}','${AGENT}') limit 1`).user_id;

const session = (viewer) => `set local role authenticated;
  do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${viewer}","role":"authenticated"}', true); end $c$;`;
const inTx = (setup, viewer, sql) => q.query(`begin; ${setup} ${viewer ? session(viewer) : ""} ${sql}; rollback;`);

console.log("\nThe share of a month\n");
const share = (m, s, e) => Number(one(`select public.monthly_share_cents(${m}, '${s}', '${e}') as v`).v);
check("first half of September floors", share(2000001, "2026-09-01", "2026-09-15"), 1000000);
check("second half carries the odd cent", share(2000001, "2026-09-16", "2026-09-30"), 1000001);
check("two halves sum to exactly one package", share(2000001, "2026-09-01", "2026-09-15") + share(2000001, "2026-09-16", "2026-09-30"), 2000001);
check("February's halves are equal halves too, not 15/28ths", share(2000000, "2026-02-01", "2026-02-15"), 1000000);
check("a whole calendar month pays the package once", share(2000000, "2026-02-01", "2026-02-28"), 2000000);

/* ₱20,000 a month, Mon–Fri 9–6 with an hour's lunch → 261 days, 8 paid hours. */
const schedule = (days) => `insert into public.work_schedules (agency_id, user_id, work_days, shift_start, shift_end, lunch_minutes, effective_from)
  values ('${AGENCY}', '${SUBJECT}', '{${days}}', '09:00', '18:00', 60, date '2020-01-01')
  on conflict (user_id, effective_from) do update set work_days = excluded.work_days, shift_start = excluded.shift_start,
    shift_end = excluded.shift_end, lunch_minutes = excluded.lunch_minutes;`;
const monthly = `insert into public.member_pay_rates (agency_id, user_id, rate_type, rate_cents, currency, effective_from)
  values ('${AGENCY}', '${SUBJECT}', 'monthly', 2000000, 'PHP', date '2020-01-01')
  on conflict (user_id, effective_from) do update set rate_type = 'monthly', rate_cents = 2000000, currency = 'PHP';`;
const breakdown = (setup, viewer) => inTx(setup, viewer,
  `select rate_type, rate_cents::int as rate_cents, currency, days_per_year, paid_minutes_per_day,
          daily_cents::int as daily_cents, hourly_cents::int as hourly_cents
     from public.pay_rate_breakdown('${SUBJECT}', '2026-09-15')`);

console.log("\nThe derivation, seen by payroll\n");
check("₱20,000 monthly, Mon–Fri 9–6 → ₱919.54 a day, ₱114.94 an hour",
  breakdown(schedule("1,2,3,4,5") + monthly, PAYROLL),
  [{ rate_type: "monthly", rate_cents: 2000000, currency: "PHP", days_per_year: 261, paid_minutes_per_day: 480, daily_cents: 91954, hourly_cents: 11494 }]);
check("a six-day week is priced on 313 days",
  breakdown(schedule("1,2,3,4,5,6") + monthly, PAYROLL).map((r) => [r.days_per_year, r.daily_cents]), [[313, 76677]]);
check("no schedule → the package, and NO guessed daily or hourly",
  breakdown(`delete from public.work_schedules where user_id='${SUBJECT}'; ${monthly}`, PAYROLL)
    .map((r) => [r.rate_cents, r.days_per_year, r.daily_cents, r.hourly_cents]), [[2000000, null, null, null]]);
check("an hourly rate reads back as itself, with the day derived",
  breakdown(schedule("1,2,3,4,5") + `insert into public.member_pay_rates (agency_id, user_id, rate_type, rate_cents, currency, effective_from)
     values ('${AGENCY}', '${SUBJECT}', 'hourly', 11500, 'PHP', date '2020-01-01')
     on conflict (user_id, effective_from) do update set rate_type='hourly', rate_cents=11500, currency='PHP';`, PAYROLL)
    .map((r) => [r.hourly_cents, r.daily_cents]), [[11500, 92000]]);

console.log("\nWho may see it\n");
check("an agent without payroll access sees no breakdown for a colleague", breakdown(schedule("1,2,3,4,5") + monthly, AGENT), []);

console.log("\nSetting the rate\n");
const setAs = (viewer, type) => inTx("", viewer, `do $c$ begin
    perform public.set_member_pay_rate('${SUBJECT}', '${type}', 2000000, 'PHP', date '2030-01-01');
    perform set_config('probe.result', 'ok', true);
  exception when others then perform set_config('probe.result', sqlstate || ' ' || sqlerrm, true); end $c$;
  select current_setting('probe.result', true) as r`)[0].r;
check("payroll may set a monthly package", setAs(PAYROLL, "monthly"), "ok");
check("…but not an invented rate type", /^P0001 rate_type is hourly, per_cutoff or monthly/.test(setAs(PAYROLL, "weekly")), true);
check("an agent may not set anyone's rate", setAs(AGENT, "monthly").startsWith("42501"), true);

console.log("\nPayroll for a half month\n");
const cutoff = one(`select id, period_start, period_end from payroll_cutoffs where status='draft' and agency_id='${AGENCY}'
  order by period_start desc limit 1`);
if (!cutoff) { failures.push("no draft cutoff to generate against"); console.log("  FAIL no draft cutoff to generate against"); }
else {
  const slip = inTx(schedule("1,2,3,4,5") + monthly, PAYROLL,
    `select public.generate_payroll('${cutoff.id}');
     select rate_type, base_cents::int as base_cents, rate_basis->>'hourly_cents' as hourly, rate_basis->>'days_per_year' as days
       from public.payslips where cutoff_id='${cutoff.id}' and user_id='${SUBJECT}'`);
  const expectShare = share(2000000, cutoff.period_start, cutoff.period_end);
  check(`the payslip for ${cutoff.period_start} – ${cutoff.period_end} pays the month's share`, slip.map((s) => [s.rate_type, s.base_cents]), [["monthly", expectShare]]);
  check("…and freezes the basis it was priced with", slip.map((s) => [s.hourly, s.days]), [["11494", "261"]]);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  - ${f}`));
process.exit(failures.length ? 1 : 0);
