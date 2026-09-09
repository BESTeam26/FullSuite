-- Dee's rule, 2026-09-09: "2 of 15 min breaks are paid. Overbreaks are NOT
-- paid." So an hourly payslip pays work + approved paid leave + BREAK time
-- up to each day's allowance from the schedule in force that day — and not
-- a minute past it. Lunch stays unpaid (the schedule's lunch allowance is
-- the unpaid meal, exactly as leave-day pay already treats it). The payslip
-- carries the paid-break figure so the arithmetic is inspectable, never
-- implied.
alter table public.payslips
  add column if not exists paid_break_minutes integer not null default 0;

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
         work_minutes, paid_leave_minutes, paid_break_minutes, base_cents)
  select p_cutoff, c.agency_id, m.user_id, r.rate_type, r.rate_cents, r.currency,
         coalesce(t.work_min, 0),
         coalesce(pl.paid_leave_min, 0),
         coalesce(pb.paid_break_min, 0),
         case r.rate_type
           when 'per_cutoff' then r.rate_cents
           else ((coalesce(t.work_min, 0) + coalesce(pl.paid_leave_min, 0)
                  + coalesce(pb.paid_break_min, 0))::numeric
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
    /* Breaks: paid per day up to that day's allowance, never past it. */
    left join lateral (
      select sum(least(day_break.mins, coalesce(s.break_minutes, 0)))::int as paid_break_min
        from (
          select te.work_date, sum(te.duration_minutes)::int as mins
            from public.time_entries te
           where te.employee_id = m.user_id and te.kind = 'break'
             and te.ended_at is not null
             and te.work_date between c.period_start and c.period_end
           group by te.work_date
        ) day_break
        left join lateral (
          select break_minutes from public.work_schedules ws
           where ws.user_id = m.user_id and ws.effective_from <= day_break.work_date
           order by ws.effective_from desc limit 1
        ) s on true
    ) pb on true
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
