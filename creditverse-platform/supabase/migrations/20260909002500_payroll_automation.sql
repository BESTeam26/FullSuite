-- =============================================================================
-- Payroll automation — the cutoff runs itself (Dee's rules, 2026-09-09).
--
--   "1–15 is paid on the 25th; 16–end is paid on the 10th. Changeable in
--    settings. The report generates itself the day after the cutoff, agents
--    are reminded to verify their hours, changes lock 5 days after, and the
--    goal is to lessen manual work for agents and admins."
--
-- The pipeline, entirely deterministic (rule 9):
--
--   period ends
--     → next sweep creates the cutoff and computes every payslip
--     → each agent is told: "verify by {lock date}; payday {payday}"
--     → an APPROVED time adjustment inside the window recomputes the draft
--       payslips by itself — nobody regenerates anything by hand
--     → the day before the lock, one reminder
--     → on the lock date: new adjustment requests for the period are REFUSED
--       by the database, the payslips recompute one final time, and the
--       admins are told the total that is ready to release
--     → RELEASE stays a human act — money leaving is a decision, everything
--       before it is arithmetic.
-- =============================================================================

-- ── Settings are data ─────────────────────────────────────────────────────
create table public.payroll_settings (
  agency_id          uuid primary key references public.agencies(id) on delete cascade,
  enabled            boolean not null default false,
  scheme             text not null default 'semi_monthly' check (scheme in ('semi_monthly')),
  /** Period 1 = 1..split_day; period 2 = split_day+1..end of month. */
  split_day          integer not null default 15 check (split_day between 10 and 20),
  /** Payday for period 1, a day of the SAME month. */
  payday_first       integer not null default 25 check (payday_first between 1 and 28),
  /** Payday for period 2, a day of the NEXT month. */
  payday_second      integer not null default 10 check (payday_second between 1 and 28),
  /** Adjustment requests for a period are refused this many days after it ends. */
  verify_window_days integer not null default 5 check (verify_window_days between 1 and 15),
  timezone           text not null default 'UTC',
  updated_by         uuid references public.profiles(id) on delete set null,
  updated_at         timestamptz not null default now()
);
alter table public.payroll_settings enable row level security;
create policy payroll_settings_select on public.payroll_settings
  for select to authenticated
  using (is_staff_of(agency_id) and (agency_can('payroll.view') or agency_can('payroll.manage')));
grant select on public.payroll_settings to authenticated;

create or replace function public.set_payroll_settings(
  p_enabled boolean, p_split_day integer, p_payday_first integer,
  p_payday_second integer, p_verify_window_days integer, p_timezone text
) returns void
language plpgsql security definer set search_path = public as $function$
declare v_agency uuid; v_actor text;
begin
  select agency_id into v_agency from public.agency_memberships
   where user_id = auth.uid() and status = 'active' limit 1;
  if v_agency is null or not public.agency_can('payroll.manage') then
    raise exception 'Payroll settings need the payroll permission' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Unknown timezone: %', p_timezone;
  end if;
  insert into public.payroll_settings
        (agency_id, enabled, split_day, payday_first, payday_second, verify_window_days, timezone, updated_by)
  values (v_agency, p_enabled, p_split_day, p_payday_first, p_payday_second, p_verify_window_days, p_timezone, auth.uid())
  on conflict (agency_id) do update
    set enabled = excluded.enabled, split_day = excluded.split_day,
        payday_first = excluded.payday_first, payday_second = excluded.payday_second,
        verify_window_days = excluded.verify_window_days, timezone = excluded.timezone,
        updated_by = excluded.updated_by, updated_at = now();

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
  values (v_agency, 'payroll_cutoff', v_agency::text, auth.uid(), v_actor,
          'Payroll settings changed', 'settings', null,
          format('enabled=%s split=%s paydays=%s/%s lock+%sd tz=%s',
                 p_enabled, p_split_day, p_payday_first, p_payday_second, p_verify_window_days, p_timezone),
          'bes_internal'::public.activity_visibility);
end;
$function$;
revoke execute on function public.set_payroll_settings(boolean, integer, integer, integer, integer, text) from public, anon;
grant execute on function public.set_payroll_settings(boolean, integer, integer, integer, integer, text) to authenticated;

-- ── Cutoffs learn their automation fields ─────────────────────────────────
alter table public.payroll_cutoffs
  add column if not exists payday date,
  add column if not exists auto_generated boolean not null default false,
  add column if not exists verification_locks_on date,
  add column if not exists agents_notified_at timestamptz,
  add column if not exists final_reminder_at timestamptz,
  add column if not exists ready_notified_at timestamptz;

-- ── The generator splits: checks in the wrapper, arithmetic inside ────────
create or replace function public.payroll_generate_internal(p_cutoff uuid)
returns integer
language plpgsql security definer set search_path = public as $function$
declare
  c record;
  n integer;
begin
  select * into c from public.payroll_cutoffs where id = p_cutoff;
  if not found then raise exception 'Cutoff not found'; end if;
  if c.status <> 'draft' then
    raise exception 'This cutoff is released. Released payroll is history.';
  end if;

  delete from public.payslips where cutoff_id = p_cutoff;

  insert into public.payslips
        (cutoff_id, agency_id, user_id, rate_type, rate_cents, currency,
         work_minutes, paid_leave_minutes, base_cents)
  select p_cutoff, c.agency_id, m.user_id, r.rate_type, r.rate_cents, r.currency,
         coalesce(t.work_min, 0),
         coalesce(pl.paid_leave_min, 0),
         case r.rate_type
           when 'per_cutoff' then r.rate_cents
           else ((coalesce(t.work_min, 0) + coalesce(pl.paid_leave_min, 0))::numeric
                 * r.rate_cents / 60)::bigint
         end
    from public.agency_memberships m
    join lateral (
      select rate_type, rate_cents, currency
        from public.member_pay_rates r
       where r.user_id = m.user_id and r.effective_from <= c.period_end
       order by r.effective_from desc limit 1
    ) r on true
    left join lateral (
      select sum(te.duration_minutes)::int as work_min
        from public.time_entries te
       where te.employee_id = m.user_id and te.kind = 'work'
         and te.ended_at is not null
         and te.work_date between c.period_start and c.period_end
    ) t on true
    left join lateral (
      select sum(
               greatest(0, (extract(epoch from (s.shift_end - s.shift_start)) / 60)::int - s.lunch_minutes)
             )::int as paid_leave_min
        from public.leave_requests lr
        join public.leave_types lt on lt.id = lr.type_id and lt.paid
        cross join lateral generate_series(
          greatest(lr.starts_on, c.period_start),
          least(lr.ends_on, c.period_end), interval '1 day') as d(day)
        join lateral (
          select * from public.work_schedules ws
           where ws.user_id = m.user_id and ws.effective_from <= d.day::date
           order by ws.effective_from desc limit 1
        ) s on extract(isodow from d.day)::smallint = any (s.work_days)
       where lr.user_id = m.user_id and lr.status = 'approved'
    ) pl on true
   where m.agency_id = c.agency_id and m.status = 'active';

  get diagnostics n = row_count;
  return n;
end;
$function$;
revoke execute on function public.payroll_generate_internal(uuid) from public, anon, authenticated;

create or replace function public.generate_payroll(p_cutoff uuid)
returns integer
language plpgsql security definer set search_path = public as $function$
declare c record;
begin
  select * into c from public.payroll_cutoffs where id = p_cutoff;
  if not found then raise exception 'Cutoff not found'; end if;
  if not public.is_staff_of(c.agency_id) or not public.agency_can('payroll.manage') then
    raise exception 'Generating payroll needs the payroll permission' using errcode = '42501';
  end if;
  return public.payroll_generate_internal(p_cutoff);
end;
$function$;

-- ── The lock has teeth: requests for a locked period are refused ──────────
create or replace function public.request_time_adjustment(p_entry uuid, p_ended_at timestamp with time zone, p_reason text)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_entry public.time_entries;
  v_id    uuid;
  v_name  text;
  v_lock  date;
begin
  select * into v_entry from public.time_entries where id = p_entry;
  if v_entry.id is null then
    raise exception 'entry not found' using errcode = 'P0002';
  end if;
  if v_entry.employee_id <> auth.uid() then
    raise exception 'You can only request an adjustment to your own time' using errcode = '42501';
  end if;
  if v_entry.ended_at is null then
    raise exception 'That timer is still running — clock out first' using errcode = '22023';
  end if;
  if p_ended_at <= v_entry.started_at or p_ended_at > now() then
    raise exception 'The corrected stop time must be after the clock started and not in the future' using errcode = '22023';
  end if;

  /* Payroll's verification lock (0255): once a period's window closes, its
     recorded time is what payroll pays. The refusal names the date. */
  select c.verification_locks_on into v_lock
    from public.payroll_cutoffs c
    left join public.payroll_settings s on s.agency_id = c.agency_id
   where c.agency_id = v_entry.agency_id
     and v_entry.work_date between c.period_start and c.period_end
     and c.verification_locks_on is not null
     and (now() at time zone coalesce(s.timezone, 'UTC'))::date >= c.verification_locks_on
   limit 1;
  if v_lock is not null then
    raise exception 'That period locked for payroll on %. Speak to your manager — a released payslip can only be corrected on the next one.', v_lock
      using errcode = '22023';
  end if;

  insert into public.time_adjustment_requests (agency_id, entry_id, requested_by, requested_ended_at, reason)
  values (v_entry.agency_id, p_entry, auth.uid(), p_ended_at, trim(p_reason))
  returning id into v_id;

  select coalesce(nullif(trim(full_name), ''), email) into v_name from public.profiles where id = auth.uid();
  insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  select distinct tm2.user_id, v_entry.agency_id, 'timer', 'time_entry', v_entry.id::text,
         'Team EOD', v_name || ' requested a time adjustment',
         'For ' || to_char(v_entry.work_date, 'FMMon DD') || ': ' || left(trim(p_reason), 200),
         'bes_internal'::public.activity_visibility
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id and t.archived_at is null
    join public.team_memberships tm2 on tm2.team_id = tm.team_id and tm2.is_lead
   where tm.user_id = auth.uid()
     and tm2.user_id <> auth.uid();
  return v_id;
end $function$;

-- ── An approved adjustment recomputes the draft payslips by itself ────────
create or replace function public.payroll_recompute_for_entry(p_entry public.time_entries)
returns void
language plpgsql security definer set search_path = public as $function$
declare c record;
begin
  for c in
    select id from public.payroll_cutoffs
     where agency_id = p_entry.agency_id and status = 'draft'
       and p_entry.work_date between period_start and period_end
  loop
    /* A regenerate recomputes from the records and CLEARS manual payslip
       adjustments — which is why manager bonuses/deductions belong after the
       verification lock, when the time has stopped moving. */
    perform public.payroll_generate_internal(c.id);
  end loop;
end;
$function$;
revoke execute on function public.payroll_recompute_for_entry(public.time_entries) from public, anon, authenticated;

create or replace function public.decide_time_adjustment(p_request uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $function$
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
  if not public.is_manager_of(v_req.agency_id)
     and not exists (
       select 1
         from public.team_memberships lead_m
         join public.team_memberships member_m on member_m.team_id = lead_m.team_id
        where lead_m.user_id = auth.uid() and lead_m.is_lead
          and member_m.user_id = v_req.requested_by
     ) then
    raise exception 'Deciding an adjustment needs a lead of their team, or management access'
      using errcode = '42501';
  end if;

  select * into v_entry from public.time_entries where id = v_req.entry_id;

  update public.time_adjustment_requests
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_request;

  if p_approve then
    update public.time_entries
       set ended_at = v_req.requested_ended_at, auto_stopped = false
     where id = v_req.entry_id;
    /* Draft payslips over this day recompute themselves (0255): nobody
       presses Regenerate because a lead said yes. */
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
end $function$;

-- ── The sweep: the day after a period, everything happens by itself ───────
create or replace function public.payroll_auto_sweep()
returns void
language plpgsql security definer set search_path = public as $function$
declare
  s record;
  c record;
  today date;
  p_start date; p_end date; v_payday date; v_cutoff uuid; v_n int;
  v_total bigint; v_people int; v_currency text;
begin
  for s in select * from public.payroll_settings where enabled loop
    today := (now() at time zone s.timezone)::date;

    /* The most recent COMPLETED period. */
    if extract(day from today)::int > s.split_day then
      p_start := date_trunc('month', today)::date;
      p_end   := make_date(extract(year from today)::int, extract(month from today)::int, s.split_day);
    else
      p_end   := (date_trunc('month', today) - interval '1 day')::date;
      p_start := make_date(extract(year from p_end)::int, extract(month from p_end)::int, s.split_day + 1);
    end if;

    /* Nothing to compute until at least one person has a rate — a cutoff of
       zero payslips would only manufacture noise. */
    if not exists (
         select 1 from public.member_pay_rates r
         join public.agency_memberships m on m.user_id = r.user_id and m.status = 'active'
        where m.agency_id = s.agency_id and r.effective_from <= p_end)
    then continue; end if;

    if not exists (
         select 1 from public.payroll_cutoffs c2
        where c2.agency_id = s.agency_id
          and daterange(c2.period_start, c2.period_end, '[]') && daterange(p_start, p_end, '[]'))
    then
      v_payday := case
        when extract(day from p_end)::int = s.split_day
          then make_date(extract(year from p_end)::int, extract(month from p_end)::int, s.payday_first)
        else (date_trunc('month', p_end) + interval '1 month' + make_interval(days => s.payday_second - 1))::date
      end;

      insert into public.payroll_cutoffs
            (agency_id, period_start, period_end, payday, auto_generated, verification_locks_on)
      values (s.agency_id, p_start, p_end, v_payday, true, p_end + s.verify_window_days)
      returning id into v_cutoff;

      v_n := public.payroll_generate_internal(v_cutoff);

      /* Each agent: your hours are computed — verify them. */
      insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
      select p.user_id, s.agency_id, 'payroll', 'payslip', p.id::text, 'My Time',
             'Your hours for ' || to_char(p_start, 'FMMon DD') || '–' || to_char(p_end, 'FMMon DD') || ' are ready to verify',
             'Recorded: ' || (p.work_minutes / 60) || 'h ' || (p.work_minutes % 60) || 'm worked'
               || case when p.paid_leave_minutes > 0 then ' plus paid leave' else '' end
               || '. Check My Time and request any adjustment before ' || to_char(p_end + s.verify_window_days, 'FMMon DD')
               || ' — after that the period locks. Payday: ' || to_char(v_payday, 'FMMon DD') || '.',
             'bes_internal'::public.activity_visibility
        from public.payslips p where p.cutoff_id = v_cutoff;

      update public.payroll_cutoffs set agents_notified_at = now() where id = v_cutoff;
    end if;

    /* One reminder, the day before the lock. */
    for c in
      select * from public.payroll_cutoffs c2
       where c2.agency_id = s.agency_id and c2.status = 'draft' and c2.auto_generated
         and c2.final_reminder_at is null
         and c2.verification_locks_on = today + 1
    loop
      insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
      select p.user_id, s.agency_id, 'payroll', 'payslip', p.id::text, 'My Time',
             'Last day to verify your hours',
             'The ' || to_char(c.period_start, 'FMMon DD') || '–' || to_char(c.period_end, 'FMMon DD')
               || ' period locks tomorrow. If a recorded time is wrong, request the adjustment today.',
             'bes_internal'::public.activity_visibility
        from public.payslips p where p.cutoff_id = c.id;
      update public.payroll_cutoffs set final_reminder_at = now() where id = c.id;
    end loop;

    /* The lock: recompute once more from the now-settled records, then tell
       the admins what is ready. */
    for c in
      select * from public.payroll_cutoffs c2
       where c2.agency_id = s.agency_id and c2.status = 'draft' and c2.auto_generated
         and c2.ready_notified_at is null
         and c2.verification_locks_on <= today
    loop
      perform public.payroll_generate_internal(c.id);
      select sum(gross_cents), count(*), min(currency) into v_total, v_people, v_currency
        from public.payslips where cutoff_id = c.id;

      insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
      select m.user_id, s.agency_id, 'payroll', 'payroll_cutoff', c.id::text, 'Finance',
             'Payroll ' || to_char(c.period_start, 'FMMon DD') || '–' || to_char(c.period_end, 'FMMon DD') || ' is ready to release',
             'Verification closed. ' || v_people || ' payslips totalling '
               || to_char(v_total / 100.0, 'FM999,999,990.00') || ' ' || v_currency
               || '. Add any bonuses or deductions, then release it from Finance → Payroll. Payday: '
               || coalesce(to_char(c.payday, 'FMMon DD'), 'unset') || '.',
             'bes_internal'::public.activity_visibility
        from public.agency_memberships m
       where m.agency_id = s.agency_id and m.status = 'active' and m.role = 'agency_admin';

      update public.payroll_cutoffs set ready_notified_at = now() where id = c.id;
    end loop;
  end loop;
end;
$function$;
revoke execute on function public.payroll_auto_sweep() from public, anon, authenticated;

select cron.schedule('payroll-auto-sweep', '30 * * * *', $$select public.payroll_auto_sweep()$$)
 where not exists (select 1 from cron.job where jobname = 'payroll-auto-sweep');

-- ── Release pays on the PAYDAY, and the vocabulary grows by one ───────────
create or replace function public.release_payroll(p_cutoff uuid)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  c record;
  v_total bigint;
  v_currencies int;
  v_currency text;
  v_people int;
  v_expense uuid;
  v_actor text;
begin
  select * into c from public.payroll_cutoffs where id = p_cutoff;
  if not found then raise exception 'Cutoff not found'; end if;
  if not public.is_staff_of(c.agency_id) or not public.agency_can('payroll.manage') then
    raise exception 'Releasing payroll needs the payroll permission' using errcode = '42501';
  end if;
  if c.status <> 'draft' then raise exception 'Already released'; end if;

  select sum(gross_cents), count(distinct currency), min(currency), count(*)
    into v_total, v_currencies, v_currency, v_people
    from public.payslips where cutoff_id = p_cutoff;
  if coalesce(v_people, 0) = 0 then
    raise exception 'Generate the payroll first — this cutoff has no payslips';
  end if;
  if v_currencies > 1 then
    raise exception 'Payslips carry more than one currency; one expense cannot honestly total them';
  end if;

  insert into public.agency_expenses
        (agency_id, vendor, description, category, due_date, amount_cents, currency, status, notes)
  values (c.agency_id, 'Payroll',
          'Payroll ' || to_char(c.period_start, 'FMMon DD') || '–' || to_char(c.period_end, 'FMMon DD, YYYY'),
          'payroll', coalesce(c.payday, c.period_end), v_total, v_currency, 'due',
          v_people || ' payslips, released from the payroll cutoff. Source: canonical time and leave records.')
  returning id into v_expense;

  update public.payroll_cutoffs
     set status = 'released', released_by = auth.uid(), released_at = now(), expense_id = v_expense
   where id = p_cutoff;

  /* Each agent gets their payslip the moment it is real. */
  insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  select p.user_id, c.agency_id, 'payroll', 'payslip', p.id::text, 'My Time',
         'Your payslip for ' || to_char(c.period_start, 'FMMon DD') || '–' || to_char(c.period_end, 'FMMon DD') || ' was released',
         'Gross ' || to_char(p.gross_cents / 100.0, 'FM999,999,990.00') || ' ' || p.currency
           || case when p.adjustment_cents <> 0
                   then ' (includes an adjustment: ' || coalesce(p.adjustment_note, 'noted') || ')'
                   else '' end
           || '. Payday: ' || coalesce(to_char(c.payday, 'FMMon DD'), to_char(c.period_end, 'FMMon DD')) || '. See My Time.',
         'bes_internal'::public.activity_visibility
    from public.payslips p where p.cutoff_id = p_cutoff;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
  values (c.agency_id, 'payroll_cutoff', c.id::text, auth.uid(), v_actor,
          'Payroll released', 'status', 'draft',
          'released · ' || v_people || ' payslips · total ' || v_total || ' ' || v_currency, 'bes_internal');
  return v_expense;
end;
$function$;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('assigned', 'unassigned', 'note', 'status', 'mention', 'dm',
                  'handoff', 'announcement', 'attention', 'timer', 'leave', 'payroll'));

-- Dee's stated policy is the seed: 1–15 → 25th; 16–end → 10th; 5-day lock.
-- Disabled until she flips it on — automation that starts itself unasked is
-- the opposite of trust. The timezone follows the agency's EOD timezone.
insert into public.payroll_settings (agency_id, enabled, split_day, payday_first, payday_second, verify_window_days, timezone)
select a.id, false, 15, 25, 10, 5, coalesce(a.eod_timezone, 'UTC')
  from public.agencies a
on conflict (agency_id) do nothing;
