#!/usr/bin/env node
/**
 * Dee's acceptance tests for the CreditOps routing and assignment engine.
 *
 * Run against the LIVE database, inside transactions that are always rolled
 * back — because the engine is triggers and SECURITY DEFINER functions, and a
 * mock of Postgres would be testing the mock. Every scenario sets up its own
 * team memberships and clients, asserts, and unwinds.
 *
 *   node supabase/scripts/creditops-routing-probe.mjs
 *
 * WHY SOME ASSERTIONS NAME NOBODY
 *
 * The Dispute pool already contains members of teams that existed before this
 * engine. Asserting "Ada gets it" would test the roster rather than the rule,
 * and would break the day somebody joins a team. Where the identity of the
 * person is not the point, the assertion is relational: the headline IS the
 * primary department's assignee, whoever the engine picked.
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
const q = createSyncQuery({
  projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url),
});

const AGENCY = "a0000000-0000-4000-8000-000000000001";
const DISPUTE_TEAM = "0cf0e681-7aed-4073-947b-a4454548738c";
const P = {
  ada: "8a638ae4-1474-4864-be73-7549b6aad91a",
  ben: "12c034aa-c73d-4cf5-bd01-362b91d10866",
  cora: "3925d409-086e-4eee-90de-1d104197c9a2",
  dev: "83f1ff5c-6831-41af-ab6d-d0e14b8e41d6",
  eli: "315f8257-bd8d-49fc-955c-036972f803bc",
  fay: "dac0d51d-9a5d-43d7-af32-1c7d5f6a1ab1",
  gus: "59a88143-7459-4327-be0e-6b0c9fd1c715",
};

/**
 * The fixtures who may actually be GIVEN files.
 *
 * Ada, Ben and Cora are the owner, the agency admin and a manager, and Dee's
 * rule is that the top of the admin takes no work — recorded as
 * `can_receive_production_work = false` and honoured by the picker. Every
 * rotation scenario below was originally written around Ada and Ben, and the
 * day that flag shipped they all started measuring an empty pool: the engine
 * was right, the cast was wrong.
 *
 * So the people who stand in for "an agent" are named once, here. A scenario
 * about WHO MAY BE ASSIGNED uses these; a scenario about who may DO the
 * assigning still uses the role it needs.
 */
const WORKERS = [P.dev, P.eli, P.fay, P.gus];
const [, AGENT_A, AGENT_B] = WORKERS;

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};

/** Run SQL inside a rolled-back transaction; returns the last statement's rows. */
/*
 * Every scenario runs in a rolled-back transaction, and starts by removing the
 * REAL people from the CreditOps teams it measures.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Several scenarios below were written around the comment "Complaints has no
 * pre-existing team", and they were right on the day they were written. Then
 * Ivan Olympia accepted his invitation and became a real member of Complaints
 * — and five assertions began failing, not because the routing engine changed,
 * but because the fixture assumption did.
 *
 * That is the fragile-probe trap this project has already named: never assume
 * an empty team, a fixed headcount, or zero rows. The fix is isolation, NOT
 * relaxing what the probe expects — the rotation rules being asserted are
 * still exactly right, and a real person joining a team must never be able to
 * turn a green gate red.
 *
 * Nothing is committed: the delete lives and dies inside the rollback.
 */
const ISOLATE = `
  delete from team_memberships tm
   using teams t, profiles p
   where tm.team_id = t.id and p.id = tm.user_id
     and t.name in ('CreditOps Complaints & Mailing Team',
                    'CreditOps Dispute Processing Team',
                    'CreditOps Client Success / Support Team',
                    'CreditOps Onboarding Team',
                    'CreditOps Bureau Calling Team')
     and coalesce(p.is_fixture, false) = false;
`;

const probe = (sql) => q.query(`begin; ${ISOLATE} ${sql} rollback;`);

/* Four fresh clients, four processors on the Dispute team. */
const setup = (members) => `
  ${members.map((m, i) => `insert into team_memberships (team_id, user_id, is_lead) values ('${DISPUTE_TEAM}', '${m}', ${i === 0});`).join("\n")}
`;
const makeClients = (n, status) =>
  Array.from({ length: n }, (_, i) => `
  insert into fulfillment_clients (id, agency_id, name, email, mode, status, round, outsourcing_group_id)
  values ('cccccccc-0000-4000-8000-00000000000${i}', '${AGENCY}', 'Probe ${i}', 'probe${i}@example.test', 'outsourcing_only',
          '${status}', 'Pre-Round', (select id from outsourcing_groups limit 1));`).join("\n");

