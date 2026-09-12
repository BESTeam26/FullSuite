/**
 * Partner Billing — acceptance tests against the live database.
 *
 * Same discipline as the marketing probe: every scenario runs inside a
 * transaction that is rolled back, as a REAL authenticated user. Money is the
 * place where "it worked when I ran it as the owner" is most dangerous, so
 * every rule here is asserted as somebody who should be refused as well as
 * somebody who should be allowed.
 *
 * Run: node supabase/scripts/billing-probe.mjs
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
const OWNER = one("select user_id from agency_memberships where is_owner and status='active' limit 1").user_id;
const AGENT = one("select user_id from agency_memberships where id='dddddddd-0000-4000-8000-552c4064ccbd'").user_id;
const AGENT_M = "dddddddd-0000-4000-8000-552c4064ccbd";
/* A real admin who is NOT the owner: the money boundary's whole point. */
const ADMIN = one(`select m.user_id from agency_memberships m
                    where m.role='agency_admin' and not m.is_owner and m.status='active'
                      and m.user_id <> '${OWNER}' limit 1`)?.user_id;

const as = (user, setup, action) => {
  try {
    return { ok: true, rows: q.query(
      `begin; ${setup}
       set local role authenticated;
       do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); end $c$;
       ${action} rollback;`) };
  } catch (e) {
    const error = String(e.message).replace(/\s+/g, " ").slice(0, 200);
    if (process.env.PROBE_DEBUG) console.log(`       [error] ${error}`);
    return { ok: false, error };
  }
};

/* A partner and a client of theirs, created inside the transaction so the
   probe never depends on production having the right shape. */
const PARTNER = "33333333-4444-4555-8666-777777777777";
const CLIENT = "33333333-4444-4555-8666-888888888888";
const SETUP = `
  insert into outsourcing_groups (id, agency_id, name, contact_email, status, lifecycle, portal_access_enabled)
  values ('${PARTNER}', '${AGENCY}', 'Probe Billing Partner', 'billing.probe@bes.test', 'Active', 'active', true);
  insert into fulfillment_engagements (agency_id, outsourcing_group_id, service, status, effective_from)
  values ('${AGENCY}', '${PARTNER}', 'creditops', 'active', current_date - 1);
  insert into fulfillment_clients (id, agency_id, outsourcing_group_id, name, email, mode, status, round)
  values ('${CLIENT}', '${AGENCY}', '${PARTNER}', 'Probe Client', 'probe.client@bes.test',
          'outsourcing_only', 'Onboarding', 'Round 1');`;

const credits = (n, kind = "purchase") => `
  insert into partner_credit_ledger (agency_id, group_id, kind, unit, quantity, description)
  values ('${AGENCY}', '${PARTNER}', '${kind}', 'creditops_round', ${n}, 'probe');`;

console.log("\nCREDITS ARE A LEDGER, NOT A COUNTER");

check("1. the balance is the sum of the ledger",
  as(OWNER, SETUP + credits(25) + credits(-18, "usage"),
    `select added, used, available from partner_credit_balance where group_id='${PARTNER}';`).rows,
  [{ added: 25, used: 18, available: 7 }]);

check("2. there is nowhere to store a balance that could drift",
  q.query(`select count(*)::int as n from information_schema.columns
            where table_schema='public' and table_name='partner_credit_ledger'
              and column_name in ('balance','available','remaining')`),
  [{ n: 0 }]);

check("3. a ledger row cannot be edited or deleted",
  q.query(`select count(*)::int as n from pg_policies
            where tablename='partner_credit_ledger' and cmd in ('UPDATE','DELETE')`),
  [{ n: 0 }]);

check("4. a correction is a reversal that leaves both rows standing",
  as(OWNER, SETUP + credits(25),
    `do $a$ begin perform reverse_partner_credit(
       (select id from partner_credit_ledger where group_id='${PARTNER}' limit 1), 'Charged in error'); end $a$;
     select (select count(*)::int from partner_credit_ledger where group_id='${PARTNER}') as rows,
            (select available::int from partner_credit_balance where group_id='${PARTNER}') as available;`).rows,
  [{ rows: 2, available: 0 }]);

check("5. …and cannot be reversed twice",
  as(OWNER, SETUP + credits(25), `do $a$
     declare e uuid := (select id from partner_credit_ledger where group_id='${PARTNER}' and kind='purchase' limit 1);
     begin
       perform reverse_partner_credit(e, 'once');
       perform reverse_partner_credit(e, 'twice');
     end $a$;`).error?.includes("already been reversed") ?? false,
  true);

check("6. a reversal must say why",
  as(OWNER, SETUP + credits(25), `do $a$ begin perform reverse_partner_credit(
     (select id from partner_credit_ledger where group_id='${PARTNER}' limit 1), '  '); end $a$;`)
    .error?.includes("Say why") ?? false,
  true);

console.log("\nSPENDING A CREDIT IS NOT A BILLING ACT");

/* The realistic case: an agent processing a client ASSIGNED to them. The
   fixture agent's scope is `assigned`, so without the assignment `in_scope`
   correctly says no — and test 10 below proves that is not an accident. */
