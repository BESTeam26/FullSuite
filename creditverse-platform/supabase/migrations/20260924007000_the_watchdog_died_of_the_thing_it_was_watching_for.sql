-- The watchdog died of the thing it was watching for.
--
-- Dee, 2026-09-24: "Since you already have infra-watch, I would make sure
-- cron.job_run_details failures are now part of that daily health check. A
-- scheduled job failing 44 times should never require someone to query the
-- table manually."
--
-- It already was part of the check. `infra_watch()` counts failed runs in the
-- last 24 hours and notifies the owners. It has never once managed to do it.
--
-- `notifications.entity_type` and `.entity_id` are NOT NULL. Both of
-- `infra_watch`'s inserts omit them. So the function works perfectly right up
-- to the moment it has something to report, and then raises 23502:
--
--   2026-09-22 06:50  succeeded   nothing wrong, so nothing inserted
--   2026-09-23 06:50  FAILED      null value in column "entity_type"
--   2026-09-24 06:50  FAILED      null value in column "entity_type"
--
-- The whole function is one transaction, so the crash also rolled back the
-- day's `infra_readings` row — which is why the last reading is from the 22nd
-- and why "change since yesterday" would have had nothing to compare against
-- even if it had got that far.
--
-- Two days of hourly purge failures, a watchdog built to report exactly that,
-- and the only trace of either was in `cron.job_run_details`. A health check
-- that cannot survive having news is worse than none: it occupies the place
-- where a working one would go.
--
-- ── THE WARNING NOW NAMES THE JOB ─────────────────────────────────────────
--
-- The old text was "N background job run(s) failed yesterday. Check Supabase
-- → Database → Cron." That is a reading without a cause, which the
-- performance doctrine (§20) forbids in as many words: a warning must report
-- the reading, the change, the likeliest source and the action. Somebody
-- reading it still had to go and find out which job, and that is the step
-- nobody takes.
--
-- It now names each failing job, its failure count, and the first line of the
-- actual error — so "attachment-purge (24 runs): cross-database references
-- are not implemented" arrives in the notification instead of in a table.
--
-- Deliberately paused jobs are excluded: they do not run, so they cannot fail,
-- and `cron_job_pauses` already carries their reason.
--
-- Cost impact: no material increase. One extra aggregate over
-- cron.job_run_details, once a day.

begin;

do $$
declare
  v_def text := pg_get_functiondef('public.infra_watch()'::regprocedure);
  v_new text;
begin
  /* Both inserts gain the two NOT NULL columns. The band alert is about the
     project; the job alert is about cron. */
  v_new := replace(v_def,
    E'    insert into public.notifications (recipient_id, agency_id, kind, title, detail, visibility)\n    select m.user_id, m.agency_id, ''attention'', v_title, v_detail, ''bes_internal''\n',
    E'    insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id,\n                                      entity_label, title, detail, visibility)\n    select m.user_id, m.agency_id, ''attention'', ''infrastructure'', current_date::text,\n           ''Supabase plan usage'', v_title, v_detail, ''bes_internal''\n');
  if v_new = v_def then
    raise exception 'the band alert insert did not match — read infra_watch before replacing it';
  end if;

  /* The failed-job alert: named cause, and the paused jobs left out. */
  v_new := replace(v_new,
    E'    insert into public.notifications (recipient_id, agency_id, kind, title, detail, visibility)\n    select m.user_id, m.agency_id, ''attention'',\n           v_failed || '' background job run(s) failed yesterday'',\n           ''Check Supabase → Database → Cron. A job that stops running takes its work with it.'',\n           ''bes_internal''\n',
    E'    insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id,\n                                      entity_label, title, detail, visibility)\n    select m.user_id, m.agency_id, ''attention'', ''cron_job'', ''failures'',\n           ''Scheduled jobs'',\n           v_failed || '' background job run(s) failed yesterday'',\n           coalesce(v_jobs, ''See Supabase → Database → Cron.'')\n             || '' A job that stops running takes its work with it.'',\n           ''bes_internal''\n');
  if position('v_jobs' in v_new) = 0 then
    raise exception 'the failed-job alert insert did not match';
  end if;

  /* The declaration, and the sentence it holds: which jobs, how often, and
     the first line of the error each one raised. */
  v_new := replace(v_new,
    E'  v_title text; v_detail text; v_sent int := 0;',
    E'  v_title text; v_detail text; v_sent int := 0; v_jobs text;');

  v_new := replace(v_new,
    E'  if v_failed > 0 then\n    select id into v_agency from public.agencies order by created_at limit 1;',
    E'  if v_failed > 0 then\n    select id into v_agency from public.agencies order by created_at limit 1;\n\n    /* Name the cause. "3 jobs failed" sends somebody to a table; "attachment-\n       purge (24 runs): cross-database references are not implemented" tells\n       them what broke and roughly where to look (doctrine §20). */\n    select string_agg(x.line, ''; '' order by x.n desc) into v_jobs from (\n      select j.jobname,\n             count(*) as n,\n             j.jobname || '' ('' || count(*) || '' run'' || case when count(*) = 1 then '''' else ''s'' end || ''): ''\n               || coalesce(split_part(btrim(regexp_replace(min(d.return_message), ''^ERROR:\\s*'', '''')), chr(10), 1),\n                           ''no message'') as line\n        from cron.job_run_details d\n        join cron.job j on j.jobid = d.jobid\n       where d.status <> ''succeeded''\n         and d.end_time > now() - interval ''24 hours''\n         and not exists (select 1 from public.cron_job_pauses p where p.jobname = j.jobname)\n       group by j.jobname\n    ) x;');

  execute v_new;
end $$;

/* It runs, it writes today's reading, and — the part that was never true —
   it survives having something to report. */
do $$
declare v_result jsonb;
begin
  v_result := public.infra_watch();
  if (v_result->>'failed_jobs')::int is null then
    raise exception 'infra_watch returned no job count: %', v_result;
  end if;
  if not exists (select 1 from public.infra_readings where taken_on = current_date) then
    raise exception 'infra_watch did not record today''s reading';
  end if;
end $$;

commit;
