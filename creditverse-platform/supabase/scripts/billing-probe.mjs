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

/* A profile that is neither BES staff nor already somebody's portal contact —
   `partner_contacts_user_idx` is unique on user_id, so one account belongs to
   one partner. That constraint is correct and it caught this probe reusing an
   account that already had a partner. */
const OUTSIDER_PORTAL = one(`select id from profiles
   where id not in (select user_id from agency_memberships)
     and id not in (select user_id from partner_contacts where user_id is not null)
     and not coalesce(is_fixture, false) limit 1`)?.id;

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

console.log("\nTHE REMINDER SCHEDULE");

/* An invoice `n` days past due, with nothing paid against it. Dates are set
   relative to today so the probe is not a time bomb. */
const invoice = (daysOverdue, totalCents = 42500, paidCents = 0) => `
  insert into partner_invoices (id, agency_id, group_id, invoice_number, issue_date, due_date,
                                currency, subtotal_cents, total_cents, amount_paid_cents, status)
  values ('44444444-5555-4666-8777-888888888888', '${AGENCY}', '${PARTNER}', 'INV-PROBE',
          current_date - ${daysOverdue} - 7, current_date - ${daysOverdue},
          'USD', ${totalCents}, ${totalCents}, ${paidCents}, 'sent');`;
const INVOICE = "44444444-5555-4666-8777-888888888888";
const sweep = "do $s$ begin perform billing_reminder_sweep(); end $s$;";

/* A billing contact with a real address, for the email tests. */
const CONTACT_EMAIL = `
  insert into partner_contacts (group_id, agency_id, full_name, email, status, is_primary)
  values ('${PARTNER}', '${AGENCY}', 'Probe Billing', 'billing.contact@bes.test', 'active', true);`;

check("26. day 1 sends one reminder and no more",
  as(OWNER, SETUP + invoice(1), `${sweep}
    reset role; select stage, days_overdue from partner_invoice_reminders where invoice_id='${INVOICE}' order by stage;`).rows,
  [{ stage: "day_1", days_overdue: 1 }]);

check("27. by day 3 the first three have gone, once each",
  as(OWNER, SETUP + invoice(3), `${sweep}
    reset role; select string_agg(stage, ',' order by stage) as stages, count(*)::int as n
      from partner_invoice_reminders where invoice_id='${INVOICE}';`).rows,
  [{ stages: "day_1,day_2,day_3", n: 3 }]);

check("28. day 5 adds the warning",
  as(OWNER, SETUP + invoice(5), `${sweep}
    reset role; select count(*)::int as n from partner_invoice_reminders
     where invoice_id='${INVOICE}' and stage='day_5_warning';`).rows,
  [{ n: 1 }]);

check("29. running the sweep twice sends nothing twice",
  as(OWNER, SETUP + invoice(5), `${sweep} ${sweep} ${sweep}
    reset role; select count(*)::int as n from partner_invoice_reminders where invoice_id='${INVOICE}';`).rows,
  [{ n: 4 }]);

check("30. day 7 sends the final reminder AND suspends",
  as(OWNER, SETUP + invoice(7), `${sweep}
    reset role;
    select (select count(*)::int from partner_invoice_reminders
             where invoice_id='${INVOICE}' and stage='day_7_final') as final_sent,
           (select count(*)::int from partner_suspensions
             where group_id='${PARTNER}' and lifted_at is null) as suspended,
           (select count(*)::int from partner_suspension_invoices si
             join partner_suspensions ps on ps.id = si.suspension_id
            where ps.group_id='${PARTNER}' and si.invoice_id='${INVOICE}') as invoice_recorded;`).rows,
  [{ final_sent: 1, suspended: 1, invoice_recorded: 1 }]);

console.log("\nSUSPENSION IS BALANCE-DRIVEN, NOT CALENDAR-DRIVEN");

check("31. an invoice paid in full at day 7 is NOT suspended",
  as(OWNER, SETUP + invoice(7, 42500, 42500), `${sweep}
    reset role; select count(*)::int as n from partner_suspensions where group_id='${PARTNER}';`).rows,
  [{ n: 0 }]);

check("32. a payment posted after the warning holds suspension off",
  /* Dee: "no successful payment posted since the previous reminder". A
     partner who has started paying is engaging, and suspending them the next
     morning is how you lose the rest of the money. */
  as(OWNER, SETUP + invoice(5) + `
      do $p$ begin perform billing_reminder_sweep(); end $p$;
      insert into partner_payments (agency_id, group_id, invoice_id, provider, amount_cents,
                                    currency, paid_on, status, method, source)
      values ('${AGENCY}', '${PARTNER}', '${INVOICE}', 'wise', 10000, 'USD', current_date,
              'succeeded', 'Wise', 'manual');
      update partner_invoices set due_date = current_date - 7 where id = '${INVOICE}';`,
    `${sweep}
     reset role;
     select (select count(*)::int from partner_invoice_reminders
              where invoice_id='${INVOICE}' and stage='day_7_final') as final_sent,
            (select count(*)::int from partner_suspensions where group_id='${PARTNER}') as suspended;`).rows,
  [{ final_sent: 1, suspended: 0 }]);

