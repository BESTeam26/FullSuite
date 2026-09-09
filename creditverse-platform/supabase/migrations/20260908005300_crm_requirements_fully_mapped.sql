----------------------------------------------------------------------
-- 0230  The last 29 requirements get their work unit.
--
-- `crm_requirements_unmapped()` is the completeness gate: a requirement whose
-- kind is `client_requirement` or `qa` is not accounted for until it names
-- the work unit it belongs to, because those kinds only mean something
-- ATTACHED — a client requirement gates a unit, and a QA row is checked
-- inside one. After 0228 the gate reported exactly these 29.
--
-- Where they go:
--
--   The 14 client requirements are all Phase 0 intake, split across the
--   setup engine's three units by what they gate: access items gate
--   "Account & Access"; brand and business inputs gate "Brand & Business
--   Setup"; compliance direction and offer strategy gate "Scope
--   Confirmation" — the build cannot be scoped until BES knows the rules and
--   the offers it must respect.
--
--   The 15 QA requirements — Phase 5, plus the two the classifier moved out
--   of build sections ("Test user permissions by role", "Test AI compliance
--   guardrails") — all attach to "Pre-launch Verification", whose description
--   is already their meaning: everything in scope, checked TOGETHER. The
--   engines' own QA units (Website QA, Sales QA, Fulfillment QA) check work
--   during the build; Phase 5 is the final pass across the whole system, and
--   folding it into the per-engine checks would lose exactly the cross-cutting
--   verification the workbook added a phase for.
--
-- Matching is on `source_section`, the workbook's own grouping — not on row
-- numbers, which an edited sheet renumbers, and not on titles, which get
-- reworded.
----------------------------------------------------------------------

do $map$
declare
  v_agency uuid;
  v_left   integer;
begin
  select id into v_agency from public.agencies order by created_at limit 1;
  if v_agency is null then return; end if;

  update public.crm_requirements r
     set work_unit_template_id = u.id
    from public.crm_work_unit_templates u
    join public.crm_engine_templates t on t.id = u.template_id
   where r.agency_id = v_agency
     and t.agency_id = v_agency and t.version = 1
     and r.work_unit_template_id is null
     and (
       (r.kind = 'client_requirement'
        and t.engine_key = 'project_setup'
        and ((r.source_section = 'Phase 0 · Access'
              and u.title = 'Account & Access')
          or (r.source_section in ('Phase 0 · Brand Assets', 'Phase 0 · Client Inputs')
              and u.title = 'Brand & Business Setup')
          or (r.source_section in ('Phase 0 · Compliance Direction', 'Phase 0 · Offer Strategy')
              and u.title = 'Scope Confirmation')))
       or
       (r.kind = 'qa'
        and t.engine_key = 'qa_launch'
        and u.title = 'Pre-launch Verification')
     );

  select count(*) into v_left
    from public.crm_requirements_unmapped(v_agency);
  if v_left > 0 then
    raise exception 'Build library still has % unmapped requirements after 0230', v_left;
  end if;
  raise notice 'Build library fully mapped: 0 unmapped.';
end $map$;
