-- The working day, and the two exemptions that are not the same exemption.
--
-- Dee, 2026-09-20:
--   "All work schedule is 9am to 6pm."
--   "The only ones who are not required to track hours are Dee and Aaron."
--   "The rest must at least clock in and clock out then record their
--    attendance of the day."
--   "Bryan is not qualified for the attendance bonus as part of the
--    management."
--
-- Those are TWO different exemptions and one flag cannot hold both. Bryan
-- clocks in like everybody else and simply does not earn the bonus; Dee and
-- Aaron do neither. Collapsing them would either start demanding a clock-in
-- from the founders or quietly enter Bryan for a prize he is not eligible
-- for.
--
--   time_tracking_required      false for Dee and Aaron
--   attendance_reward_eligible  false for Bryan, and for anyone not tracking
--
-- Both default TRUE, so a new hire is required to clock in and does earn the
-- bonus unless somebody says otherwise. Default to the ordinary case.

alter table public.agency_memberships
  add column if not exists time_tracking_required boolean not null default true,
  add column if not exists attendance_reward_eligible boolean not null default true;

comment on column public.agency_memberships.time_tracking_required is
  'Whether this person must clock in and out. False for the founders (Dee, 2026-09-20); their days are not scored and not reported as missing.';
comment on column public.agency_memberships.attendance_reward_eligible is
  'Whether this person can earn the quarterly attendance bonus. Management tracks time without competing for it. Never true while time_tracking_required is false — there is nothing to score.';

/* The rule, not the names: nobody who is exempt from tracking can win a prize
   for attendance. Enforced rather than remembered. */
alter table public.agency_memberships drop constraint if exists membership_reward_needs_tracking;
alter table public.agency_memberships add constraint membership_reward_needs_tracking
  check (not attendance_reward_eligible or time_tracking_required);

do $$
declare v_agency uuid; v_n int; v_sched int := 0; r record;
begin
  select id into v_agency from public.agencies order by created_at limit 1;

  /* The founders: no clock. Found by name because that is what they are —
     configuration, not a rule about owners. A future founder is a row change,
     not a code change. */
  update public.agency_memberships m
     set time_tracking_required = false, attendance_reward_eligible = false
    from public.profiles p
   where p.id = m.user_id and p.full_name in ('Dee Gallardo', 'Aaron Gallardo');
  get diagnostics v_n = row_count;
  raise notice 'Exempt from clocking in: % people', v_n;

  update public.agency_memberships m
     set attendance_reward_eligible = false
    from public.profiles p
   where p.id = m.user_id and p.full_name = 'Bryan Breva';
  get diagnostics v_n = row_count;
  raise notice 'Tracks time, not eligible for the bonus: % people', v_n;

  /* 9am to 6pm for everybody who must track. Monday to Friday is the shape
     every existing schedule uses except Ivan's, which is deliberate and is
     left alone — Dee set the HOURS, not the days. */
  for r in
    select m.user_id from public.agency_memberships m
      join public.profiles p on p.id = m.user_id
     where m.agency_id = v_agency and m.status in ('active', 'invited')
       and m.time_tracking_required and not coalesce(p.is_fixture, false)
       and not exists (select 1 from public.work_schedules ws where ws.user_id = m.user_id)
  loop
    insert into public.work_schedules
      (user_id, agency_id, effective_from, work_days, shift_start, shift_end, lunch_minutes, break_minutes)
    values (r.user_id, v_agency, current_date, '{1,2,3,4,5}', '09:00', '18:00', 60, 30);
    v_sched := v_sched + 1;
  end loop;
  raise notice 'Schedules created at 9am-6pm: %', v_sched;

  /* Bryan was on 8am-4pm. Dee said everybody is 9 to 6. A new dated row, not
     an edit: a schedule is effective-dated so last week is still scored
     against the hours that were true last week. */
  insert into public.work_schedules
    (user_id, agency_id, effective_from, work_days, shift_start, shift_end, lunch_minutes, break_minutes)
  select ws.user_id, ws.agency_id, current_date, ws.work_days, '09:00', '18:00', ws.lunch_minutes, ws.break_minutes
    from public.work_schedules ws
    join public.profiles p on p.id = ws.user_id
   where p.full_name = 'Bryan Breva'
     and ws.effective_from = (select max(x.effective_from) from public.work_schedules x where x.user_id = ws.user_id)
     and (ws.shift_start <> '09:00' or ws.shift_end <> '18:00')
  on conflict (user_id, effective_from) do update
    set shift_start = excluded.shift_start, shift_end = excluded.shift_end;
end $$;
