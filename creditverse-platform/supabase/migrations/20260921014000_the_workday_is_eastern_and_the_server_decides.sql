-- The workday a punch belongs to is Eastern Time, and the SERVER decides it.
--
-- Dee, 2026-09-21: "Lock BES internal workforce time to America/New_York …
-- Do not let browser/device timezone decide which workday a punch belongs to."
--
-- It was deciding. `localWorkDate()` in the browser read the DEVICE's calendar
-- date and sent it as `work_date`, and the column default fell back to UTC.
-- For the Manila half of the team — twelve hours ahead — a punch made after
-- their local midnight but inside the Eastern working day was filed on
-- TOMORROW. Six entries were already wrong when this was written: Archie,
-- Mark and Paul, all clocked in on the afternoon of 2026-09-21 Eastern and
-- all stamped 2026-09-22. Daily totals, attendance, EOD and payroll grouping
-- all read that column.
--
-- ── WORK IS STAMPED FROM ITS OWN START; REST INHERITS ITS SHIFT ───────────
--
-- A work entry's day is the Eastern date of `started_at`. A break or lunch
-- keeps the day it was given, because `start_break` and `resume_work` copy it
-- from the open work entry — a break belongs to the shift it interrupts, even
-- in the (BES does not have one) case of a shift crossing Eastern midnight.
--
-- The trigger overrides whatever a client sends. That is the point: no
-- browser, present or future, gets a vote on which day somebody worked.

alter table public.time_entries
  alter column work_date set default ((now() at time zone 'America/New_York')::date);

create or replace function public.time_entry_work_date_is_eastern() returns trigger
language plpgsql set search_path = public as $function$
begin
  /* Work: the Eastern date it began, whatever the device believed. */
  if new.kind = 'work' or new.kind is null then
    new.work_date := (new.started_at at time zone 'America/New_York')::date;
  /* Rest: keep the shift's day when the caller supplied one (the canonical
     RPCs copy it from the open entry); otherwise fall back to Eastern. */
  elsif new.work_date is null then
    new.work_date := (new.started_at at time zone 'America/New_York')::date;
  end if;
  return new;
end $function$;

drop trigger if exists time_entries_work_date_eastern on public.time_entries;
create trigger time_entries_work_date_eastern
  before insert on public.time_entries
  for each row execute function public.time_entry_work_date_is_eastern();

comment on function public.time_entry_work_date_is_eastern() is
  'A work entry belongs to the Eastern day it started; rest keeps its shift day. The server decides, never the device (Dee, 2026-09-21).';

-- ── The six already filed on the wrong day ────────────────────────────────
/* A correction to a mis-stamped field, not a rewrite of history: no timestamp
   moves, only the day the hours are counted under. Breaks follow the shift
   they interrupt, which is the same correction. */
update public.time_entries t
   set work_date = (t.started_at at time zone 'America/New_York')::date
 where t.kind = 'work'
   and t.work_date <> (t.started_at at time zone 'America/New_York')::date;

/* A correlated subquery, not a lateral: an UPDATE's FROM cannot see the row
   being updated. Each rest entry takes the day of the work entry it follows. */
update public.time_entries r
   set work_date = (
     select t.work_date from public.time_entries t
      where t.employee_id = r.employee_id and t.kind = 'work' and t.started_at <= r.started_at
      order by t.started_at desc limit 1)
 where r.kind <> 'work'
   and exists (
     select 1 from public.time_entries t
      where t.employee_id = r.employee_id and t.kind = 'work' and t.started_at <= r.started_at
        and t.work_date <> r.work_date
      order by t.started_at desc limit 1);
