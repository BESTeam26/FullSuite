#!/usr/bin/env node
/**
 * Every function written today, actually CALLED.
 *
 * Twice today a function has looked correct and never executed:
 *
 *   `client_match_for_import`  counted candidates with `min(fc.id)`, and there
 *                              is no min(uuid). It would have stopped the
 *                              import on the first card with an email.
 *   `set_partner_service`      compared `module_categories.module` (its own
 *                              enum) against text, and raised 42883 the first
 *                              time anybody pressed the control.
 *
 * Both compile. PL/pgSQL resolves the statement at execution, so neither a
 * migration nor `tsc` nor a code review sees them — only a call does. Dee,
 * 2026-09-24, on reading that for the second time: "EXECUTE THIS."
 *
 * So this calls each one, as a real authenticated person, inside a
 * transaction that is rolled back. It asserts nothing about the ANSWER — the
 * probes that own each rule do that. It asserts only that the function runs,
 * which is the thing that keeps being untrue.
 *
 * Run: node supabase/scripts/executed-probe.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });

let pass = 0; const failures = [];
const one = (sql) => q.query(sql)[0];
const as = (u) => `set local role authenticated; do $c$ begin perform set_config('request.jwt.claims','{"sub":"${u}","role":"authenticated"}',true); end $c$;`;

const OWNER = one(`select m.user_id u from agency_memberships m join profiles p on p.id=m.user_id
                    where m.is_owner and m.status='active' and coalesce(p.is_fixture,false)=false limit 1`).u;
const CLIENT = one(`select id from fulfillment_clients where coalesce(is_fixture,false)=false limit 1`)?.id;
const GROUP = one(`select id from outsourcing_groups where archived_at is null limit 1`).id;
const CAT = one(`select id from module_categories where module::text='creditops' and key='outsourcing' and archived_at is null`)?.id;
const POST = CLIENT
  ? one(`select id from activity_events where entity_type='fulfillment_client'
           and entity_id='${CLIENT}' order by created_at desc limit 1`)?.id
  : null;

/** Call it. A refusal is a RUN — the function reached its own rule. */
const runs = (name, sql) => {
  try {
    q.query(`begin; ${as(OWNER)} ${sql} rollback;`);
    pass += 1; console.log(`  ok   ${name}`);
  } catch (e) {
    const m = String(e.message).replace(/\s+/g, " ");
    /* 42501 and 22023 mean the body executed and decided. Anything else —
       42883 no such operator, 42P01 no such relation, 42703 no such column,
       22P02 bad input — means it never got that far. */
    if (/42501|22023|P0001/.test(m)) { pass += 1; console.log(`  ok   ${name} (refused, which means it ran)`); }
    else { failures.push(name); console.log(`  FAIL ${name}\n       ${m.slice(0, 150)}`); }
  }
};

console.log("\nEVERY FUNCTION WRITTEN TODAY, CALLED\n");

runs("creditops_unstaffed_departments()", `select * from creditops_unstaffed_departments();`);
runs("creditops_coverage_states()", `select * from creditops_coverage_states();`);
runs("creditops_coverage()", `select * from creditops_coverage();`);
runs("creditops_alert_uncovered()", `select public.creditops_alert_uncovered();`);
runs("creditops_status_is_actionable()",
  `select public.creditops_status_is_actionable('Complaints','COMPLAINT COMPLETED');`);
runs("creditops_closed_status_for()", `select public.creditops_closed_status_for('Complaints');`);
runs("names_are_compatible()", `select public.names_are_compatible('Jenny Guzman','Estebania De La Cruz');`);
runs("may_set_agency_policy()",
  `select public.may_set_agency_policy((select id from agencies order by created_at limit 1));`);
runs("client_writable()",
  `select public.client_writable(null, '${GROUP}', (select id from agencies order by created_at limit 1));`);
runs("infra_watch()", `select public.infra_watch();`);
runs("attachment_purge_dispatch()", `select public.attachment_purge_dispatch();`);
runs("set_partner_service()", `select public.set_partner_service('${GROUP}','creditops','${CAT}');`);
runs("set_partner_service() — ending", `select public.set_partner_service('${GROUP}','talentops', null);`);
runs("client_match_for_import() — every branch",
  `select public.client_match_for_import('${GROUP}','clickup','no-task','no-legacy',
     'nobody@example.invalid','5550000000','Nobody At All','1900-01-01');`);

if (CLIENT) {
  runs("client_posts()", `select * from client_posts('${CLIENT}');`);
  runs("client_history()", `select * from client_history('${CLIENT}');`);
  runs("client_note_cross_partner_identity()",
    `select public.client_note_cross_partner_identity(
       (select client_id from fulfillment_clients where id='${CLIENT}'), '${GROUP}');`);
} else {
  console.log("  --   no real client to call the per-client functions on");
}
if (POST) {
  runs("activity_react() — on", `select public.activity_react(${POST}, '👍');`);
  runs("note_edit()", `select public.note_edit(${POST}, 'probe edit');`);
  runs("note_delete()", `select public.note_delete(${POST});`);
  runs("client_feed() — after a withdrawal",
    `select public.note_delete(${POST});
     select count(*)::int from client_feed('${CLIENT}') where activity_id = ${POST};`);
  runs("activity_react() — off", `select public.activity_react(${POST}, '👍'), public.activity_react(${POST}, '👍');`);
} else {
  console.log("  --   no post to react to");
}

console.log(`\n${pass} passed, ${failures.length} failed\n`);
process.exit(failures.length === 0 ? 0 : 1);
