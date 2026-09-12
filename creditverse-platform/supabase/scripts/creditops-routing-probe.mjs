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
};

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};

/** Run SQL inside a rolled-back transaction; returns the last statement's rows. */
const probe = (sql) => q.query(`begin; ${sql} rollback;`);

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
check("1 — four processors, four files: one each",
  probe(`${setup([P.ada, P.ben, P.cora, P.dev])}
    ${makeClients(4, "Ready for Processing")}
    select count(distinct assignee_id)::int as n, count(*)::int as rows
      from client_department_statuses
     where client_id::text like 'cccccccc%' and department = 'Dispute';`)[0],
  { n: 4, rows: 4 });

check("2 — a fifth file goes back to the front of the rotation, not to a fifth person",
  probe(`${setup([P.ada, P.ben, P.cora, P.dev])}
    ${makeClients(5, "Ready for Processing")}
    select count(distinct assignee_id)::int as n,
           max(c)::int as busiest
      from (select assignee_id, count(*) as c from client_department_statuses
             where client_id::text like 'cccccccc%' and department='Dispute'
             group by 1) x;`)[0],
  { n: 4, busiest: 2 });

check("3 — waiting files do not count as workload",
  /* Isolated on Complaints, which has no pre-existing team: the Dispute pool
     already contains members of [TEST] Team A, so a Dispute probe would be
     measuring them too. Ada holds four WAITING files, Ben holds one
     ACTIONABLE. Ada must still be picked — none of hers is work she can do. */
  probe(`insert into team_memberships (team_id, user_id, is_lead) values
           ((select id from teams where name='CreditOps Complaints & Mailing Team'), '${P.ada}', false),
           ((select id from teams where name='CreditOps Complaints & Mailing Team'), '${P.ben}', false);
    insert into client_department_statuses (client_id, department, status, assignee_id)
      select id, 'Dispute', 'ROUND SENT - AWAITING RESULTS', '${P.ada}' from fulfillment_clients
       where archived_at is null and coalesce(lifecycle,'active')='active' limit 4
      on conflict (client_id, department) do update set assignee_id='${P.ada}', status='ROUND SENT - AWAITING RESULTS';
    insert into client_department_statuses (client_id, department, status, assignee_id)
      select id, 'Complaints', 'LETTERS PENDING', '${P.ben}' from fulfillment_clients
       where archived_at is null and coalesce(lifecycle,'active')='active' limit 1
      on conflict (client_id, department) do update set assignee_id='${P.ben}', status='LETTERS PENDING';
    select public.creditops_pick_assignee('Complaints', '${AGENCY}')::text as picked;`)[0],
  { picked: P.ada });

check("4 — actionable files DO count as workload",
  probe(`insert into team_memberships (team_id, user_id, is_lead) values
           ((select id from teams where name='CreditOps Complaints & Mailing Team'), '${P.ada}', false),
           ((select id from teams where name='CreditOps Complaints & Mailing Team'), '${P.ben}', false);
    insert into client_department_statuses (client_id, department, status, assignee_id)
      select id, 'Complaints', 'LETTERS PENDING', '${P.ada}' from fulfillment_clients
       where archived_at is null and coalesce(lifecycle,'active')='active' limit 3
      on conflict (client_id, department) do update set assignee_id='${P.ada}', status='LETTERS PENDING';
    select public.creditops_pick_assignee('Complaints', '${AGENCY}')::text as picked;`)[0],
  { picked: P.ben });

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
    ${makeClients(1, "On Hold (Non Workable)")}
    select department::text, assignee_id::text, assignment_method
      from client_department_statuses where client_id::text like 'cccccccc%';`)[0],
  { department: "Support", assignee_id: null, assignment_method: "team_lead" });

check("9 — Support's unassigned files are NOT Assignment Required",
  probe(`${makeClients(1, "On Hold (Non Workable)")}
    select count(*)::int as n from creditops_assignment_required where client_id::text like 'cccccccc%';`)[0],
  { n: 0 });

console.log("\nLOCKED STATUS RULES");
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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
