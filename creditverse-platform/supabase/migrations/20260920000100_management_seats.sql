-- D-021 locked (Dee, 2026-09-20): "Role = experience. Management placement =
-- scope. Capability = action." A manager's reach comes from the SEAT they
-- hold — chief operations, a division, a department — not from team
-- membership, not from partner assignments, and never from a capability
-- alone. Design: ARCHITECTURE_PROPOSAL_MANAGEMENT_PLACEMENT.md.
--
-- Part 1 — the placement table, the canonical scope helpers, and the two
-- branches. Nothing an Agent or a Team Lead could reach before changes;
-- nothing about money is touched.

-- ── 1. One placement table ───────────────────────────────────────────────────
create table if not exists public.management_seats (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  seat           text not null check (seat in ('chief_operations', 'division_manager', 'department_manager')),
  division_id    uuid references public.divisions(id) on delete cascade,
  department_id  uuid references public.departments(id) on delete cascade,
  effective_from date not null default current_date,
  effective_to   date,
  reason         text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  check ((seat = 'division_manager')   = (division_id is not null)),
  check ((seat = 'department_manager') = (department_id is not null)),
  check (effective_to is null or effective_to >= effective_from)
);
comment on table public.management_seats is
  'Where a person sits in management: chief operations (organization operations scope), a division, or a department. Team Lead stays team_memberships.is_lead. Placement is scope; capabilities are actions; money is neither.';
create index if not exists management_seats_user_idx on public.management_seats (user_id) where effective_to is null;
create index if not exists management_seats_division_idx on public.management_seats (division_id) where effective_to is null;
create index if not exists management_seats_department_idx on public.management_seats (department_id) where effective_to is null;

alter table public.management_seats enable row level security;
revoke all on public.management_seats from public, anon;
grant select, insert, update on public.management_seats to authenticated;
-- Placement is an organizational fact every staff member may read (the org
-- chart shows it); only an administrator changes it.
drop policy if exists management_seats_select on public.management_seats;
create policy management_seats_select on public.management_seats for select to authenticated using (public.is_staff_of(agency_id));
drop policy if exists management_seats_insert on public.management_seats;
create policy management_seats_insert on public.management_seats for insert to authenticated with check (public.is_admin_of(agency_id));
drop policy if exists management_seats_update on public.management_seats;
create policy management_seats_update on public.management_seats for update to authenticated using (public.is_admin_of(agency_id)) with check (public.is_admin_of(agency_id));

create or replace function public.seat_is_live(p_from date, p_to date) returns boolean
language sql immutable as $function$ select p_from <= current_date and (p_to is null or p_to >= current_date) $function$;

-- Audit + projections. departments.manager_id and divisions.lead_id stay as
-- DISPLAY projections of the live seat (the org chart reads them); nothing
-- authorizes on them any more.
create or replace function public.management_seats_after_change() returns trigger
language plpgsql security definer set search_path = public as $function$
declare v_actor text; r record;
begin
  r := coalesce(new, old);
  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
  values (r.agency_id, 'profile', r.user_id::text, auth.uid(), v_actor,
          case when tg_op = 'INSERT' then 'Management seat granted' when new.effective_to is not null and old.effective_to is null then 'Management seat ended' else 'Management seat changed' end,
          'management_seat',
          case when tg_op = 'INSERT' then null else old.seat || coalesce(' ' || old.division_id::text, '') || coalesce(' ' || old.department_id::text, '') || ' ' || old.effective_from || '→' || coalesce(old.effective_to::text, 'open') end,
          new.seat || coalesce(' ' || new.division_id::text, '') || coalesce(' ' || new.department_id::text, '') || ' ' || new.effective_from || '→' || coalesce(new.effective_to::text, 'open'),
          'bes_internal');
  if r.department_id is not null then
    update public.departments d set manager_id = (
      select s.user_id from public.management_seats s where s.department_id = d.id and s.seat = 'department_manager'
        and public.seat_is_live(s.effective_from, s.effective_to) order by s.effective_from desc, s.created_at desc limit 1)
     where d.id = r.department_id;
  end if;
  if r.division_id is not null then
    update public.divisions dv set lead_id = (
      select s.user_id from public.management_seats s where s.division_id = dv.id and s.seat = 'division_manager'
        and public.seat_is_live(s.effective_from, s.effective_to) order by s.effective_from desc, s.created_at desc limit 1)
     where dv.id = r.division_id;
  end if;
  return null;
