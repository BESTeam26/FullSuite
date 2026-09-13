-- =============================================================================
-- `extensions.net.http_post` is three names, and Postgres reads the first as a
-- database.
--
--   ERROR: cross-database references are not implemented: extensions.net.http_post
--
-- pg_net's EXTENSION is registered under `extensions`, but its FUNCTIONS live
-- in the `net` schema — so the call is `net.http_post`. The three-part name
-- parses as database.schema.function and fails at runtime, never at creation,
-- which is why it sat undetected.
--
-- ── IT WAS NOT ONLY THE NEW ONE ─────────────────────────────────────────────
--
-- `ghl_outbound_dispatch` has the same call, written 2026-09-09, and is
-- scheduled every minute. Every one of those runs has been failing silently at
-- the `perform` — the queue drains nowhere and the cron log records success,
-- because the job succeeded in calling a function that then threw. Any GHL
-- outbound push queued since then is still sitting in `ghl_outbound_events`.
--
-- Both are corrected here. Found because the billing dispatcher refused to
-- send a test email, which is the cheapest possible way to find it.
-- =============================================================================

create or replace function public.billing_email_dispatch()
returns void
language plpgsql security definer set search_path = public, net, vault as $function$
declare
  v_url text;
  v_secret text;
begin
  perform public.billing_email_supersede_settled();

  if not exists (
    select 1 from public.billing_email_outbox
     where state in ('pending', 'failed') and attempts < 5 and to_email is not null
  ) then
    return;
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'billing_email_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'billing_email_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000);
end $function$;
revoke execute on function public.billing_email_dispatch() from public, anon;
grant execute on function public.billing_email_dispatch() to authenticated;

create or replace function public.ghl_outbound_dispatch()
returns void
language plpgsql security definer set search_path = public, net, vault as $function$
declare
  v_secret text;
  v_url    text;
begin
  if not exists (select 1 from public.ghl_outbound_events where state = 'pending') then
    return;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'ghl_push_secret';
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'ghl_push_url';
  if v_secret is null or v_url is null then
    /* Stopped, not open. The panel reads the pending count and says why. */
    return;
  end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end $function$;
revoke execute on function public.ghl_outbound_dispatch() from public, anon, authenticated;
