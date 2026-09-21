-- BES watches its own usage, because Supabase will not.
--
-- Dee asked for Supabase usage alerts. Supabase does not have them. Their
-- cost-control page says so plainly: the Spend Cap "doesn't allow for
-- fine-grained cost control, such as setting budgets for specific usage item
-- or receiving notifications when certain costs are reached."
--
-- So the doctrine's §22 — "Never rely solely on the invoice at month end" —
-- has to be satisfied from inside. This watches the two things Postgres can
-- answer for itself, free and without a credential:
--
--   disk       against the Pro plan's 8 GB per project
--   connections against the Small instance's 90 direct
--
-- and the health of the background jobs, because a job failing quietly is how
-- a cost problem starts (§10). Egress, storage, realtime and active users are
-- not visible from in here; the Spend Cap covers those, which is why it is
-- worth turning on.
--
-- One reading a day. Usage moves slowly and §9 says use the slowest interval
-- the business needs.

create table if not exists public.infra_readings (
  taken_on          date primary key,
  database_bytes    bigint not null,
  disk_quota_bytes  bigint not null,
  connections       integer not null,
  connection_limit  integer not null,
  failed_jobs       integer not null,
  /* The highest band crossed, so the same warning is not repeated daily. */
  notified_band     integer,
  created_at        timestamptz not null default now()
);
comment on table public.infra_readings is
  'One row a day: how much of the plan BES is using. Supabase sends no usage alerts, so this is where the 50/75/90 warning comes from.';
alter table public.infra_readings enable row level security;
revoke all on public.infra_readings from public, anon;
grant select on public.infra_readings to authenticated;

/* Owners only. Usage is a commercial fact about the company. */
create policy infra_readings_select on public.infra_readings
  for select to authenticated
  using (exists (select 1 from public.agency_memberships m
                  where m.user_id = auth.uid() and m.status = 'active' and m.is_owner));

/**
 * Take today's reading and warn the owners when a band is crossed.
 *
 * Bands are 50, 75 and 90 percent of the tightest of the two measures, which
 * is the one worth acting on. A band is announced ONCE — re-reading the same
 * 78% every morning is how a notice becomes wallpaper.
 */
create or replace function public.infra_watch() returns jsonb
language plpgsql security definer set search_path = public as $function$
declare
  v_bytes bigint; v_conn int; v_limit int; v_failed int;
  v_quota constant bigint := 8 * 1024^3;   -- Pro: 8 GB disk per project
  v_disk_pct int; v_conn_pct int; v_worst int; v_band int; v_last int;
  v_agency uuid; v_title text; v_detail text; v_sent int := 0;
begin
  select pg_database_size(current_database()) into v_bytes;
  select count(*) into v_conn from pg_stat_activity;
  select setting::int into v_limit from pg_settings where name = 'max_connections';
  select count(*) into v_failed from cron.job_run_details
   where status <> 'succeeded' and end_time > now() - interval '24 hours';

  v_disk_pct := (100 * v_bytes / v_quota)::int;
  v_conn_pct := (100 * v_conn / greatest(v_limit, 1))::int;
  v_worst := greatest(v_disk_pct, v_conn_pct);
  v_band := case when v_worst >= 90 then 90 when v_worst >= 75 then 75
                 when v_worst >= 50 then 50 else null end;

  insert into public.infra_readings
        (taken_on, database_bytes, disk_quota_bytes, connections, connection_limit, failed_jobs)
  values (current_date, v_bytes, v_quota, v_conn, v_limit, v_failed)
  on conflict (taken_on) do update
    set database_bytes = excluded.database_bytes, connections = excluded.connections,
        failed_jobs = excluded.failed_jobs;

  /* The highest band already announced. Crossing UP notifies; settling back
     down does not, and re-crossing the same band later does not either —
     somebody has been told, and the reading is on the record. */
  select max(notified_band) into v_last from public.infra_readings
   where notified_band is not null and taken_on > current_date - 30;

  if v_band is not null and (v_last is null or v_band > v_last) then
    select id into v_agency from public.agencies order by created_at limit 1;
    v_title := v_band || '% of the Supabase plan in use';
    v_detail := 'Database ' || pg_size_pretty(v_bytes) || ' of ' || pg_size_pretty(v_quota)
             || ' (' || v_disk_pct || '%). Connections ' || v_conn || ' of ' || v_limit
             || ' (' || v_conn_pct || '%).'
             || case when v_failed > 0 then ' ' || v_failed || ' background job run(s) failed in the last day.' else '' end;

    insert into public.notifications (recipient_id, agency_id, kind, title, detail, visibility)
    select m.user_id, m.agency_id, 'attention', v_title, v_detail, 'bes_internal'
      from public.agency_memberships m
     where m.agency_id = v_agency and m.status = 'active' and m.is_owner;
    get diagnostics v_sent = row_count;

    update public.infra_readings set notified_band = v_band where taken_on = current_date;
  end if;

  /* A failing job is its own warning, whatever the usage bands say. */
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

  return jsonb_build_object('disk_pct', v_disk_pct, 'connection_pct', v_conn_pct,
                            'band', v_band, 'failed_jobs', v_failed, 'notified', v_sent);
end $function$;
revoke all on function public.infra_watch() from public, anon;

select cron.schedule('infra-watch', '50 6 * * *', $$select public.infra_watch();$$);
