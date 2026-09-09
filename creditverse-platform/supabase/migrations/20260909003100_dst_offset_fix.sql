-- The DST finder read the SESSION's timezone offset, not the target zone's
-- (extract(timezone from …) describes the connection, not the argument), so
-- it found no transitions and the sweep put nothing on the calendar. The
-- offset is now the difference between the same wall-clock instant read in
-- UTC and in the zone — which is the zone's offset by definition, DST and
-- all. Verified before shipping: Nov 1 2026 fall back, Mar 14 2027 spring
-- forward for America/New_York.
create or replace function public.next_dst_transitions(p_tz text, p_from date, p_count int default 2)
returns table (transition_on date, direction text)
language sql stable set search_path = public as $function$
  with days as (
    select d::date as day,
           extract(epoch from (((d::date::timestamp + interval '12 hours') at time zone 'UTC')
                             - ((d::date::timestamp + interval '12 hours') at time zone p_tz))) as offset_s
      from generate_series(p_from - 1, p_from + 500, interval '1 day') d
  )
  select day,
         case when offset_s > lag_offset then 'spring_forward' else 'fall_back' end
    from (select day, offset_s, lag(offset_s) over (order by day) as lag_offset from days) x
   where lag_offset is not null and offset_s <> lag_offset and day >= p_from
   order by day
   limit p_count
$function$;

select public.dst_calendar_sweep();
