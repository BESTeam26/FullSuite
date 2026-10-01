-- An End of Day report is filed for the EASTERN workday (Go-Live Stabilization
-- Pass, 2026-10-01 evening).
--
-- What happened: six people submitted their EOD between 5 and 6 PM Eastern on
-- October 1. Their devices sit in Manila, where it was already 5 AM on
-- October 2, and the page stamped the report with the device's date. The
-- snapshot was then computed for October 2 — a day with no work in it — so
-- six reports and six lead emails said "0 production, 0 minutes".
--
-- The platform's workday is Eastern (FULLSUITE: "All BES workforce times are
-- shown in Eastern Time"; time entries already have time_entry_work_date_is_
-- eastern). The page now sends the Eastern date; this is the server's half:
--
--   1. A work_date later than today in Eastern time is clamped to today. A
--      report cannot be about a day that has not happened.
--   2. At the moment of submission the SNAPSHOT is taken here, from the
--      canonical day activity for the stored date, not accepted from the
--      client. The report is what the system knows the day was (rule 9).
--   3. An insert that lands on a day the person already has a report for
--      says so in words, instead of a unique-violation code.

create or replace function public.eod_set_routing()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r         record;
  v_out     jsonb;
  v_eastern date := (now() at time zone 'America/New_York')::date;
begin
  /* 1. The Eastern workday, whatever the device believed. */
  if new.work_date > v_eastern then
    new.work_date := v_eastern;
  end if;
  if tg_op = 'INSERT' and exists (
       select 1 from public.eod_submissions e
        where e.employee_id = new.employee_id and e.work_date = new.work_date) then
    raise exception 'You already have an End of Day report for % (Eastern). Open it instead of starting another.',
      to_char(new.work_date, 'FMMonth FMDD') using errcode = '23505';
  end if;

  if new.submitted_at is not null
     and (tg_op = 'INSERT' or old.submitted_at is null) then

    /* 2. The day as the system measured it, for the day the report is about. */
    begin
      new.snapshot := coalesce(public.eod_day_activity(new.employee_id, new.work_date), new.snapshot);
    exception when others then
      /* A snapshot failure must not undo a submission; the client's copy stands. */
      null;
    end;

    select * into r from public.eod_route_up_for(new.employee_id);
    new.routed_to      := r.lead_id;
    new.routed_team_id := r.team_id;
    new.routing_reason := r.reason;

    if r.level is not null and r.scope_id is not null then
      new.report_level    := r.level;
      new.report_scope_id := r.scope_id;
      begin
        v_out := public.eod_documents_for(new.employee_id, new.work_date);
        new.report       := jsonb_build_object('documents', v_out -> 'documents');
        new.report_error := v_out ->> 'error';
      exception when others then
        new.report := null;
        new.report_error := sqlerrm;
      end;
    else
      new.report_level    := null;
      new.report_scope_id := null;
      new.report          := null;
      new.report_error    := null;
    end if;
  end if;
  return new;
end $$;
