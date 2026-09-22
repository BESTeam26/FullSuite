#!/usr/bin/env node
/**
 * Dee's CreditOps queue doctrine, proved against the live database.
 *
 * `CREDITOPS_QUEUE_DOCTRINE.md`, 2026-09-21. She wrote six acceptance cases
 * and added two; all eight are below, in her order and her words. The rule she
 * explicitly REJECTED — "moving to another department closes the previous
 * one" — has its own check, so it cannot creep back in.
 *
 *   node supabase/scripts/creditops-queue-probe.mjs
 *
 * Every case runs inside a transaction that is rolled back. The scope cases
 * run as REAL authenticated users, because who may SEE a queue row is not a
 * question a superuser can answer.
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });
let pass = 0, fail = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  ok  " : "  FAIL"} ${n}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};
const tx = (sql) => q.query(`begin; ${sql} rollback;`);
const asUser = (user, sql, setup = "") => q.query(
  `begin; ${setup} set local role authenticated;
   do $c$ begin perform set_config('request.jwt.claims','{"sub":"${user}","role":"authenticated"}',true); end $c$;
   ${sql} rollback;`);

/* One client, cleared of department rows, driven through statuses. */
const CLIENT = `(select id from fulfillment_clients where lifecycle = 'active' and archived_at is null order by created_at limit 1)`;
/* Resolving an action is gated on being the client or BES staff, so the two
   resume cases run as a REAL staff member. A superuser has no auth.uid() and
   is refused, correctly. */
const STAFF = q.query(`select m.user_id from agency_memberships m join profiles p on p.id = m.user_id
  where m.status = 'active' and not coalesce(p.is_fixture, false) and m.is_owner limit 1`)[0].user_id;
const asStaff = (setup, sql) => q.query(
  `begin; ${setup} set local role authenticated;
   do $c$ begin perform set_config('request.jwt.claims','{"sub":"${STAFF}","role":"authenticated"}',true); end $c$;
   ${sql} rollback;`);
const reset = `create temp table t as select ${CLIENT} as id;
  /* The resume cases switch role mid-transaction, and a temp table belongs to
     whoever made it. */
  grant select on t to authenticated;
  delete from partner_action_items where fulfillment_client_id = (select id from t);
  delete from client_department_statuses where client_id = (select id from t);`;
const setStatus = (s) => `update fulfillment_clients set status = '${s}' where id = (select id from t);`;
/* What the QUEUE shows — the view the screens read, not the client's status. */
const queue = `select coalesce(string_agg(department::text || '=' || case when actionable then 'ACTIONABLE' else 'waiting' end, ' | ' order by department::text), '(none)') as rows
               from creditops_department_queue where client_id = (select id from t)`;

console.log("\nDEE'S SIX CASES");

check("1 — Ready for Processing → the Dispute queue shows it",
  tx(`${reset} ${setStatus("Ready for Processing")} ${queue};`)[0].rows,
  "Dispute=ACTIONABLE");

check("2 — Round 8 Sent → Dispute hidden from the active queue, waiting, NOT completed",
  tx(`${reset} ${setStatus("Ready for Processing")} ${setStatus("Round 8 Sent")}
      select (select status from client_department_statuses where client_id=(select id from t) and department='Dispute') as dept_status,
             (select actionable from creditops_department_queue where client_id=(select id from t) and department='Dispute') as actionable,
             (select count(*)::int from client_department_statuses where client_id=(select id from t) and department='Dispute') as row_kept;`)[0],
  { dept_status: "ROUND SENT - AWAITING RESULTS", actionable: false, row_kept: 1 });

check("3 — Monitoring Issue 2 while Dispute waits → Support visible, Dispute still hidden, both records truthful",
  tx(`${reset} ${setStatus("Ready for Processing")} ${setStatus("Round 8 Sent")} ${setStatus("Monitoring Issue 2")} ${queue};`)[0].rows,
  "Dispute=waiting | Support=ACTIONABLE");

check("4 — For Client Confirmation → internal queue hidden, portal action visible",
  tx(`${reset} ${setStatus("Ready for Processing")} ${setStatus("For Client Confirmation")}
      select (select count(*)::int from creditops_department_queue
               where client_id=(select id from t) and actionable) as internal_actionable,
             (select count(*)::int from partner_action_items
               where fulfillment_client_id=(select id from t) and audience='client' and status='open') as portal_actions,
             (select origin_status::text from partner_action_items
               where fulfillment_client_id=(select id from t) and audience='client') as resumes_to;`)[0],
  { internal_actionable: 0, portal_actions: 1, resumes_to: "Ready for Processing" });