console.log("\nEQUAL DISTRIBUTION");

/* Two rules, and they pull in opposite directions on purpose.
 *
 * Three earlier versions of this section were wrong in the same way: each
 * asserted something that was true of the roster on the day it was written.
 * The first wanted four files to produce four distinct assignees, and broke
 * the moment a member already held work — the normal state of a real team.
 * The second wanted everybody within one file of the least loaded, on the
 * premise that "the members start from a known zero", which stopped being
 * true once the fixture agents held fixture work.
 *
 * The third was subtler and worth writing down. It measured whether handing
 * the team four files made it less level — and it did, every time, because
 * all four probe clients belonged to the SAME partner. That is Dee's own
 * rule, not a fault: "give files per partner group so agent will work only on
 * one dispute fox and one SOP before they jump on the next company." Partner
 * batching deliberately outranks workload. A probe that spread those four
 * files across four people would have been asserting the OPPOSITE of what
 * she asked for, and it would have looked like a fairness test while doing
 * it.
 *
 * So the two rules are checked separately, each on the case it governs: one
 * partner's files stay with one agent, and work from DIFFERENT partners
 * levels the team out. Levelness is measured as a gap that must not widen,
 * because nobody starts at zero.
 */
const COMPLAINTS_TEAM = "(select id from teams where name='CreditOps Complaints & Mailing Team')";
const staffComplaints = (members) => members
  .map((m) => `insert into team_memberships (team_id, user_id, is_lead) values (${COMPLAINTS_TEAM}, '${m}', false);`)
  .join("\n");

check("1 — four files from ONE partner stay with ONE agent, per Dee's batching rule",
  probe(`${staffComplaints(WORKERS)}
    ${makeClients(4, "For Complaints")}
    select count(distinct assignee_id)::int as agents,
           count(*)::int as placed
      from client_department_statuses
     where client_id::text like 'cccccccc%' and assignee_id is not null;`)[0],
  { agents: 1, placed: 4 });

/* One partner each, created here rather than borrowed: the fixture partners
   name their own agents, and a named agent is a smaller pool than the team. */
const makeClientsAcrossPartners = (n, status) =>
  Array.from({ length: n }, (_, i) => `
  insert into outsourcing_groups (id, agency_id, name, contact_email)
  values ('bbbbbbbb-0000-4000-8000-00000000000${i}', '${AGENCY}', 'Probe Partner ${i}', 'partner${i}@example.test');
  insert into fulfillment_clients (id, agency_id, name, email, mode, status, round, outsourcing_group_id)
  values ('cccccccc-0000-4000-8000-00000000000${i}', '${AGENCY}', 'Probe ${i}', 'probe${i}@example.test',
          'outsourcing_only', '${status}', 'Pre-Round', 'bbbbbbbb-0000-4000-8000-00000000000${i}');`).join("\n");

/** Open actionable files per worker, as one scalar: busiest minus least busy. */
const SPREAD = `
  select coalesce(max(files) - min(files), 0) from (
    select (select count(*) from client_department_statuses s
              join fulfillment_clients c on c.id = s.client_id
             where s.assignee_id = u.user_id and c.archived_at is null
               and coalesce(c.lifecycle,'active') = 'active'
               and public.creditops_status_is_actionable(s.department, s.status)) as files
      from (values ${WORKERS.map((w) => `('${w}'::uuid)`).join(", ")}) u(user_id)
  ) t`;

const acrossPartners = (n) => `
  ${staffComplaints(WORKERS)}
  create temp table spread_before on commit drop as ${SPREAD};
  ${makeClientsAcrossPartners(n, "For Complaints")}
  select ((${SPREAD}) <= greatest((select * from spread_before), 1)) as level,
         (select count(*)::int from client_department_statuses
           where client_id::text like 'cccccccc%' and assignee_id is not null) as placed;`;

check("2 — work from four DIFFERENT partners does not make the team less level",
  probe(acrossPartners(4))[0], { level: true, placed: 4 });

