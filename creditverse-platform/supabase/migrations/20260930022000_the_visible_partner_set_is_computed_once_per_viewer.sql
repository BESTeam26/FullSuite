-- The visible partner set is computed once per viewer, not once per partner.
--
-- `creditops_visible_group_ids()` — the set the client policy hoists — asked
-- `bes_holds_partner(g)` and `can_see_partner(g)` for every partner, and each
-- of those re-derived the viewer's context (staff of the agency, admin,
-- operations seat, managed departments, managed services, own teams) from
-- scratch: ~16 ms a partner, 93 ms for the set, and the client policy is
-- evaluated one to three times per CreditOps statement.
--
-- Same predicate, restated so the viewer's context is resolved ONCE and
-- joined to the partners. Nothing about who sees what changes; proven by
-- comparing the old and new sets per account inside one transaction.
--
-- Cost impact: less, on every CreditOps read.

begin;

create or replace function public.creditops_visible_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  with agencies as (
    select a.id,
           public.is_staff_of(a.id)           as staff,
           public.is_admin_of(a.id)           as admin,
           public.has_operations_scope(a.id)  as ops
      from (select distinct g.agency_id as id from public.outsourcing_groups g) a
  ),
  my_teams as (
    select tm.team_id
      from public.team_memberships tm
      join public.teams t on t.id = tm.team_id and t.archived_at is null
     where tm.user_id = auth.uid()
  ),
  managed_depts as (select public.managed_departments() as id),
  managed_svcs  as (select public.managed_services()    as service)
  select g.id
    from public.outsourcing_groups g
    join agencies ag on ag.id = g.agency_id
   where ag.staff                                   -- bes_holds_partner
     and g.lifecycle <> 'archived'
     and (
       ag.admin                                     -- can_see_partner
       or exists (
         select 1 from public.partner_assignments a
          where a.group_id = g.id and a.ended_on is null
            and (a.user_id = auth.uid()
                 or a.team_id in (select team_id from my_teams)
                 or (a.team_id is not null and exists (
                       select 1 from public.teams t
                        where t.id = a.team_id and t.archived_at is null
                          and t.department_id in (select id from managed_depts)))))
       or ag.ops
       or exists (
         select 1 from public.fulfillment_engagements e
          where e.outsourcing_group_id = g.id
            and public.engagement_is_live(e.status, e.effective_from, e.effective_to)
            and e.service in (select service from managed_svcs))
     )
$$;

comment on function public.creditops_visible_group_ids() is
  'bes_holds_partner(g) AND can_see_partner(g) for every partner, with the '
  'viewer''s context resolved once. The set the CreditOps client policy hoists.';

commit;
