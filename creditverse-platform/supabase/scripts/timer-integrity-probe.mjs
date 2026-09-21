/**
 * Two rules about somebody else's clock, proved against production.
 *
 * 1. A CLOSED punch keeps its end (20260921017000). The guard used to rewrite
 *    `ended_at` on any update to a finished row, which produced thirty-nine
 *    overlapping entries across four people before it was caught.
 * 2. A manager may clock out somebody they MANAGE, and nobody else
 *    (20260921018000) — Dee, 2026-09-21. Checked from all four views.
 *
 * Every case runs inside a transaction and is rolled back.
 *
 * Run: node supabase/scripts/timer-integrity-probe.mjs
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
const AGENT = one(`select p.id from profiles p join agency_memberships m on m.user_id=p.id and m.status='active'
                    where p.email='jetmanugas.bes@gmail.com'`).id;
/* A second agent the first one certainly does not manage. */
const OTHER = one(`select mp.user_id from agency_memberships m
                     join lateral (select m.user_id) mp on true
                    where m.agency_id='${AGENCY}' and m.status='active' and m.user_id not in ('${DEE}','${AGENT}')
                    order by m.user_id limit 1`).user_id;

const as = (u) => `set local role authenticated; do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true); end $c$;`;
const TODAY = "(now() at time zone 'America/New_York')::date";
const CLEAR = (u) => `delete from time_entries where employee_id='${u}' and (ended_at is null or work_date >= ${TODAY} - 1);`;
const openWork = (u, ago = "2 hours") => `insert into time_entries (agency_id, employee_id, kind, work_date, started_at, division_id)
  values ('${AGENCY}', '${u}', 'work', ${TODAY}, now() - interval '${ago}', 'creditops');`;
const closedWork = (u) => `insert into time_entries (agency_id, employee_id, kind, work_date, started_at, ended_at, division_id)
  values ('${AGENCY}', '${u}', 'work', ${TODAY}, now() - interval '5 hours', now() - interval '4 hours', 'creditops');`;

console.log("\nA CLOSED PUNCH KEEPS ITS END\n");
{
  /* An agent editing their own finished entry's note must not move its end. */
  const r = one(`begin; set local role postgres; ${CLEAR(AGENT)} ${closedWork(AGENT)}
    ${as(AGENT)}
    update time_entries set task_note = 'renamed'
      where employee_id='${AGENT}' and ended_at is not null;
    select duration_minutes as m, auto_stopped from time_entries
      where employee_id='${AGENT}' and ended_at is not null limit 1;
    rollback;`);
  check("1 · an edit to a finished entry leaves its 60 minutes alone", r.m, 60);
  check("2 · and does not stamp it auto-stopped", r.auto_stopped, false);

  /* The same edit more than ten hours after the start used to rewrite the end
     to start + cap and claim the system had stopped it. */
  const old = one(`begin; set local role postgres; ${CLEAR(AGENT)}
    insert into time_entries (agency_id, employee_id, kind, work_date, started_at, ended_at, division_id)
      values ('${AGENCY}','${AGENT}','work',${TODAY} - 1, now() - interval '30 hours', now() - interval '29 hours','creditops');
    ${as(AGENT)}
    update time_entries set task_note='renamed' where employee_id='${AGENT}';
    select duration_minutes as m, auto_stopped from time_entries where employee_id='${AGENT}' limit 1;
    rollback;`);
  check("3 · nor does an edit a day later become a ten-hour auto-stop", [old.m, old.auto_stopped], [60, false]);

  /* Closing an OPEN entry still behaves exactly as it always did. */
  const closing = one(`begin; set local role postgres; ${CLEAR(AGENT)} ${openWork(AGENT, "90 minutes")}
    ${as(AGENT)}
    update time_entries set ended_at = now() - interval '3 days'
      where employee_id='${AGENT}' and ended_at is null;
    select duration_minutes as m from time_entries where employee_id='${AGENT}' limit 1;
    rollback;`);
  check("4 · a clock-out is still stamped now, whatever the client sends", closing.m, 90);

  const capped = one(`begin; set local role postgres; ${CLEAR(AGENT)} ${openWork(AGENT, "14 hours")}
    ${as(AGENT)}
    update time_entries set ended_at = now() where employee_id='${AGENT}' and ended_at is null;
    select duration_minutes as m, auto_stopped from time_entries where employee_id='${AGENT}' limit 1;
    rollback;`);
  check("5 · and still capped at ten hours, and marked as such", [capped.m, capped.auto_stopped], [600, true]);

  /* No overlapping pair may exist anywhere in production. */
  const live = one(`with nx as (
      select a.id, a.ended_at,
             (select min(b.started_at) from time_entries b
               where b.employee_id=a.employee_id and b.started_at > a.started_at) nx
        from time_entries a where a.ended_at is not null)
    select count(*)::int n from nx where nx is not null and ended_at > nx;`);
  check("6 · and no punch anywhere still outlives the next one", live.n, 0);
}

