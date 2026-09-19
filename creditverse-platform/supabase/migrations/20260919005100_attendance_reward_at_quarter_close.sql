-- An Attendance Reward is earned at quarter CLOSE, not during it.
--
-- Dee, 2026-09-19: "Do NOT grant continuously during the quarter. Evaluate at
-- quarter close." Until now nothing stopped a reward being issued in week two
-- of a quarter that later picked up three lates — and a reward taken back is
-- worse than one that arrived late.
--
-- The rule is enforced HERE rather than by the button: a quarter that has not
-- ended cannot be rewarded, whoever asks.

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
  v_year int;
  v_q int;
  v_quarter_end date;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_automatic boolean := v_me is null;
begin
  /* `p_quarter` is the KEY the uniqueness rule is built on, so it is parsed
     rather than trusted as a label. */
  if p_quarter !~ '^[0-9]{4}-Q[1-4]$' then
    raise exception 'A quarter reads like 2026-Q3' using errcode = '22023';
  end if;
  v_year := split_part(p_quarter, '-Q', 1)::int;
  v_q    := split_part(p_quarter, '-Q', 2)::int;
  v_quarter_end := (make_date(v_year, v_q * 3, 1) + interval '1 month - 1 day')::date;

  if v_today <= v_quarter_end then
    raise exception '% has not closed yet — it ends on %. A reward is earned at quarter close.',
      p_quarter, to_char(v_quarter_end, 'FMMon FMDD, YYYY') using errcode = '22023';
  end if;

  select m.agency_id into v_agency from public.agency_memberships m
   where m.user_id = p_user and m.status = 'active' limit 1;
  if v_agency is null then
    raise exception 'That person is not active staff' using errcode = '42501';
  end if;

  /* `auth.uid()` is null when the sweep runs with no user session. A person
     asking must hold management authority; the sweep is the system itself. */
  if not v_automatic and not public.is_manager_of(v_agency) then
    raise exception 'Issuing a reward needs management access' using errcode = '42501';
  end if;

  insert into public.reward_credits
    (agency_id, user_id, kind, label, source_quarter, issued_automatically,
     issued_on, expires_on, consumed_note)
  values (v_agency, p_user, 'attendance', p_quarter || ' Attendance Champion',
          p_quarter, v_automatic, v_today, v_today + 90, p_note)
  /* The unique index is the guard, so a re-run of the sweep is silent rather
     than an error somebody has to catch. */
  on conflict (user_id, kind, source_quarter) where source_quarter is not null
    do nothing
  returning id into v_id;

  if v_id is null then
    return null;
  end if;

  insert into public.notifications
    (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  values (p_user, v_agency, 'timer', 'reward_credit', v_id::text, 'Time Off',
          'You earned a paid Reward Day',
          p_quarter || ' Attendance Champion. Use it within 90 days — Reward Days do not roll over.',
          'bes_internal');

  return v_id;
end;
$function$;

comment on function public.grant_attendance_reward(uuid, text, text) is
  'Issues the Attendance Champion Reward Day for a CLOSED quarter. Refuses a quarter still running, and the unique index on (user_id, kind, source_quarter) makes a re-run silent rather than a duplicate.';

revoke all on function public.grant_attendance_reward(uuid, text, text) from public, anon;
grant execute on function public.grant_attendance_reward(uuid, text, text) to authenticated;
