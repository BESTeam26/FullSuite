/**
 * release_payroll books what BES PAYS, not what the workers receive.
 *
 * Two lines change in a long function, so it is regenerated from the live
 * definition by exact string replacement rather than retyped — a retype is
 * how an unrelated line quietly changes.
 *
 * Run: node supabase/scripts/gen-release-books-bes-cost.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
import { writeFileSync } from "node:fs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });
const once = (text, marker, replacement, what) => {
  const n = text.split(marker).length - 1;
  if (n !== 1) { console.error(`${what}: expected one marker, found ${n}`); process.exit(1); }
  return text.replace(marker, replacement);
};

let fn = q.query(`select pg_get_functiondef(oid) as d from pg_proc
  where proname='release_payroll' and pronamespace='public'::regnamespace`)[0].d;

fn = once(fn,
  `  select sum(payout_cents) into v_total
    from public.payslips where cutoff_id = p_cutoff;`,
  `  /* The expense is BES's COST, which is the workers' pay plus any managing
     partner's margin. Booking the workers' side would understate what left
     the bank by exactly the margin. */
  select sum(bes_payout_cents) into v_total
    from public.payslips where cutoff_id = p_cutoff;`,
  "release total");

fn = once(fn,
  `v_people || ' payslips, released from the payroll cutoff. Source: canonical time and leave records; '
            || 'amounts converted at the rate each payslip recorded.')`,
  `v_people || ' payslips, released from the payroll cutoff. Source: canonical time and leave records; '
            || 'amounts converted at the rate each payslip recorded. This is what BES pays out, '
            || 'including any managing partner margin.')`,
  "release note");

writeFileSync(new URL("../migrations/20260920003200_release_books_what_bes_pays.sql", import.meta.url),
`-- The released expense is BES's cost.
--
-- A cutoff used to book the sum of the payslips, which was the same thing
-- while BES paid every worker directly. Under a managing partner it is not:
-- BES pays the partner, and the partner pays the worker less. Booking the
-- workers' total would understate the money that actually left BES.
--
-- Regenerated from the live definition — see
-- supabase/scripts/gen-release-books-bes-cost.mjs.

${fn};
`);
console.log("written");
