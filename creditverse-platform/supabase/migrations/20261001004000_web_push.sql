-- Web Push: notifications reach a closed app and a locked phone (Dee,
-- 2026-10-01, "Build Now"). A device subscribes once (its browser's push
-- endpoint and keys, stored under the person's own row); every new
-- notification row nudges the push-notify Edge Function, which sends to the
-- recipient's devices. The payload is the same title and detail the bell
-- shows; the function reads the row itself, so nothing is trusted from the
-- nudge but an id.
begin;

-- ── 1. A device's subscription ──────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  /** Set when the push service said the subscription is gone (404/410); the function deletes it. */
  failed_at   timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
comment on table public.push_subscriptions is
  'One row per device that asked for push. The endpoint and keys are what the browser handed us; only the push-notify function reads them.';

alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_staff_of(agency_id));

-- ── 2. The public half of the VAPID key, where a browser can read it ────
-- Public by nature (it travels in every subscription request); the private
-- half lives only in the Edge Function's secrets. Set by the operator.
alter table public.agencies add column if not exists push_public_key text;
comment on column public.agencies.push_public_key is 'VAPID public key the app uses to subscribe a device to push. The private key is a push-notify function secret.';

-- ── 3. Every new notification nudges the sender ─────────────────────────
create or replace function public.notify_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_url text; v_secret text;
begin
  /* No device, no call: most rows today have no subscriber. */
  if not exists (select 1 from public.push_subscriptions s where s.user_id = new.recipient_id and s.failed_at is null) then
    return new;
  end if;
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_notify_secret';
  if v_url is null or v_secret is null then return new; end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', v_secret),
    body    := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 10000);
  return new;
exception when others then
  /* A push that cannot be requested must never take the notification down with it. */
  return new;
end $$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push
  after insert on public.notifications
  for each row execute function public.notify_push();

revoke all on function public.notify_push() from public, anon, authenticated;

commit;