check("33. paying in full between the final reminder and the sweep stops suspension",
  /* The lock re-reads the balance. The invoice this loop started from said
     unpaid; the locked re-read says paid, and the sweep walks away. */
  as(OWNER, SETUP + invoice(7) + `
      do $p$ begin perform billing_reminder_sweep(); end $p$;
      delete from partner_suspensions where group_id = '${PARTNER}';
      update outsourcing_groups set lifecycle = 'active' where id = '${PARTNER}';
      insert into partner_payments (agency_id, group_id, invoice_id, provider, amount_cents,
                                    currency, paid_on, status, method, source)
      values ('${AGENCY}', '${PARTNER}', '${INVOICE}', 'wise', 42500, 'USD', current_date,
              'succeeded', 'Wise', 'manual');`,
    `${sweep}
     reset role;
     select (select count(*)::int from partner_suspensions where group_id='${PARTNER}') as suspended,
            (select status::text from partner_invoices where id='${INVOICE}') as invoice_status;`).rows,
  [{ suspended: 0, invoice_status: "paid" }]);

check("34. reminders stop once the balance is satisfied",
  as(OWNER, SETUP + invoice(1) + `
      do $p$ begin perform billing_reminder_sweep(); end $p$;
      insert into partner_payments (agency_id, group_id, invoice_id, provider, amount_cents,
                                    currency, paid_on, status, method, source)
      values ('${AGENCY}', '${PARTNER}', '${INVOICE}', 'wise', 42500, 'USD', current_date,
              'succeeded', 'Wise', 'manual');
      update partner_invoices set due_date = current_date - 5 where id = '${INVOICE}';`,
    `${sweep}
     reset role; select string_agg(stage, ',' order by stage) as stages
       from partner_invoice_reminders where invoice_id='${INVOICE}';`).rows,
  [{ stages: "day_1" }]);

check("35. paying an overdue invoice reactivates the partner",
  as(OWNER, SETUP + invoice(7) + `
      do $p$ begin perform billing_reminder_sweep(); end $p$;
      insert into partner_payments (agency_id, group_id, invoice_id, provider, amount_cents,
                                    currency, paid_on, status, method, source)
      values ('${AGENCY}', '${PARTNER}', '${INVOICE}', 'wise', 42500, 'USD', current_date,
              'succeeded', 'Wise', 'manual');`,
    `do $a$ begin perform billing_reactivation_sweep(); end $a$;
     reset role;
     select (select count(*)::int from partner_suspensions
              where group_id='${PARTNER}' and lifted_at is null) as still_suspended,
            (select lifecycle::text from outsourcing_groups where id='${PARTNER}') as lifecycle;`).rows,
  [{ still_suspended: 0, lifecycle: "active" }]);

check("36. a PARTIAL payment does not reactivate",
  /* Dee §21: "Do not silently reactivate because $1 was paid." */
  as(OWNER, SETUP + invoice(7) + `
      do $p$ begin perform billing_reminder_sweep(); end $p$;
      insert into partner_payments (agency_id, group_id, invoice_id, provider, amount_cents,
                                    currency, paid_on, status, method, source)
      values ('${AGENCY}', '${PARTNER}', '${INVOICE}', 'wise', 100, 'USD', current_date,
              'succeeded', 'Wise', 'manual');`,
    `do $a$ begin perform billing_reactivation_sweep(); end $a$;
     reset role;
     select (select count(*)::int from partner_suspensions
              where group_id='${PARTNER}' and lifted_at is null) as still_suspended,
            (select status::text from partner_invoices where id='${INVOICE}') as invoice_status;`).rows,
  [{ still_suspended: 1, invoice_status: "partially_paid" }]);

check("37. both sweeps are actually scheduled",
  /* `mark_overdue_invoices` sat unscheduled since it was written, which is
     how a reminder engine quietly does nothing. */
  q.query(`select count(*)::int as n from cron.job
            where jobname in ('billing-reminder-sweep', 'billing-reactivation-sweep')`),
  [{ n: 2 }]);

console.log("\nRECURRING INVOICES");

check("38. a period key names the cycle a date falls in",
  q.query(`select billing_period_key('RECURRING_WEEKLY',  date '2026-09-16') as weekly,
                  billing_period_key('RECURRING_MONTHLY', date '2026-09-16') as monthly,
                  billing_period_key('RECURRING_QUARTERLY', date '2026-09-16') as quarterly,
                  billing_period_key('PER_CLIENT', date '2026-09-16') as usage_based`),
  [{ weekly: "2026-W38", monthly: "2026-09", quarterly: "2026-Q3", usage_based: null }]);