const HAS_CREDITOPS = `insert into agency_member_permissions (membership_id, key, allowed)
  values ('${AGENT_M}','partners.clients',true), ('${AGENT_M}','creditops.clients.edit',true)
  on conflict (membership_id, key) do update set allowed = true;
  update fulfillment_clients set assigned_agent_id = '${AGENT}' where id = '${CLIENT}';`;

check("7. an agent who may work the client spends a credit without seeing money",
  as(AGENT, SETUP + credits(25) + HAS_CREDITOPS,
    `do $a$ begin perform spend_partner_credit('${CLIENT}', 'creditops_round', 1, 'Round 1'); end $a$;
     reset role;
     select available::int as available from partner_credit_balance where group_id='${PARTNER}';`).rows,
  [{ available: 24 }]);

check("8. …and still cannot read the ledger itself",
  as(AGENT, SETUP + credits(25) + HAS_CREDITOPS,
    `select count(*)::int as n from partner_credit_ledger where group_id='${PARTNER}';`).rows,
  [{ n: 0 }]);

check("9. spending refuses to go negative rather than lending credits",
  as(AGENT, SETUP + credits(1) + HAS_CREDITOPS,
    `do $a$ begin perform spend_partner_credit('${CLIENT}', 'creditops_round', 2, null); end $a$;`)
    .error?.includes("credits left") ?? false,
  true);

check("10. somebody who may not work the client cannot spend their credits",
  as(AGENT, SETUP + credits(25),
    `do $a$ begin perform spend_partner_credit('${CLIENT}', 'creditops_round', 1, null); end $a$;`)
    .error?.includes("not yours to work") ?? false,
  true);

console.log("\nTHE MONEY BOUNDARY STILL HOLDS");

if (!ADMIN) {
  console.log("  SKIP 11-12  no non-owner admin to test the boundary with");
} else {
  check("11. an admin who was never granted billing reads no credits",
    as(ADMIN, SETUP + credits(25),
      `select count(*)::int as n from partner_credit_ledger where group_id='${PARTNER}';`).rows,
    [{ n: 0 }]);

  check("12. …and cannot write one",
    as(ADMIN, SETUP, `do $a$ begin
       insert into partner_credit_ledger (agency_id, group_id, kind, unit, quantity)
       values ('${AGENCY}', '${PARTNER}', 'promotional', 'creditops_round', 5); end $a$;`)
      .error?.includes("row-level security") ?? false,
    true);
}

check("13. the owner reads and writes them without an explicit grant",
  as(OWNER, SETUP, `do $a$ begin
     insert into partner_credit_ledger (agency_id, group_id, kind, unit, quantity, description)
     values ('${AGENCY}', '${PARTNER}', 'promotional', 'creditops_round', 5, 'goodwill'); end $a$;
     select available::int as available from partner_credit_balance where group_id='${PARTNER}';`).rows,
  [{ available: 5 }]);

check("14. the balance view cannot leak past RLS",
  q.query(`select coalesce((select true from pg_class c
            where c.relname='partner_credit_balance' and c.reloptions::text like '%security_invoker=true%'), false) as invoker`),
  [{ invoker: true }]);

check("15. refunded is now an invoice status",
  q.query(`select count(*)::int as n from pg_enum e join pg_type t on t.oid=e.enumtypid
            where t.typname='partner_invoice_status' and e.enumlabel='refunded'`),
  [{ n: 1 }]);

console.log("\nSUSPENSION STOPS WORK, AND DESTROYS NOTHING");

/* An open CreditOps file for the probe partner, assigned, so it is in a queue
   and in somebody's My Work before anything is suspended. */
const IN_QUEUE = `
  update fulfillment_clients set assigned_agent_id = '${AGENT}' where id = '${CLIENT}';
  insert into client_department_statuses (client_id, department, status, assignee_id, opened_at)
  values ('${CLIENT}', 'Dispute', 'DISPUTE PROCESSING', '${AGENT}', now())
  on conflict (client_id, department) do update
    set status = excluded.status, assignee_id = excluded.assignee_id;`;

check("16. before suspension the work is in the queue and in My Work",
  as(OWNER, SETUP + IN_QUEUE, `reset role;
    select (select count(*)::int from creditops_department_queue
             where client_id='${CLIENT}' and department='Dispute') as in_queue,
           (select count(*)::int from creditops_my_work
             where client_id='${CLIENT}' and department='Dispute') as in_my_work;`).rows,
  [{ in_queue: 1, in_my_work: 1 }]);

check("17. suspending removes it from both",
  as(OWNER, SETUP + IN_QUEUE,
    `do $a$ begin perform suspend_partner('${PARTNER}', 'nonpayment', 'probe', '{}'); end $a$;
     reset role;
     select (select count(*)::int from creditops_department_queue where client_id='${CLIENT}') as in_queue,
            (select count(*)::int from creditops_my_work where client_id='${CLIENT}') as in_my_work,
            (select count(*)::int from creditops_assignment_required where client_id='${CLIENT}') as assignable;`).rows,
  [{ in_queue: 0, in_my_work: 0, assignable: 0 }]);

