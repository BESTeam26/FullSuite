#!/usr/bin/env node
/**
 * Who may correct a comment, who may withdraw one, and what survives.
 *
 * Dee, 2026-09-24: "I CANT DELETE COMMENTS IN CREDITOPS, I should have delete
 * and edit capability."
 *
 * The rule has three parts and each is easy to get wrong in a different
 * direction: too narrow and Dee cannot tidy her own team's file, too wide and
 * somebody rewrites a status change, and a delete that really deletes would
 * take a row out of the file's audit trail.
 *
 * ── THE FIXTURE IS INSERTED AS THE OWNER, ON PURPOSE ──────────────────────
 *
 * Writing a note in ANOTHER person's name is refused by the insert policy, so
 * a scenario that sets itself up as the acting user fails at its setup and
 * reports a refusal that has nothing to do with the rule being measured. That
 * has now happened three times today in three different probes. The note is
 * created before any role is assumed; only the ACTION runs as the person.
 *
 * Run: node supabase/scripts/comment-edit-probe.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "/Users/dee_gallardo/BES-Platform/creditverse-platform/supabase/scripts/lib/sync-query.mjs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("file:///Users/dee_gallardo/BES-Platform/creditverse-platform/supabase/scripts/lib/") });
const who = (n) => q.query(`select m.user_id u from agency_memberships m join profiles p on p.id=m.user_id where p.full_name='${n}'`)[0].u;
const as = (u) => `set local role authenticated; do $c$ begin perform set_config('request.jwt.claims','{"sub":"${u}","role":"authenticated"}',true); end $c$;`;
const DEE = who("Dee Gallardo"), JET = who("Jet Manugas"), IVAN = who("Ivan L. Olympia");
const C = q.query(`select id from fulfillment_clients where outsourcing_group_id='4e8a6a80-f90b-4f66-8bfb-41ce8aa16656' order by name limit 1`)[0].id;
const AG = q.query(`select agency_id a from fulfillment_clients where id='${C}'`)[0].a;

const mk = (author) => `insert into activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, detail, visibility)
  values ('${AG}','fulfillment_client','${C}','${author}','probe','Internal note','probe note','bes_internal') returning id`;
const sys = `insert into activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, detail, field, visibility)
  values ('${AG}','fulfillment_client','${C}',null,'system','Status changed','x','status','bes_internal') returning id`;

/* The fixture note is inserted as the CONNECTION OWNER, before any role is
   assumed — otherwise the insert policy refuses to let one person write a
   note in another's name and the scenario fails at its setup instead of at
   the thing being measured. */
let pass = 0; const failures = [];
const scenario = (label, setup, actor, action, want) => {
  let got;
  try {
    q.query(`begin; ${setup} ${as(actor)} ${action} rollback;`);
    got = "allowed";
  } catch (e) {
    got = /42501|22023/.test(String(e.message)) ? "refused" : `error: ${String(e.message).replace(/\s+/g, " ").slice(0, 70)}`;
  }
  if (got === want) { pass += 1; console.log(`  ok   ${label} — ${got}`); }
  else { failures.push(label); console.log(`  FAIL ${label}\n       expected ${want}, got ${got}`); }
};

console.log("\nEDIT AND DELETE, AS REAL PEOPLE\n");
const NOTE = (author) => `create temp table t on commit drop as with n as (${mk(author)}) select id from n; grant select on t to authenticated;`;
const ID = `(select id from t)`;

scenario("Jet edits his OWN note", NOTE(JET), JET, `select public.note_edit(${ID}, 'corrected');`, "allowed");
scenario("Jet deletes his OWN note", NOTE(JET), JET, `select public.note_delete(${ID});`, "allowed");
scenario("Jet edits IVAN's note", NOTE(IVAN), JET, `select public.note_edit(${ID}, 'nope');`, "refused");
scenario("Jet deletes IVAN's note", NOTE(IVAN), JET, `select public.note_delete(${ID});`, "refused");
scenario("Dee edits Jet's note (manager)", NOTE(JET), DEE, `select public.note_edit(${ID}, 'ok');`, "allowed");
scenario("anybody edits a STATUS CHANGE", `create temp table t on commit drop as with n as (${sys}) select id from n; grant select on t to authenticated;`, DEE,
  `select public.note_edit(${ID}, 'rewrite history');`, "refused");
/* Two statements, deliberately. `client_feed` is STABLE, so asked in the SAME
   statement as the delete it reads the snapshot from before it — and would
   report the note still showing when it had gone. */
scenario("a deleted note leaves the feed", NOTE(JET), JET,
  `select public.note_delete(${ID});
   select (select count(*)::int from client_feed('${C}') where detail='probe note') as still_showing;`, "allowed");
scenario("…and is still in the table, for the audit", NOTE(JET), JET,
  `select public.note_delete(${ID});
   reset role;
   select (deleted_at is not null) as withdrawn, (deleted_by is not null) as by_whom
     from activity_events where id = ${ID};`, "allowed");

console.log(`\n${pass} passed, ${failures.length} failed\n`);
process.exit(failures.length === 0 ? 0 : 1);