end $function$;
drop trigger if exists management_seats_after_change on public.management_seats;
create trigger management_seats_after_change after insert or update on public.management_seats
  for each row execute function public.management_seats_after_change();

-- ── 2. Canonical scope helpers — every one reads seats, nothing else ─────────
create or replace function public.has_operations_scope(p_agency uuid) returns boolean
language sql stable security definer set search_path = public as $function$
  select public.is_admin_of(p_agency)
      or exists (select 1 from public.management_seats s
                  where s.user_id = auth.uid() and s.agency_id = p_agency and s.seat = 'chief_operations'
                    and public.seat_is_live(s.effective_from, s.effective_to))
$function$;
comment on function public.has_operations_scope(uuid) is 'Organization-wide OPERATIONS scope: administrator, or a live Chief Operations seat. Grants no money.';

create or replace function public.managed_divisions() returns setof uuid
language sql stable security definer set search_path = public as $function$
  select dv.id from public.divisions dv
   where dv.archived_at is null
     and (exists (select 1 from public.management_seats s where s.user_id = auth.uid() and s.agency_id = dv.agency_id
                    and s.seat = 'chief_operations' and public.seat_is_live(s.effective_from, s.effective_to))
       or exists (select 1 from public.management_seats s where s.user_id = auth.uid() and s.seat = 'division_manager'
                    and s.division_id = dv.id and public.seat_is_live(s.effective_from, s.effective_to)))
$function$;

create or replace function public.managed_departments() returns setof uuid
language sql stable security definer set search_path = public as $function$
  select d.id from public.departments d
   where d.archived_at is null
     and (d.division_id in (select public.managed_divisions())
       or exists (select 1 from public.management_seats s where s.user_id = auth.uid() and s.seat = 'department_manager'
                    and s.department_id = d.id and public.seat_is_live(s.effective_from, s.effective_to)))
$function$;

create or replace function public.managed_teams() returns setof uuid
language sql stable security definer set search_path = public as $function$
  select t.id from public.teams t
   where t.archived_at is null
     and (t.department_id in (select public.managed_departments())
       or exists (select 1 from public.team_memberships tm where tm.team_id = t.id and tm.user_id = auth.uid() and tm.is_lead))
$function$;

create or replace function public.managed_services() returns setof public.fulfillment_service
language sql stable security definer set search_path = public as $function$
  select distinct dv.service from public.divisions dv where dv.id in (select public.managed_divisions())
$function$;

-- The management-scope path. Explicit, separate from the agent path.
create or replace function public.management_reach(p_agency uuid, p_service public.fulfillment_service, p_team uuid) returns boolean
language sql stable security definer set search_path = public as $function$
  select public.has_operations_scope(p_agency)
      or (p_team is not null and exists (select 1 from public.teams t where t.id = p_team and t.agency_id = p_agency and t.id in (select public.managed_teams())))
      /* A record on no team belongs to its division; its division managers reach it. */
      or (p_team is null and p_service is not null and p_service in (select public.managed_services()))
$function$;
comment on function public.management_reach(uuid, public.fulfillment_service, uuid) is
  'Operational management visibility from placement: chief operations, or the record''s team in a managed department/division, or a team-less record in a managed division. Never money.';