check("39. an ISO week keeps its meaning across a year boundary",
  /* 31 Dec 2026 and 1 Jan 2027 are the same ISO week — a key built from the
     calendar year would call them different cycles and invoice twice. */
  q.query(`select billing_period_key('RECURRING_WEEKLY', date '2026-12-31') as a,
                  billing_period_key('RECURRING_WEEKLY', date '2027-01-01') as b`),
  [{ a: "2026-W53", b: "2026-W53" }]);

/*
 * PIN THE ISSUE DATE. `billing_period_due` takes `p_issued` and defaults it to
 * CURRENT_DATE, so leaving it off made every expectation below true only on the
 * day this was written — the 'Monday' case passed for a whole week because the
 * clamp below happened to land on the same date. Pass the fourth argument.
 */
check("40. the due date reads the day somebody typed, and falls back rather than guessing",
  q.query(`select billing_period_due('RECURRING_WEEKLY', 'Every Friday', date '2026-09-14', date '2026-09-14')::text as friday,
                  billing_period_due('RECURRING_WEEKLY', 'Monday', date '2026-09-14', date '2026-09-14')::text as monday,
                  billing_period_due('RECURRING_MONTHLY', 'End of the month', date '2026-09-01', date '2026-09-01')::text as eom,
                  billing_period_due('RECURRING_MONTHLY', 'whenever', date '2026-09-01', date '2026-09-01')::text as unreadable`),
  [{ friday: "2026-09-18", monday: "2026-09-14", eom: "2026-09-30", unreadable: "2026-09-30" }]);

check("40b. and it never hands back a due date that is already past on the day of issue",
  /* The rule the missing argument was hiding: a cycle day earlier than the day
     the invoice exists would be born overdue, so the issue date wins. Asserted
     against an invented issue date, not today's, so it stays true tomorrow. */
  q.query(`select billing_period_due('RECURRING_WEEKLY', 'Monday', date '2026-09-14', date '2026-09-16')::text as clamped,
                  billing_period_due('RECURRING_WEEKLY', 'Friday', date '2026-09-14', date '2026-09-16')::text as untouched`),
  [{ clamped: "2026-09-16", untouched: "2026-09-18" }]);

const TERMS = `
  insert into partner_services (id, group_id, agency_id, service_type, name, status)
  values ('55555555-6666-4777-8888-999999999999', '${PARTNER}', '${AGENCY}',
          'CREDITOPS_FULFILLMENT', 'CreditOps Fulfillment', 'active');
  insert into partner_service_billing (service_id, agency_id, billing_model, payment_frequency,
                                       invoice_day, rate_cents, currency, billing_status, effective_from)
  values ('55555555-6666-4777-8888-999999999999', '${AGENCY}', 'RECURRING_WEEKLY', 'Weekly',
          'Monday', 42500, 'USD', 'active', current_date - 30);`;
const genSweep = "do $g$ begin perform billing_recurring_sweep(); end $g$;";

check("41. a weekly agreement generates one invoice for this week",
  as(OWNER, SETUP + TERMS, `${genSweep}
    reset role;
    select count(*)::int as invoices, max(period_key) = billing_period_key('RECURRING_WEEKLY', current_date) as right_period,
           max(total_cents)::int as amount, max(status::text) as status
      from partner_invoices where group_id='${PARTNER}';`).rows,
  [{ invoices: 1, right_period: true, amount: 42500, status: "sent" }]);

check("42. running it three times still generates one",
  /* The unique index on (billing_id, period_key) decides, not a flag. */
  as(OWNER, SETUP + TERMS, `${genSweep} ${genSweep} ${genSweep}
    reset role; select count(*)::int as n from partner_invoices where group_id='${PARTNER}';`).rows,
  [{ n: 1 }]);

check("43. the invoice carries a line describing the cycle",
  as(OWNER, SETUP + TERMS, `${genSweep}
    reset role; select count(*)::int as lines, max(amount_cents)::int as amount
      from partner_invoice_lines l join partner_invoices i on i.id = l.invoice_id
     where i.group_id='${PARTNER}';`).rows,
  [{ lines: 1, amount: 42500 }]);

check("44. terms with no rate generate nothing and are surfaced instead",
  as(OWNER, SETUP + `
      insert into partner_services (id, group_id, agency_id, service_type, name, status)
      values ('55555555-6666-4777-8888-aaaaaaaaaaaa', '${PARTNER}', '${AGENCY}',
              'CREDITOPS_FULFILLMENT', 'CreditOps Fulfillment', 'active');
      insert into partner_service_billing (service_id, agency_id, billing_model, payment_frequency,
                                           rate_cents, currency, billing_status, effective_from)
      values ('55555555-6666-4777-8888-aaaaaaaaaaaa', '${AGENCY}', 'RECURRING_MONTHLY', 'Monthly',
              null, 'USD', 'active', current_date - 30);`,
    `${genSweep}
     reset role;
     select (select count(*)::int from partner_invoices where group_id='${PARTNER}') as invoices,
            (select count(*)::int from billing_terms_needing_rate
              where partner_name = 'Probe Billing Partner') as surfaced;`).rows,
  [{ invoices: 0, surfaced: 1 }]);

