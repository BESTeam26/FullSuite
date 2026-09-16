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

    /* A peer WITHOUT management capability. Once Bryan took over Team Leads its
       members became the other leads, who hold ops.manage and can legitimately
       read a rollup — so the first version of this check picked one of them and
       reported correct behaviour as a leak. The rule is about an ordinary
       colleague, so the query now says so. */
    const peer = one(`select tm.user_id from team_memberships tm
        join teams t on t.id = tm.team_id and t.archived_at is null
        join team_memberships l on l.team_id = t.id and l.user_id = '${lead}' and l.is_lead
        join agency_memberships m on m.user_id = tm.user_id
                                 and m.role = 'agency_user' and m.status = 'active'
       where tm.user_id <> '${lead}'
         and not exists (select 1 from agency_member_permissions amp
                          where amp.membership_id = m.id and amp.key = 'ops.manage' and amp.allowed)
       limit 1`)?.user_id;
    if (peer) {
      const theirs = as(peer, "", `select count(*)::int as n from public.eod_team_rollup('${lead}', current_date);`);
      /* The people being rolled up must not read the rollup: it contains their
         colleagues' days, blockers and what they could not finish. */
      check("an ordinary colleague on the team cannot read their lead's rollup of it",
        theirs.ok ? theirs.rows[0].n : "error", 0);
    } else {
      console.log("  ..   no non-management member on that team to test the peer rule with");
    }
  }
}

console.log("\nSubmitting queues one email, and never sends from inside the transaction");
{
  const agency = one("select id from agencies order by created_at limit 1").id;
  /* Somebody whose routing resolves to a real lead, so there is an address. */
  const routed = one(`select e.employee_id from eod_submissions e
                       where e.routing_reason = 'team_lead' and e.routed_to is not null limit 1`)?.employee_id;
  const unrouted = one(`select m.user_id from agency_memberships m
      join profiles p on p.id = m.user_id and coalesce(p.is_fixture,false) = false
      cross join lateral public.eod_route_for(m.user_id) r
     where m.status = 'active' and r.reason = 'no_lead' limit 1`)?.user_id;

  const submit = (who, day, extra = "") => `
    insert into eod_submissions (agency_id, employee_id, work_date, state, submitted_at, submitted_by)
      values ('${agency}', '${who}', current_date - ${day}, 'submitted', now(), '${who}');
    ${extra}`;
  const outbox = (who, day) => `
    select count(*)::int as queued,
           max(o.to_email) as recipient, max(o.cc_email) as cc,
           max(o.state) as state, max(o.subject) as subject
      from eod_email_outbox o
      join eod_submissions e on e.id = o.eod_id
     where e.employee_id = '${who}' and e.work_date = current_date - ${day};`;

  if (routed) {
    const r = shaped(submit(routed, 31), outbox(routed, 31)).rows?.[0];
    check("one email is queued", r?.queued, 1);
    check("…to a resolved address, never an invented one", !!r?.recipient, true);
    check("…copied to the permanent record", r?.cc, "support@blessedempireservices.com");
    /* Dee's exact format: {{Agent Name}} - EOD Report - {{Month Day, Year}} */
    check("…with the subject Dee specified",
      /^.+ - EOD Report - [A-Z][a-z]+ \d{1,2}, \d{4}$/.test(r?.subject ?? ""), true);

    const twice = shaped(
      submit(routed, 32, `update eod_submissions set blockers = 'edited'
                           where employee_id = '${routed}' and work_date = current_date - 32;
                          update eod_submissions set blockers = 'edited again'
                           where employee_id = '${routed}' and work_date = current_date - 32;`),
      outbox(routed, 32)).rows?.[0];
    check("re-submitting does not queue a second email", twice?.queued, 1);
  }

  if (unrouted) {
    const r = shaped(submit(unrouted, 33), outbox(unrouted, 33)).rows?.[0];
    /* The row still exists, as 'unavailable'. A silent absence would leave
       nobody able to tell "nobody to send to" from "the sweep has not run". */
    check("a report with no lead still records the attempt", r?.queued, 1);
    check("…marked unavailable rather than pending for ever", r?.state, "unavailable");
    check("…and invents no recipient", r?.recipient, null);
  }

  const draft = shaped(`
    insert into eod_submissions (agency_id, employee_id, work_date, state)
      values ('${agency}', '${routed ?? unrouted}', current_date - 34, 'draft');`,
    outbox(routed ?? unrouted, 34)).rows?.[0];
  check("a draft queues nothing", draft?.queued, 0);
}

