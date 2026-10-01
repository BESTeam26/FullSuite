-- A direct team lead still decides (2026-10-01, same day as 20261001013000).
--
-- 20261001013000 replaced the "leads a team this person is on" branch of
-- decide_time_adjustment() and record_attendance_correction() with
-- managed_people(). That set deliberately excludes fixture profiles — it
-- limits who is MANAGED in real lists, not who may act — and so the matrix's
-- fixture lead could no longer decide a fixture agent's request (phase 70).
-- The placement branch is a widening, not a replacement: both branches stay.

create or replace function public.decide_time_adjustment(p_request uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_req   public.time_adjustment_requests;
  v_entry public.time_entries;
  v_actor text;
begin
  select * into v_req from public.time_adjustment_requests where id = p_request;
  if v_req.id is null then raise exception 'request not found' using errcode = 'P0002'; end if;
  if v_req.status <> 'pending' then
    raise exception 'This request was already decided' using errcode = '22023';
  end if;
  if v_req.requested_by = auth.uid() then
    raise exception 'You cannot decide your own adjustment request' using errcode = '42501';
  end if;
  /* Management authority, a lead of a team the person is on, or the person is
     in the caller's placement scope (department or division seat). */
  if not public.is_manager_of(v_req.agency_id)
     and not exists (
       select 1
         from public.team_memberships lead_m
         join public.team_memberships member_m on member_m.team_id = lead_m.team_id
        where lead_m.user_id = auth.uid() and lead_m.is_lead
          and member_m.user_id = v_req.requested_by)
     and not exists (select 1 from public.managed_people() mp where mp.user_id = v_req.requested_by) then
    raise exception 'Deciding an adjustment needs a lead or manager of this person'
      using errcode = '42501';
  end if;

  select * into v_entry from public.time_entries where id = v_req.entry_id;

  update public.time_adjustment_requests
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_request;

  if p_approve then
    /* The guard bypasses for managers but not for leads — and a lead IS a
       valid decider here. The decision above is the authorization, so this
       one write declares itself to the guard rather than being re-litigated
       (and silently clamped) by it. */
    perform set_config('bes.time_system', '1', true);
    update public.time_entries
       set ended_at = v_req.requested_ended_at, auto_stopped = false
     where id = v_req.entry_id;
    perform set_config('bes.time_system', '', true);
    v_entry.ended_at := v_req.requested_ended_at;
    perform public.payroll_recompute_for_entry(v_entry);
  end if;

  select coalesce(nullif(trim(full_name), ''), email) into v_actor from public.profiles where id = auth.uid();
  insert into public.audit_log (agency_id, actor_id, action, entity_type, entity_id, before, after)
  values (v_req.agency_id, auth.uid(),
          case when p_approve then 'time_adjustment.approved' else 'time_adjustment.declined' end,
          'time_entry', v_req.entry_id::text,
          jsonb_build_object('ended_at', v_entry.ended_at, 'auto_stopped', v_entry.auto_stopped),
          jsonb_build_object('ended_at', case when p_approve then v_req.requested_ended_at else v_entry.ended_at end,
                             'requested_by', v_req.requested_by, 'reason', v_req.reason,
                             'decided_by', auth.uid(), 'note', v_req.decision_note));

  insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  values (v_req.requested_by, v_req.agency_id, 'timer', 'time_entry', v_req.entry_id::text,
          'My Time',
          case when p_approve then 'Your time adjustment was approved' else 'Your time adjustment was declined' end,
          coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Decided by ' || coalesce(v_actor, 'a manager') || '.'),
          'bes_internal'::public.activity_visibility);
end $$;

create or replace function public.record_attendance_correction(p_user uuid, p_date date, p_classification text, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
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
         and member_m.user_id = p_user)
    or exists (select 1 from public.managed_people() mp where mp.user_id = p_user)
  ) then
    raise exception 'Correcting attendance needs a lead or manager of this person'
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
end $$;