check("3 — waiting files do not count as workload",
  /* Isolated on Complaints, which has no pre-existing team: the Dispute pool
     already contains members of [TEST] Team A, so a Dispute probe would be
     measuring them too. The first agent holds four WAITING files, the second
     holds one ACTIONABLE. The first must still be picked — none of hers is work she can do. */
  probe(`insert into team_memberships (team_id, user_id, is_lead) values
           ((select id from teams where name='CreditOps Complaints & Mailing Team'), '${AGENT_A}', false),
           ((select id from teams where name='CreditOps Complaints & Mailing Team'), '${AGENT_B}', false);
    insert into client_department_statuses (client_id, department, status, assignee_id)
      select id, 'Dispute', 'ROUND SENT - AWAITING RESULTS', '${AGENT_A}' from fulfillment_clients
       where archived_at is null and coalesce(lifecycle,'active')='active' limit 4
      on conflict (client_id, department) do update set assignee_id='${AGENT_A}', status='ROUND SENT - AWAITING RESULTS';
    insert into client_department_statuses (client_id, department, status, assignee_id)
      select id, 'Complaints', 'LETTERS PENDING', '${AGENT_B}' from fulfillment_clients
       where archived_at is null and coalesce(lifecycle,'active')='active' limit 1
      on conflict (client_id, department) do update set assignee_id='${AGENT_B}', status='LETTERS PENDING';
    select public.creditops_pick_assignee('Complaints', '${AGENCY}')::text as picked;`)[0],
  { picked: AGENT_A });

check("4 — actionable files DO count as workload",
  probe(`insert into team_memberships (team_id, user_id, is_lead) values
           ((select id from teams where name='CreditOps Complaints & Mailing Team'), '${AGENT_A}', false),
           ((select id from teams where name='CreditOps Complaints & Mailing Team'), '${AGENT_B}', false);
    insert into client_department_statuses (client_id, department, status, assignee_id)
      select id, 'Complaints', 'LETTERS PENDING', '${AGENT_A}' from fulfillment_clients
       where archived_at is null and coalesce(lifecycle,'active')='active' limit 3
      on conflict (client_id, department) do update set assignee_id='${AGENT_A}', status='LETTERS PENDING';
    select public.creditops_pick_assignee('Complaints', '${AGENCY}')::text as picked;`)[0],
  { picked: AGENT_B });

console.log("\nZERO-MEMBER DEPARTMENT");
check("5 — an empty auto department leaves the file unassigned, department still set",
  probe(`${makeClients(1, "For Complaints")}
    select department::text, assignee_id::text, assignment_method
      from client_department_statuses where client_id::text like 'cccccccc%';`)[0],
  { department: "Complaints", assignee_id: null, assignment_method: null });

check("6 — and it is flagged Assignment Required",
  probe(`${makeClients(1, "For Complaints")}
    select count(*)::int as n from creditops_assignment_required
     where client_id::text like 'cccccccc%';`)[0],
  { n: 1 });

check("7 — it does NOT fall back to an admin",
  probe(`${makeClients(1, "For Complaints")}
    select count(*)::int as n from client_department_statuses
     where client_id::text like 'cccccccc%' and assignee_id is not null;`)[0],
  { n: 0 });

console.log("\nSUPPORT IS MANUAL");
check("8 — Support never auto-assigns, even with a full team",
  probe(`insert into team_memberships (team_id, user_id, is_lead)
           values ((select id from teams where name='CreditOps Client Success / Support Team'), '${P.ada}', true),
                  ((select id from teams where name='CreditOps Client Success / Support Team'), '${P.ben}', false);
    ${makeClients(1, "Monitoring Issue 1")}
    select department::text, assignee_id::text, assignment_method
      from client_department_statuses where client_id::text like 'cccccccc%';`)[0],
  { department: "Support", assignee_id: null, assignment_method: "team_lead" });

check("9 — Support's unassigned files are NOT Assignment Required",
  probe(`${makeClients(1, "Monitoring Issue 1")}
    select count(*)::int as n from creditops_assignment_required where client_id::text like 'cccccccc%';`)[0],
  { n: 0 });

console.log("\nLOCKED STATUS RULES");

/* Dee, 2026-09-22, asked whether the monitoring stages should leave every
   queue the way Non Workable now does: "All monitoring issues remain
   actionable items." Every one of them lands on Support as real work. */
check("10a — every monitoring stage is actionable Support work",
  q.query(`select coalesce(string_agg(distinct
             r.kind || '/' || r.department::text || '/' ||
             public.creditops_status_is_actionable(r.department, r.entry_status)::text, ' '), '(none)') as v
             from creditops_status_routing r
            where r.status::text like 'Monitoring Issue%'`)[0].v,
  "actionable/Support/true");
check("10 — Ready For Reimport / Credit Update goes to Support, unassigned",
  probe(`${setup([P.ada])}
    ${makeClients(1, "Ready for Processing")}
    update fulfillment_clients set status='Ready For Reimport/ Credit Update' where id::text like 'cccccccc%';
    select department::text, assignee_id::text from client_department_statuses
     where client_id::text like 'cccccccc%' and department='Support';`)[0],
  { department: "Support", assignee_id: null });

