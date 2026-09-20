/**
 * The pivot can group by division, and honours a division filter.
 *
 * Generated from the live definition by exact replacement.
 * Run: node supabase/scripts/gen-pivot-by-division.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
import { writeFileSync } from "node:fs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });
const once = (t, m, r, what) => {
  const n = t.split(m).length - 1;
  if (n !== 1) { console.error(`${what}: expected one marker, found ${n}`); process.exit(1); }
  return t.replace(m, r);
};

let fn = q.query(`select pg_get_functiondef(oid) as d from pg_proc
  where proname='report_pivot' and pronamespace='public'::regnamespace`)[0].d;

/* Department becomes the DIVISION-SCOPED department, and division joins the list. */
fn = once(fn,
  `when 'department' then 'coalesce(department, ''—'')'`,
  `when 'department' then 'department_scoped' when 'division' then 'division'`,
  "dimensions");

/* Read from the scoped view, which names the division and resolves the
   department inside it. */
fn = once(fn, `from public.report_facts where fact_date`,
  `from public.report_facts_scoped where fact_date`, "source view");

/* The department filter must scope too, and division becomes filterable. */
fn = once(fn,
  `  if p_filters ? 'department'      then v_where := v_where || format(' and department = %L', p_filters->>'department'); end if;`,
  `  if p_filters ? 'department'      then v_where := v_where || format(' and department_scoped = %L', p_filters->>'department'); end if;
  if p_filters ? 'division'        then v_where := v_where || format(' and division = %L', p_filters->>'division'); end if;`,
  "filters");

writeFileSync(new URL("../migrations/20260920007200_pivot_by_division.sql", import.meta.url),
`-- The report groups by division, and filters by it.
--
-- Dee asked for "the full productivity report for each department, on all
-- divisions… I can filter so I can have full visibility". Division was not a
-- dimension at all; the nearest thing, Service, is the raw key and was the one
-- the BES CRM hyphen split in two.
--
-- Grouping by Department now uses the DIVISION-SCOPED department, so
-- CreditOps Support and FundingOps Support are two rows and always were two
-- different teams.
--
-- Generated — see supabase/scripts/gen-pivot-by-division.mjs.

${fn};
`);
console.log("written");
