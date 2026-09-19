/**
 * attendance_for: a bound that covers a quarter.
 *
 * Found 2026-09-19: the function's bounds CTE required `p_to - p_from < 62`,
 * and an out-of-range call returned NO ROWS rather than an error. The app
 * asks for the current quarter (92 days) — so every attendance score read a
 * clean 15, and the quarter-close sweep would have seen the same emptiness.
 * One string replacement over the LIVE definition; never a retype.
 *
 * Run: node supabase/scripts/gen-attendance-for-range.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
import { writeFileSync } from "node:fs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });
const def = q.query(`select pg_get_functiondef(oid) as d from pg_proc
  where proname='attendance_for' and pronamespace='public'::regnamespace`)[0].d;
const marker = "p_to - p_from < 62   -- bounded, always (rule 7)";
const n = def.split(marker).length - 1;
if (n !== 1) { console.error(`expected exactly one bound, found ${n}`); process.exit(1); }
const patched = def.replace(marker,
  `p_to - p_from < 100  -- bounded, always (rule 7) — and wide enough for one quarter (92 days)`);
const header = `-- attendance_for: the bound covers a quarter.
--
-- Found 2026-09-19 while building People & Teams → Overview: the bounds CTE
-- required p_to - p_from < 62 and an out-of-range call returned NO ROWS, not
-- an error. Every quarter-scoped reader — the Attendance section, the
-- quarterly score, the quarter-close reward sweep — asks for 92 days, so each
-- read an empty quarter: a clean 15 for everyone, no incidents, no streaks,
-- and a sweep that would have found nothing to reward or flag.
--
-- The bound is raised to < 100 days: one quarter with margin, still bounded
-- (rule 7). The client (fetchAttendance) now refuses a wider range loudly
-- instead of ever letting a silent empty result stand in for the truth.
--
-- GENERATED from the live definition by
-- supabase/scripts/gen-attendance-for-range.mjs with a single replacement.

`;
writeFileSync("supabase/migrations/20260919010000_attendance_for_quarter_range.sql", header + patched + ";\n");
console.log("written");
