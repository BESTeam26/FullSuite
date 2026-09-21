/**
 * The workforce engine does not manage the owners.
 *
 * One predicate added to `managed_people()`, generated from the live
 * definition rather than retyped.
 *
 * Run: node supabase/scripts/gen-managed-people-skips-owners.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
import { writeFileSync } from "node:fs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });

let fn = q.query(`select pg_get_functiondef(oid) as d from pg_proc
  where proname='managed_people' and pronamespace='public'::regnamespace`)[0].d;

const marker = `   where m.status = 'active'
     and coalesce(p.is_fixture, false) = false`;
const n = fn.split(marker).length - 1;
if (n !== 1) { console.error(`expected one marker, found ${n}`); process.exit(1); }
fn = fn.replace(marker, `   where m.status = 'active'
     and coalesce(p.is_fixture, false) = false
     /* Dee, 2026-09-21: "AARON AND DEE MUST NOT BE REQUIRED FOR ANYTHING LIKE
        SCHEDULE OR PERFORMANCE OR PAY." An owner appearing here is an owner
        appearing in every management list that reads it — schedules to set,
        performance to score, a pay rate to chase. They run the company; they
        are not measured by it. This limits who is MANAGED, never who may
        look. */
     and coalesce(m.workforce_managed, true)`);

writeFileSync(new URL("../migrations/20260921002100_workforce_lists_skip_the_owners.sql", import.meta.url),
`-- Every workforce list skips whoever the engine does not manage.
--
-- \`managed_people()\` is what Schedule, Attendance, Performance, End of Day
-- and the pay roster all read to decide whose row to draw. Adding the
-- exemption in each of those screens would be five places to forget; adding
-- it here is one.
--
-- This narrows who is MANAGED. It does not narrow who may LOOK — Dee and
-- Aaron still read every one of those screens, they simply no longer appear
-- on them as people with a schedule to set or a score to explain.
--
-- Generated — see supabase/scripts/gen-managed-people-skips-owners.mjs.

${fn};
`);
console.log("written");
