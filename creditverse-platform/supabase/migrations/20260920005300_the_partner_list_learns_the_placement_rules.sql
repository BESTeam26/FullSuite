-- The partner list and the partner gate must answer the same question.
--
-- `can_see_partner()` gained its D-021 placement branches: a partner reached
-- through a department you manage, and a partner with a live engagement in a
-- service your division owns. `partners_visible_to_user()` — the parameterised
-- copy the interface and the access report read — never learned them. So a
-- division manager who manages CreditOps could open any of the 22 partners
-- with a live CreditOps engagement, while the list told them "no assignment"
-- for every one.
--
-- The list was the NARROWER of the two, so nothing leaked. What it produced
-- was worse in a quieter way: an access report that understates access. A
-- report nobody can trust is not a control.
--
-- ── ONE DEFINITION, TWO CALLERS ───────────────────────────────────────────
--
-- The scope helpers all read `auth.uid()`, so the list could not ask them
-- about somebody else. Rather than restate the seat rules a second time — the
-- exact drift that caused this — each helper gains a `_for(user)` form and
-- the original becomes a one-line call with `auth.uid()`. There is still one
-- place that knows what a seat reaches.

create or replace function public.managed_divisions_for(p_user uuid) returns setof uuid
language sql stable security definer set search_path = public as $function$
  select dv.id from public.divisions dv
   where dv.archived_at is null
     and (exists (select 1 from public.management_seats s where s.user_id = p_user and s.agency_id = dv.agency_id
                    and s.seat = 'chief_operations' and public.seat_is_live(s.effective_from, s.effective_to))
       or exists (select 1 from public.management_seats s where s.user_id = p_user and s.seat = 'division_manager'
                    and s.division_id = dv.id and public.seat_is_live(s.effective_from, s.effective_to)))
$function$;

create or replace function public.managed_departments_for(p_user uuid) returns setof uuid
language sql stable security definer set search_path = public as $function$
  with direct as (
    select d.id from public.departments d
     where d.archived_at is null
       and (d.division_id in (select public.managed_divisions_for(p_user))
         or exists (select 1 from public.management_seats s where s.user_id = p_user and s.seat = 'department_manager'
                      and s.department_id = d.id and public.seat_is_live(s.effective_from, s.effective_to))))
  select id from direct
  union
  select c.id from public.departments c where c.archived_at is null and c.parent_department_id in (select id from direct)
$function$;

create or replace function public.managed_services_for(p_user uuid) returns setof fulfillment_service
language sql stable security definer set search_path = public as $function$
  select distinct dv.service from public.divisions dv where dv.id in (select public.managed_divisions_for(p_user))
$function$;

create or replace function public.has_operations_scope_for(p_user uuid, p_agency uuid) returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (select 1 from public.agency_memberships m
                  where m.user_id = p_user and m.agency_id = p_agency
                    and m.status = 'active' and m.role = 'agency_admin')
      or exists (select 1 from public.management_seats s
                  where s.user_id = p_user and s.agency_id = p_agency and s.seat = 'chief_operations'
                    and public.seat_is_live(s.effective_from, s.effective_to))
$function$;

/* The originals are now the same question asked about the caller. */
create or replace function public.managed_divisions() returns setof uuid
language sql stable security definer set search_path = public as $function$
  select public.managed_divisions_for(auth.uid())
$function$;
create or replace function public.managed_departments() returns setof uuid
language sql stable security definer set search_path = public as $function$
  select public.managed_departments_for(auth.uid())
$function$;
create or replace function public.managed_services() returns setof fulfillment_service
language sql stable security definer set search_path = public as $function$
  select public.managed_services_for(auth.uid())
$function$;

do $$ declare f text; begin
  foreach f in array array[
    'managed_divisions_for(uuid)', 'managed_departments_for(uuid)',
    'managed_services_for(uuid)', 'has_operations_scope_for(uuid, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

/**
 * Every partner, and whether this person may see it — with the REASON.
 *
 * Now the same four routes `can_see_partner` allows, each named, because the
 * reason is the point: "no assignment" is only useful when it is true.
 */
create or replace function public.partners_visible_to_user(p_user uuid)
returns table(partner_id uuid, partner_name text, allowed boolean, reason text)
language sql stable security definer set search_path = public as $function$
  select g.id, g.name,
         (v.reason is not null),
         coalesce(v.reason, 'no assignment')
    from public.outsourcing_groups g
    cross join lateral (
      select case
        /* Agency-wide BY ROLE, the same rule 0154 established — and, since
           D-021, by holding the Chief Operations seat. */
        when public.has_operations_scope_for(p_user, g.agency_id)
          then 'agency-wide by role'
        /* Assigned by name. */
        when exists (select 1 from public.partner_assignments a
                      where a.group_id = g.id and a.ended_on is null and a.user_id = p_user)
          then 'assigned directly'
        /* Or through a live team they are on — named, because that is the
           thing somebody would go and change. */
        when exists (select 1 from public.partner_assignments a
                       join public.teams t on t.id = a.team_id
                       join public.team_memberships tm on tm.team_id = a.team_id and tm.user_id = p_user
                      where a.group_id = g.id and a.ended_on is null and t.archived_at is null)
          then (select 'via team ' || t.name
                  from public.partner_assignments a
                  join public.teams t on t.id = a.team_id
                  join public.team_memberships tm on tm.team_id = a.team_id and tm.user_id = p_user
                 where a.group_id = g.id and a.ended_on is null and t.archived_at is null
                 limit 1)
        /* D-021: a team in a department they manage. */
        when exists (select 1 from public.partner_assignments a
                       join public.teams t on t.id = a.team_id
                      where a.group_id = g.id and a.ended_on is null and t.archived_at is null
                        and t.department_id in (select public.managed_departments_for(p_user)))
          then (select 'via the department they manage, through team ' || t.name
                  from public.partner_assignments a
                  join public.teams t on t.id = a.team_id
                 where a.group_id = g.id and a.ended_on is null and t.archived_at is null
                   and t.department_id in (select public.managed_departments_for(p_user))
                 limit 1)
        /* D-021: a live engagement in a service their division owns. */
        else (select 'serviced by the ' || e.service || ' division they manage'
                from public.fulfillment_engagements e
               where e.outsourcing_group_id = g.id
                 and public.engagement_is_live(e.status, e.effective_from, e.effective_to)
                 and e.service in (select public.managed_services_for(p_user))
               limit 1)
      end as reason
    ) v
   where (public.can_preview_as_user() or p_user = auth.uid())
     and exists (select 1 from public.agency_memberships m
                  where m.user_id = p_user and m.agency_id = g.agency_id and m.status = 'active')
   order by g.name
$function$;
