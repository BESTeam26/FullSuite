-- The correction in 20260921014000 did nothing, and the reason is a good one.
--
-- `time_entries_guard` pins `work_date` and `started_at` on update unless the
-- caller is a manager or the system itself: an agent must never be able to
-- rewrite which day they worked. A migration is neither of those by default,
-- so the guard put the wrong dates straight back — silently, because that is
-- what a BEFORE trigger does.
--
-- `bes.time_system = '1'` is the system's own hand, the same flag the
-- auto-stop sweep uses. Set for this transaction only, and the repair is the
-- narrowest possible: the day a work entry is counted under, derived from the
-- timestamp it already has. No timestamp moves.

set local bes.time_system = '1';

update public.time_entries t
   set work_date = (t.started_at at time zone 'America/New_York')::date
 where t.kind = 'work'
   and t.work_date <> (t.started_at at time zone 'America/New_York')::date;

update public.time_entries r
   set work_date = (
     select t.work_date from public.time_entries t
      where t.employee_id = r.employee_id and t.kind = 'work' and t.started_at <= r.started_at
      order by t.started_at desc limit 1)
 where r.kind <> 'work'
   and exists (
     select 1 from public.time_entries t
      where t.employee_id = r.employee_id and t.kind = 'work' and t.started_at <= r.started_at
        and t.work_date <> r.work_date);
