-- Work schedules: read and write within management scope.
--
-- Dee, 2026-09-19, Team Management: "each tab proving both UI scope and
-- backend scope." The Schedule tab lists managed_people(); the rows behind it
-- were still authorized on is_manager_of(agency) — company-wide for any
-- manager, the same leak §20b closed for attendance, corrections and rewards
-- (0263). A division manager could read, and SET, every schedule in BES.
--
-- Reads now use may_view_workforce_record: self, a lead of your team, or
-- management within its own scope. Writes keep the management requirement
-- (a lead reads their team's schedule and does not set it — unchanged) and
-- add the same scope check.
--
-- The function is GENERATED from the live definition by
-- supabase/scripts/gen-set-work-schedule.mjs with a single string replacement.

drop policy if exists work_schedules_select on public.work_schedules;
create policy work_schedules_select on public.work_schedules
  for select to authenticated
  using (public.is_staff_of(agency_id) and public.may_view_workforce_record(agency_id, user_id));

CREATE OR REPLACE FUNCTION public.set_work_schedule(p_user uuid, p_work_days smallint[], p_shift_start time without time zone, p_shift_end time without time zone, p_lunch_minutes integer, p_break_minutes integer, p_grace_minutes integer, p_timezone text, p_effective_from date DEFAULT ((now() AT TIME ZONE 'utc'::text))::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agency uuid;
  v_actor text;
  v_id uuid;
  v_before text;
begin
  select agency_id into v_agency
    from public.agency_memberships
   where user_id = p_user and status = 'active'
   limit 1;
  if v_agency is null then
    raise exception 'That person is not an active member of the agency';
  end if;
  /* Management capability, INSIDE the caller's scope. A division manager
     sets schedules for their division, not the company; a team lead reads
     their team's schedule but does not set it (§20b). */
  if not public.is_manager_of(v_agency) then
    raise exception 'Setting a schedule needs management access' using errcode = '42501';
  end if;
  if not public.may_view_workforce_record(v_agency, p_user) then
    raise exception 'That person is outside your management scope' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Unknown timezone: %', p_timezone;
  end if;

  select 'days ' || work_days::text || ' ' || shift_start || '–' || shift_end
    into v_before
    from public.work_schedules
   where user_id = p_user and effective_from <= p_effective_from
   order by effective_from desc limit 1;

  insert into public.work_schedules
        (agency_id, user_id, work_days, shift_start, shift_end,
         lunch_minutes, break_minutes, grace_minutes, timezone,
         effective_from, created_by)
  values (v_agency, p_user, p_work_days, p_shift_start, p_shift_end,
          p_lunch_minutes, p_break_minutes, p_grace_minutes, p_timezone,
          p_effective_from, auth.uid())
  on conflict (user_id, effective_from) do update
    set work_days = excluded.work_days, shift_start = excluded.shift_start,
        shift_end = excluded.shift_end, lunch_minutes = excluded.lunch_minutes,
        break_minutes = excluded.break_minutes, grace_minutes = excluded.grace_minutes,
        timezone = excluded.timezone, created_by = excluded.created_by
  returning id into v_id;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name,
         action, field, previous_value, new_value, visibility)
  values (v_agency, 'work_schedule', p_user::text, auth.uid(), v_actor,
          'Work schedule set', 'schedule', v_before,
          'days ' || p_work_days::text || ' ' || p_shift_start || '–' || p_shift_end
            || ' from ' || p_effective_from,
          'bes_internal');
  return v_id;
end;
$function$
;
