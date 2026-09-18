/**
 * Correcting somebody's attendance, asked of the DATABASE.
 *
 * This changes a quarterly score, which Dee has attached money to — ₱2,000 and
 * a paid Reward Day at 20/20. So every rule is measured as the real user,
 * inside rolled-back transactions, not trusted to the dialog.
 *
 * Run: node supabase/scripts/attendance-correction-probe.mjs
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
const OWNER = one(`select m.user_id from agency_memberships m join profiles p on p.id = m.user_id
   where m.is_owner and m.status='active' and coalesce(p.is_fixture,false)=false limit 1`).user_id;
/* An ordinary agent — neither management nor a lead of anybody. */
const AGENT = one(`select p.id from profiles p
    join agency_memberships m on m.user_id = p.id and m.status='active'
   where coalesce(p.is_fixture,false)=false and m.role='agency_user' and not m.is_owner
     and not exists (select 1 from team_memberships tm where tm.user_id = p.id and tm.is_lead)
   limit 1`)?.id;
const LEAD = one(`select distinct tm.user_id from team_memberships tm
    join profiles p on p.id = tm.user_id
   where tm.is_lead and coalesce(p.is_fixture,false)=false limit 1`).user_id;
const LED = one(`select member_m.user_id from team_memberships lead_m
    join team_memberships member_m on member_m.team_id = lead_m.team_id
   where lead_m.user_id = '${LEAD}' and lead_m.is_lead and member_m.user_id <> '${LEAD}' limit 1`)?.user_id;
const SUBJECT = one(`select p.id from profiles p
    join agency_memberships m on m.user_id = p.id and m.status='active'
   where coalesce(p.is_fixture,false)=false and p.id <> '${OWNER}' limit 1`).id;
const DAY = one("select ((now() at time zone 'America/New_York')::date - 3)::text as d").d;

const as = (user, sql) => {
  try {
    return { ok: true, rows: q.query(`begin;
      set local role authenticated;
      do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); end $c$;
      ${sql} rollback;`) };
  } catch (e) {
    try { q.query("rollback;"); } catch { /* gone */ }
    return { ok: false, message: String(e.message ?? e).split("\n").find((l) => /ERROR|cannot|needs|Say why/.test(l)) ?? "refused" };
  }
};
const correct = (actor, subject, cls, reason = "Emergency confirmed with the family") =>
  as(actor, `select public.record_attendance_correction('${subject}', '${DAY}', '${cls}', '${reason}') as id;`);

console.log(`\nCorrecting attendance · subject day ${DAY}\n`);

console.log("Who may correct");
{
  check("an owner may correct somebody's day", correct(OWNER, SUBJECT, "approved_leave").ok, true);
  if (LED) check("a lead may correct somebody on their own team", correct(LEAD, LED, "approved_leave").ok, true);
  if (AGENT) {
    const r = correct(AGENT, SUBJECT, "approved_leave");
    check("an ordinary agent may not correct anybody", r.ok, false);
    check("…and is told why", /lead of their team|management/.test(r.message ?? ""), true);
  }
  const own = correct(OWNER, OWNER, "approved_leave");
  check("nobody may correct their OWN attendance", own.ok, false);
  check("…and is told why", /your own/i.test(own.message ?? ""), true);
}

console.log("\nWhat a correction must carry");
{
  check("a reason is required", correct(OWNER, SUBJECT, "approved_leave", "no").ok, false);
  check("an invented classification is refused",
    correct(OWNER, SUBJECT, "on_holiday").ok, false);
  check("NCNS may be recorded — the one thing the records cannot derive",
    correct(OWNER, SUBJECT, "ncns", "No contact all day, confirmed with the lead").ok, true);
}

console.log("\nWhat it leaves behind");
{
  const r = as(OWNER, `select public.record_attendance_correction('${SUBJECT}', '${DAY}', 'approved_leave', 'Emergency approved after the fact') as id;
    select c.classification, c.decided_by::text as by, length(c.reason) as reason_len
      from public.attendance_corrections c where c.user_id = '${SUBJECT}';`);
  const row = r.ok ? r.rows[0] : null;
  check("the correction is recorded with its actor", row?.by, OWNER);
  check("…and its reason", (row?.reason_len ?? 0) > 5, true);

  /*
   * Asked as the RECIPIENT, which is the only person who can answer it.
   * The first draft asked as the manager who sent it and got 0 — notifications
   * are private to whoever they are addressed to, so that check was measuring
   * the privacy rule and calling it a missing notification.
   */
  const told = q.query(`begin;
    set local role authenticated;
    do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', true); end $c$;
    create temp table probe_n on commit drop as
      select public.record_attendance_correction('${SUBJECT}', '${DAY}', 'approved_leave', 'Emergency approved after the fact') as id;
    do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${SUBJECT}","role":"authenticated"}', true); end $c$;
    select count(*)::int as n from public.notifications n
     where n.entity_id = (select id::text from probe_n);
    rollback;`);
  check("…and the person themselves is told, not left to discover it", told[0]?.n, 1);
}

console.log("\nWho may read one");
{
  const r = as(OWNER, `select public.record_attendance_correction('${SUBJECT}', '${DAY}', 'absent', 'Recorded for the probe') as id;
    select count(*)::int as n from public.attendance_corrections where user_id = '${SUBJECT}';`);
  check("a manager sees it", r.ok ? r.rows[0].n : "error", 1);

  if (AGENT && AGENT !== SUBJECT) {
    const outsider = as(AGENT, `select count(*)::int as n from public.attendance_corrections where user_id = '${SUBJECT}';`);
    check("an unrelated colleague sees nothing", outsider.ok ? outsider.rows[0].n : "error", 0);
  }
}

console.log("\nAnd nothing survives the probe");
check("no probe rows left behind",
  one("select count(*)::int as n from public.attendance_corrections").n, 0);
check("direct inserts are refused — decided_by cannot be forged",
  (() => {
    const r = as(OWNER, `insert into public.attendance_corrections
      (agency_id, user_id, work_date, classification, reason, decided_by)
      values ('${AGENCY}', '${SUBJECT}', '${DAY}', 'approved_leave', 'forged by hand', '${SUBJECT}');`);
    return r.ok;
  })(), false);

console.log(`\n${pass} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  - ${f}`));
process.exit(failures.length ? 1 : 0);