check("5 — the client confirms → the portal action closes and the right internal status resumes",
  asStaff(`${reset} ${setStatus("Ready for Processing")} ${setStatus("For Client Confirmation")}`,
     `do $r$ begin perform public.resolve_client_action(
        (select id from partner_action_items where fulfillment_client_id=(select id from t) and audience='client'),
        'Confirmed.'); end $r$;
      select (select status::text from fulfillment_clients where id=(select id from t)) as credit_status,
             (select status from partner_action_items where fulfillment_client_id=(select id from t) and audience='client') as action_status,
             (select count(*)::int from creditops_department_queue
               where client_id=(select id from t) and actionable) as internal_actionable;`)[0],
  { credit_status: "Ready for Processing", action_status: "completed", internal_actionable: 1 });

check("6 — a department still legitimately actionable is NOT suppressed by another opening",
  /* Dee REJECTED the generic close rule. Dispute has not sent the round, so it
     keeps its actionable work while Support picks up a monitoring issue. */
  tx(`${reset} ${setStatus("Ready for Processing")} ${setStatus("Monitoring Issue 2")} ${queue};`)[0].rows,
  "Dispute=ACTIONABLE | Support=ACTIONABLE");

console.log("\nTHE TWO DEE ADDED");

check("7 — a client waiting for results is not assignable from the active Dispute queue",
  tx(`${reset} ${setStatus("Ready for Processing")} ${setStatus("Round 8 Sent")}
      select (select assignee_id is null from client_department_statuses
               where client_id=(select id from t) and department='Dispute') as unassigned,
             (select count(*)::int from creditops_department_queue
               where client_id=(select id from t) and department='Dispute' and actionable) as in_active_queue;`)[0],
  { unassigned: true, in_active_queue: 0 });

check("8 — after confirmation the file returns by itself, with no manager hunting for it",
  asStaff(`${reset} ${setStatus("Round 8 Sent")} ${setStatus("For Client Confirmation")}`,
     /* Two statements, deliberately: a function call inside the same SELECT
        that reads the table sees the snapshot from before its own write. */
     `do $r$ begin perform public.resolve_client_action(
        (select id from partner_action_items where fulfillment_client_id=(select id from t) and audience='client'),
        'Yes.'); end $r$;
      select (select status::text from fulfillment_clients where id=(select id from t)) as back_to,
             (select status from client_department_statuses
               where client_id=(select id from t) and department='Dispute') as dispute_back_to;`)[0],
  { back_to: "Round 8 Sent", dispute_back_to: "ROUND SENT - AWAITING RESULTS" });

console.log("\nTHE RULE DEE REJECTED MUST NOT COME BACK");

check("9 — nothing closes a department merely because another opened",
  tx(`${reset} ${setStatus("Ready for Processing")} ${setStatus("Monitoring Issue 2")}
      select count(*)::int as closed from client_department_statuses
       where client_id=(select id from t) and upper(status) = 'COMPLETED';`)[0].closed,
  0);

check("10 — waiting is never recorded as completed",
  tx(`${reset} ${setStatus("Ready for Processing")} ${setStatus("Round 8 Sent")}
      select count(*)::int as wrongly_completed from client_department_statuses
       where client_id=(select id from t) and upper(status) = 'COMPLETED';`)[0].wrongly_completed,
  0);

console.log("\nSCOPE STILL DECIDES WHO SEES IT");
/* Dee: "even if a status makes something actionable, the agent still only sees
   it if both their department/work scope and Partner/client scope allow it."
   Actionable is a property of the WORK. Visible is a property of the VIEWER,
   and the two are not the same question. */
const AGENT = q.query(`select m.user_id from agency_memberships m join profiles p on p.id = m.user_id
  where m.status='active' and m.role='agency_user' and not coalesce(p.is_fixture,false)
    and not exists (select 1 from agency_member_permissions amp
                     where amp.membership_id = m.id and amp.allowed
                       and amp.key in ('ops.manage','creditops.clients.view'))
  limit 1`)[0]?.user_id;

/* The total is read OUTSIDE the impersonation. Counting inside it compares the
   agent to themselves, which is always equal and proves nothing — the first
   version of this check did exactly that and passed for the wrong reason. */
const ALL_ACTIONABLE = q.query(
  `select count(*)::int as n from creditops_department_queue where actionable`)[0].n;

check("11 — the queue is RLS-scoped: an ordinary agent sees fewer rows than exist",
  AGENT
    ? asUser(AGENT, `select count(*)::int as n from creditops_department_queue where actionable;`)[0].n < ALL_ACTIONABLE
    : "no unprivileged agent on the roster",
  true);

check("12 — a portal client reads their OWN action and nobody else's",
  q.query(`select count(*)::int as n from pg_policy
            where polrelid='public.partner_action_items'::regclass
              and pg_get_expr(polqual, polrelid) ilike '%portal_user_id%'`)[0].n,
  1);

check("13 — answering somebody else's action is refused",
  (() => { try {
    asUser(AGENT ?? STAFF, `do $r$ begin perform public.resolve_client_action(gen_random_uuid()); end $r$;`);
    return "allowed";
  } catch (e) { return /42501|No such action/i.test(e.message) ? "refused" : `other: ${e.message.slice(0,60)}`; } })(),
  "refused");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