check("11 — …and NOT back to the previous processor",
  probe(`${setup([P.ada])}
    ${makeClients(1, "Ready for Processing")}
    update fulfillment_clients set status='Ready For Reimport/ Credit Update' where id::text like 'cccccccc%';
    select assigned_agent_id::text as headline from fulfillment_clients where id::text like 'cccccccc%';`)[0],
  { headline: null });

check("12 — Round Sent - Awaiting Results clears the assignee",
  probe(`${setup([P.ada])}
    ${makeClients(1, "Ready for Processing")}
    update fulfillment_clients set status='Round Sent - Awaiting Results' where id::text like 'cccccccc%';
    select assignee_id::text, assignment_method, status from client_department_statuses
     where client_id::text like 'cccccccc%' and department='Dispute';`)[0],
  { assignee_id: null, assignment_method: "system_waiting_unassign", status: "ROUND SENT - AWAITING RESULTS" });

check("13 — For Partner Confirmation clears every BES assignee",
  probe(`${setup([P.ada])}
    ${makeClients(1, "Ready for Processing")}
    update fulfillment_clients set status='For Partner Confirmation' where id::text like 'cccccccc%';
    select count(*)::int as still_assigned from client_department_statuses
     where client_id::text like 'cccccccc%' and assignee_id is not null;`)[0],
  { still_assigned: 0 });

console.log("\nCONCURRENCY AND CHURN");
check("14 — routing Complaints does not touch active Support work",
  probe(`${setup([P.ada])}
    ${makeClients(1, "Ready for Processing")}
    insert into client_department_statuses (client_id, department, status, assignee_id)
      select id, 'Support', 'SUPPORT NEW', '${P.ben}' from fulfillment_clients where id::text like 'cccccccc%';
    update fulfillment_clients set status='For Complaints' where id::text like 'cccccccc%';
    select status, assignee_id::text from client_department_statuses
     where client_id::text like 'cccccccc%' and department='Support';`)[0],
  { status: "SUPPORT NEW", assignee_id: P.ben });

check("15 — a valid existing assignee is kept, not churned",
  probe(`${setup([P.ada, P.ben])}
    ${makeClients(1, "Ready for Processing")}
    update client_department_statuses set assignee_id='${P.ben}' where client_id::text like 'cccccccc%' and department='Dispute';
    update fulfillment_clients set status='Prio Processing' where id::text like 'cccccccc%';
    select assignee_id::text from client_department_statuses
     where client_id::text like 'cccccccc%' and department='Dispute';`)[0],
  { assignee_id: P.ben });

check("16 — editing a note or a phone number does not reassign",
  probe(`${setup([P.ada, P.ben])}
    ${makeClients(1, "Ready for Processing")}
    update client_department_statuses set assignee_id='${P.ben}' where client_id::text like 'cccccccc%' and department='Dispute';
    update fulfillment_clients set phone='(305) 000-0000', next_action='call them' where id::text like 'cccccccc%';
    select assignee_id::text from client_department_statuses
     where client_id::text like 'cccccccc%' and department='Dispute';`)[0],
  { assignee_id: P.ben });

console.log("\nHEADLINE ASSIGNEE");
check("17 — the headline IS the primary department's owner, whoever the engine picked",
  /* Asserted relationally on purpose. Naming a person here would test the
     roster rather than the rule, and the Dispute pool already holds members
     of pre-existing teams. */
  probe(`${setup([P.ada])}
    ${makeClients(1, "Ready for Processing")}
    select (select assigned_agent_id from fulfillment_clients where id::text like 'cccccccc%')
             is not distinct from
           (select assignee_id from client_department_statuses where client_id::text like 'cccccccc%' and department='Dispute')
           as headline_matches_primary,
           (select assigned_agent_id is not null from fulfillment_clients where id::text like 'cccccccc%') as somebody_has_it;`)[0],
  { headline_matches_primary: true, somebody_has_it: true });

check("18 — a second department's owner does NOT become the headline",
  probe(`${setup([P.ada])}
    ${makeClients(1, "Ready for Processing")}
    insert into client_department_statuses (client_id, department, status, assignee_id)
      select id, 'Support', 'SUPPORT NEW', '${P.ben}' from fulfillment_clients where id::text like 'cccccccc%';
    update fulfillment_clients set status='Ready for Processing' where id::text like 'cccccccc%';
    select (select assigned_agent_id::text from fulfillment_clients where id::text like 'cccccccc%') = '${P.ben}' as headline_stolen,
           (select assignee_id::text from client_department_statuses where client_id::text like 'cccccccc%' and department='Support') as support_owner;`)[0],
  { headline_stolen: false, support_owner: P.ben });

