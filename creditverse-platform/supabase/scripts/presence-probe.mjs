/**
 * The presence precedence, proved (Dee's rule, 2026-09-21).
 *
 *   1. a live clock entry always shows as the live state
 *      · on a day off / no schedule → exception `unscheduled_shift`
 *      · on approved leave          → exception `leave_conflict`
 *   2. with no live entry: leave → worked-and-out → day off / no schedule →
 *      not in yet (shift running) → absent (shift ended)
 *
 * Each case rewrites one real person's day inside a transaction and rolls it
 * back. Read as Dee (the owner); scope is checked by reading as an agent.
 *
 * Run: node supabase/scripts/presence-probe.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });
let pass = 0; const failures = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}\n       expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`); }
};
const one = (sql) => q.query(sql)[0];

const AGENCY = one("select id from agencies order by created_at limit 1").id;
const DEE = one(`select m.user_id from agency_memberships m join profiles p on p.id=m.user_id
                  where m.agency_id='${AGENCY}' and m.is_owner and p.email like '%blessedempireservices.com'
                  order by p.email limit 1`).user_id;
/* Somebody in the owner's scope who is not a manager — the row under test. */
const TARGET = one(`select p.id, p.full_name from profiles p
                     join agency_memberships m on m.user_id = p.id and m.status='active'
                     where p.email = 'jetmanugas.bes@gmail.com'`);
const AGENT = TARGET.id;

const as = (u) => `set local role authenticated; do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true); end $c$;`;
/* Today, in the business timezone the function uses. */
const TODAY = "(now() at time zone 'America/New_York')::date";
const CLEAR = `
  delete from time_entries where employee_id='${AGENT}' and (ended_at is null or work_date >= ${TODAY} - 1);
  delete from leave_requests where user_id='${AGENT}' and ${TODAY} between starts_on and ends_on;
  delete from work_schedules where user_id='${AGENT}';`;

/** A schedule for today (or deliberately not for today), ending at `endsAt`. */
const schedule = (worksToday, endsAt) => `
  insert into work_schedules (agency_id, user_id, work_days, shift_start, shift_end, lunch_minutes, break_minutes, grace_minutes, timezone, effective_from)
  values ('${AGENCY}', '${AGENT}',
          ${worksToday ? `array[extract(isodow from ${TODAY})::smallint]` : `array[(case when extract(isodow from ${TODAY})::int = 1 then 2 else 1 end)::smallint]`},
          '00:00'::time, '${endsAt}'::time, 60, 30, 15, 'America/New_York', ${TODAY} - 30);`;

const openWork = `insert into time_entries (agency_id, employee_id, kind, work_date, started_at, division_id)
                  values ('${AGENCY}', '${AGENT}', 'work', ${TODAY}, now() - interval '2 hours', 'creditops');`;
/* duration_minutes is generated from the two timestamps; it is never written. */
const closedWork = `insert into time_entries (agency_id, employee_id, kind, work_date, started_at, ended_at, division_id)
                    values ('${AGENCY}', '${AGENT}', 'work', ${TODAY}, now() - interval '5 hours', now() - interval '1 hour', 'creditops');`;
const leave = `insert into leave_requests (agency_id, user_id, type_id, starts_on, ends_on, status, reason)
               select '${AGENCY}', '${AGENT}', lt.id, ${TODAY}, ${TODAY}, 'approved', 'probe'
                 from leave_types lt where lt.agency_id='${AGENCY}' and lt.active order by lt.sort limit 1;`;

const row = (setup) => {
  const r = q.query(`begin; set local role postgres; ${CLEAR} ${setup}
    ${as(DEE)}
    select state, coalesce(exception, '-') as exception from team_presence() where user_id = '${AGENT}';
    rollback;`);
  const x = r[0] ?? {};
  return `${x.state ?? "(missing)"}/${x.exception ?? "-"}`;
};

console.log(`\nPRESENCE PRECEDENCE — ${TARGET.full_name}, read by the owner\n`);
check("1 · on the clock on a scheduled day", row(`${schedule(true, "23:59")} ${openWork}`), "clocked_in/-");
check("2 · on the clock on a DAY OFF is Working, flagged as an unscheduled shift",
  row(`${schedule(false, "23:59")} ${openWork}`), "clocked_in/unscheduled_shift");
check("3 · on the clock while on APPROVED LEAVE is Working, flagged as a leave conflict",
  row(`${schedule(true, "23:59")} ${leave} ${openWork}`), "clocked_in/leave_conflict");
check("4 · approved leave and no clock is On leave, and is not an exception",
  row(`${schedule(true, "23:59")} ${leave}`), "on_leave/-");
