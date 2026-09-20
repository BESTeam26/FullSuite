/**
 * Attendance does not chase somebody who does not clock in.
 *
 * One line changes in a long function, so it is regenerated from the live
 * definition by exact replacement rather than retyped.
 *
 * Run: node supabase/scripts/gen-attendance-skips-the-exempt.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
import { writeFileSync } from "node:fs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });

let fn = q.query(`select pg_get_functiondef(oid) as d from pg_proc
  where proname='attendance_for' and pronamespace='public'::regnamespace`)[0].d;

const marker = `      from public.agency_memberships am
     where am.status = 'active'`;
const n = fn.split(marker).length - 1;
if (n !== 1) { console.error(`expected one marker, found ${n}`); process.exit(1); }
fn = fn.replace(marker, `      from public.agency_memberships am
     where am.status = 'active'
       /* Dee, 2026-09-20: "The only ones who are not required to track hours
          are Dee and Aaron." Somebody exempt has no schedule BY DESIGN, so
          leaving them in produced a "no schedule" row against their name
          every single day — a standing reminder to fix something that is not
          broken. They are not absent; they are not in this question. */
       and am.time_tracking_required`);

writeFileSync(new URL("../migrations/20260920006200_attendance_skips_whoever_does_not_clock_in.sql", import.meta.url),
`-- Attendance is silent about people who do not clock in.
--
-- The founders are exempt from tracking (20260920006100), which means they
-- have no work schedule on purpose. \`attendance_for\` still listed them, so
-- every day produced a "no schedule" row against their names and the team
-- attendance card counted them under "people have no work schedule yet — set
-- schedules on the Workforce page". A standing instruction to fix something
-- that is not broken trains people to ignore the notice.
--
-- They are not absent. They are not part of this question.
--
-- Regenerated from the live definition — see
-- supabase/scripts/gen-attendance-skips-the-exempt.mjs.

${fn};
`);
console.log("written");
