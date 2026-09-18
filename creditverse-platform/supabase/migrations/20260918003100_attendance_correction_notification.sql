-- The notification nobody could see.
--
-- 20260918003000 told the employee their attendance had been corrected, and
-- addressed the notification to `entity_type = 'time_entry'` with the
-- CORRECTION's id. `notifications_select` asks `entity_visible(entity_type,
-- entity_id)`, which for 'time_entry' looks for a `time_entries` row with that
-- id — there is none, so the row was written and then hidden from everybody,
-- including the person it was for.
--
-- The probe caught it, but only after the check itself was wrong twice: first
-- it asked the manager who SENT it (notifications are private to their
-- recipient, so 0 was correct), then it asked the recipient and still got 0 —
-- which is when the real bug showed. Worth recording, because "the test was
-- wrong" is a tempting place to stop.
--
-- `entity_visible` is DEFAULT-DENY on an unknown type, which is what saved
-- this from being a leak in the other direction. It has to learn the type.
--
-- A first attempt also added a CHECK constraint on `notifications.entity_type`,
-- "restoring" a list it read from the function. There is no such constraint and
-- never was, and the invented list omitted `payslip`, which is in use — so it
-- was refused by existing rows. Reading what is actually there beats
-- reconstructing it from something that looks like it.

create or replace function public.entity_visible(p_entity_type text, p_entity_id text)
returns boolean language sql stable set search_path = public as $function$
  select case p_entity_type
    when 'fulfillment_client' then exists (select 1 from public.fulfillment_clients c where c.id::text = p_entity_id)
    when 'funding_client'     then exists (select 1 from public.funding_clients c where c.id::text = p_entity_id)
    when 'work_item'          then exists (select 1 from public.work_items w where w.id::text = p_entity_id)
    when 'funding_file'       then exists (select 1 from public.funding_files f where f.id::text = p_entity_id)
    when 'eod_submission'     then exists (select 1 from public.eod_submissions e where e.id::text = p_entity_id)
    when 'channel'            then exists (select 1 from public.channels c where c.id::text = p_entity_id)
    when 'channel_message'    then exists (select 1 from public.messages m where m.id = public.try_bigint(p_entity_id))
    when 'client'             then exists (select 1 from public.clients c where c.id::text = p_entity_id)
    when 'announcement'       then exists (select 1 from public.announcements a where a.id::text = p_entity_id)
    when 'crm_project'        then exists (select 1 from public.crm_projects p where p.id::text = p_entity_id)
    when 'time_entry'         then exists (select 1 from public.time_entries te where te.id::text = p_entity_id)
    when 'company_document'   then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
                                or exists (select 1 from public.agencies a where a.id::text = p_entity_id)
    when 'organization'       then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
    when 'activity_event'     then exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(p_entity_id))
    when 'partner'            then exists (select 1 from public.outsourcing_groups g where g.id::text = p_entity_id)
    when 'work_schedule'      then exists (select 1 from public.work_schedules ws where ws.user_id::text = p_entity_id)
    when 'leave_request'      then exists (select 1 from public.leave_requests lr where lr.id::text = p_entity_id)
    /* New. The row's own RLS still decides who may read the correction; this
       only stops a notification pointing at something that does not exist. */
    when 'attendance_correction' then exists (
      select 1 from public.attendance_corrections ac where ac.id::text = p_entity_id)
    /* PRE-EXISTING, found while fixing the above: `payslip` notifications are
       written by the payroll release and were never taught here, so every one
       of them has been invisible to the person it was for — the same failure,
       already shipped. One line, because the fix is the same line. */
    when 'payslip' then exists (select 1 from public.payslips p where p.id::text = p_entity_id)
    else false
  end
$function$;

-- ── And point the notification at the right thing ─────────────────────────
create or replace function public.record_attendance_correction(
  p_user uuid, p_date date, p_classification text, p_reason text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := auth.uid();
  v_agency uuid;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_user = v_me then
    raise exception 'You cannot correct your own attendance' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Say why this is being corrected' using errcode = '22023';
  end if;

  select m.agency_id into v_agency
    from public.agency_memberships m
   where m.user_id = p_user and m.status = 'active'
   limit 1;
  if v_agency is null then
    raise exception 'That person is not active staff' using errcode = '42501';
  end if;

  if not (
    public.is_manager_of(v_agency)
    or exists (
      select 1
        from public.team_memberships lead_m
        join public.team_memberships member_m on member_m.team_id = lead_m.team_id
       where lead_m.user_id = v_me and lead_m.is_lead
         and member_m.user_id = p_user
    )
  ) then
    raise exception 'Correcting attendance needs a lead of their team, or management access'
      using errcode = '42501';
  end if;

  insert into public.attendance_corrections
    (agency_id, user_id, work_date, classification, reason, decided_by)
  values (v_agency, p_user, p_date, p_classification, trim(p_reason), v_me)
  returning id into v_id;

  insert into public.notifications
    (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  select p_user, v_agency, 'timer', 'attendance_correction', v_id::text, 'Attendance',
         'Your attendance for ' || to_char(p_date, 'FMMon FMDD') || ' was corrected',
         'Now recorded as ' || replace(p_classification, '_', ' ')
           || ' by ' || coalesce(nullif(trim(pr.full_name), ''), pr.email)
           || '. "' || trim(p_reason) || '"',
         'bes_internal'
    from public.profiles pr where pr.id = v_me;

  return v_id;
end;
$function$;

revoke all on function public.record_attendance_correction(uuid, date, text, text) from public, anon;
grant execute on function public.record_attendance_correction(uuid, date, text, text) to authenticated;