check("45. generation does not collect — the invoice is unpaid and nothing was charged",
  /* Dee: "Recurring invoice creation and automatic collection are separate." */
  as(OWNER, SETUP + TERMS, `${genSweep}
    reset role;
    select (select amount_paid_cents::int from partner_invoices where group_id='${PARTNER}') as paid,
           (select count(*)::int from partner_payments where group_id='${PARTNER}') as payments;`).rows,
  [{ paid: 0, payments: 0 }]);

check("46. ended terms stop generating",
  as(OWNER, SETUP + TERMS + `
      update partner_service_billing set effective_to = current_date - 1
       where service_id = '55555555-6666-4777-8888-999999999999';`,
    `${genSweep}
     reset role; select count(*)::int as n from partner_invoices where group_id='${PARTNER}';`).rows,
  [{ n: 0 }]);

check("47. the generator is scheduled",
  q.query(`select count(*)::int as n from cron.job where jobname = 'billing-recurring-sweep'`),
  [{ n: 1 }]);

console.log("\nMANUAL PAYMENT");

const record = (provider, cents, invoice = `'${INVOICE}'`) =>
  `do $r$ begin perform record_partner_payment('${PARTNER}', ${cents}, '${provider}', ${invoice},
     current_date, 'REF-${provider}', 'probe'); end $r$;`;

for (const [n, provider] of [[48, "wise"], [49, "paypal_personal"], [50, "bank_transfer"], [51, "other"]]) {
  check(`${n}. a ${provider.replace("_", " ")} payment creates a ledger entry and settles the invoice`,
    as(OWNER, SETUP + invoice(0), `${record(provider, 42500)}
      reset role;
      select (select count(*)::int from partner_payments where invoice_id='${INVOICE}') as payments,
             (select status::text from partner_invoices where id='${INVOICE}') as status,
             (select amount_paid_cents::int from partner_invoices where id='${INVOICE}') as paid;`).rows,
    [{ payments: 1, status: "paid", paid: 42500 }]);
}

check("52. a partial payment leaves the invoice Partially Paid, not Paid",
  as(OWNER, SETUP + invoice(0), `${record("wise", 10000)}
    reset role;
    select status::text as status, amount_paid_cents::int as paid,
           invoice_balance_cents(id)::int as balance from partner_invoices where id='${INVOICE}';`).rows,
  [{ status: "partially_paid", paid: 10000, balance: 32500 }]);

check("53. the invoice cannot be set to Paid without a payment behind it",
  /* Dee: "Never simply change the invoice to Paid."
     This used to assert that a hand-edited status was CORRECTED the next time
     anything recomputed the invoice — true, but it meant the wrong figure was
     live in between, and every screen that read it in that window was wrong.
     Since 20260917002100 the edit is REFUSED: `partner_invoice_recompute` is
     the only writer of amount_paid_cents and of the payment statuses. */
  (() => {
    /* `as` returns {ok:false, error} rather than throwing. */
    const r = as(OWNER, SETUP + invoice(3), `
      update partner_invoices set amount_paid_cents = 42500 where id = '${INVOICE}';
      select 1 as reached;`);
    if (r.ok) return "ACCEPTED A HAND-EDITED PAID TOTAL";
    return r.error.includes("derived from its payments") ? "refused"
      : `OTHER: ${r.error.slice(0, 90)}`;
  })(),
  "refused");

check("53b. and a real payment still moves it, because recompute is the writer",
  as(OWNER, SETUP + invoice(3), `${record("wise", 42500)}
    reset role;
    select status::text as status, amount_paid_cents::int as paid
      from partner_invoices where id='${INVOICE}';`).rows,
  [{ status: "paid", paid: 42500 }]);

check("54. money with no invoice is still recorded, and waits in review",
  as(OWNER, SETUP, `${record("wise", 42500, "null")}
    reset role;
    select (select count(*)::int from partner_payments where group_id='${PARTNER}') as recorded,
           (select reconciliation_state from partner_payments where group_id='${PARTNER}') as state,
           (select count(*)::int from payment_matching_review where group_id='${PARTNER}') as in_review;`).rows,
  [{ recorded: 1, state: "review_required", in_review: 1 }]);

check("55. review OFFERS candidate invoices rather than applying one",
  as(OWNER, SETUP + invoice(3),
    `${record("wise", 42500, "null")}
     select jsonb_array_length(candidate_invoices) as candidates,
            (select invoice_id from partner_payments where group_id='${PARTNER}') is null as still_unapplied
       from payment_matching_review where group_id='${PARTNER}';`).rows,
  [{ candidates: 1, still_unapplied: true }]);

