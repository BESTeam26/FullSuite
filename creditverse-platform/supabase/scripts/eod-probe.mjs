/**
 * End of Day: who a report goes to, and who may read it.
 *
 * Dee, 2026-09-16: *"Do not determine Team Lead from a person's name/email.
 * Resolve: Employee → Team Membership → Team Lead … If the routing is
 * genuinely ambiguous, surface EOD Routing Review Required. Do not silently
 * send to a random Team Lead."*
 *
 * Every scenario below builds its OWN team and its own people inside a rolled
 * back transaction. That is deliberate: routing is a question about
 * organisational shape, and asserting it against whoever happens to lead a team
 * this week produces a probe that fails the day somebody is promoted. The one
 * thing measured against the real roster is that the live answers are
 * self-consistent.
 *
 * Run: node supabase/scripts/eod-probe.mjs
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
const as = (user, setup, action) => {
  try {
    return { ok: true, rows: q.query(`begin; ${setup}
      set local role authenticated;
      do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); end $c$;
      ${action} rollback;`) };
  } catch (e) {
    try { q.query("rollback;"); } catch { /* gone */ }
    return { ok: false, message: String(e.message ?? e).split("\n")[0].replace(/^.*ERROR:\s*/, "") };
  }
};
/** Superuser-side, still inside a rollback: for shaping a fixture org. */
const shaped = (setup, action) => {
  try { return { ok: true, rows: q.query(`begin; ${setup} ${action} rollback;`) }; }
  catch (e) { try { q.query("rollback;"); } catch { /* gone */ }
    return { ok: false, message: String(e.message ?? e).split("\n")[0].replace(/^.*ERROR:\s*/, "") }; }
};

const AGENCY = one("select id from agencies order by created_at limit 1").id;
const DEPT   = one("select id from departments where archived_at is null limit 1").id;
/* Three existing accounts to cast as agent, lead and bystander. Real ids,
   because team_memberships has a foreign key; their actual identities are
   irrelevant and never asserted on. */
const cast = q.query(`select p.id from profiles p
   join agency_memberships m on m.user_id = p.id and m.status = 'active'
  limit 3`).map((r) => r.id);

/* Valid HEX only. The first version spelled "eod" into the prefix, and `o` is
   not a hex digit, so every fixture insert failed and eight checks reported
   `undefined` rather than a wrong answer. */
const T = "0ed0ed00-1111-4222-8333-44445555";
const team = (n) => `${T}${String(n).padStart(4, "0")}`;

console.log("\nEnd of Day — routing and rollup\n");

console.log("Employee → Team Membership → Team Lead");
if (cast.length < 3) {
  console.log("  SKIPPED — needs three accounts to shape a fixture team\n");
} else {
  const [agent, lead, other] = cast;
  const makeTeam = (id, withLead = true) => `
    insert into teams (id, agency_id, name, department_id)
      values ('${id}', '${AGENCY}', '[probe] team ${id}', '${DEPT}');
    insert into team_memberships (team_id, user_id, is_lead)
      values ('${id}', '${agent}', false)${withLead ? `, ('${id}', '${lead}', true)` : ""};`;

  const route = (setup, who = agent) => {
    const r = shaped(setup, `select lead_id::text, reason from public.eod_route_for('${who}');`);
    /* A broken fixture must not look like a wrong routing decision. */
    if (!r.ok) return { reason: `FIXTURE FAILED: ${r.message}` };
    return r.rows[0];
  };

  /* The fixture agent may already sit on real teams, so each scenario starts by
     lifting them out — otherwise the live roster decides the answer. */
  const alone = `delete from team_memberships where user_id in ('${agent}', '${lead}', '${other}');`;

  check("one team with one lead routes to that lead",
    route(alone + makeTeam(team(1)))?.lead_id, lead);

  check("…and says so",
    route(alone + makeTeam(team(1)))?.reason, "team_lead");

  check("a team with no lead is not routed to a random member",
    route(alone + makeTeam(team(2), false))?.reason, "no_lead");

  check("belonging to no team at all says so",
    route(alone)?.reason, "no_team");

  check("two teams with DIFFERENT leads is ambiguous, never a guess",
    route(alone + makeTeam(team(3)) + `
      insert into teams (id, agency_id, name, department_id)
        values ('${team(4)}', '${AGENCY}', '[probe] team four', '${DEPT}');
      insert into team_memberships (team_id, user_id, is_lead)
        values ('${team(4)}', '${agent}', false), ('${team(4)}', '${other}', true);`)?.reason,
    "ambiguous");

  check("two teams sharing ONE lead is not ambiguous",
    route(alone + makeTeam(team(5)) + `
      insert into teams (id, agency_id, name, department_id)
        values ('${team(6)}', '${AGENCY}', '[probe] team six', '${DEPT}');
      insert into team_memberships (team_id, user_id, is_lead)
        values ('${team(6)}', '${agent}', false), ('${team(6)}', '${lead}', true);`)?.reason,
    "team_lead");

  check("a lead is never routed to themselves",
    route(alone + makeTeam(team(7)), lead)?.reason, "is_lead");

  check("an archived team leads nobody",
    route(alone + makeTeam(team(8)) + `update teams set archived_at = now() where id = '${team(8)}';`)?.reason,
    "no_team");

  check("a lead whose account is not active does not count",
    /* 'inactive', not 'suspended' — the status check allows exactly two values
       and the invented third failed the constraint rather than the routing. */
    route(alone + makeTeam(team(9)) + `
      update agency_memberships set status = 'inactive' where user_id = '${lead}';`)?.reason,
    "no_lead");
}

