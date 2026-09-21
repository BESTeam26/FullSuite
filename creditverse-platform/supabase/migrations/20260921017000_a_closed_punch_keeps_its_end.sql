-- A finished punch keeps the end it finished at.
--
-- Found 2026-09-21 while building the accumulated break timer Dee asked for:
-- her My Time showed a break of 4h 31m, a lunch of 4h 31m and three more
-- lunches, all overlapping each other and all ending at the same instant.
-- Thirty-nine rows across four people were wrong — Dee, James, Archie, Mark.
--
-- ── ONE CAUSE, TWO SHAPES ─────────────────────────────────────────────────
--
-- `time_entries_guard` is a BEFORE UPDATE trigger. For any hand that is not a
-- manager and not the system it did this:
--
--     if new.ended_at is not null then
--       ... new.ended_at := now();           -- or start + cap, past 10 hours
--
-- It never asked whether the row was being CLOSED. So an update to an
-- ALREADY-CLOSED entry — for any reason, touching any column — silently moved
-- its end to the moment of that update:
--
--   * updated within 10 hours of its start  → end became now()
--       11 rows, all ending 2026-09-21 18:19:24 Eastern. That was this
--       project's own `work_date` repair in 20260921014000, whose two UPDATE
--       statements ran WITHOUT `bes.time_system = '1'`. The repair was right;
--       running it unflagged let the guard rewrite the ends of every row it
--       corrected. Recorded plainly because the next repair must set the flag.
--   * updated more than 10 hours after its start → end became start + the
--     10-hour cap, and the row was stamped `auto_stopped`
--       28 rows, every one exactly 600 minutes, going back to 2026-09-03.
--       These did NOT come from the auto-stop sweep: that only touches open
--       entries. They are closed entries updated the following day.
--
-- The one-open-entry index has held since 20260903000600, so no two punches
-- were ever open at once. Every overlap was created afterwards, by the guard.
--
-- ── THE FIX ───────────────────────────────────────────────────────────────
--
-- The clock-out rule applies to a CLOSE, not to an edit. An entry that is
-- already closed keeps its end, whatever an update carries; the agent still
-- cannot set it, because it is pinned to the stored value exactly as
-- `started_at` and `work_date` already were. Correcting a finished entry
-- remains what it has always been: an approved adjustment, or a manager's own
-- hand (rule 11 — never silently overwrite a historical operational record).

create or replace function public.time_entries_guard() returns trigger
language plpgsql security definer set search_path = public as $function$
begin
  if coalesce(current_setting('bes.time_system', true), '') = '1'
     or public.is_manager_of(old.agency_id) then
    return new;  -- the system's own hand, or a manager's decision
  end if;
  new.started_at := old.started_at;
  new.work_date  := old.work_date;
  new.employee_id := old.employee_id;
  new.agency_id   := old.agency_id;
  new.auto_stopped := old.auto_stopped;
  if old.ended_at is not null then
    /* Already finished. Its end is history, and an edit is not a clock-out. */
    new.ended_at := old.ended_at;
  elsif new.ended_at is not null then
    /* Closing now: whatever was sent, a clock-out is the moment it happened. */
    if now() >= old.started_at + public.timer_cap() then
      new.ended_at := old.started_at + public.timer_cap();
      new.auto_stopped := true;
    else
      new.ended_at := now();
    end if;
  end if;
  return new;
end $function$;

comment on function public.time_entries_guard() is
  'An agent may not set their own start, day or end. A clock-out is stamped at the moment it happens and capped; an already-closed entry keeps its end, because an edit is not a clock-out (2026-09-21).';

-- ── The thirty-nine already damaged ───────────────────────────────────────
/* The true end of a rewritten entry is not recoverable, so it is not
   invented. What IS certain is that somebody cannot be in two places at once:
   an entry ended no later than the next punch that person made. Clamping to
   that instant is exactly what `start_break`, `resume_work` and `clock_out`
   would have written, and it can only ever SHORTEN a record — no entry grows,
   no timestamp moves forward, and `duration_minutes` recomputes from the two
   timestamps because it is generated.

   Under the system flag, deliberately: without it this very statement would
   trip the bug it is repairing. */
do $$
declare v_fixed int;
begin
  perform set_config('bes.time_system', '1', true);
  with nx as (
    select a.id,
           (select min(b.started_at) from public.time_entries b
             where b.employee_id = a.employee_id and b.started_at > a.started_at) as next_start
      from public.time_entries a
     where a.ended_at is not null
  )
  update public.time_entries t
     set ended_at = nx.next_start,
         /* It was never auto-stopped; the guard's cap branch said so wrongly. */
         auto_stopped = case when t.duration_minutes = 600 then false else t.auto_stopped end
    from nx
   where nx.id = t.id and nx.next_start is not null and t.ended_at > nx.next_start;
  get diagnostics v_fixed = row_count;
  raise notice 'time entries clamped to the next punch: %', v_fixed;
  perform set_config('bes.time_system', '', true);
end $$;