check("56. matching it applies the money and clears the queue",
  as(OWNER, SETUP + invoice(3),
    `${record("wise", 42500, "null")}
     do $a$ begin perform match_partner_payment(
       (select id from partner_payments where group_id='${PARTNER}'), '${INVOICE}', 'Wise ref checked'); end $a$;
     reset role;
     select (select status::text from partner_invoices where id='${INVOICE}') as status,
            (select count(*)::int from payment_matching_review where group_id='${PARTNER}') as in_review;`).rows,
  [{ status: "paid", in_review: 0 }]);

check("57. one partner's money cannot be applied to another's invoice",
  as(OWNER, SETUP + invoice(3) + `
      insert into outsourcing_groups (id, agency_id, name, contact_email, status, lifecycle)
      values ('66666666-7777-4888-8999-aaaaaaaaaaaa', '${AGENCY}', 'Other Probe Partner',
              'other.probe@bes.test', 'Active', 'active');`,
    `do $a$ begin perform record_partner_payment('66666666-7777-4888-8999-aaaaaaaaaaaa', 42500,
       'wise', '${INVOICE}', current_date, null, null); end $a$;`)
    .error?.includes("different partner") ?? false,
  true);

check("58. recording a payment reactivates a suspended partner immediately",
  /* Not at the next hourly sweep. Somebody who has just paid should get their
     team back while they are still on the phone. */
  as(OWNER, SETUP + invoice(7) + `do $p$ begin perform billing_reminder_sweep(); end $p$;`,
    `${record("wise", 42500)}
     reset role;
     select (select count(*)::int from partner_suspensions
              where group_id='${PARTNER}' and lifted_at is null) as still_suspended,
            (select lifecycle::text from outsourcing_groups where id='${PARTNER}') as lifecycle;`).rows,
  [{ still_suspended: 0, lifecycle: "active" }]);

check("59. an admin who was never granted payments cannot record one",
  ADMIN
    ? (as(ADMIN, SETUP + invoice(0), record("wise", 42500)).error?.includes("owner-granted") ?? false)
    : "skipped",
  ADMIN ? true : "skipped");

console.log("\nTHE PARTNER'S OWN BILLING PAGE");

if (!OUTSIDER_PORTAL) {
  console.log("  SKIP 60-68  no free account to activate as a portal contact");
}

/* A real, activated portal contact for the probe partner. */
const CONTACT = `
  insert into partner_contacts (group_id, agency_id, full_name, email, user_id, status, is_primary, activated_at)
  values ('${PARTNER}', '${AGENCY}', 'Probe Billing Contact', 'billing.contact@bes.test',
          '${OUTSIDER_PORTAL}', 'active', true, now());`;

if (OUTSIDER_PORTAL) check("60. the partner sees their balance, derived from their invoices",
  as(OUTSIDER_PORTAL, SETUP + CONTACT + invoice(3),
    `select balance_cents::int as balance, overdue_invoices, suspended from my_partner_billing();`).rows,
  [{ balance: 42500, overdue_invoices: 0, suspended: false }]);

if (OUTSIDER_PORTAL) check("61. …their invoices, with the balance on each",
  as(OUTSIDER_PORTAL, SETUP + CONTACT + invoice(3),
    `select invoice_number, total_cents::int as total, balance_cents::int as balance, status
       from my_partner_invoices();`).rows,
  [{ invoice_number: "INV-PROBE", total: 42500, balance: 42500, status: "sent" }]);

if (OUTSIDER_PORTAL) check("62. …their payments, and what each was put against",
  as(OUTSIDER_PORTAL, SETUP + CONTACT + invoice(3) + `
      insert into partner_payments (agency_id, group_id, invoice_id, provider, amount_cents,
                                    currency, paid_on, status, method, source)
      values ('${AGENCY}', '${PARTNER}', '${INVOICE}', 'wise', 10000, 'USD', current_date,
              'succeeded', 'Wise', 'manual');`,
    `select amount_cents::int as amount, method, invoice_number from my_partner_payments();`).rows,
  [{ amount: 10000, method: "Wise", invoice_number: "INV-PROBE" }]);

if (OUTSIDER_PORTAL) check("63. …and their credits, with the history behind them",
  as(OUTSIDER_PORTAL, SETUP + CONTACT + credits(25) + credits(-18, "usage"),
    `select unit, added::int as added, used::int as used, available::int as available,
            jsonb_array_length(history) as entries from my_partner_credits();`).rows,
  [{ unit: "creditops_round", added: 25, used: 18, available: 7, entries: 2 }]);

if (OUTSIDER_PORTAL) check("64. a SUSPENDED partner can still reach their billing page",
  /* The rule this exists for. `partner_group_of_user()` refuses a suspended
     partner, which would have locked them out of the one screen where they
     could fix it. */
  as(OUTSIDER_PORTAL, SETUP + CONTACT + invoice(7) + `
      do $p$ begin perform billing_reminder_sweep(); end $p$;`,
    `select suspended, balance_cents::int as balance, overdue_invoices,
            suspension_detail is not null as says_why from my_partner_billing();`).rows,
  [{ suspended: true, balance: 42500, overdue_invoices: 1, says_why: true }]);

