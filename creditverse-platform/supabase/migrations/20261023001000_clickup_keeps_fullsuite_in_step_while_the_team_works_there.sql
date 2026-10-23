-- ClickUp keeps FullSuite in step while the team works there.
--
-- Dee, 2026-10-23: "Team is working on ClickUp and I need to ensure you're
-- being updated too — when a client is added, when a client is moved or
-- archived, everything."
--
-- The importer already exists and already knows the rules: one function,
-- `clickup-import`, parses a card, hands secrets to the vault and lets
-- `clickup_import_client` decide matching, idempotency and the status guard
-- ("a rerun never regresses a refined status": a file moves only when its
-- ClickUp status changed). Nothing here is a second importer. This adds the
-- clock: every five minutes the five partners whose lists were checked
-- longest ago are sent to that function with `since` = the moment they
-- were last in step, and the function imports only the cards ClickUp says
-- changed after it (new, moved, edited, archived). Twenty linked lists means
-- every list is checked within about twenty minutes.
--
-- What it cannot see: a card DELETED in ClickUp (not archived) is gone from
-- every listing, so the file stays as it was. Archive instead of delete.
--
-- Cost scales with: two ClickUp list reads per partner per cycle, plus one
-- card read per changed card — bounded by how much the team changes.

begin;

create table if not exists public.clickup_sync_state (
  group_id        uuid primary key references public.outsourcing_groups(id) on delete cascade,
  agency_id       uuid not null references public.agencies(id),
  list_id         text not null,
  /* Cards updated after this moment have not been looked at yet. */
  last_synced_at  timestamptz not null default timestamptz '2026-09-29 00:00+00',
  last_run_at     timestamptz,
  last_result     jsonb,
  last_error      text,
  updated_at      timestamptz not null default now()
);
comment on table public.clickup_sync_state is
  'Per partner list: how far the ClickUp sync has read, when it last ran, and what it found. Written by the clickup-import function in sync mode.';
alter table public.clickup_sync_state enable row level security;
revoke all on public.clickup_sync_state from public, anon;
grant select on public.clickup_sync_state to authenticated;
drop policy if exists clickup_sync_state_staff_select on public.clickup_sync_state;
create policy clickup_sync_state_staff_select on public.clickup_sync_state
  for select using (public.is_staff_of(agency_id));

/* The dispatcher: five lists per tick, longest-unchecked first. The URL and
   the shared secret live in the Vault, like every other dispatcher. */
create or replace function public.clickup_sync_dispatch()
returns integer language plpgsql security definer set search_path = public as $function$
declare
  v_url text; v_secret text; r record; v_sent int := 0;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'clickup_sync_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'clickup_sync_secret';
  if v_url is null or v_secret is null then return 0; end if;

  /* Every linked partner has a state row; a new link joins the rotation. */
  insert into public.clickup_sync_state (group_id, agency_id, list_id)
  select g.id, g.agency_id, split_part(g.source_list_ref, ':', 3)
    from public.outsourcing_groups g
   where g.source_type = 'clickup' and g.source_list_ref like 'clickup:list:%'
     and g.lifecycle in ('active', 'suspended')
  on conflict (group_id) do nothing;

  for r in
    select s.group_id, s.list_id, s.last_synced_at
      from public.clickup_sync_state s
      join public.outsourcing_groups g on g.id = s.group_id and g.lifecycle in ('active', 'suspended')
     /* Not one still in flight (the function marks the start). */
     where s.last_run_at is null or s.last_run_at < now() - interval '4 minutes'
     order by s.last_run_at nulls first
     limit 5
  loop
    update public.clickup_sync_state set last_run_at = now() where group_id = r.group_id;
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', v_secret),
      body    := jsonb_build_object('sync', true, 'groupId', r.group_id, 'listId', r.list_id,
                                    'since', r.last_synced_at, 'max', 6),
      timeout_milliseconds := 5000);
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $function$;
revoke all on function public.clickup_sync_dispatch() from public, anon, authenticated;

select cron.schedule('clickup-sync', '*/5 * * * *', $$select public.clickup_sync_dispatch()$$);

commit;
