-- The EOD day is an Eastern day.
--
-- Dee, 2026-09-28: "Make sure it respects Eastern Time (`America/New_York`)
-- for the workday boundary."
--
-- It does not. `eod_day_activity` decides which day a piece of work belongs to
-- with `(completed_at at time zone 'UTC')::date`, so the boundary is midnight
-- UTC — which is 8pm Eastern in daylight time and 7pm in standard time.
--
-- Demonstrated against the live database:
--
--   work completed 2026-09-28 21:30 America/New_York
--     counted by eod_day_activity on   2026-09-29
--     actually belongs to              2026-09-28
--
-- So everything an agent finishes after 8pm lands on TOMORROW's report, and
-- today's report is missing it. Not a rounding detail: it moves work between
-- two people's days at the exact hour the evening shift is working, and the
-- EOD is what a Team Lead reads to know what happened.
--
-- ── WHY THIS IS CLEARLY A MISTAKE AND NOT A CHOICE ───────────────────────
--
-- Eleven functions in this schema already anchor to America/New_York —
-- `time_entry_work_date_is_eastern`, `team_presence`, `manager_clock_out`,
-- `grant_birthday_rewards`, `leave_requests_enforce_notice` and the rest.
-- `eod_day_activity` is the ONLY function in the whole database that dates
-- anything by UTC. It is the outlier, not the convention.
--
-- `production_logs.work_date` is already a stored date and already correct, so
-- the `logs` CTE is untouched; only the two CTEs that derive a date from a
-- timestamp change.
--
-- The `in_progress`, `overdue` and `blocked` CTEs are point-in-time, not
-- day-bounded, so they are untouched too.
--
-- Cost impact: no material increase. Identical work, one timezone name.

begin;

do $$
declare v_src text; v_new text; v_hits int;
begin
  select pg_get_functiondef(oid) into v_src
    from pg_proc where proname = 'eod_day_activity'
     and pronamespace = 'public'::regnamespace;

  /* Two occurrences, both in the day-bounding CTEs. If the body has changed
     and they are not there, stop rather than write something unintended. */
  v_hits := (length(v_src) - length(replace(v_src, 'at time zone ''UTC'')::date', '')))
            / length('at time zone ''UTC'')::date');
  if v_hits <> 2 then
    raise exception 'expected 2 UTC date casts in eod_day_activity, found % — body changed, not rewriting blind', v_hits;
  end if;

  v_new := replace(v_src,
    'at time zone ''UTC'')::date',
    'at time zone ''America/New_York'')::date');

  execute v_new;
end $$;

/* It actually changed, and it changed the right way. */
do $$
declare v_src text;
begin
  select pg_get_functiondef(oid) into v_src
    from pg_proc where proname = 'eod_day_activity'
     and pronamespace = 'public'::regnamespace;

  if position('at time zone ''UTC'')::date' in v_src) > 0 then
    raise exception 'eod_day_activity still dates work by UTC';
  end if;
  if position('America/New_York' in v_src) = 0 then
    raise exception 'eod_day_activity does not mention America/New_York';
  end if;
  raise notice 'eod_day_activity now bounds the day in Eastern time';
end $$;

/* And the boundary itself behaves: 9:30pm Eastern belongs to that day. */
do $$
declare v_wrong boolean;
begin
  select (timestamptz '2026-09-28 21:30:00-04' at time zone 'America/New_York')::date
         <> date '2026-09-28'
    into v_wrong;
  if v_wrong then
    raise exception 'the Eastern boundary does not land where expected';
  end if;
end $$;

commit;