if (OUTSIDER_PORTAL) check("65. …and still sees the invoices they have to pay",
  as(OUTSIDER_PORTAL, SETUP + CONTACT + invoice(7) + `
      do $p$ begin perform billing_reminder_sweep(); end $p$;`,
    `select count(*)::int as n from my_partner_invoices();`).rows,
  [{ n: 1 }]);

if (OUTSIDER_PORTAL) check("66. …while their SERVICE access is still refused",
  /* Suspension stops the work, not the paying. The service chokepoint is
     unchanged and still says no. */
  as(OUTSIDER_PORTAL, SETUP + CONTACT + invoice(7) + `
      do $p$ begin perform billing_reminder_sweep(); end $p$;`,
    `select partner_group_of_user() is null as service_refused,
            partner_billing_group_of_user() is not null as billing_allowed;`).rows,
  [{ service_refused: true, billing_allowed: true }]);

if (OUTSIDER_PORTAL) check("67. one partner cannot read another's billing",
  as(OUTSIDER_PORTAL, SETUP + CONTACT + invoice(3) + `
      insert into outsourcing_groups (id, agency_id, name, contact_email, status, lifecycle, portal_access_enabled)
      values ('77777777-8888-4999-8aaa-bbbbbbbbbbbb', '${AGENCY}', 'Someone Else',
              'else@bes.test', 'Active', 'active', true);
      insert into partner_invoices (agency_id, group_id, invoice_number, issue_date, due_date,
                                    currency, subtotal_cents, total_cents, amount_paid_cents, status)
      values ('${AGENCY}', '77777777-8888-4999-8aaa-bbbbbbbbbbbb', 'INV-OTHER',
              current_date - 10, current_date - 3, 'USD', 99900, 99900, 0, 'sent');`,
    `select count(*)::int as n from my_partner_invoices() where invoice_number = 'INV-OTHER';`).rows,
  [{ n: 0 }]);

if (OUTSIDER_PORTAL) check("68. an archived partner is refused even for billing",
  as(OUTSIDER_PORTAL, SETUP + CONTACT + `
      update outsourcing_groups set lifecycle = 'archived' where id = '${PARTNER}';`,
    `select partner_billing_group_of_user() is null as refused;`).rows,
  [{ refused: true }]);

console.log("\nTWO LEDGERS, NEVER ONE");

check("69. account credit is money and processing credits are units, in different tables",
  /* Dee: "If both are called 'credits' internally, that will become a billing
     mess very quickly." The schema is where that is prevented. */
  q.query(`select
      (select count(*)::int from information_schema.columns
        where table_name='partner_account_credit_ledger' and column_name='amount_cents') as money_in_cents,
      (select count(*)::int from information_schema.columns
        where table_name='partner_credit_ledger' and column_name='quantity') as units_in_quantity,
      (select count(*)::int from information_schema.columns
        where table_name='partner_account_credit_ledger' and column_name='quantity') as money_has_no_quantity,
      (select count(*)::int from information_schema.columns
        where table_name='partner_credit_ledger' and column_name like '%cents%') as units_have_no_cents`),
  [{ money_in_cents: 1, units_in_quantity: 1, money_has_no_quantity: 0, units_have_no_cents: 0 }]);

check("70. a partner can hold both at once without either affecting the other",
  as(OWNER, SETUP + credits(7) + `
      insert into partner_account_credit_ledger (agency_id, group_id, kind, amount_cents, currency, description)
      values ('${AGENCY}', '${PARTNER}', 'goodwill', 10000, 'USD', 'probe');`,
    `select (select available::int from partner_credit_balance where group_id='${PARTNER}') as processing_rounds,
            (select available_cents::int from partner_account_credit_balance where group_id='${PARTNER}') as account_cents;`).rows,
  [{ processing_rounds: 7, account_cents: 10000 }]);

console.log("\nOVERPAYMENT IS NOT LOST");

check("71. $425 against a $400 balance settles the invoice and keeps $25 on account",
  /* Dee's own example. */
  as(OWNER, SETUP + invoice(3, 40000), `
    do $r$ begin perform record_partner_payment('${PARTNER}', 42500, 'wise', '${INVOICE}',
      current_date, 'REF-OVER', null); end $r$;
    reset role;
    select (select status::text from partner_invoices where id='${INVOICE}') as invoice_status,
           (select amount_paid_cents::int from partner_invoices where id='${INVOICE}') as invoice_paid,
           (select available_cents::int from partner_account_credit_balance where group_id='${PARTNER}') as on_account;`).rows,
  [{ invoice_status: "paid", invoice_paid: 40000, on_account: 2500 }]);

