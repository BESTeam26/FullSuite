/**
 * The report knows which division a department belongs to.
 *
 * Two changes, both generated from the live definitions:
 *   • the time branch of `report_facts` stops emitting NULL for department;
 *   • a `report_facts_scoped` view resolves every fact to ONE department row,
 *     scoped by its division, and names the division.
 *
 * Run: node supabase/scripts/gen-report-knows-the-division.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
import { writeFileSync } from "node:fs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });

let view = q.query(`select pg_get_viewdef('public.report_facts'::regclass, true) as d`)[0].d;

const marker = `            t.division_id,
            NULL::text,
            t.employee_id,`;
const n = view.split(marker).length - 1;
if (n !== 1) { console.error(`time branch: expected one marker, found ${n}`); process.exit(1); }
view = view.replace(marker, `            t.division_id,
            (select dep.name from public.departments dep where dep.id = t.department_id),
            t.employee_id,`);

writeFileSync(new URL("../migrations/20260920007100_the_report_knows_the_division.mjs.sql", import.meta.url),
`-- Each division's departments are its own, and the report says so.
--
-- Dee, 2026-09-20: "separate each department based in the division. So
-- CreditOps will have its own support department and team while BES CRM and
-- FundingOps and TalentOps have the same logic."
--
-- They already are separate in the structure — \`departments\` carries a
-- \`division_id\`. The REPORT was the part that lost it: \`report_facts\` records
-- a department NAME, so "Support" from CreditOps and "Support" from
-- FundingOps added into one row. That was not hypothetical. Two CreditOps
-- production logs recorded against "Support" were matching FundingOps'
-- Support department, because a name is all the report had to match on.
--
-- Two fixes:
--
--   1. Time now reports its department. It has had one since 20260920007000
--      and the view was still emitting NULL, which is why every department
--      showed zero minutes worked.
--   2. \`report_facts_scoped\` resolves each fact to ONE department row, found
--      inside its own division and by key first, then name. A department that
--      cannot be resolved keeps its raw label rather than disappearing.
--
-- Generated — see supabase/scripts/gen-report-knows-the-division.mjs.

create or replace view public.report_facts as
${view};

/**
 * Every fact, with its division named and its department resolved.
 *
 * The department is looked up INSIDE the fact's own division, so two
 * departments called Support stay two departments. Key first because the
 * production enum spells 'Support' where the structure names it 'Client
 * Success'; name second because a department added later may match that way
 * and nothing else.
 */
create or replace view public.report_facts_scoped as
  select f.*,
         dv.id                                   as division_id,
         coalesce(dv.name, f.service, '—')       as division,
         dep.id                                  as department_id,
         /* Labelled with the division, because "Support" alone is the very
            ambiguity this view exists to remove. */
         case
           when dep.id is not null then dep.name || ' · ' || dv.name
           when f.department is not null then f.department
           else '—'
         end                                     as department_scoped
    from public.report_facts f
    left join public.divisions dv
      on dv.archived_at is null and dv.service::text = f.service
    left join lateral (
      select d.id, d.name from public.departments d
       where d.archived_at is null
         and d.division_id = dv.id
         and f.department is not null
         and (lower(d.key) = lower(f.department) or lower(d.name) = lower(f.department))
       order by (lower(d.key) = lower(f.department)) desc
       limit 1
    ) dep on true;

comment on view public.report_facts_scoped is
  'report_facts with the division named and the department resolved WITHIN that division, so two departments of the same name are never added together.';
revoke all on public.report_facts_scoped from public, anon;
grant select on public.report_facts_scoped to authenticated;
`);
console.log("written");
