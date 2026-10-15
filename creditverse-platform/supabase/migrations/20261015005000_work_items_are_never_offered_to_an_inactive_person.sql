-- Work items are never offered to an inactive person.
--
-- Dee, 2026-10-15: "All inactive agents must be hidden by default … and
-- should not be assigned or show to any work or tasks; their name should
-- not even show on the selection from the tasks."
--
-- 20261015003000 made the database refuse an inactive assignee and took the
-- inactive out of the client pickers. One list was still unfiltered:
-- assignable_profiles(), which My Work, the workspaces and BES CRM read for
-- their assignee pickers, returned every agency membership whatever its
-- status. It now returns active members only. Authorization is unchanged:
-- who may SEE the list is exactly as before; what the list contains is
-- narrower.
--
-- Cost impact: none.

create or replace function public.assignable_profiles(p_scope public.work_scope, p_org uuid default null)
returns table(id uuid, full_name text, email text, role text)
language sql stable security definer set search_path = public as $function$
  select p.id, p.full_name, p.email::text, am.role::text
    from public.agency_memberships am
    join public.profiles p on p.id = am.user_id
   where p_scope = 'AGENCY'
     and am.status = 'active'
     and (public.is_manager_of(am.agency_id)
          or exists (select 1 from public.team_memberships tm
                       join public.teams t on t.id = tm.team_id
                      where tm.user_id = auth.uid() and tm.is_lead and t.agency_id = am.agency_id))
  union all
  select p.id, p.full_name, p.email::text, om.role::text
    from public.org_memberships om
    join public.profiles p on p.id = om.user_id
   where p_scope = 'ORGANIZATION'
     and om.organization_id = p_org
     and om.archived_at is null
     and (public.is_org_admin(p_org)
          or (public.bes_engaged_with(p_org) and public.is_manager_of(public.org_agency(p_org))))
$function$;
