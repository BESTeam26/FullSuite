-- =============================================================================
-- Agency time is Eastern, and the clock change is on the calendar.
--
-- Dee, 2026-09-09: "Default Agency Time is EST. Organization time can be on
-- the organization's timezone, but for agency that's EST. Include the DST
-- change in the announcements/calendar too."
--
-- The agency's eod_timezone and payroll timezone were already
-- America/New_York (Eastern with DST handled by the zone database — "EST"
-- in the operational sense). What still said UTC was the default on new
-- work schedules; it now follows the agency's own clock.
--
-- DST: a deterministic function finds the next clock changes for a zone by
-- arithmetic (no table of dates to go stale), and the daily sweep keeps two
-- system-managed calendar events ahead and announces each change seven days
-- out through the SAME idempotent announcement pipe the holidays use.
-- =============================================================================

alter table public.work_schedules
  alter column timezone set default 'America/New_York';

-- ── Where do the clocks change? Computed, never listed ────────────────────
create or replace function public.next_dst_transitions(p_tz text, p_from date, p_count int default 2)
returns table (transition_on date, direction text)
language sql stable set search_path = public as $function$
  /* A transition day is one whose UTC offset at noon differs from the day
     before. Scanning 500 days of offsets costs nothing and never goes
     stale — the zone database is the single source of truth. */
  with days as (
    select d::date as day,
           extract(timezone from ((d::date::timestamp + interval '12 hours') at time zone p_tz)) as offset_s
      from generate_series(p_from - 1, p_from + 500, interval '1 day') d
  )
  select day,
         case when offset_s > lag_offset then 'spring_forward' else 'fall_back' end
    from (select day, offset_s, lag(offset_s) over (order by day) as lag_offset from days) x
   where lag_offset is not null and offset_s <> lag_offset and day >= p_from
   order by day
   limit p_count
$function$;
revoke execute on function public.next_dst_transitions(text, date, int) from public, anon;
grant execute on function public.next_dst_transitions(text, date, int) to authenticated;

-- ── The sweep: calendar events kept ahead, announcements seven days out ───
create or replace function public.dst_calendar_sweep()
returns void
language plpgsql security definer set search_path = public as $function$
declare
  a record;
  t record;
  v_today date;
  v_key text;
  v_name text;
  v_body text;
begin
  for a in select id, coalesce(eod_timezone, 'America/New_York') as tz from public.agencies loop
    v_today := (now() at time zone a.tz)::date;

    for t in select * from public.next_dst_transitions(a.tz, v_today, 2) loop
      v_key := 'dst:' || a.tz || ':' || t.transition_on;
      v_name := case t.direction
        when 'spring_forward' then 'Clocks spring forward (DST begins)'
        else 'Clocks fall back (DST ends)' end;

      /* The calendar event — system-managed, idempotent by source_key,
         a working day (the clock changes; the work does not stop). */
      insert into public.agency_calendar_events
            (agency_id, kind, source_key, name, event_date, observed_date,
             non_working, notes, system_managed, rule_version)
      values (a.id, 'company_event', v_key, v_name, t.transition_on, t.transition_on,
              false,
              case t.direction
                when 'spring_forward' then 'At 2:00 AM local time the clock jumps to 3:00 AM — the day is 23 hours. Schedules and payroll follow ' || a.tz || ' automatically.'
                else 'At 2:00 AM local time the clock returns to 1:00 AM — the day is 25 hours. Schedules and payroll follow ' || a.tz || ' automatically.'
              end,
              true, 'dst-v1')
      on conflict (agency_id, source_key) do nothing;

      /* Seven days out: one announcement, through the same idempotent pipe
         the holidays use (same source_key = never a duplicate). */
      if t.transition_on - v_today between 0 and 7 then
        v_body := case t.direction
          when 'spring_forward' then
            'On ' || to_char(t.transition_on, 'FMDay, FMMonth DD') || ' clocks spring forward one hour (2:00 AM becomes 3:00 AM ' ||
            a.tz || '). Shift times stay as scheduled in local time — check your first clock-in that day.'
          else
            'On ' || to_char(t.transition_on, 'FMDay, FMMonth DD') || ' clocks fall back one hour (2:00 AM becomes 1:00 AM ' ||
            a.tz || '). Shift times stay as scheduled in local time — check your first clock-in that day.'
        end;
        perform public.publish_holiday_announcement(a.id, v_key, v_name, v_body);
      end if;
    end loop;
  end loop;
end;
$function$;
revoke execute on function public.dst_calendar_sweep() from public, anon, authenticated;

select cron.schedule('dst-calendar-sweep', '15 6 * * *', $$select public.dst_calendar_sweep()$$)
 where not exists (select 1 from cron.job where jobname = 'dst-calendar-sweep');

-- Run once now, so the next two clock changes are on the calendar today,
-- not tomorrow at 06:15.
select public.dst_calendar_sweep();

-- ── Stale deictic announcements are rephrased with their DATE ─────────────
-- "Today is Labor Day" read on September 9th is a small lie on the board
-- (Dee's screenshot). The generator now writes dated titles; this rephrases
-- what it already wrote, deriving each date from the announcement's own
-- calendar event so nothing is guessed.
update public.announcements a
   set title = e.name || ' — ' || to_char(e.observed_date, 'FMMon DD'),
       body  = 'BES is observing the U.S. federal holiday on '
               || to_char(e.observed_date, 'FMDay, DD FMMonth YYYY') || '.'
  from public.agency_calendar_events e
 where a.source_key like 'holiday:%:day'
   and a.title like 'Today is %'
   and e.agency_id = a.agency_id
   and a.source_key = 'holiday:' || replace(e.source_key, 'us:', '') || ':day';

-- ── More kinds of time off (Dee, 2026-09-09) ──────────────────────────────
-- Types are rows, so growing the list is data. Paid/unpaid follows common
-- practice; every one of these is editable or retirable by a manager.
insert into public.leave_types (agency_id, code, label, paid, sort)
select a.id, v.code, v.label, v.paid, v.sort
  from public.agencies a,
       (values ('bereavement',    'Bereavement leave', true,  50),
               ('maternity',      'Maternity leave',   true,  60),
               ('paternity',      'Paternity leave',   true,  70),
               ('emergency',      'Emergency leave',   true,  80),
               ('medical',        'Medical leave',     true,  90),
               ('jury_duty',      'Jury duty',         true, 100)) as v(code, label, paid, sort)
on conflict (agency_id, code) do nothing;