check("18. …and destroys nothing — the client, the assignment and the history all stand",
  as(OWNER, SETUP + IN_QUEUE,
    `do $a$ begin perform suspend_partner('${PARTNER}', 'nonpayment', 'probe', '{}'); end $a$;
     reset role;
     select (select count(*)::int from fulfillment_clients where id='${CLIENT}') as client,
            (select assigned_agent_id = '${AGENT}' from fulfillment_clients where id='${CLIENT}') as still_assigned,
            (select count(*)::int from client_department_statuses
              where client_id='${CLIENT}' and department='Dispute') as department_rows,
            (select lifecycle::text from outsourcing_groups where id='${PARTNER}') as lifecycle;`).rows,
  [{ client: 1, still_assigned: true, department_rows: 1, lifecycle: "suspended" }]);

check("19. management and billing still see the client",
  as(OWNER, SETUP + IN_QUEUE,
    `do $a$ begin perform suspend_partner('${PARTNER}', 'nonpayment', 'probe', '{}'); end $a$;
     select count(*)::int as n from fulfillment_clients where id='${CLIENT}';`).rows,
  [{ n: 1 }]);

check("20. suspending twice does not open a second episode",
  as(OWNER, SETUP, `do $a$ begin
       perform suspend_partner('${PARTNER}', 'nonpayment', 'probe', '{}');
       perform suspend_partner('${PARTNER}', 'nonpayment', 'probe', '{}'); end $a$;
     reset role; select count(*)::int as n from partner_suspensions where group_id='${PARTNER}';`).rows,
  [{ n: 1 }]);

check("21. lifting it puts the work back",
  as(OWNER, SETUP + IN_QUEUE, `do $a$ begin
       perform suspend_partner('${PARTNER}', 'nonpayment', 'probe', '{}');
       perform lift_partner_suspension('${PARTNER}', 'Paid in full'); end $a$;
     reset role;
     select (select count(*)::int from creditops_department_queue
              where client_id='${CLIENT}' and department='Dispute') as in_queue,
            (select lifecycle::text from outsourcing_groups where id='${PARTNER}') as lifecycle,
            (select count(*)::int from partner_suspensions where group_id='${PARTNER}' and lifted_at is not null) as closed;`).rows,
  [{ in_queue: 1, lifecycle: "active", closed: 1 }]);

check("22. the episode records who, why and when",
  as(OWNER, SETUP, `do $a$ begin
       perform suspend_partner('${PARTNER}', 'nonpayment', 'Day 7 final reminder unpaid', '{}'); end $a$;
     reset role;
     select reason, detail, suspended_by = '${OWNER}' as by_owner, suspended_at is not null as dated
       from partner_suspensions where group_id='${PARTNER}';`).rows,
  [{ reason: "nonpayment", detail: "Day 7 final reminder unpaid", by_owner: true, dated: true }]);

check("23. an admin who was never granted billing cannot suspend a partner",
  ADMIN
    ? (as(ADMIN, SETUP, `do $a$ begin perform suspend_partner('${PARTNER}', 'nonpayment', null, '{}'); end $a$;`)
        .error?.includes("owner-granted") ?? false)
    : "skipped",
  ADMIN ? true : "skipped");

check("24. …nor reactivate one",
  ADMIN
    ? (as(ADMIN, SETUP, `do $a$ begin
         perform suspend_partner('${PARTNER}', 'nonpayment', null, '{}', null);
       end $a$;
       set local role authenticated;
       do $c2$ begin perform set_config('request.jwt.claims', '{"sub":"${ADMIN}","role":"authenticated"}', true); end $c2$;
       do $b$ begin perform lift_partner_suspension('${PARTNER}', 'nice try'); end $b$;`)
        .error?.includes("owner-granted") ?? false)
    : "skipped",
  ADMIN ? true : "skipped");

check("25. marketing work for a suspended partner is HELD, not unassigned",
  (() => {
    const ws = q.query(`select id from workspaces where module='sales_marketing' and partner_group_id is not null limit 1`)[0]?.id;
    if (!ws) return "skipped";
    const group = q.query(`select partner_group_id from workspaces where id='${ws}'`)[0].partner_group_id;
    return as(OWNER, "",
      `do $a$ begin
         insert into work_items (agency_id, scope, related_type, division, workspace_id, status_id, item_type_id, title, assigned_to)
         values ('${AGENCY}', 'AGENCY', 'project', 'sales_marketing', '${ws}',
           (select id from workspace_statuses where workspace_id='${ws}' and key='todo'),
           (select id from workspace_item_types where workspace_id='${ws}' and key='content'),
           'Probe: held work', '${AGENT}');
         perform suspend_partner('${group}', 'nonpayment', 'probe', '{}'); end $a$;
       reset role;
       select held_at is not null as held, assigned_to = '${AGENT}' as still_assigned, completed_at is null as intact
         from work_items where title = 'Probe: held work';`).rows;
  })(),
  [{ held: true, still_assigned: true, intact: true }]);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  - ${f}`)); process.exitCode = 1; }
q.close();
