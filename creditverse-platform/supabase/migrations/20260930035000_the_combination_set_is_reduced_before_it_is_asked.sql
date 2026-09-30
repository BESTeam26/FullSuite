-- The combination set is reduced before it is asked.
--
-- 20260930034000 defined activity_view_combos() as
--   select … from (select distinct …) x where can_view_activity(x.…)
-- and the planner, quite legally, pushed the predicate below the DISTINCT:
-- can_view_activity() ran on all 20,631 rows before they were reduced to
-- 33 combinations — 5.5 s, which the whole change existed to remove.
--
-- The DISTINCT is now MATERIALIZED, so the function is asked 33 times and
-- not 20,631. Same set, same predicate; proven in 034000's proof, which
-- compared the predicate over the combinations themselves.
--
-- Cost impact: less — this is the change 034000 meant to make.

begin;

create or replace function public.activity_view_combos()
returns table(agency_id uuid, organization_id uuid, visibility public.activity_visibility, entity_type text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with combos as materialized (
    select distinct e.agency_id, e.organization_id, e.visibility, e.entity_type from public.activity_events e
  )
  select x.agency_id, x.organization_id, x.visibility, x.entity_type
    from combos x
   where public.can_view_activity(x.agency_id, x.organization_id, x.visibility, x.entity_type)
$$;

create or replace function public.notification_view_combos()
returns table(agency_id uuid, organization_id uuid, visibility public.activity_visibility, entity_type text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with combos as materialized (
    select distinct n.agency_id, n.organization_id, n.visibility, n.entity_type
      from public.notifications n where n.recipient_id = auth.uid()
  )
  select x.agency_id, x.organization_id, x.visibility, x.entity_type
    from combos x
   where public.can_view_activity(x.agency_id, x.organization_id, x.visibility, x.entity_type)
$$;

commit;