do $$ declare f text; begin
  foreach f in array array['has_operations_scope(uuid)','managed_divisions()','managed_departments()','managed_teams()','managed_services()','management_reach(uuid, public.fulfillment_service, uuid)','seat_is_live(date, date)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ── 3. The two branches ──────────────────────────────────────────────────────
create or replace function public.in_scope(p_agency uuid, p_division public.fulfillment_service, p_team uuid, p_assignee uuid default null, p_creator uuid default null)
returns boolean language sql stable security definer set search_path = public as $function$
  select public.is_admin_of(p_agency)
  or (p_assignee is not null and p_assignee = auth.uid())
  or (p_team is not null and exists (
        select 1 from public.teams t
         where t.id = p_team and t.agency_id = p_agency and t.archived_at is null
           and t.department_id in (select public.my_departments())))
  or (p_team is not null and exists (
        select 1 from public.team_memberships tm
          join public.teams t on t.id = tm.team_id
         where tm.team_id = p_team and tm.user_id = auth.uid()
           and t.agency_id = p_agency and t.archived_at is null))
  or (p_team is not null
      and exists (select 1 from public.teams t where t.id = p_team and t.agency_id = p_agency)
      and public.is_team_lead_of(p_team))
  /* D-021: management placement. The only new line. */
  or public.management_reach(p_agency, p_division, p_team)
$function$;

create or replace function public.can_see_partner(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $function$
  select p_group is not null and exists (
    select 1 from public.outsourcing_groups g
     where g.id = p_group
       and (
         public.is_admin_of(g.agency_id)
         or (
           public.is_staff_of(g.agency_id)
           and (
             exists (
               select 1 from public.partner_assignments a
                where a.group_id = g.id and a.ended_on is null
                  and (a.user_id = auth.uid()
                       or (a.team_id is not null and exists (
                             select 1 from public.team_memberships tm join public.teams t on t.id = tm.team_id
                              where tm.team_id = a.team_id and tm.user_id = auth.uid() and t.archived_at is null))
                       /* A team in a department you manage (was departments.manager_id; now the seat). */
                       or (a.team_id is not null and exists (
                             select 1 from public.teams t where t.id = a.team_id and t.archived_at is null
                                and t.department_id in (select public.managed_departments())))))
             /* D-021: a partner serviced through a division you manage. */
             or public.has_operations_scope(g.agency_id)
             or exists (
               select 1 from public.fulfillment_engagements e
                where e.outsourcing_group_id = g.id
                  and public.engagement_is_live(e.status, e.effective_from, e.effective_to)
                  and e.service in (select public.managed_services()))
           )
         )
       )
  )
$function$;

-- ── 4. Workforce helpers read placement ──────────────────────────────────────
create or replace function public.may_view_workforce_record(p_agency uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $function$
  select p_user = auth.uid()
    or exists (
      select 1 from public.team_memberships lead_m
        join public.team_memberships member_m on member_m.team_id = lead_m.team_id
       where lead_m.user_id = auth.uid() and lead_m.is_lead and member_m.user_id = p_user)
    /* Agency-wide by role or by an agency-scoped management profile (the
       Managing Partner's workforce administration). */
    or exists (
      select 1 from public.agency_memberships me
       where me.user_id = auth.uid() and me.agency_id = p_agency and me.status = 'active'
         and (me.role = 'agency_admin' or (public.agency_can('ops.manage') and me.scope = 'agency')))
    or public.has_operations_scope(p_agency)
    /* The person sits on a team in a department or division you manage. */
    or exists (
      select 1 from public.team_memberships tm
       where tm.user_id = p_user and tm.team_id in (select public.managed_teams()))
$function$;

create or replace function public.holds_management_view(p_agency uuid) returns boolean
language sql stable security definer set search_path = public as $function$
  select public.is_manager_of(p_agency)
      or exists (select 1 from public.team_memberships tm join public.teams t on t.id = tm.team_id
                  where tm.user_id = auth.uid() and tm.is_lead and t.agency_id = p_agency and t.archived_at is null)
      or exists (select 1 from public.management_seats s where s.user_id = auth.uid() and s.agency_id = p_agency
                  and public.seat_is_live(s.effective_from, s.effective_to))
$function$;

create or replace function public.managed_people() returns table(user_id uuid)
language sql stable security definer set search_path = public as $function$
  select distinct m.user_id
    from public.agency_memberships m
    join public.profiles p on p.id = m.user_id
   where m.status = 'active'
     and coalesce(p.is_fixture, false) = false
     and m.user_id <> auth.uid()
     and public.may_view_workforce_record(m.agency_id, m.user_id)
     and (
       exists (select 1 from public.team_memberships tm where tm.user_id = auth.uid() and tm.is_lead)
       or exists (select 1 from public.agency_memberships me
                   where me.user_id = auth.uid() and me.status = 'active'
                     and (me.role = 'agency_admin' or public.agency_can('ops.manage')))
       or exists (select 1 from public.management_seats s where s.user_id = auth.uid() and public.seat_is_live(s.effective_from, s.effective_to))
     )
$function$;

create or replace function public.creditops_directory_visible(p_agency uuid) returns boolean
language sql stable security definer set search_path = public as $function$
  select public.is_admin_of(p_agency)
      or public.has_operations_scope(p_agency)
      or ('creditops'::public.fulfillment_service in (select public.managed_services()))
      or ('creditops' = any (array(select public.my_divisions())) and public.agency_can('creditops.clients.view'))
$function$;