check("72. the payment itself is still recorded at what actually arrived",
  as(OWNER, SETUP + invoice(3, 40000), `
    do $r$ begin perform record_partner_payment('${PARTNER}', 42500, 'wise', '${INVOICE}',
      current_date, null, null); end $r$;
    reset role; select amount_cents::int as amount from partner_payments where group_id='${PARTNER}';`).rows,
  [{ amount: 42500 }]);

check("73. applying account credit settles an invoice through the payment ledger",
  as(OWNER, SETUP + invoice(3, 10000) + `
      insert into partner_account_credit_ledger (agency_id, group_id, kind, amount_cents, currency, description)
      values ('${AGENCY}', '${PARTNER}', 'goodwill', 25000, 'USD', 'probe');`,
    `do $a$ begin perform apply_account_credit('${PARTNER}', '${INVOICE}', null); end $a$;
     reset role;
     select (select status::text from partner_invoices where id='${INVOICE}') as invoice_status,
            (select available_cents::int from partner_account_credit_balance where group_id='${PARTNER}') as left_on_account,
            (select count(*)::int from partner_payments where invoice_id='${INVOICE}') as payments;`).rows,
  [{ invoice_status: "paid", left_on_account: 15000, payments: 1 }]);

check("74. it refuses to spend credit the partner does not have",
  as(OWNER, SETUP + invoice(3), `do $a$ begin
     perform apply_account_credit('${PARTNER}', '${INVOICE}', null); end $a$;`)
    .error?.includes("nothing to apply") ?? false,
  true);

console.log("\nEMAIL COMES FROM THE SAME EVENT");

check("75. a reminder queues exactly one email, addressed to the billing contact",
  as(OWNER, SETUP + CONTACT_EMAIL + invoice(1), `${sweep}
    reset role;
    select (select count(*)::int from billing_email_outbox where group_id='${PARTNER}' and kind='reminder') as queued,
           (select state from billing_email_outbox where group_id='${PARTNER}' and kind='reminder') as state,
           (select to_email from billing_email_outbox where group_id='${PARTNER}' and kind='reminder') as addressed_to,
           (select email_state from partner_invoice_reminders where invoice_id='${INVOICE}') as reminder_email_state;`).rows,
  [{ queued: 1, state: "pending", addressed_to: "billing.contact@bes.test", reminder_email_state: "pending" }]);

check("76. running the sweep three times still queues one",
  /* The reminder is the idempotency source; email inherits it. */
  as(OWNER, SETUP + CONTACT_EMAIL + invoice(1), `${sweep} ${sweep} ${sweep}
    reset role; select count(*)::int as n from billing_email_outbox where group_id='${PARTNER}';`).rows,
  [{ n: 1 }]);

check("77. no billing email is recorded as unavailable, never as delivered",
  /* Dee: "do NOT pretend the email was delivered." */
  as(OWNER, SETUP + `update outsourcing_groups set contact_email = '' where id = '${PARTNER}';` + invoice(1),
    `${sweep}
     reset role;
     select (select state from billing_email_outbox where group_id='${PARTNER}') as state,
            (select email_state from partner_invoice_reminders where invoice_id='${INVOICE}') as reminder_state,
            (select count(*)::int from billing_attention
              where kind='missing_billing_email' and group_id='${PARTNER}') as in_attention;`).rows,
  [{ state: "unavailable", reminder_state: "unavailable", in_attention: 1 }]);

check("78. a payment queues exactly one receipt, whatever recorded it",
  as(OWNER, SETUP + CONTACT_EMAIL + invoice(3), `
    do $r$ begin perform record_partner_payment('${PARTNER}', 42500, 'wise', '${INVOICE}',
      current_date, 'REF-1', null); end $r$;
    reset role;
    select count(*)::int as receipts,
           (payload->>'reactivated')::boolean as says_reactivated
      from billing_email_outbox where group_id='${PARTNER}' and kind='receipt' group by 2;`).rows,
  [{ receipts: 1, says_reactivated: false }]);

check("79. a receipt after suspension says the account is reactivated",
  as(OWNER, SETUP + CONTACT_EMAIL + invoice(7) + `do $p$ begin perform billing_reminder_sweep(); end $p$;`,
    `do $r$ begin perform record_partner_payment('${PARTNER}', 42500, 'wise', '${INVOICE}',
       current_date, 'REF-2', null); end $r$;
     reset role;
     select (payload->>'reactivated')::boolean as says_reactivated
       from billing_email_outbox where group_id='${PARTNER}' and kind='receipt';`).rows,
  [{ says_reactivated: true }]);

console.log("\nBILLING ATTENTION");

check("80. the BMF missing rate surfaces rather than staying hidden",
  /* Dee: "Business Made Fair currently has missing recurring rate
     information, so that should surface here rather than remain hidden." */
  q.query(`select count(*)::int as n from billing_attention
            where kind = 'billing_terms_missing_rate' and partner_name = 'Business Made Fair'`),
  [{ n: 1 }]);