console.log("\nA MANAGER MAY CLOCK OUT SOMEBODY THEY MANAGE\n");
const attempt = (actor, target, setup) => {
  try {
    const r = q.query(`begin; set local role postgres; ${CLEAR(target)} ${setup}
      ${as(actor)}
      select public.manager_clock_out('${target}', 'left the laptop running') as id;
      rollback;`);
    return r[0]?.id ? "done" : "no id";
  } catch (e) {
    const m = String(e.message);
    if (m.includes("do not manage")) return "refused: not managed";
    if (m.includes("not clocked in")) return "refused: not clocked in";
    if (m.includes("your own clock")) return "refused: yourself";
    return `error: ${m.split("\n")[0].slice(0, 60)}`;
  }
};

check("7 · the owner may clock out an agent", attempt(DEE, AGENT, openWork(AGENT)), "done");
check("8 · an agent may not clock out another agent", attempt(AGENT, OTHER, openWork(OTHER)), "refused: not managed");
check("9 · nobody clocks themselves out through this door", attempt(DEE, DEE, openWork(DEE)), "refused: yourself");
check("10 · clocking out somebody who is not on the clock says so", attempt(DEE, AGENT, ""), "refused: not clocked in");

{
  /* The entry really closes, at now, and the audit and the notice are written. */
  const r = one(`begin; set local role postgres; ${CLEAR(AGENT)} ${openWork(AGENT, "3 hours")}
    ${as(DEE)}
    select public.manager_clock_out('${AGENT}', 'forgot to clock out') as id;
    /* Read the result back as the system: a notification is readable only by
       its recipient, so the manager cannot see the one they just caused. */
    reset role; set local role postgres;
    select
      (select duration_minutes from time_entries where employee_id='${AGENT}') as m,
      (select count(*)::int from activity_events
         where entity_type='time_entry' and action='manager_clock_out' and actor_id='${DEE}') as audited,
      (select count(*)::int from notifications
         where recipient_id='${AGENT}' and kind='timer'
           and detail like '%forgot to clock out%') as told;
    rollback;`);
  check("11 · the entry closes at three hours, not at the ten-hour cap", r.m, 180);
  check("12 · the act is audited against the manager who did it", r.audited, 1);
  check("13 · and the agent is told their timer was stopped", r.told, 1);

  /* A break is a clock state too: stopping it ends the day, not just the rest. */
  const brk = one(`begin; set local role postgres; ${CLEAR(AGENT)}
    insert into time_entries (agency_id, employee_id, kind, work_date, started_at, division_id)
      values ('${AGENCY}','${AGENT}','break',${TODAY}, now() - interval '20 minutes','creditops');
    ${as(DEE)}
    select public.manager_clock_out('${AGENT}', null);
    select count(*)::int as open from time_entries where employee_id='${AGENT}' and ended_at is null;
    rollback;`);
  check("14 · clocking out somebody on a break leaves nothing running", brk.open, 0);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
