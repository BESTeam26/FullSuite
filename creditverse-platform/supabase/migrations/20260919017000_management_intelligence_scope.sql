-- Two experiences, one record (Dee, 2026-09-19): "Do NOT expose the full Team
-- Member Profile to ordinary Agents… The Agent must also be unable to retrieve
-- these management records through direct URL, RPC/API, or database policy."
--
-- 1. The performance weighting is management intelligence. It was readable by
--    every staff member (it drives the People & Teams pages, which agents
--    cannot open); now only management and team leads read it.
-- 2. The Employee ID is read-only for everyone except the canonical owner.
--    agency_memberships is admin-writable; a trigger refuses a change to
--    employee_code by anyone but the owner, and the owner's change is audited.

create or replace function public.holds_management_view(p_agency uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select public.is_manager_of(p_agency)
      or exists (select 1 from public.team_memberships tm join public.teams t on t.id = tm.team_id
                  where tm.user_id = auth.uid() and tm.is_lead and t.agency_id = p_agency and t.archived_at is null)
$function$;
comment on function public.holds_management_view(uuid) is
  'Management or a live team lead of this agency — the people who may read performance machinery (weights, sampling, scores). Not a data scope: scope is may_view_workforce_record.';
revoke all on function public.holds_management_view(uuid) from public, anon;
grant execute on function public.holds_management_view(uuid) to authenticated;

drop policy if exists performance_policy_select on public.performance_policy;
create policy performance_policy_select on public.performance_policy
  for select to authenticated using (public.is_staff_of(agency_id) and public.holds_management_view(agency_id));

create or replace function public.agency_memberships_protect_employee_code() returns trigger
language plpgsql security definer set search_path = public as $function$
declare v_actor text;
begin
  if new.employee_code is distinct from old.employee_code then
    if not exists (select 1 from public.agency_memberships m where m.user_id = auth.uid() and m.agency_id = old.agency_id and m.is_owner and m.status = 'active') then
      raise exception 'The Employee ID is assigned once and changed only by the owner' using errcode = '42501';
    end if;
    select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
    insert into public.activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
    values (old.agency_id, 'profile', old.user_id::text, auth.uid(), v_actor, 'Employee ID changed', 'employee_code', old.employee_code, new.employee_code, 'bes_internal');
  end if;
  return new;
end $function$;
drop trigger if exists agency_memberships_protect_employee_code on public.agency_memberships;
create trigger agency_memberships_protect_employee_code before update on public.agency_memberships
  for each row execute function public.agency_memberships_protect_employee_code();