console.log("\nThe email cannot take the submission down with it");
{
  const src = one(`select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = 'eod_queue_email'`).prosrc;
  /* Dee: "Email failure must NOT undo a valid EOD submission." The trigger must
     QUEUE and nothing else — an http call here would put a provider outage on
     the same transaction as somebody's day of work. */
  check("the submit trigger makes no network call", /net\.http_post/.test(src), false);
  check("…it only writes to the outbox", /insert into public\.eod_email_outbox/.test(src), true);

  const dedupe = one(`select indexdef from pg_indexes
                       where tablename = 'eod_email_outbox' and indexname = 'eod_email_outbox_once'`);
  check("one email per report is enforced by an index, not by a check in code",
    /UNIQUE/i.test(dedupe?.indexdef ?? ""), true);

  const job = one(`select active from cron.job where jobname = 'eod-email-dispatch'`);
  check("the sweep is actually scheduled", job?.active, true);
}

console.log("\nSubmitting tells the right people, and claims nothing extra");
{
  const agency = one("select id from agencies order by created_at limit 1").id;
  const routed = one(`select e.employee_id from eod_submissions e
                       where e.routing_reason = 'team_lead' and e.routed_to is not null limit 1`)?.employee_id;

  if (routed) {
    const notes = (day, extra) => shaped(`
      insert into eod_submissions (agency_id, employee_id, work_date, state, submitted_at, submitted_by${extra ? ", blockers" : ""})
        values ('${agency}', '${routed}', current_date - ${day}, 'submitted', now(), '${routed}'${extra ? `, '${extra}'` : ""});`,
      `select n.recipient_id::text as who, n.title, n.detail, n.visibility::text as vis
         from notifications n
        where n.kind = 'eod'
          and n.entity_id = (select id::text from eod_submissions
                              where employee_id = '${routed}' and work_date = current_date - ${day});`);

    const withBlockers = notes(41, "Waiting on access");
    check("two people are told: the author and their lead",
      withBlockers.ok ? withBlockers.rows.length : "error", 2);
    check("…and a report with blockers says so, so a list can prioritise it",
      withBlockers.rows?.some((r) => /blockers or help needed/.test(r.detail)), true);

    /* An EOD names internal blockers and what somebody could not finish. It is
       BES's own record; `shared_with_partner` here would be a leak wearing a
       sensible-looking enum value. */
    check("…and every EOD notification is BES-internal",
      withBlockers.rows?.every((r) => r.vis === "bes_internal"), true);

    const quiet = notes(42, null);
    check("a report with no blockers does not claim urgency",
      quiet.rows?.some((r) => /blockers or help needed/.test(r.detail)), false);
  }

  /* The bug this pair exists to catch: `notifications.visibility` is NOT NULL
     with no default, and the first version of the trigger omitted it — which
     made EVERY submission fail with 23502 rather than merely skipping a
     notification. A notification must never be able to refuse a submission. */
  const vis = one(`select is_nullable, column_default from information_schema.columns
                    where table_name = 'notifications' and column_name = 'visibility'`);
  check("notifications.visibility still has no default, so the trigger must pass one",
    vis.is_nullable === "NO" && vis.column_default === null, true);
  const src = one(`select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = 'eod_notify'`).prosrc;
  check("…and it does, on every insert",
    (src.match(/insert into public\.notifications/g) ?? []).length ===
    (src.match(/'bes_internal'/g) ?? []).length, true);
}

