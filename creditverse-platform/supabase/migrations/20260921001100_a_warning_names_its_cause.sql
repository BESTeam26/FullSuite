-- A warning that does not name its cause is just alarm.
--
-- Dee, 2026-09-21: "I would extend that doctrine slightly so Claude always
-- reports not just 'usage crossed X%' but also the likely cause… That makes
-- the warning actionable instead of just alarming."
--
--   Connections 78%
--   Change from yesterday: +21%
--   Likely source: increased realtime subscriptions from Communication
--   Recommended action: inspect subscription fan-out before scaling compute
--
-- So the reading now keeps its own evidence: connections broken down by what
-- opened them, and the largest tables. Tomorrow's reading compares itself to
-- yesterday's and names the biggest mover. Nothing is guessed — the cause is
-- whichever line actually grew.
--
-- The recommended action is never "add compute" (§1). It is always to go and
-- look at the thing that moved.

alter table public.infra_readings
  add column if not exists connections_by_source jsonb,
  add column if not exists largest_tables jsonb,
  add column if not exists cause text;

comment on column public.infra_readings.connections_by_source is
  'Connection count per application_name, so a jump can be attributed rather than guessed at.';
comment on column public.infra_readings.largest_tables is
  'The ten largest tables and their bytes, so disk growth can be attributed to the table that grew.';

create or replace function public.infra_watch() returns jsonb
language plpgsql security definer set search_path = public as $function$
declare
  v_bytes bigint; v_conn int; v_limit int; v_failed int;
  v_quota constant bigint := 8 * 1024^3;   -- Pro: 8 GB disk per project
  v_disk_pct int; v_conn_pct int; v_worst int; v_band int; v_last int;
  v_sources jsonb; v_tables jsonb; y record;
  v_agency uuid; v_cause text; v_action text; v_delta text := 'no reading yesterday';
  v_title text; v_detail text; v_sent int := 0;
begin
  select pg_database_size(current_database()) into v_bytes;
  select count(*) into v_conn from pg_stat_activity;
  select setting::int into v_limit from pg_settings where name = 'max_connections';
  select count(*) into v_failed from cron.job_run_details
   where status <> 'succeeded' and end_time > now() - interval '24 hours';

  select coalesce(jsonb_object_agg(coalesce(nullif(application_name, ''), 'unnamed'), n), '{}'::jsonb)
    into v_sources
    from (select application_name, count(*) as n from pg_stat_activity group by 1) s;

  select coalesce(jsonb_object_agg(t, bytes), '{}'::jsonb) into v_tables
    from (select c.relname as t, pg_total_relation_size(c.oid) as bytes
            from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
           order by 2 desc limit 10) x;

  v_disk_pct := (100 * v_bytes / v_quota)::int;
  v_conn_pct := (100 * v_conn / greatest(v_limit, 1))::int;
  v_worst := greatest(v_disk_pct, v_conn_pct);
  v_band := case when v_worst >= 90 then 90 when v_worst >= 75 then 75
                 when v_worst >= 50 then 50 else null end;

  /* Yesterday's reading is the whole basis of "what changed". */
  select * into y from public.infra_readings
   where taken_on < current_date order by taken_on desc limit 1;

  if y.taken_on is not null then
    v_delta := 'disk ' || case when v_bytes >= y.database_bytes then '+' else '' end
            || pg_size_pretty(v_bytes - y.database_bytes)
            || ', connections ' || case when v_conn >= y.connections then '+' else '' end
            || (v_conn - y.connections)::text;

    /* The cause is whichever line actually moved most, named. */
    if v_conn_pct >= v_disk_pct then
      select 'connections from ' || key || ' (' || (value::int - coalesce((y.connections_by_source->>key)::int, 0))::text || ' more than yesterday)'
        into v_cause
        from jsonb_each_text(v_sources)
       order by (value::int - coalesce((y.connections_by_source->>key)::int, 0)) desc limit 1;
      v_action := 'Look at what is holding those connections — realtime subscriptions and pooler settings first. Do not add compute (doctrine §1).';
    else
      select 'growth in ' || key || ' (' || pg_size_pretty(value::bigint - coalesce((y.largest_tables->>key)::bigint, 0)) || ' since yesterday)'
        into v_cause
        from jsonb_each_text(v_tables)
       order by (value::bigint - coalesce((y.largest_tables->>key)::bigint, 0)) desc limit 1;
      v_action := 'Check what is writing to that table and whether it should be retained or pruned. Do not add disk (doctrine §1).';
    end if;
  end if;

  insert into public.infra_readings
        (taken_on, database_bytes, disk_quota_bytes, connections, connection_limit, failed_jobs,
         connections_by_source, largest_tables, cause)
  values (current_date, v_bytes, v_quota, v_conn, v_limit, v_failed, v_sources, v_tables, v_cause)
  on conflict (taken_on) do update
    set database_bytes = excluded.database_bytes, connections = excluded.connections,
        failed_jobs = excluded.failed_jobs, connections_by_source = excluded.connections_by_source,
        largest_tables = excluded.largest_tables, cause = excluded.cause;

  select max(notified_band) into v_last from public.infra_readings
   where notified_band is not null and taken_on > current_date - 30;

  if v_band is not null and (v_last is null or v_band > v_last) then
    select id into v_agency from public.agencies order by created_at limit 1;
    v_title := v_band || '% of the Supabase plan in use';
    v_detail := 'Disk ' || pg_size_pretty(v_bytes) || ' of ' || pg_size_pretty(v_quota) || ' (' || v_disk_pct || '%). '
             || 'Connections ' || v_conn || ' of ' || v_limit || ' (' || v_conn_pct || '%). '
             || 'Change since yesterday: ' || v_delta || '. '
             || coalesce('Likely source: ' || v_cause || '. ', '')
             || coalesce(v_action, '')
             || case when v_failed > 0 then ' Also: ' || v_failed || ' background job run(s) failed in the last day.' else '' end;

    insert into public.notifications (recipient_id, agency_id, kind, title, detail, visibility)
    select m.user_id, m.agency_id, 'attention', v_title, v_detail, 'bes_internal'
      from public.agency_memberships m
     where m.agency_id = v_agency and m.status = 'active' and m.is_owner;
    get diagnostics v_sent = row_count;

    update public.infra_readings set notified_band = v_band where taken_on = current_date;
  end if;

  if v_failed > 0 then
    select id into v_agency from public.agencies order by created_at limit 1;
    insert into public.notifications (recipient_id, agency_id, kind, title, detail, visibility)
    select m.user_id, m.agency_id, 'attention',
           v_failed || ' background job run(s) failed yesterday',
           'Check Supabase → Database → Cron. A job that stops running takes its work with it.',
           'bes_internal'
      from public.agency_memberships m
     where m.agency_id = v_agency and m.status = 'active' and m.is_owner
       and not exists (select 1 from public.notifications n
                        where n.recipient_id = m.user_id and n.kind = 'attention'
                          and n.title like '%background job run%'
                          and n.created_at > now() - interval '20 hours');
  end if;

  return jsonb_build_object('disk_pct', v_disk_pct, 'connection_pct', v_conn_pct, 'band', v_band,
                            'change_since_yesterday', v_delta, 'likely_source', v_cause,
                            'failed_jobs', v_failed, 'notified', v_sent);
end $function$;
revoke all on function public.infra_watch() from public, anon;
