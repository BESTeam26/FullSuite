/**
 * Seven days' notice, asked of the DATABASE.
 *
 * Dee, 2026-09-18: "Add rule, DO NOT Allow Leave Submission 7 days before the
 * leave request date."
 *
 * The form refuses early and says why, but a form is presentation. These send
 * the insert the client sends, as the real user, inside rolled-back
 * transactions — the only version of the rule that counts.
 *
 * Run: node supabase/scripts/leave-notice-probe.mjs
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
/*
 * Somebody with NO live leave in the window this probe writes into.
 *
 * The first version used the owner, who has real pending leave over the exact
 * dates "today + 7" lands on — so `leave_requests_no_overlap` refused the
 * insert and it read as the notice rule rejecting a date it should have taken.
 * The rule was right; the probe had picked a subject with a diary. Choosing by
 * SHAPE rather than by role keeps it true as real leave comes and goes.
 */
const ME = one(`select p.id as user_id from profiles p
    join agency_memberships m on m.user_id = p.id and m.status = 'active'
   where coalesce(p.is_fixture,false) = false
     and not exists (
       select 1 from leave_requests r
        where r.user_id = p.id and r.status in ('pending','approved')
          and r.ends_on   >= (now() at time zone 'America/New_York')::date - 10
          and r.starts_on <= (now() at time zone 'America/New_York')::date + 45)
   limit 1`).user_id;
const TODAY = one(`select (now() at time zone coalesce(
    (select eod_timezone from agencies where id='${AGENCY}'), 'America/New_York'))::date as d`).d;
const typeOf = (code) => one(`select id, min_notice_days as n, label from leave_types
   where agency_id='${AGENCY}' and code='${code}'`);

/* Far enough out that the overlap constraint cannot collide with real leave. */
const plus = (days) => one(`select ('${TODAY}'::date + ${days})::text as d`).d;

/** The client's own insert, as the real user, rolled back. */
const submit = (typeId, startsOn, endsOn) => {
  try {
    q.query(`begin;
      set local role authenticated;
      do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${ME}","role":"authenticated"}', true); end $c$;
      insert into public.leave_requests (agency_id, user_id, type_id, starts_on, ends_on, reason)
      values ('${AGENCY}', '${ME}', '${typeId}', '${startsOn}', '${endsOn}', '[probe]');
      rollback;`);
    return "accepted";
  } catch (e) {
    try { q.query("rollback;"); } catch { /* gone */ }
    return String(e.message ?? e).includes("notice") ? "refused for notice" : "refused";
  }
};

console.log(`\nSeven days' notice · today is ${TODAY} in the agency's own timezone\n`);

const vacation = typeOf("vacation");
check("vacation carries the seven-day rule", vacation.n, 7);

check("leave starting tomorrow is refused", submit(vacation.id, plus(1), plus(2)), "refused for notice");
check("…and so is leave starting in six days", submit(vacation.id, plus(6), plus(7)), "refused for notice");
check("leave starting on the seventh day is allowed", submit(vacation.id, plus(7), plus(8)), "accepted");
check("…and anything later still is", submit(vacation.id, plus(30), plus(34)), "accepted");
check("leave starting today is refused", submit(vacation.id, TODAY, TODAY), "refused for notice");
check("leave starting in the PAST is refused", submit(vacation.id, plus(-3), plus(-1)), "refused for notice");

/* The half of this rule that would break a real workflow if it were flat. */
for (const code of ["sick", "emergency", "bereavement"]) {
  const t = typeOf(code);
  check(`${t.label} needs no notice — nobody plans it`, t.n, 0);
  check(`…so ${t.label.toLowerCase()} can be filed for today`, submit(t.id, TODAY, TODAY), "accepted");
}

for (const code of ["personal", "unpaid", "maternity", "paternity"]) {
  const t = typeOf(code);
  check(`${t.label} keeps the seven-day rule`, t.n, 7);
}

/* The rule is about ADMISSION. A decision made later must not be re-tested
   against it, or approving next week's request would fail its own rule. */
const decided = (() => {
  try {
    const r = q.query(`begin;
      insert into public.leave_requests (agency_id, user_id, type_id, starts_on, ends_on, reason)
        values ('${AGENCY}', '${ME}', '${vacation.id}', '${plus(8)}', '${plus(9)}', '[probe]')
        returning id;
      update public.leave_requests set status = 'approved', decided_at = now()
       where reason = '[probe]' and user_id = '${ME}';
      select status from public.leave_requests where reason = '[probe]' and user_id = '${ME}';
      rollback;`);
    return r[0]?.status ?? "missing";
  } catch (e) {
    try { q.query("rollback;"); } catch { /* gone */ }
    return String(e.message ?? e).split("\n")[0];
  }
})();
check("an accepted request can still be approved later", decided, "approved");

/* And nothing was left behind. */
check("no probe rows survived", one(`select count(*)::int as n from public.leave_requests where reason = '[probe]'`).n, 0);

console.log(`\n${pass} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  - ${f}`));
process.exit(failures.length ? 1 : 0);
