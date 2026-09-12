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

/* Measured as SPREAD, not as "one each".
 *
 * The first version asserted four files across four members gave four
 * distinct assignees, and broke the moment a member already held work — which
 * is the normal state of a real team. Fairness does not mean everybody gets
 * the next one; it means nobody ends up more than one file ahead of the least
 * loaded person. That is the rule, so that is what is checked.
 *
 * Complaints is used because no team pointed at it before today, so the
 * members start from a known zero. */
const COMPLAINTS_TEAM = "(select id from teams where name='CreditOps Complaints & Mailing Team')";
const staffComplaints = (members) => members
  .map((m) => `insert into team_memberships (team_id, user_id, is_lead) values (${COMPLAINTS_TEAM}, '${m}', false);`)
  .join("\n");
const complaintsSpread = (n) => `
  ${staffComplaints([P.ada, P.ben, P.cora, P.dev])}
  ${makeClients(n, "For Complaints")}
  with load as (
    select u.user_id,
           (select count(*) from client_department_statuses s
             join fulfillment_clients c on c.id = s.client_id
            where s.assignee_id = u.user_id and c.archived_at is null
              and coalesce(c.lifecycle,'active')='active'
              and public.creditops_status_is_actionable(s.department, s.status)) as files
      from (values ('${P.ada}'::uuid), ('${P.ben}'), ('${P.cora}'), ('${P.dev}')) u(user_id)
  )
  select (max(files) - min(files) <= 1) as level,
         (select count(*)::int from client_department_statuses
           where client_id::text like 'cccccccc%' and assignee_id is not null) as placed
    from load;`;

check("1 — four members, four files: nobody ends up more than one file ahead",
  probe(complaintsSpread(4))[0], { level: true, placed: 4 });

check("2 — eight files stay level, so the rotation does not favour anyone",
  probe(complaintsSpread(8))[0], { level: true, placed: 8 });

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
      `begin; ${setup}
       set local role authenticated;
       do $claims$ begin perform set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); end $claims$;
       ${action} rollback;`) };
  } catch (e) {
    return { ok: false, error: String(e.message).replace(/\s+/g, " ").slice(0, 140) };
  }
};

const SUPPORT_TEAM = "(select id from teams where name='CreditOps Client Success / Support Team')";

/* Resolved ONCE, as the connection owner, and inlined as a literal.
 *
 * Looking it up inside the probe's own statement would run under the acting
 * user's RLS — a Support lead who cannot yet see that row gets null, the
 * function is handed null, and the refusal that comes back says "Client not
 * visible" when the real answer is "the probe asked the wrong question". */
const SUPPORT_FILE = `'${
  q.query(`select s.client_id from client_department_statuses s
             join fulfillment_clients c on c.id = s.client_id
            where s.department = 'Support' and c.is_fixture = false
              and c.archived_at is null limit 1`)[0].client_id
}'::uuid`;

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
  attempt(P.dev, supportTeam(P.dev, P.ben), `
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
  ${staffComplaints([P.ada])}
  ${makeClients(1, "For Complaints")}
  ${setup}
  select count(*)::int as mine from creditops_my_work where assignee_id = '${P.ada}'
   and client_id::text like 'cccccccc%';`)[0];

check("26 — actionable work I own is in My Work",
  myWorkCount(""), { mine: 1 });

check("27 — a waiting file is not, even though it is still mine on paper",
  myWorkCount(`update client_department_statuses set status='CM AWAITING RESPONSE'
                where client_id::text like 'cccccccc%' and department='Complaints';`),
  { mine: 0 });

check("28 — resolved work is not",
  myWorkCount(`update client_department_statuses set status='CM COMPLETED'
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
  probe(`${makeClients(1, "On Hold (Non Workable)")}
    update fulfillment_clients set status='For Partner Confirmation' where id::text like 'cccccccc%';
    select origin_status::text, origin_department::text
      from partner_action_items where fulfillment_client_id::text like 'cccccccc%';`)[0],
  { origin_status: "On Hold (Non Workable)", origin_department: "Support" });

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
    update client_department_statuses set status='CM COMPLETED'
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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