console.log("\nEach person sees the right people, and no more");
{
  const owner = one("select user_id from agency_memberships where is_owner and status='active' limit 1").user_id;
  const agent = one(`select m.user_id from agency_memberships m
      join profiles p on p.id = m.user_id and coalesce(p.is_fixture,false) = false
      cross join lateral public.eod_route_for(m.user_id) r
     where m.role = 'agency_user' and m.status = 'active' and r.reason = 'team_lead' limit 1`)?.user_id;

  const seen = (u) => {
    const r = as(u, "", "select relationship, count(*)::int as n from public.eod_visible_people() group by 1;");
    return r.ok ? Object.fromEntries(r.rows.map((x) => [x.relationship, x.n])) : { error: 1 };
  };

  const mgmt = seen(owner);
  check("management sees the organisation", (mgmt.managed ?? 0) > 0, true);
  check("…and themselves", mgmt.self, 1);

  if (agent) {
    const theirs = seen(agent);
    /* The whole point: an ordinary agent's EOD history is their own. */
    check("an ordinary agent sees exactly one person — themselves", theirs.self, 1);
    check("…and leads nobody", theirs.led ?? 0, 0);
    check("…and manages nobody", theirs.managed ?? 0, 0);
  }

  const lead = one(`select distinct tm.user_id from team_memberships tm
      join teams t on t.id = tm.team_id and t.archived_at is null
     where tm.is_lead
       and exists (select 1 from team_memberships o where o.team_id = tm.team_id and o.user_id <> tm.user_id)
     limit 1`)?.user_id;
  if (lead) {
    check("a lead sees their team", (seen(lead).led ?? 0) > 0, true);
  }
}

console.log("\nAn EOD is private to its author and their management");
{
  /* The Team EOD PAGE is reachable by any staff member — it is gated on
     RequireAgencyStaff, not on a capability. That is only safe because the
     DATABASE refuses, which is the layer that has to be right (rule 1: never
     rely on hidden UI). These assert the refusal, not the hiding. */
  const owner = one("select user_id from agency_memberships where is_owner and status='active' limit 1").user_id;
  const agent = one(`select m.user_id from agency_memberships m
      join profiles p on p.id = m.user_id and coalesce(p.is_fixture,false) = false
     where m.role = 'agency_user' and m.status = 'active' limit 1`)?.user_id;

  if (agent) {
    const theirs = as(agent, "", `select
      count(*) filter (where employee_id <> auth.uid())::int as other_peoples,
      count(*) filter (where employee_id <> auth.uid() and blockers is not null)::int as other_blockers
        from eod_submissions;`);
    check("an agent reads nobody else's EOD",
      theirs.ok ? theirs.rows[0].other_peoples : "error", 0);
    /* Blockers and escalations are the most sensitive thing in the report —
       what somebody could not do, and who they needed help from. */
    check("…and none of their blockers",
      theirs.ok ? theirs.rows[0].other_blockers : "error", 0);
  }

  const mgmt = as(owner, "", "select count(distinct employee_id)::int as n from eod_submissions;");
  check("management reads the organisation's", mgmt.ok && mgmt.rows[0].n > 0, true);
}

