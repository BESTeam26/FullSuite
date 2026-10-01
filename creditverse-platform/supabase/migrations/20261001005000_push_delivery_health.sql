-- Push delivery health, event-driven (Dee, 2026-10-01: "failed push sends,
-- dead device cleanup, unauthorized dispatch attempts, delivery function
-- failures. Do not poll for this."). The push-notify function writes an
-- event the moment one happens; a trigger on that table tells the owners
-- about the kinds that mean something is wrong, once an hour per kind.
begin;

create table if not exists public.push_delivery_events (
  id              bigint generated always as identity primary key,
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  kind            text not null check (kind in ('failed_send', 'device_gone', 'unauthorized', 'function_error', 'dispatch_error')),
  notification_id bigint,
  subscription_id uuid,
  user_id         uuid,
  detail          text,
  created_at      timestamptz not null default now()
);
create index if not exists push_delivery_events_recent_idx on public.push_delivery_events (agency_id, created_at desc);
comment on table public.push_delivery_events is
  'One row per push delivery event, written by push-notify (service role) and notify_push(). Read by agency admins on Settings › Integrations. Never polled: the owner alert is a trigger here.';

alter table public.push_delivery_events enable row level security;
drop policy if exists push_delivery_events_admin_read on public.push_delivery_events;
create policy push_delivery_events_admin_read on public.push_delivery_events
  for select to authenticated
  using (public.is_staff_of(agency_id) and public.is_agency_admin());

-- The owners hear about the kinds that mean something is broken — at most
-- once an hour per kind, so a burst reads as one warning, not forty.
create or replace function public.push_delivery_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_title text; v_detail text; v_recent int;
begin
  if new.kind = 'device_gone' then return new; end if;
  if new.kind = 'failed_send' then
    select count(*) into v_recent from public.push_delivery_events e
     where e.agency_id = new.agency_id and e.kind = 'failed_send' and e.created_at > now() - interval '1 hour';
    if v_recent < 5 then return new; end if;
    v_title := v_recent || ' push sends failed in the last hour';
    v_detail := 'The push service refused or could not be reached. Check Settings › Integrations › Push delivery; a device that is gone is removed automatically, a failing one is not.';
  elsif new.kind = 'unauthorized' then
    v_title := 'Somebody called the push sender without the secret';
    v_detail := 'A request reached push-notify with a wrong or missing dispatch secret and was refused. If this repeats, rotate PUSH_DISPATCH_SECRET and the Vault copy together.';
  elsif new.kind = 'function_error' then
    v_title := 'The push sender failed';
    v_detail := coalesce(left(new.detail, 240), 'push-notify returned an error.') || ' Check Supabase → Edge Functions → push-notify logs.';
  else
    v_title := 'A notification could not be handed to the push sender';
    v_detail := coalesce(left(new.detail, 240), 'notify_push() failed.') || ' The notification itself was saved; only the push was lost.';
  end if;

  insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  select m.user_id, m.agency_id, 'attention', 'push_delivery', new.kind, 'Push delivery', v_title, v_detail, 'bes_internal'
    from public.agency_memberships m
   where m.agency_id = new.agency_id and m.status = 'active' and m.is_owner
     and not exists (select 1 from public.notifications n
                      where n.recipient_id = m.user_id and n.entity_type = 'push_delivery' and n.entity_id = new.kind
                        and n.created_at > now() - interval '1 hour');
  return new;
end $$;

drop trigger if exists push_delivery_events_alert on public.push_delivery_events;
create trigger push_delivery_events_alert
  after insert on public.push_delivery_events
  for each row execute function public.push_delivery_alert();
revoke all on function public.push_delivery_alert() from public, anon, authenticated;

-- The hand-off itself can fail (pg_net unavailable, Vault empty): record it.
create or replace function public.notify_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_url text; v_secret text;
begin
  if not exists (select 1 from public.push_subscriptions s where s.user_id = new.recipient_id and s.failed_at is null) then
    return new;
  end if;
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_notify_secret';
  if v_url is null or v_secret is null then
    insert into public.push_delivery_events (agency_id, kind, notification_id, user_id, detail)
    values (new.agency_id, 'dispatch_error', new.id, new.recipient_id, 'push_notify_url or push_notify_secret is missing from the Vault');
    return new;
  end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', v_secret),
    body    := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 10000);
  return new;
exception when others then
  begin
    insert into public.push_delivery_events (agency_id, kind, notification_id, user_id, detail)
    values (new.agency_id, 'dispatch_error', new.id, new.recipient_id, left(sqlerrm, 400));
  exception when others then null;
  end;
  return new;
end $$;

commit;