console.log("\nRouting is frozen at submission, not recomputed");
{
  const person = one(`select employee_id, work_date, routed_to::text, routing_reason
                        from eod_submissions
                       where routing_reason = 'team_lead' and routed_to is not null limit 1`);
  if (!person) console.log("  SKIPPED — no routed submission to test against");
  else {
    /* Move them off every team. A report already submitted must keep the lead
       it was routed to — rule 4, historical attribution does not move. */
    const after = shaped(
      `delete from team_memberships where user_id = '${person.employee_id}';`,
      `select routed_to::text, routing_reason from eod_submissions
        where employee_id = '${person.employee_id}' and work_date = '${person.work_date}';`).rows?.[0];
    check("taking somebody off their team does not re-route yesterday's report",
      after?.routed_to, person.routed_to);
    check("…and the reason stands too", after?.routing_reason, "team_lead");
  }
}

console.log("\nThe team rollup is the lead's, and management's");
{
  const lead = one(`select distinct tm.user_id from team_memberships tm
      join teams t on t.id = tm.team_id and t.archived_at is null
     where tm.is_lead
       and exists (select 1 from team_memberships o where o.team_id = tm.team_id and o.user_id <> tm.user_id)
     limit 1`)?.user_id;
  if (!lead) console.log("  SKIPPED — no team with a lead and at least one other member");
  else {
    const mine = as(lead, "", `select count(*)::int as n from public.eod_team_rollup('${lead}', current_date);`);
    check("a lead can roll up their own team", mine.ok && mine.rows[0].n > 0, true);

    const owner = one("select user_id from agency_memberships where is_owner and status='active' limit 1").user_id;
    const mgmt = as(owner, "", `select count(*)::int as n from public.eod_team_rollup('${lead}', current_date);`);
    check("management can read it too", mgmt.ok && mgmt.rows[0].n > 0, true);

    const peer = one(`select tm.user_id from team_memberships tm
        join teams t on t.id = tm.team_id and t.archived_at is null
        join team_memberships l on l.team_id = t.id and l.user_id = '${lead}' and l.is_lead
       where tm.user_id <> '${lead}' limit 1`)?.user_id;
    if (peer) {
      const theirs = as(peer, "", `select count(*)::int as n from public.eod_team_rollup('${lead}', current_date);`);
      /* The person being rolled up must not be able to read the rollup — it
         contains their colleagues' days. */
      check("somebody ON the team cannot read their lead's rollup of it",
        theirs.ok ? theirs.rows[0].n : "error", 0);
    }
  }
}

console.log("\nThe figures come from the frozen snapshot");
{
  const src = one(`select proname, prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = 'eod_team_rollup'`);
  /* If the rollup ever starts reading live work_items instead of the snapshot,
     a past day's numbers would move whenever today's tasks do. */
  check("the rollup reads e.snapshot, not live tasks", /e\.snapshot/.test(src.prosrc), true);
  check("…and does not touch work_items at all", /work_items/.test(src.prosrc), false);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  - ${f}`));
process.exit(failures.length ? 1 : 0);