console.log("\nA failed email is reported, and retrying it is a permission");
{
  const agency = one("select id from agencies order by created_at limit 1").id;
  const routed = one(`select e.employee_id, e.routed_to from eod_submissions e
                       where e.routing_reason = 'team_lead' and e.routed_to is not null limit 1`);
  const stranger = one(`select m.user_id from agency_memberships m
      join profiles p on p.id = m.user_id and coalesce(p.is_fixture,false) = false
     where m.role = 'agency_user' and m.status = 'active'
       and m.user_id <> '${routed?.employee_id ?? "00000000-0000-0000-0000-000000000000"}'
       and not exists (select 1 from agency_member_permissions amp
                        where amp.membership_id = m.id and amp.key = 'ops.manage' and amp.allowed)
     limit 1`)?.user_id;

  if (routed) {
    const EOD = "33333333-4444-4555-8666-777788889999";
    const failed = `
      insert into eod_submissions (id, agency_id, employee_id, work_date, state, submitted_at, submitted_by)
        values ('${EOD}', '${agency}', '${routed.employee_id}', current_date - 60, 'submitted', now(), '${routed.employee_id}');
      update eod_email_outbox set state = 'failed', attempts = 2, last_error = '550 mailbox unavailable'
       where eod_id = '${EOD}';`;
    const status = (u) => {
      const r = as(u, failed, `select state, recipient, last_error, may_retry
                                 from public.my_eod_email_status('${EOD}');`);
      return r.ok ? (r.rows[0] ?? null) : { error: r.message };
    };

    const author = status(routed.employee_id);
    check("the author is told their email failed", author?.state, "failed");
    /* The lead's NAME, never their address — an author does not need their
       manager's inbox handed back by an API call. */
    check("…and told who it was for, by name", /@/.test(author?.recipient ?? ""), false);
    /* The provider's words go to somebody who can act on them. "550 mailbox
       unavailable" teaches an author nothing except that something is wrong. */
    check("…but not the provider's error, which they cannot act on", author?.last_error, null);
    check("…and may try again", author?.may_retry, true);

    const owner = one("select user_id from agency_memberships where is_owner and status='active' limit 1").user_id;
    check("management DOES see the provider's error", status(owner)?.last_error, "550 mailbox unavailable");

    if (stranger) {
      check("an unrelated agent is told nothing at all", status(stranger), null);
      const refused = as(stranger, failed, `select public.retry_eod_email('${EOD}');`);
      check("…and cannot retry it", refused.ok ? "ALLOWED" : /not yours to retry/i.test(refused.message), true);
    }

    /* Five tries is five tries however they are spread out, or the button
       becomes an unbounded way to hammer the provider. */
    const after = as(routed.employee_id, failed,
      `select public.retry_eod_email('${EOD}'); reset role;
       select state, attempts from eod_email_outbox where eod_id = '${EOD}';`);
    check("retrying re-queues it", after.ok ? after.rows[0].state : "error", "pending");
    check("…without resetting the attempt count", after.ok ? after.rows[0].attempts : "error", 2);

    const exhausted = as(routed.employee_id,
      failed + `update eod_email_outbox set attempts = 5 where eod_id = '${EOD}';`,
      `select may_retry from public.my_eod_email_status('${EOD}');`);
    check("after five attempts there is no retry left to offer",
      exhausted.ok ? exhausted.rows[0].may_retry : "error", false);
  }
}

console.log("\nA lead's email carries their team; everybody else's does not");
{
  const agency = one("select id from agencies order by created_at limit 1").id;
  const lead = one(`select distinct tm.user_id from team_memberships tm
      join teams t on t.id = tm.team_id and t.archived_at is null
     where tm.is_lead
       and exists (select 1 from team_memberships o where o.team_id = tm.team_id and o.user_id <> tm.user_id)
     limit 1`)?.user_id;
  const plain = one(`select m.user_id from agency_memberships m
      join profiles p on p.id = m.user_id and coalesce(p.is_fixture,false) = false
     where m.status = 'active'
       and not exists (select 1 from team_memberships tm
                        join teams t on t.id = tm.team_id and t.archived_at is null
                       where tm.user_id = m.user_id and tm.is_lead)
     limit 1`)?.user_id;

  const payload = (person, day) => {
    const r = shaped(`
      insert into eod_submissions (agency_id, employee_id, work_date, state, submitted_at, submitted_by)
        values ('${agency}', '${person}', current_date - ${day}, 'submitted', now(), '${person}');`,
      `select o.payload -> 'team' as team from eod_email_outbox o
         join eod_submissions e on e.id = o.eod_id
        where e.employee_id = '${person}' and e.work_date = current_date - ${day};`);
    return r.ok ? r.rows[0]?.team : { error: r.message };
  };

  if (lead) {
    const t = payload(lead, 70);
    check("a lead's email carries a team section", t !== null && t !== undefined, true);
    check("…naming the people on it", Array.isArray(t?.people) && t.people.length > 0, true);
    /* Dee asked for this as its own section so a lead reading on a phone does
       not have to scan every line to find who is stuck. */
    check("…and a separate attention list", Array.isArray(t?.attention), true);
  }
  if (plain) {
    /* An "your team" section reading "0 members" on an agent's email is a
       question about why it is there. */
    check("somebody who leads nobody gets no team section at all", payload(plain, 71), null);
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