check("19 — routed to Support unassigned, the headline is nobody",
  /* Dee's locked rule reached through the summary field: the previous
     processor must not reappear as the headline. */
  probe(`${setup([P.ada])}
    ${makeClients(1, "Ready for Processing")}
    update fulfillment_clients set status='Ready For Reimport/ Credit Update' where id::text like 'cccccccc%';
    select assigned_agent_id::text as headline from fulfillment_clients where id::text like 'cccccccc%';`)[0],
  { headline: null });

console.log("\nASSIGN AGENT");

/* Setup runs as the connection owner; the CALL runs as a real authenticated
   user. The point of these is WHO may invoke the function, which a superuser
   never proves — and a team roster is not what is being tested, so building it
   under RLS would only be testing the Teams screen. */
/* `reset role` before the verification SELECT, always: the acting user is
   deliberately restricted, so reading the outcome AS them tests their read
   policy rather than the write that just happened. */
const attempt = (user, setup, action) => {
  try {
    return { ok: true, rows: q.query(
      /* One statement, one answer.
       *
       * The transport hands back a single result set, so the whole scenario —
       * become the user, call the function, read the outcome — is wrapped in
       * one SELECT over a CTE-free DO block plus a final query. Anything that
       * returns rows in between silently becomes the "answer" instead. */
      `begin; ${MAKE_SUPPORT_FILE} ${setup}
       set local role authenticated;
       do $claims$ begin perform set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); end $claims$;
       ${action} rollback;`) };
  } catch (e) {
    return { ok: false, error: String(e.message).replace(/\s+/g, " ").slice(0, 140) };
  }
};

const SUPPORT_TEAM = "(select id from teams where name='CreditOps Client Success / Support Team')";

/* The file these scenarios act on is BUILT by the probe, not borrowed.
 *
 * It used to be `select … limit 1` over the live table, and it worked for as
 * long as pilot clients happened to exist. The day CreditOps was cleared for
 * Dee's real import the probe crashed on an empty result — the same
 * fragile-probe trap named at the top of this file, in a new place. A
 * security probe must never depend on rows somebody else put there.
 *
 * The id is a literal, resolved before any role is assumed. Looking it up
 * inside the probe's own statement would run under the acting user's RLS — a
 * Support lead who cannot yet see that row gets null, the function is handed
 * null, and the refusal says "Client not visible" when the real answer is
 * "the probe asked the wrong question".
 *
 * The status routes it to Support on insert (check 42), so the department row
 * these scenarios assign comes from the real trigger rather than a hand-made
 * row. Created inside each scenario's transaction, and rolled back with it. */
const SUPPORT_FILE = `'dddddddd-0000-4000-8000-000000000001'::uuid`;
const MAKE_SUPPORT_FILE = `
  insert into fulfillment_clients (id, agency_id, name, email, mode, status, round, outsourcing_group_id)
  values (${SUPPORT_FILE}, '${AGENCY}', 'Probe Support File', 'probe-support@example.test',
          'outsourcing_only', 'Ready For Reimport/ Credit Update', 'Pre-Round',
          (select id from outsourcing_groups limit 1));
`;

/* A genuine agent, not a manager: [TEST] Cora Manager holds `ops.manage`, so
 * using her to prove "an agent may not" proved the opposite by accident. */
const AGENT = P.eli;

const supportTeam = (lead, member) => `
  insert into team_memberships (team_id, user_id, is_lead) values
    (${SUPPORT_TEAM}, '${lead}', true), (${SUPPORT_TEAM}, '${member}', false);`;

check("20 — a Support Team Lead can assign a Support agent",
  attempt(P.dev, supportTeam(P.dev, P.ben), `
    do $$ begin perform public.creditops_assign_agent(${SUPPORT_FILE}, 'Support', '${P.ben}', 'covering today'); end $$;
    reset role;
    select assignee_id::text as owner, assignment_method from client_department_statuses
     where client_id = ${SUPPORT_FILE} and department='Support';`).rows?.[0],
  { owner: P.ben, assignment_method: "team_lead" });

check("21 — a plain Support agent cannot reassign a case",
  attempt(AGENT, `insert into team_memberships (team_id, user_id, is_lead) values
      (${SUPPORT_TEAM}, '${AGENT}', false), (${SUPPORT_TEAM}, '${P.ben}', false);`,
    `select public.creditops_assign_agent(${SUPPORT_FILE}, 'Support', '${P.ben}', null);`).ok,
  false);