check("81. suspension and past due use the pipeline's existing vocabulary",
  q.query(`select distinct label from billing_attention order by label`)
    .map((r) => r.label).filter((l) => ["Billing Attention Required", "Suspended Due To Non-Payment"].includes(l)).length > 0,
  true);

check("82. a partner only sees the payment methods BES turned on for them",
  as(OUTSIDER_PORTAL, SETUP + CONTACT + `
      insert into partner_payment_methods (agency_id, group_id, method, enabled, instructions, sort)
      values ('${AGENCY}', '${PARTNER}', 'wise', true, 'Send to wise.com/pay/bes', 10),
             ('${AGENCY}', '${PARTNER}', 'paypal', false, 'not for them', 20);`,
    `select method, instructions from my_partner_payment_methods();`).rows,
  [{ method: "wise", instructions: "Send to wise.com/pay/bes" }]);

console.log("\nAN EMAIL THAT STOPPED BEING TRUE");

check("83. paying between queue and dispatch stands the reminder email down",
  /* Dee: "payment before dispatch prevents an invalid overdue email if the
     canonical event is no longer applicable." A demand for money already
     sent is worse than sending nothing. */
  as(OWNER, SETUP + CONTACT_EMAIL + invoice(1) + `do $p$ begin perform billing_reminder_sweep(); end $p$;`,
    `do $r$ begin perform record_partner_payment('${PARTNER}', 42500, 'wise', '${INVOICE}',
       current_date, 'REF-EARLY', null); end $r$;
     do $d$ begin perform billing_email_supersede_settled(); end $d$;
     reset role;
     select (select state from billing_email_outbox where group_id='${PARTNER}' and kind='reminder') as reminder_email,
            (select state from billing_email_outbox where group_id='${PARTNER}' and kind='receipt') as receipt_email;`).rows,
  [{ reminder_email: "superseded", receipt_email: "pending" }]);

check("84. the reminder EVENT still stands — only the email is stood down",
  /* It happened. The portal notification went. Losing the record would make
     the schedule unauditable. */
  as(OWNER, SETUP + CONTACT_EMAIL + invoice(1) + `do $p$ begin perform billing_reminder_sweep(); end $p$;`,
    `do $r$ begin perform record_partner_payment('${PARTNER}', 42500, 'wise', '${INVOICE}',
       current_date, 'REF-EARLY', null); end $r$;
     do $d$ begin perform billing_email_supersede_settled(); end $d$;
     reset role;
     select count(*)::int as reminders_still_recorded
       from partner_invoice_reminders where invoice_id='${INVOICE}';`).rows,
  [{ reminders_still_recorded: 1 }]);

check("85. a receipt is never stood down — the money did arrive",
  as(OWNER, SETUP + CONTACT_EMAIL + invoice(3), `
     do $r$ begin perform record_partner_payment('${PARTNER}', 42500, 'wise', '${INVOICE}',
       current_date, 'REF-R', null); end $r$;
     do $d$ begin perform billing_email_supersede_settled(); end $d$;
     reset role;
     select state from billing_email_outbox where group_id='${PARTNER}' and kind='receipt';`).rows,
  [{ state: "pending" }]);

if (OUTSIDER_PORTAL) check("86. a voided invoice stays listed but owes nothing",
  /* Found on the live portal, 2026-09-16: the Balance column showed the full
     amount against an invoice marked Void. The totals were always right — every
     aggregating function filters void by status — but the ROW put $125.00 in a
     Balance column on a money page. It stays in the list, deliberately, so the
     partner can see it was cancelled. */
  /* The void happens in SETUP, before the session becomes the partner. Done in
     the action it silently affects zero rows — a portal contact has no write
     policy on partner_invoices, and RLS refuses by matching nothing, not by
     raising. The first version of this check passed a "sent" invoice and I read
     it as the fix failing. */
  as(OUTSIDER_PORTAL,
    SETUP + CONTACT + invoice(3) +
      `update partner_invoices set status = 'void', voided_at = now() where id = '${INVOICE}';`,
    `select invoice_number, total_cents::int as total, balance_cents::int as balance, status
       from my_partner_invoices();`).rows,
  [{ invoice_number: "INV-PROBE", total: 42500, balance: 0, status: "void" }]);

if (OUTSIDER_PORTAL) check("87. …and the raw arithmetic underneath is untouched",
  /* `invoice_balance_cents` stays total-minus-paid for everybody else —
     record_partner_payment needs the true figure, not a status-aware one. */
  as(OWNER,
    SETUP + invoice(3) +
      `update partner_invoices set status = 'void', voided_at = now() where id = '${INVOICE}';`,
    `select public.invoice_balance_cents('${INVOICE}')::int as raw;`).rows,
  [{ raw: 42500 }]);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  - ${f}`)); process.exitCode = 1; }
q.close();
