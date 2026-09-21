-- The purge worker runs on its own, so a deleted attachment does not wait for
-- somebody to remember. Hourly: sensitive enough to be prompt, rare enough
-- that a minute-by-minute sweep would be noise. An empty queue costs one
-- function invocation that returns `considered: 0`.
--
-- The url and the secret live in the vault beside the other dispatchers; the
-- function itself refuses any call without the secret.
select vault.create_secret(
  'https://wiojlgkzxlaiajwwrzuj.supabase.co/functions/v1/attachment-purge',
  'attachment_purge_url', 'Storage purge worker for deleted message attachments');
select vault.create_secret('65ead300a4b6a3f71f32715d70b504c9245e8e0f342f51a759771dac132a5800', 'attachment_purge_secret', 'x-dispatch-secret for attachment-purge');

create or replace function public.attachment_purge_dispatch() returns void
language plpgsql security definer set search_path = public as $function$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'attachment_purge_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'attachment_purge_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  /* Nothing queued, nothing to wake. */
  if not exists (select 1 from public.attachment_purge_queue
                  where deleted_at is null and abandoned_at is null and retry_count < 5) then
    return;
  end if;
  perform extensions.net.http_post(
    url     := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000);
end $function$;
revoke execute on function public.attachment_purge_dispatch() from public, anon, authenticated;

select cron.schedule('attachment-purge', '35 * * * *', $$select public.attachment_purge_dispatch()$$);