check("22 — …and cannot take the case for themselves either",
  attempt(AGENT, `insert into team_memberships (team_id, user_id, is_lead) values (${SUPPORT_TEAM}, '${AGENT}', false);`,
    `select public.creditops_assign_agent(${SUPPORT_FILE}, 'Support', '${AGENT}', null);`).ok,
  false);

check("23 — work cannot be parked on somebody outside the department",
  attempt(P.dev, `insert into team_memberships (team_id, user_id, is_lead) values (${SUPPORT_TEAM}, '${P.dev}', true);`,
    `select public.creditops_assign_agent(${SUPPORT_FILE}, 'Support', '${P.ada}', null);`).ok,
  false);

check("24 — the change is recorded with actor, previous and new",
  /* Release it first. The file is whichever real client happens to have a
     Support row, and whether THAT one is already assigned is not what this
     check is about — the rule is that the audit records what it moved FROM.
     Asserting on the incidental state made this fail the day a status
     normalisation reshuffled which row came back first. */
  attempt(P.dev, `${supportTeam(P.dev, P.ben)}
    update client_department_statuses set assignee_id = null
     where client_id = ${SUPPORT_FILE} and department = 'Support';`, `
    do $$ begin perform public.creditops_assign_agent(${SUPPORT_FILE}, 'Support', '${P.ben}', 'covering today'); end $$;
    reset role;
    select action, previous_value, (actor_id = '${P.dev}') as actor_is_the_lead,
           (detail like '%covering today%') as reason_kept
      from activity_events
     where entity_id = (${SUPPORT_FILE})::text and action = 'Assignment changed'
     order by created_at desc limit 1;`).rows?.[0],
  { action: "Assignment changed", previous_value: "Unassigned", actor_is_the_lead: true, reason_kept: true });

check("25 — releasing a file back to the queue is allowed",
  attempt(P.dev, supportTeam(P.dev, P.ben), `
    do $$ begin
      perform public.creditops_assign_agent(${SUPPORT_FILE}, 'Support', '${P.ben}', null);
      perform public.creditops_assign_agent(${SUPPORT_FILE}, 'Support', null, 'back to the queue');
    end $$;
    reset role;
    select assignee_id::text as owner from client_department_statuses
     where client_id = ${SUPPORT_FILE} and department='Support';`).rows?.[0],
  { owner: null });

console.log("\nMY WORK");

/* The client used for these is created inside the transaction so its
   department rows are known exactly, rather than depending on whatever the
   live board happens to hold today. */
const myWorkCount = (setup) => probe(`
  ${staffComplaints([AGENT_A])}
  ${makeClients(1, "For Complaints")}
  ${setup}
  select count(*)::int as mine from creditops_my_work where assignee_id = '${AGENT_A}'
   and client_id::text like 'cccccccc%';`)[0];

check("26 — actionable work I own is in My Work",
  myWorkCount(""), { mine: 1 });

check("27 — a waiting file is not, even though it is still mine on paper",
  myWorkCount(`update client_department_statuses set status='COMPLAINT AWAITING RESPONSE'
                where client_id::text like 'cccccccc%' and department='Complaints';`),
  { mine: 0 });

check("28 — resolved work is not",
  myWorkCount(`update client_department_statuses set status='COMPLAINT COMPLETED'
                where client_id::text like 'cccccccc%' and department='Complaints';`),
  { mine: 0 });

check("29 — an archived client's work is not",
  myWorkCount(`update fulfillment_clients set lifecycle='archived', archived_at=now()
                where id::text like 'cccccccc%';`),
  { mine: 0 });

check("30 — work sitting with the partner is not",
  myWorkCount(`update fulfillment_clients set status='For Partner Confirmation'
                where id::text like 'cccccccc%';
               update client_department_statuses set assignee_id='${P.ada}'
                where client_id::text like 'cccccccc%' and department='Complaints';`),
  { mine: 0 });

check("31 — somebody else's work is not in mine",
  myWorkCount(`update client_department_statuses set assignee_id='${P.ben}'
                where client_id::text like 'cccccccc%' and department='Complaints';`),
  { mine: 0 });

console.log("\nPARTNER ACTION REQUIRED");

const PARTNER_GROUP = `(select id from outsourcing_groups where is_fixture=false limit 1)`;

check("32 — For Partner Confirmation raises an item for the partner",
  probe(`${makeClients(1, "Ready for Processing")}
    update fulfillment_clients set status='For Partner Confirmation' where id::text like 'cccccccc%';
    select count(*)::int as items, min(status) as state from partner_action_items
     where fulfillment_client_id::text like 'cccccccc%';`)[0],
  { items: 1, state: "open" });

