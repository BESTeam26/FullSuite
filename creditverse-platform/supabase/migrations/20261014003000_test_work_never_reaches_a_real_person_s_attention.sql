-- Test work never reaches a real person's attention.
--
-- Found 2026-10-14 while reviewing the Attention Center for the four views:
-- seven "[TEST]" fixture work items (is_fixture = true, seeded 2026-09-04
-- for the security matrix) sat in Dee's Attention Center as overdue and
-- blocked exceptions. work_items_select does not look at is_fixture, so a
-- real person sees fixture work wherever it is listed; the attention view
-- is where it costs the most, because the HQ dashboard counts it as work
-- needing a human.
--
-- Dee, 2026-09-30: "test/fixture accounts can NEVER receive production
-- work". 20261003004000 applied that rule to the CreditOps sweep, and
-- 20261003007000 to assignment. This is the same rule for the attention
-- list, in the other direction: a real person is never asked to act on
-- test work. Fixture users (the matrix) still see fixture work, so every
-- existing matrix expectation holds unchanged.
--
-- The view stays security_invoker: work_items_select still decides whose
-- rows appear; this only removes fixture rows for real people.
-- Cost impact: none (is_real_person(auth.uid()) is one indexed lookup per
-- statement; the planner evaluates it once).

create or replace view public.work_attention
with (security_invoker = true) as
select w.id, w.scope, w.organization_id, w.subject_organization_id, w.related_type, w.related_ref,
       w.title, w.description, w.stage, w.priority, w.assigned_to, w.created_by, w.due_at,
       w.completed_at, w.created_at, w.updated_at, w.agency_id, w.division, w.team_id,
       case
         when w.stage = any (array['Blocked'::public.work_stage, 'Attention'::public.work_stage]) then 'blocked'
         when w.due_at is not null and w.due_at < now() then 'overdue'
         when w.due_at is not null and w.due_at < now() + interval '4 hours' then 'sla_risk'
         else null
       end as attention_reason,
       case when w.due_at is null then null::numeric
            else round(extract(epoch from w.due_at - now()) / 3600.0, 1) end as hours_remaining
  from public.work_items w
 where w.completed_at is null
   and (w.stage = any (array['Blocked'::public.work_stage, 'Attention'::public.work_stage])
        or (w.due_at is not null and w.due_at < now() + interval '4 hours'))
   /* test work never reaches a real person's attention */
   and (not coalesce(w.is_fixture, false) or not public.is_real_person(auth.uid()));
