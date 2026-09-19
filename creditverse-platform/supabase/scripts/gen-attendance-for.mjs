import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
import { writeFileSync } from "node:fs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });
const def = q.query(`select pg_get_functiondef(oid) as d from pg_proc
  where proname='attendance_for' and pronamespace='public'::regnamespace`)[0].d;
const marker = "am.user_id = auth.uid()";
const n = def.split(marker).length - 1;
if (n !== 1) { console.error(`expected exactly one '${marker}', found ${n}`); process.exit(1); }
const patched = def.replace(marker,
  `(am.user_id = auth.uid()
             /* The quarter-close reward sweep runs with NO user session, as
                the service role. It must see everybody, and nothing an
                authenticated caller can do reaches this branch: auth.uid() is
                never null inside the app. */
             or (auth.uid() is null and current_user = 'service_role'))`);
const header = `-- attendance_for, readable by the reward sweep.
--
-- Dee, 2026-09-19: "Build the quarter-close reward evaluator as an Edge
-- Function that imports and uses the SAME canonical attendance scoring
-- engine… Do not duplicate the attendance scoring logic in SQL."
--
-- The engine needs the same attendance facts the app reads, and
-- \`attendance_for\` is SECURITY DEFINER scoped on auth.uid() — a session-less
-- caller sees nobody. Rather than a second derivation for the sweep (the
-- duplicate Dee forbade), the ONE function gains a branch that only the
-- service role, with no user session, can take. Every authenticated call is
-- byte-for-byte unchanged.
--
-- GENERATED from the live definition by supabase/scripts/gen-attendance-for.mjs
-- with a single string replacement, because rewriting a long SQL function from
-- a read of it is how branches get dropped — it has happened three times in
-- this repository and is not happening a fourth.

`;
writeFileSync("supabase/migrations/20260919006000_attendance_for_service_role.sql", header + patched + ";\n");
console.log("written; replacements:", n);