check("33 — re-entering the status does not stack up a second request",
  probe(`${makeClients(1, "Ready for Processing")}
    update fulfillment_clients set status='For Partner Confirmation' where id::text like 'cccccccc%';
    update fulfillment_clients set status='Ready for Processing' where id::text like 'cccccccc%';
    update fulfillment_clients set status='For Partner Confirmation' where id::text like 'cccccccc%';
    select count(*)::int as items from partner_action_items
     where fulfillment_client_id::text like 'cccccccc%' and status='open';`)[0],
  { items: 1 });

check("34 — BES moving the file on cancels what the partner was asked",
  probe(`${makeClients(1, "Ready for Processing")}
    update fulfillment_clients set status='For Partner Confirmation' where id::text like 'cccccccc%';
    update fulfillment_clients set status='Ready for Processing' where id::text like 'cccccccc%';
    select status, cancelled_reason from partner_action_items
     where fulfillment_client_id::text like 'cccccccc%';`)[0],
  { status: "cancelled", cancelled_reason: "The file moved on" });

check("35 — no BES assignee while the partner holds it",
  probe(`${setup([P.ada])}
    ${makeClients(1, "Ready for Processing")}
    update fulfillment_clients set status='For Partner Confirmation' where id::text like 'cccccccc%';
    select count(*)::int as assigned from client_department_statuses
     where client_id::text like 'cccccccc%' and assignee_id is not null;`)[0],
  { assigned: 0 });

console.log("\nPARTNER CONFIRMATION RETURNS HOME");

check("36 — the request remembers which workflow asked",
  probe(`${makeClients(1, "Ready for Processing")}
    update fulfillment_clients set status='For Partner Confirmation' where id::text like 'cccccccc%';
    select origin_status::text, origin_department::text, needs_routing_review
      from partner_action_items where fulfillment_client_id::text like 'cccccccc%';`)[0],
  { origin_status: "Ready for Processing", origin_department: "Dispute", needs_routing_review: false });

check("37 — a Support request records Support, not Processing",
  probe(`${makeClients(1, "Monitoring Issue 1")}
    update fulfillment_clients set status='For Partner Confirmation' where id::text like 'cccccccc%';
    select origin_status::text, origin_department::text
      from partner_action_items where fulfillment_client_id::text like 'cccccccc%';`)[0],
  { origin_status: "Monitoring Issue 1", origin_department: "Support" });

console.log("\nQUEUES READ DEPARTMENT WORK");

check("38 — In Dispute with no complaints work is NOT in the Complaints queue",
  probe(`${makeClients(1, "In Dispute")}
    select count(*)::int as rows from creditops_department_queue
     where client_id::text like 'cccccccc%' and department='Complaints';`)[0],
  { rows: 0 });

check("39 — …and IS in the Complaints queue once complaints work exists",
  probe(`${makeClients(1, "In Dispute")}
    insert into client_department_statuses (client_id, department, status)
      select id, 'Complaints', 'LETTERS PENDING' from fulfillment_clients where id::text like 'cccccccc%';
    select count(*)::int as rows from creditops_department_queue
     where client_id::text like 'cccccccc%' and department='Complaints';`)[0],
  { rows: 1 });

check("40 — the queue's status is the DEPARTMENT's, not the client's credit status",
  probe(`${makeClients(1, "In Dispute")}
    insert into client_department_statuses (client_id, department, status)
      select id, 'Complaints', 'LETTERS PENDING' from fulfillment_clients where id::text like 'cccccccc%';
    select work_status, credit_status::text from creditops_department_queue
     where client_id::text like 'cccccccc%' and department='Complaints';`)[0],
  { work_status: "LETTERS PENDING", credit_status: "In Dispute" });

check("41 — a waiting round is in Dispute as WAITING, not actionable",
  probe(`${makeClients(1, "Round Sent - Awaiting Results")}
    select department::text, actionable, waiting from creditops_department_queue
     where client_id::text like 'cccccccc%';`)[0],
  { department: "Dispute", actionable: false, waiting: true });

check("42 — Ready For Reimport goes to Support and CLOSES the dispute work",
  probe(`${makeClients(1, "Round Sent - Awaiting Results")}
    update fulfillment_clients set status='Ready For Reimport/ Credit Update' where id::text like 'cccccccc%';
    select
      (select count(*)::int from creditops_department_queue
        where client_id::text like 'cccccccc%' and department='Support') as in_support,
      (select count(*)::int from creditops_department_queue
        where client_id::text like 'cccccccc%' and department='Dispute') as in_dispute;`)[0],
  { in_support: 1, in_dispute: 0 });

