-- Granting, electing and extending a reward credit.
--
-- Three separate acts with three different rules, so three functions rather
-- than one that takes a verb (Dee's four engines: the reward engine grants and
-- spends; it never decides pay).

-- ── The birthday reward, granted from a verified birthday ─────────────────
--
-- Dee: "Every eligible active contractor receives 1 Birthday Reward Day per
-- year… The system grants it automatically based on their verified birthday."
-- Eligibility is the birthday MONTH, not the day, "so operations has enough
-- flexibility to approve coverage" — and the credit expires with that month.
create or replace function public.grant_birthday_rewards(p_on date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_day date := coalesce(p_on, (now() at time zone 'America/New_York')::date);
  v_granted integer;
begin
  with eligible as (
    select m.agency_id, p.id as user_id, p.birth_month
      from public.profiles p
      join public.agency_memberships m on m.user_id = p.id and m.status = 'active'
     where coalesce(p.is_fixture, false) = false
       and p.birth_month is not null and p.birth_day is not null
       /* Their birthday month, in the agency's own calendar. */
       and p.birth_month = extract(month from v_day)::int
  )
  insert into public.reward_credits (agency_id, user_id, kind, label, issued_on, expires_on)
  select e.agency_id, e.user_id, 'birthday',
         'Birthday Reward ' || extract(year from v_day)::text,
         v_day,
         /* Last day of the birthday month. */
         (date_trunc('month', v_day) + interval '1 month - 1 day')::date
    from eligible e
  /* The unique index is the real guard; this keeps a re-run silent. */
  on conflict do nothing;

  get diagnostics v_granted = row_count;
  return v_granted;
end;
$function$;

comment on function public.grant_birthday_rewards(date) is
  'Grants one Birthday Reward to every active non-fixture person whose birthday month it is. Idempotent — one per person per year, enforced by a unique index rather than by whoever calls it.';

revoke all on function public.grant_birthday_rewards(date) from public, anon;
grant execute on function public.grant_birthday_rewards(date) to authenticated;

-- ── An attendance reward, earned by a 20/20 quarter ───────────────────────
--
-- Not granted from the engine's own reading: a reward that appears and
-- disappears as a score is recalculated is not a reward. A manager (or a
-- scheduled job) records it once, against the named quarter, and the unique
-- label stops it being recorded twice.
create or replace function public.grant_attendance_reward(
  p_user uuid, p_quarter text, p_note text default null
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

  select m.agency_id into v_agency from public.agency_memberships m
   where m.user_id = p_user and m.status = 'active' limit 1;
  if v_agency is null then
    raise exception 'That person is not active staff' using errcode = '42501';
  end if;
  if not public.is_manager_of(v_agency) then
    raise exception 'Issuing a reward needs management access' using errcode = '42501';
  end if;
  if exists (select 1 from public.reward_credits c
              where c.user_id = p_user and c.kind = 'attendance'
                and c.label = p_quarter || ' Attendance Champion') then
    raise exception 'That quarter''s reward has already been issued' using errcode = '23505';
  end if;

  insert into public.reward_credits
    (agency_id, user_id, kind, label, issued_on, expires_on, consumed_note)
  values (v_agency, p_user, 'attendance', p_quarter || ' Attendance Champion',
          (now() at time zone 'America/New_York')::date,
          /* 90 days from issue. No rollover, no cash value. */
          ((now() at time zone 'America/New_York')::date + 90), p_note)
  returning id into v_id;

  insert into public.notifications
    (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  values (p_user, v_agency, 'timer', 'reward_credit', v_id::text, 'Time Off',
          'You earned a paid Reward Day',
          p_quarter || ' Attendance Champion. Use it within 90 days — Reward Days do not roll over.',
          'bes_internal');

  return v_id;
end;
$function$;

revoke all on function public.grant_attendance_reward(uuid, text, text) from public, anon;
grant execute on function public.grant_attendance_reward(uuid, text, text) to authenticated;

-- ── Choosing how to use the birthday reward ───────────────────────────────
--
-- Dee: "I would NOT automatically double-pay someone merely because they
-- failed to submit birthday leave. That creates an exploitable loophole."
-- So the premium is an EXPLICIT election, recorded, and it consumes the credit
-- exactly as taking the day would.
create or replace function public.elect_birthday_reward(
  p_credit uuid, p_election text, p_leave_request uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare c public.reward_credits%rowtype;
begin
  select * into c from public.reward_credits where id = p_credit;
  if not found then raise exception 'No such reward' using errcode = '42501'; end if;
  /* Your own reward, or a manager acting for you. Never somebody else's by
     default — a reward is personal. */
  if c.user_id <> auth.uid() and not public.is_manager_of(c.agency_id) then
    raise exception 'That is not your reward' using errcode = '42501';
  end if;
  if c.kind <> 'birthday' then
    raise exception 'Only a Birthday Reward is elected; a Reward Day is simply booked'
      using errcode = '22023';
  end if;
  if c.consumed_at is not null then
    raise exception 'This Birthday Reward has already been used' using errcode = '22023';
  end if;
  if c.expires_on < (now() at time zone 'America/New_York')::date then
    raise exception 'This Birthday Reward expired on %', to_char(c.expires_on, 'FMMon FMDD')
      using errcode = '22023';
  end if;
  if p_election not in ('paid_day', 'work_premium') then
    raise exception 'Choose a paid day or the 2x working premium' using errcode = '22023';
  end if;

  update public.reward_credits
     set election = p_election,
         elected_at = now(),
         consumed_at = now(),
         consumed_for = case when p_election = 'paid_day' then p_leave_request else null end
   where id = p_credit;
end;
$function$;

revoke all on function public.elect_birthday_reward(uuid, text, uuid) from public, anon;
grant execute on function public.elect_birthday_reward(uuid, text, uuid) to authenticated;

-- ── Extending an expiry, as an audited exception ──────────────────────────
create or replace function public.extend_reward_credit(
  p_credit uuid, p_new_expiry date, p_reason text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare c public.reward_credits%rowtype;
begin
  select * into c from public.reward_credits where id = p_credit;
  if not found then raise exception 'No such reward' using errcode = '42501'; end if;
  if not public.is_manager_of(c.agency_id) then
    raise exception 'Extending a reward needs management access' using errcode = '42501';
  end if;
  if c.consumed_at is not null then
    raise exception 'That reward has already been used' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Say why it is being extended — this is an audited exception'
      using errcode = '22023';
  end if;
  if p_new_expiry <= c.expires_on then
    raise exception 'An extension moves the expiry later' using errcode = '22023';
  end if;

  update public.reward_credits
     set extended_from = coalesce(c.extended_from, c.expires_on),
         expires_on = p_new_expiry,
         extended_by = auth.uid(),
         extend_reason = trim(p_reason)
   where id = p_credit;
end;
$function$;

revoke all on function public.extend_reward_credit(uuid, date, text) from public, anon;
grant execute on function public.extend_reward_credit(uuid, date, text) to authenticated;

-- entity_visible learns the new type, or the reward notification is invisible
-- to the person it congratulates — the exact bug fixed yesterday.
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
    when 'attendance_correction' then exists (
      select 1 from public.attendance_corrections ac where ac.id::text = p_entity_id)
    when 'payslip' then exists (select 1 from public.payslips p where p.id::text = p_entity_id)
    when 'reward_credit' then exists (
      select 1 from public.reward_credits rc where rc.id::text = p_entity_id)
    else false
  end
$function$;
