-- The sweep runs daily; the sweep decides whether a quarter closes.
--
-- Dee, 2026-09-19: "Run once daily. The Edge Function itself decides whether a
-- quarter is eligible for close processing. That is safer than relying on a
-- cron expression that only works on quarter-end dates."
--
-- Mirrors `eod_email_dispatch`: pg_cron nudges the function through pg_net
-- with a Vault secret, and is silent when the Vault is unconfigured so an
-- install without the endpoint does not error every morning.

create or replace function public.attendance_reward_dispatch()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'attendance_reward_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'attendance_reward_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000);
end $$;

comment on function public.attendance_reward_dispatch() is
  'Nudges the attendance-reward-sweep function once a day. The function decides whether a quarter has closed; this only knocks.';

select cron.schedule(
  'attendance-reward-sweep',
  /* 02:45 UTC — after the birthday grant at 02:15, off the hour. */
  '45 2 * * *',
  $$ select public.attendance_reward_dispatch() $$
);
