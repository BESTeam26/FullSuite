-- One definition of a payable minute, and every current rate expressed as an
-- arrangement.
--
-- The payroll generator already knew what a period owes in minutes: worked
-- time, approved PAID leave on scheduled days, and paid break up to the
-- schedule's allowance. The compensation engine needs the SAME answer, and
-- two copies of that rule would eventually disagree about somebody's pay
-- (rules 2 and 5). So it is lifted out once and both callers read it.
--
-- Then every rate that exists today becomes a `direct_bes` arrangement —
-- BES's cost and the worker's pay are the same number, because until today
-- they were the same number. Nobody's pay changes.

/**
 * What a person is owed minutes for, between two dates.
 *
 * Lifted verbatim out of payroll_generate_internal so the payslip and the
 * compensation engine can never price different periods.
 */
create or replace function public.payable_minutes(p_user uuid, p_from date, p_to date)
returns table(work_minutes integer, paid_leave_minutes integer, paid_break_minutes integer)
language sql stable security definer set search_path = public as $function$
  select coalesce(t.work_min, 0), coalesce(pl.paid_leave_min, 0), coalesce(pb.paid_break_min, 0)
    from (select 1) _
    left join lateral (
      select sum(te.duration_minutes)::int as work_min
        from public.time_entries te
       where te.employee_id = p_user and te.kind = 'work'
         and te.ended_at is not null
         and te.work_date between p_from and p_to
    ) t on true
    /* Break time is paid only up to the schedule's allowance for that day. */
    left join lateral (
      select sum(least(day_break.mins, coalesce(s.break_minutes, 0)))::int as paid_break_min
        from (
          select te.work_date, sum(te.duration_minutes)::int as mins
            from public.time_entries te
           where te.employee_id = p_user and te.kind = 'break'
             and te.ended_at is not null
             and te.work_date between p_from and p_to
           group by te.work_date
        ) day_break
        left join lateral (
          select break_minutes from public.work_schedules ws
           where ws.user_id = p_user and ws.effective_from <= day_break.work_date
           order by ws.effective_from desc limit 1
        ) s on true
    ) pb on true
    /* Approved PAID leave, on days the schedule says they work: each such day
       pays the scheduled shift minus the unpaid lunch. */
    left join lateral (
      select sum(
               greatest(0, (extract(epoch from (s.shift_end - s.shift_start)) / 60)::int - s.lunch_minutes)
             )::int as paid_leave_min
        from public.leave_requests lr
        join public.leave_types lt on lt.id = lr.type_id and lt.paid
        cross join lateral generate_series(
          greatest(lr.starts_on, p_from), least(lr.ends_on, p_to), interval '1 day') as d(day)
        join lateral (
          select * from public.work_schedules ws
           where ws.user_id = p_user and ws.effective_from <= d.day::date
           order by ws.effective_from desc limit 1
        ) s on extract(isodow from d.day)::smallint = any (s.work_days)
       where lr.user_id = p_user and lr.status = 'approved'
    ) pl on true
$function$;
revoke all on function public.payable_minutes(uuid, date, date) from public, anon;
grant execute on function public.payable_minutes(uuid, date, date) to authenticated;
comment on function public.payable_minutes(uuid, date, date) is
  'Worked + paid-leave + allowed paid-break minutes in a range. The single definition used by both the payroll generator and the compensation engine.';

/* ── The segment engine now prices the same minutes the payslip does ────── */
create or replace function public.compensation_segments(p_user uuid, p_from date, p_to date)
returns table(
  arrangement_id uuid, arrangement_type text, compensation_basis text, managing_partner_id uuid,
  currency text, segment_from date, segment_to date, paid_days integer, period_paid_days integer,
  work_minutes integer, agent_cents bigint, bes_cents bigint)
language sql stable security definer set search_path = public as $function$
  with arrangements as (
    select a.*, greatest(a.effective_from, p_from) as seg_from,
           least(coalesce(a.effective_to, p_to), p_to) as seg_to
      from public.compensation_arrangements a
     where a.user_id = p_user
       and a.effective_from <= p_to
       and (a.effective_to is null or a.effective_to >= p_from)
  ), measured as (
    select a.*,
           public.paid_scheduled_days(p_user, a.seg_from, a.seg_to) as seg_days,
           public.paid_scheduled_days(p_user, p_from, p_to) as whole_days,
           (select m.work_minutes + m.paid_leave_minutes + m.paid_break_minutes
              from public.payable_minutes(p_user, a.seg_from, a.seg_to) m) as minutes
      from arrangements a
  )
  select m.id, m.arrangement_type, m.compensation_basis, m.managing_partner_id, m.currency,
         m.seg_from, m.seg_to, m.seg_days, m.whole_days, m.minutes,
         case m.compensation_basis
           when 'hourly'     then round(m.minutes * m.agent_rate_cents / 60.0)::bigint
           when 'daily'      then (m.seg_days * m.agent_rate_cents)::bigint
           when 'per_cutoff' then case when m.whole_days = 0 then m.agent_rate_cents
                                       else round(m.agent_rate_cents * m.seg_days::numeric / m.whole_days)::bigint end
           when 'monthly'    then case when m.whole_days = 0 then 0
                                       else round(public.monthly_share_cents(m.agent_rate_cents, p_from, p_to)
                                                  * m.seg_days::numeric / m.whole_days)::bigint end
         end,
         case m.compensation_basis
           when 'hourly'     then round(m.minutes * m.bes_cost_cents / 60.0)::bigint
           when 'daily'      then (m.seg_days * m.bes_cost_cents)::bigint
           when 'per_cutoff' then case when m.whole_days = 0 then m.bes_cost_cents
                                       else round(m.bes_cost_cents * m.seg_days::numeric / m.whole_days)::bigint end
           when 'monthly'    then case when m.whole_days = 0 then 0
                                       else round(public.monthly_share_cents(m.bes_cost_cents, p_from, p_to)
                                                  * m.seg_days::numeric / m.whole_days)::bigint end
         end
    from measured m
   order by m.seg_from
$function$;
revoke all on function public.compensation_segments(uuid, date, date) from public, anon;
grant execute on function public.compensation_segments(uuid, date, date) to authenticated;

-- ── Every current rate, expressed as a direct arrangement ─────────────────
-- The guard trigger refuses rows without a reason, so the backfill states one.
do $$
declare v_n int;
begin
  insert into public.compensation_arrangements
        (agency_id, user_id, arrangement_type, compensation_basis, agent_rate_cents,
         bes_cost_cents, currency, effective_from, effective_to, reason, created_by)
  select r.agency_id, r.user_id, 'direct_bes', r.rate_type, r.rate_cents,
         r.rate_cents, r.currency, r.effective_from,
         (lead(r.effective_from) over (partition by r.user_id order by r.effective_from) - 1),
         'Backfilled from the pay rate in force. BES paid the worker directly, so cost and pay were one number.',
         r.created_by
    from public.member_pay_rates r
   where not exists (
     select 1 from public.compensation_arrangements a
      where a.user_id = r.user_id and a.effective_from = r.effective_from);
  get diagnostics v_n = row_count;
  raise notice 'compensation_arrangements backfilled: % row(s)', v_n;
end $$;
