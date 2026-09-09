----------------------------------------------------------------------
-- 0238  The guard yields to the system's own hand.
--
-- 0236's guard clamps every non-manager update — but the cron sweep runs with
-- no auth.uid() at all, so the guard treated the SYSTEM as an agent and
-- stripped the auto_stopped flag off its own auto-stop (the cap still
-- applied, so the minutes were right and only the label was lost). A null
-- uid can never reach an UPDATE through the API — the table's policy demands
-- employee_id = auth.uid() — so a null uid HERE is by definition a definer
-- function or the sweep, both of which state their own rules.
----------------------------------------------------------------------

create or replace function public.time_entries_guard()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if auth.uid() is null or public.is_manager_of(old.agency_id) then
    return new;  -- the sweep, a definer function, or a manager's decision
  end if;
  new.started_at := old.started_at;
  new.work_date  := old.work_date;
  new.employee_id := old.employee_id;
  new.agency_id   := old.agency_id;
  new.auto_stopped := old.auto_stopped;
  if new.ended_at is not null then
    if new.ended_at > old.started_at + public.timer_cap() then
      new.ended_at := old.started_at + public.timer_cap();
      new.auto_stopped := true;
    else
      new.ended_at := least(new.ended_at, now());
    end if;
    if new.ended_at <= old.started_at then
      new.ended_at := old.started_at + interval '1 minute';
    end if;
  end if;
  return new;
end $function$;

/* The one row the first sweep already closed carries the right minutes but
   lost its label to the old guard; restore the fact. */
update public.time_entries
   set auto_stopped = true
 where ended_at = started_at + public.timer_cap()
   and duration_minutes = 600
   and auto_stopped = false
   and work_date = '2026-09-06';