check("5 · a day off and no clock is Day off", row(schedule(false, "23:59")), "off/-");
check("6 · no schedule at all says so rather than guessing", row(""), "no_schedule/-");
check("7 · scheduled, not in, shift still running → Not in yet",
  row(schedule(true, "23:59")), "not_in_yet/-");
check("8 · scheduled, not in, shift already ended → Absent (not at midnight)",
  row(schedule(true, "00:01")), "absent/-");
check("9 · worked and clocked out → Clocked out", row(`${schedule(true, "23:59")} ${closedWork}`), "clocked_out/-");
check("10 · worked and clocked out on a DAY OFF keeps the exception",
  row(`${schedule(false, "23:59")} ${closedWork}`), "clocked_out/unscheduled_shift");
check("11 · leave plus a finished shift is a conflict, not a quiet 'on leave'",
  row(`${schedule(true, "23:59")} ${leave} ${closedWork}`), "on_leave/leave_conflict");

/* ── The DAY's break and lunch, not the current sitting (Dee, 2026-09-21) ── */
console.log("\nACCUMULATED BREAK AND LUNCH ON THE BOARD");
{
  /* Three closed breaks plus one that is still running. A manager looking at
     the fourth must see the day, not the four minutes of this one. */
  const restRow = (setup) => {
    const r = q.query(`begin; set local role postgres; ${CLEAR} ${setup}
      ${as(DEE)}
      select state, break_minutes, lunch_minutes, break_allowance_minutes, lunch_allowance_minutes
        from team_presence() where user_id = '${AGENT}';
      rollback;`);
    return r[0] ?? {};
  };
  const rest = (kind, startAgo, endAgo) =>
    `insert into time_entries (agency_id, employee_id, kind, work_date, started_at, ended_at, division_id)
     values ('${AGENCY}', '${AGENT}', '${kind}', ${TODAY}, now() - interval '${startAgo}', now() - interval '${endAgo}', 'creditops');`;
  const openRest = (kind, startAgo) =>
    `insert into time_entries (agency_id, employee_id, kind, work_date, started_at, division_id)
     values ('${AGENCY}', '${AGENT}', '${kind}', ${TODAY}, now() - interval '${startAgo}', 'creditops');`;

  const three = `${schedule(true, "23:59")} ${rest("break", "5 hours", "4 hours 48 minutes")} ${rest("break", "3 hours", "2 hours 50 minutes")} ${rest("break", "90 minutes", "75 minutes")}`;
  const a = restRow(three);
  check("14 · three closed breaks add up to the day's total", a.break_minutes, 37);
  check("15 · the allowance comes from the person's own schedule", [a.break_allowance_minutes, a.lunch_allowance_minutes], [30, 60]);

  const b = restRow(`${three} ${openRest("break", "4 minutes")}`);
  check("16 · a fourth, running break reads the DAY, not the sitting", b.break_minutes, 41);
  check("17 · and the state is still On break", b.state, "on_break");

  const c = restRow(`${schedule(true, "23:59")} ${rest("lunch", "5 hours", "4 hours 18 minutes")} ${openRest("lunch", "26 minutes")}`);
  check("18 · a split lunch resumes from the earlier segment", c.lunch_minutes, 68);

  /* Yesterday's rest belongs to yesterday's work_date and must not carry. */
  const yesterday = `insert into time_entries (agency_id, employee_id, kind, work_date, started_at, ended_at, division_id)
     values ('${AGENCY}', '${AGENT}', 'break', ${TODAY} - 1, now() - interval '26 hours', now() - interval '25 hours 35 minutes', 'creditops');`;
  const d = restRow(`${schedule(true, "23:59")} ${yesterday} ${rest("break", "2 hours", "1 hour 53 minutes")}`);
  check("19 · the day resets on the Eastern work_date, so yesterday does not carry", d.break_minutes, 7);

  /* No schedule: usage is still reported, no allowance is claimed. */
  const e = restRow(`${rest("break", "2 hours", "1 hour 40 minutes")}`);
  check("20 · with no schedule the usage shows and no allowance is invented",
    [e.break_minutes, e.break_allowance_minutes], [20, null]);

  /* The raw punches stay separate rows — the total is derived, never merged. */
  const rows = q.query(`begin; set local role postgres; ${CLEAR} ${three}
    select count(*)::int as n from time_entries where employee_id='${AGENT}' and kind='break';
    rollback;`)[0].n;
  check("21 · and the three punches remain three rows", rows, 3);
}

console.log("\nSCOPE");
{
  const agentSees = q.query(`begin; ${as(AGENT)} select count(*)::int as n from team_presence(); rollback;`)[0].n;
  check("12 · an agent manages nobody, so the board is empty for them", agentSees, 0);
  const ownerSees = q.query(`begin; ${as(DEE)} select count(*)::int as n from team_presence(); rollback;`)[0].n;
  check("13 · the owner sees the company", ownerSees > 5, true);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
