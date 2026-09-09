-- =============================================================================
-- Partner portal, built out: their clients, and files that are actually shared.
--
-- Dee's direction 2026-09-09: proceed with the partner portal build. Three
-- pieces, all on the canonical records (rules 2, 16):
--
-- 1. my_partner_clients() — a partner contact sees THEIR OWN clients' dispute
--    state: the canonical fulfillment_clients rows for their group, restricted
--    to partner-safe columns. What a partner never gets from this: which BES
--    agent works the file, internal descriptions and next actions, teams, or
--    anything about any other partner. This is the portal replacement for the
--    per-partner ClickUp folder they used to watch.
--
-- 2. set_partner_file_shared() — the missing mechanism behind 0146. The
--    database has said "a file reaches the portal only when deliberately
--    shared" since 0146, but nothing could set the flag: files has no staff
--    UPDATE policy, and no UI offered it. Sharing is publication, so it is a
--    named, permission-gated, audited act — not a row edit.
--
-- 3. bes_files_partner_select on storage — the shared file's OBJECT becomes
--    downloadable by the partner's contacts. Until now a shared files row
--    would have listed a name the partner could not open (a dead control,
--    rule 12). Same shape as bes_files_activity_select: the object follows
--    its row.
-- =============================================================================

-- ── 1 · The partner's own clients, partner-safe columns only ─────────────
create or replace function public.my_partner_clients(p_include_closed boolean default false)
returns table (
  public_id        text,
  name             text,
  email            citext,
  status           text,
  round            text,
  open_items       integer,
  lifecycle        text,
  last_activity_at timestamptz,
  processed_on     date,
  created_at       timestamptz
)
language sql stable security definer set search_path = public as $function$
  select c.public_id, c.name, c.email, c.status::text, c.round::text,
         c.open_items, c.lifecycle::text, c.last_activity_at, c.processed_on,
         c.created_at
    from public.fulfillment_clients c
   where c.outsourcing_group_id = public.partner_group_of_user()
     and c.is_fixture = false
     and (p_include_closed or c.lifecycle <> 'archived')
   order by c.last_activity_at desc
$function$;

comment on function public.my_partner_clients(boolean) is
  'The calling partner contact''s own clients, partner-safe columns only. '
  'partner_group_of_user() is the whole gate: a suspended contact or partner '
  'resolves to nothing, so this returns nothing. No agent names, no internal '
  'notes, no other partner — ever.';

revoke execute on function public.my_partner_clients(boolean) from public, anon;
grant execute on function public.my_partner_clients(boolean) to authenticated;

-- ── 2 · Sharing a file is a named, audited act ───────────────────────────
create or replace function public.set_partner_file_shared(p_file uuid, p_shared boolean)
returns void
language plpgsql security definer set search_path = public as $function$
declare
  f record;
  v_actor text;
begin
  select id, agency_id, entity_type, entity_id, name, shared_with_partner
    into f
    from public.files
   where id = p_file and entity_type = 'partner';
  if not found then
    raise exception 'File not found, or not a partner file';
  end if;
  if not public.is_staff_of(f.agency_id) or not public.agency_can('partners.portal') then
    raise exception 'Sharing to the partner portal needs the portal permission'
      using errcode = '42501';
  end if;
  if f.shared_with_partner = p_shared then
    return; -- already in the asked-for state; no noise in the audit trail
  end if;

  update public.files
     set shared_with_partner = p_shared,
         shared_by = case when p_shared then auth.uid() end,
         shared_at = case when p_shared then now() end
   where id = p_file;

  select coalesce(pr.full_name, pr.email) into v_actor
    from public.profiles pr where pr.id = auth.uid();

  /* Publication is a meaningful mutation (rule 10): actor, record, both
     states. bes_internal — the share event is BES's own history. */
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name,
         action, field, previous_value, new_value, visibility)
  values (f.agency_id, 'partner', f.entity_id, auth.uid(), v_actor,
          case when p_shared then 'File shared to the partner portal'
               else 'File removed from the partner portal' end,
          'file: ' || f.name,
          case when p_shared then 'private' else 'shared' end,
          case when p_shared then 'shared' else 'private' end,
          'bes_internal');
end;
$function$;

comment on function public.set_partner_file_shared(uuid, boolean) is
  'The only way a partner file becomes portal-visible (0146 flag). Staff with '
  'partners.portal only; every change writes an activity event.';

revoke execute on function public.set_partner_file_shared(uuid, boolean) from public, anon;
grant execute on function public.set_partner_file_shared(uuid, boolean) to authenticated;

-- ── 3 · The shared file's object follows its row ─────────────────────────
drop policy if exists bes_files_partner_select on storage.objects;
create policy bes_files_partner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bes-files'
    and exists (
      select 1 from public.files f
       where f.bucket = 'bes-files'
         and f.path = objects.name
         and f.entity_type = 'partner'
         and f.shared_with_partner
         and f.entity_id = public.partner_group_of_user()::text
    )
  );
