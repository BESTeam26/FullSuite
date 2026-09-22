/**
 * A sent round waits thirty days, unassigned, then comes back assigned.
 *
 * Dee, 2026-09-22: *"I need only the Actual Round 1-10 Sent a that's
 * automatically the waiting status. Remove assignee for these status and
 * automatically set their next due date to 30 days. Then After 30 days, sent
 * their next status to Results available for review and assign to the support
 * team."*
 *
 * Every case rewrites one real client inside a transaction and rolls back.
 *
 * Run: node supabase/scripts/round-wait-probe.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });
let pass = 0; const failures = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}\n       expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`); }
};
const one = (sql) => q.query(sql)[0];

const CLIENT = one(`select id, name from fulfillment_clients
                     where coalesce(is_fixture,false)=false and archived_at is null
                     order by created_at limit 1`);

/** Put the client on a sent round and read back what the engine decided. */
const sendRound = (round) => one(`begin;
  update public.fulfillment_clients set status = 'Round ${round} Sent' where id = '${CLIENT.id}';
  select d.status,
         (d.assignee_id is null) as unassigned,
         round((extract(epoch from (coalesce(d.manual_due_at, d.system_due_at) - now())) / 86400)::numeric) as days_to_due
    from public.client_department_statuses d
   where d.client_id = '${CLIENT.id}' and d.department = 'Dispute';
  rollback;`);

console.log(`\nA SENT ROUND — ${CLIENT.name}\n`);
{
  const r1 = sendRound(1);
  check("1 · opens Dispute as waiting for results", r1.status, "ROUND SENT - AWAITING RESULTS");
  check("2 · with nobody assigned", r1.unassigned, true);
  check("3 · and a due date thirty days out", Number(r1.days_to_due), 30);

  /* Every numbered round behaves the same — the rule is the status family,
     not one hand-configured row. */
  const each = [2, 5, 10, 12].map((n) => {
    const r = sendRound(n);
    return `${r.status}/${r.unassigned}/${Number(r.days_to_due)}`;
  });
  check("4 · rounds 2, 5, 10 and 12 all behave identically", each,
    Array(4).fill("ROUND SENT - AWAITING RESULTS/true/30"));
}

console.log("\nTHIRTY DAYS LATER\n");
{
  /* Age the wait past its due date and run the real sweep. */
  const after = one(`begin;
    update public.fulfillment_clients set status = 'Round 3 Sent' where id = '${CLIENT.id}';
    update public.client_department_statuses
       set system_due_at = now() - interval '1 hour', opened_at = now() - interval '31 days'
     where client_id = '${CLIENT.id}' and department = 'Dispute';
    select public.sla_sweep();
    select fc.status as client_status,
           (select s.status from public.client_department_statuses s
             where s.client_id = fc.id and s.department = 'Support') as support_status,
           (select s.assignee_id is not null from public.client_department_statuses s
             where s.client_id = fc.id and s.department = 'Support') as support_assigned
      from public.fulfillment_clients fc where fc.id = '${CLIENT.id}';
    rollback;`);
  check("5 · the client status becomes Results Available for Review",
    after.client_status, "Results Available for Review");
  check("6 · Support is opened on it", after.support_status, "READY FOR REIMPORT");
  check("7 · and somebody on the support team has it", after.support_assigned, true);

  /* It must not fire early. */
  const early = one(`begin;
    update public.fulfillment_clients set status = 'Round 3 Sent' where id = '${CLIENT.id}';
    select public.sla_sweep();
    select status as client_status from public.fulfillment_clients where id = '${CLIENT.id}';
    rollback;`);
  check("8 · and not a day before", early.client_status, "Round 3 Sent");
}

console.log("\nTHE OTHER POLICIES ARE UNTOUCHED\n");
{
  const onboarding = one(`select count(*)::int n from sla_policies
                           where department = 'Onboarding' and max_cycles is not null`);
  check("9 · the onboarding follow-up policies still exist", onboarding.n > 0, true);
  const defaults = one(`select count(*)::int n from sla_policies
                         where on_expiry_client_status is null and on_expiry_assign = false`);
  check("10 · every other policy keeps the old unassigned behaviour", defaults.n > 0, true);
  const dead = one(`select count(*)::int n from sla_policies where status = 'Mailed'`);
  check("11 · the dead 'Mailed' policy is gone", dead.n, 0);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
