/**
 * One clock for the workforce: America/New_York (Dee, 2026-09-21).
 *
 * The device gets no vote. These are the server-side halves of Dee's ten UAT
 * points — the ones a browser cannot prove, checked against the live database
 * in rolled-back transactions.
 *
 * Run: node supabase/scripts/eastern-workday-probe.mjs
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
const WHO = one(`select p.id from profiles p join agency_memberships m on m.user_id = p.id
                  where p.email = 'archieamistadcarlos.bes@gmail.com'`).id;

/* 2026-09-21 22:02 Eastern (EDT). In Manila that is 2026-09-22 10:02 — the
   exact shape of the six punches that were filed on the wrong day. */
const EVENING_EDT = "2026-09-22T02:02:00Z";
/* 2026-01-15 21:00 Eastern (EST): the same evening, in winter. */
const EVENING_EST = "2026-01-16T02:00:00Z";

const insertWork = (startedAt, sentWorkDate) => `
  insert into time_entries (agency_id, employee_id, division_id, kind, started_at${sentWorkDate ? ", work_date" : ""})
  values ('${AGENCY}', '${WHO}', 'admin', 'work', '${startedAt}'::timestamptz${sentWorkDate ? `, '${sentWorkDate}'::date` : ""})
  returning work_date::text as work_date;`;

const run = (sql) => q.query(`begin; set local role postgres; ${sql} rollback;`);

console.log("\nTHE SERVER DECIDES THE WORKDAY");
{
  const r = run(`${insertWork(EVENING_EDT, null)}`);
  check("1 · an evening-Eastern punch is filed on the Eastern day", r.at(-1)?.work_date, "2026-09-21");
}
{
  /* What a Manila device would have sent, and used to win with. */
  const r = run(`${insertWork(EVENING_EDT, "2026-09-22")}`);
  check("2 · a device claiming tomorrow is overruled", r.at(-1)?.work_date, "2026-09-21");
}
{
  /* And a device claiming yesterday, the Californian direction. */
  const r = run(`${insertWork(EVENING_EDT, "2026-09-20")}`);
  check("3 · a device claiming yesterday is overruled too", r.at(-1)?.work_date, "2026-09-21");
}
{
  const r = run(`${insertWork(EVENING_EST, "2026-01-16")}`);
  check("4 · the same in winter, when Eastern is EST", r.at(-1)?.work_date, "2026-01-15");
}
{
  /* Mobile and desktop are the same insert; there is only one rule to obey. */
  const r = run(`
    ${insertWork(EVENING_EDT, "2026-09-22")}
    select count(distinct work_date)::int days from time_entries
     where employee_id = '${WHO}' and started_at = '${EVENING_EDT}'::timestamptz;`);
  check("5 · two devices punching the same instant land on one workday", r.at(-1)?.days, 1);
}

console.log("\nREST BELONGS TO ITS SHIFT");
{
  const r = run(`
    ${insertWork("2026-09-21T20:00:00Z", null)}
    select work_date::text as work_date from time_entries
     where employee_id = '${WHO}' and started_at = '2026-09-21T20:00:00Z'::timestamptz;`);
  check("6 · an afternoon-Eastern punch is that day", r.at(-1)?.work_date, "2026-09-21");
}
{
  /* A break carries the day it is given — the RPCs copy it from the open
     work entry, so a break never drifts onto the next day mid-shift. */
  const r = run(`
    insert into time_entries (agency_id, employee_id, division_id, kind, started_at, work_date)
    values ('${AGENCY}', '${WHO}', 'admin', 'break', '${EVENING_EDT}'::timestamptz, '2026-09-21'::date)
    returning work_date::text as work_date;`);
  check("7 · rest keeps the shift's day it was handed", r.at(-1)?.work_date, "2026-09-21");
}

console.log("\nEVERY JUDGEMENT READS THE SAME CLOCK");
{
  const tz = one("select count(*)::int n from work_schedules where timezone <> 'America/New_York'").n;
  check("8 · every schedule is America/New_York", tz, 0);
  const cols = one(`select count(*)::int n from information_schema.columns
                     where table_name='time_entries' and column_name='work_date'
                       and column_default like '%America/New_York%'`).n;
  check("9 · and the column's own default is Eastern, not UTC", cols, 1);
}
{
  /* attendance_for judges lateness and absence in the schedule's zone, and
     payable_minutes groups by work_date — both now Eastern by construction. */
  const late = one(`select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
                     where ns.nspname='public' and p.proname='attendance_for'
                       and pg_get_functiondef(p.oid) like '%w.timezone%'`).n;
  check("10 · lateness and absence resolve through the schedule's timezone", late, 1);
  const pay = one(`select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
                    where ns.nspname='public' and p.proname='payable_minutes'
                      and pg_get_functiondef(p.oid) like '%work_date%'`).n;
  check("11 · payroll groups by that same workday column", pay, 1);
}
{
  const drift = one(`select count(*)::int n from time_entries
                      where kind = 'work' and work_date <> (started_at at time zone 'America/New_York')::date`).n;
  check("12 · no live punch is filed on the wrong day", drift, 0);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