check("43 — resolved department work leaves the queue",
  probe(`${makeClients(1, "For Complaints")}
    update client_department_statuses set status='COMPLAINT COMPLETED'
     where client_id::text like 'cccccccc%' and department='Complaints';
    select count(*)::int as rows from creditops_department_queue where client_id::text like 'cccccccc%';`)[0],
  { rows: 0 });

check("44 — an archived client leaves every queue",
  probe(`${makeClients(1, "For Complaints")}
    update fulfillment_clients set lifecycle='archived', archived_at=now() where id::text like 'cccccccc%';
    select count(*)::int as rows from creditops_department_queue where client_id::text like 'cccccccc%';`)[0],
  { rows: 0 });

check("45 — two legitimate department workstreams put the client in both queues",
  probe(`${makeClients(1, "In Dispute")}
    insert into client_department_statuses (client_id, department, status)
      select id, 'Complaints', 'FTC FILED' from fulfillment_clients where id::text like 'cccccccc%';
    select count(distinct department)::int as queues from creditops_department_queue
     where client_id::text like 'cccccccc%';`)[0],
  { queues: 2 });

console.log("\n\"NO ACTIVE STAFF\" IS A QUESTION ABOUT THE ROSTER");

/* The label fired on "every file in this queue is unassigned", so Complaints —
   three agents, one file waiting for the hourly sweep — was reported as having
   nobody. Those two facts look identical in a one-file queue and mean opposite
   things: one resolves itself within the hour, the other needs somebody hired
   onto a team. Never derive the second from the first. */

check("46 — a staffed queue holding nothing but unassigned files is NOT unstaffed",
  /* Eli and Dev, not Ada and Ben: the owner and the admin carry
     `can_receive_production_work = false` by Dee's rule that the top of the
     admin takes no files, so a queue staffed only by them genuinely has
     nobody who can be given work. */
  probe(`${staffComplaints([P.eli, P.dev])}
    ${makeClients(2, "For Complaints")}
    update client_department_statuses set assignee_id = null
     where client_id::text like 'cccccccc%';
    select
      (select count(*)::int from client_department_statuses
        where client_id::text like 'cccccccc%' and assignee_id is null) as unowned,
      exists (select 1 from creditops_unstaffed_departments()
               where department = 'Complaints') as reported_unstaffed;`)[0],
  { unowned: 2, reported_unstaffed: false });

check("47 — a queue with nobody on its team IS unstaffed, files or no files",
  /* ISOLATE has already emptied the CreditOps teams of real people, so
     Complaints genuinely has nobody here. Asserted with no client at all, to
     show the answer does not come from the work. */
  probe(`select exists (select 1 from creditops_unstaffed_departments()
                          where department = 'Complaints') as reported_unstaffed;`)[0],
  { reported_unstaffed: true });

check("48 — one agent is enough; the label is about zero, not about capacity",
  probe(`${staffComplaints([P.eli])}
    ${makeClients(6, "For Complaints")}
    select exists (select 1 from creditops_unstaffed_departments()
                    where department = 'Complaints') as reported_unstaffed;`)[0],
  { reported_unstaffed: false });

console.log("\nTHE VOCABULARY AND THE RULES AGREE");

/* Renaming a status is four edits in the data and four more in the logic, and
   twice now the second half has been missed — BC/CM was spelled out in the
   enum, the rows, the routing and the dropdowns while four functions went on
   comparing against the old words. A file then read COMPLAINT COMPLETED,
   matched nothing, and stayed in the queue as live work forever.
   Asked as a rule so the next rename cannot repeat it. */

check("50 — the status each department closes with is one of its own, and is not actionable",
  q.query(`select coalesce(string_agg(d.dept::text || ': ' || coalesce(c.closed, '(none)'), ', '), '') as broken
     from unnest(enum_range(null::fulfillment_department)) d(dept)
     cross join lateral (select creditops_closed_status_for(d.dept) as closed) c
    where c.closed is null
       or not (c.closed = any(creditops_department_statuses(d.dept)))
       or creditops_status_is_actionable(d.dept, c.closed)`)[0],
  { broken: "" });

check("51 — no rule anywhere still compares against a status name that was renamed away",
  q.query(`select coalesce(string_agg(name, ', '), '') as stale from (
      select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and pg_get_functiondef(p.oid) ~ '''(BC|CM) '
      union all
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('v','m') and pg_get_viewdef(c.oid) ~ '''(BC|CM) '
    ) t`)[0],
  { stale: "" });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
