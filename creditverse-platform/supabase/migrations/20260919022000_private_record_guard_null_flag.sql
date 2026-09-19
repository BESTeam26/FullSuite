-- Defect found by member-profile-probe, 2026-09-19: the date-of-birth guard
-- read `current_setting('bes.onboarding_apply', true) = 'on'`, which is NULL
-- when the flag was never set — and `not NULL and …` is not true, so the
-- check never raised. An agent could record their own date of birth. The
-- flag reads default to 'off' now, here and in the Employee ID guard, so an
-- unset flag means "no bypass", never "unknown".

create or replace function public.member_private_records_guard() returns trigger
language plpgsql security definer set search_path = public as $function$
declare v_actor text; v_old date; v_onboarding boolean;
begin
  v_onboarding := coalesce(current_setting('bes.onboarding_apply', true), 'off') = 'on';
  v_old := case when tg_op = 'UPDATE' then old.date_of_birth else null end;
  if new.date_of_birth is distinct from v_old then
    if not v_onboarding and not public.manages_private_record_of(new.user_id) then
      raise exception 'The date of birth is recorded by management, not by the person' using errcode = '42501';
    end if;
    select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
    insert into public.activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
    values (new.agency_id, 'profile', new.user_id::text, auth.uid(), v_actor,
            case when v_onboarding then 'Date of birth recorded from the invitation' else 'Date of birth recorded' end,
            'date_of_birth', v_old::text, new.date_of_birth::text, 'bes_internal');
    update public.profiles
       set birth_month = extract(month from new.date_of_birth)::smallint,
           birth_day   = extract(day from new.date_of_birth)::smallint
     where id = new.user_id and new.date_of_birth is not null;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $function$;

create or replace function public.agency_memberships_protect_employee_code() returns trigger
language plpgsql security definer set search_path = public as $function$
declare v_actor text;
begin
  if new.employee_code is distinct from old.employee_code then
    if coalesce(current_setting('bes.employee_code_recompute', true), 'off') = 'on' then return new; end if;
    if not exists (select 1 from public.agency_memberships m where m.user_id = auth.uid() and m.agency_id = old.agency_id and m.is_owner and m.status = 'active') then
      raise exception 'The Employee ID is assigned once and changed only by the owner' using errcode = '42501';
    end if;
    select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
    insert into public.activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
    values (old.agency_id, 'profile', old.user_id::text, auth.uid(), v_actor, 'Employee ID changed', 'employee_code', old.employee_code, new.employee_code, 'bes_internal');
  end if;
  return new;
end $function$;
