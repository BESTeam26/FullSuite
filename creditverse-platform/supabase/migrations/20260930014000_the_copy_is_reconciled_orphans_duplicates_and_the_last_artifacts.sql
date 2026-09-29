-- The copy is reconciled: orphans, duplicates, and the last artifacts.
--
-- Final audit of the ClickUp copy (Dee, 2026-09-30: "prove completeness AND
-- no duplication"). Four findings, each handled at its own depth:
--
-- 1. 85 comment/attachment links and 58 file rows point at work files that
--    no longer exist — the earliest imports (Kevin Hernandez, 09-25; Approve
--    with Tiff, 09-24) whose rows were later replaced. Because the importer
--    skips a comment whose ClickUp id is already linked, those cards could
--    never be re-imported: the link existed, the record did not. The dead
--    links and rows go; the cards are re-imported afterwards and the storage
--    objects behind the dead rows are removed by the import tooling.
--
-- 2. 37 pairs of live work files carry the same name on the same partner —
--    35 of them Vanquish Ventures, where a bulk of cards (ids 86ey21r…) was
--    created beside older ones. None has an SSN on either side to prove
--    identity, and rule 4 forbids merging on a name. They are flagged
--    `[possible duplicate]` for a person to resolve through
--    resolve_client_duplicate(); nothing is merged here.
--
-- 3. 8 imported comments still read "undefined": their ClickUp comments were
--    edited or deleted after import, so there is no source to rebuild from.
--    The artifact line becomes a marker saying exactly that.
--
-- 4. Kendra Smith's two SmartCredit passwords, named by Dee, are not two
--    "password:" lines the detector can see — the second sits in the card's
--    notes. Flagged by hand, with that provenance, so a person compares the
--    preserved description and the notes.
--
-- Also: client_secret_write no longer rotates the vault or writes an
-- 'updated' event when it is handed the value it already holds, so a rerun
-- of the importer changes nothing unless ClickUp changed.
--
-- Cost impact: none.

begin;

/* ── 1. Dead links and rows ──────────────────────────────────────────── */
do $$
declare v_links int; v_files int;
begin
  delete from public.import_links il
   where il.source_system = 'clickup' and il.source_kind in ('comment', 'attachment')
     and not exists (select 1 from public.fulfillment_clients fc where fc.id::text = il.entity_id);
  get diagnostics v_links = row_count;
  delete from public.files f
   where f.entity_type = 'fulfillment_client'
     and not exists (select 1 from public.fulfillment_clients fc where fc.id::text = f.entity_id);
  get diagnostics v_files = row_count;
  raise notice '% dead links and % dead file rows removed', v_links, v_files;
end $$;

/* ── 2. Same name, same partner, no identity to compare ──────────────── */
with pairs as (
  select fc.client_id, fc.outsourcing_group_id, lower(regexp_replace(fc.name, '\s+', ' ', 'g')) as nm
    from public.fulfillment_clients fc
   where not fc.is_fixture and fc.archived_at is null
), dup as (
  select p.outsourcing_group_id, p.nm, string_agg(distinct
           coalesce((select il.source_id from public.import_links il
                      where il.entity_id = fc2.id::text and il.source_kind = 'task' limit 1), fc2.id::text), ', ') as cards
    from pairs p
    join public.fulfillment_clients fc2 on fc2.outsourcing_group_id = p.outsourcing_group_id
     and lower(regexp_replace(fc2.name, '\s+', ' ', 'g')) = p.nm and fc2.archived_at is null
   group by 1, 2 having count(distinct fc2.id) > 1
)
update public.clients c
   set needs_review = true,
       review_note = case when coalesce(c.review_note, '') like '%[possible duplicate]%' then c.review_note
                          else concat_ws(E'\n', nullif(c.review_note, ''),
                               '[possible duplicate] Another live file with this name on the same partner (ClickUp cards ' || d.cards
                               || '). No SSN on either side to prove it; resolve or dismiss under the Client Directory.') end
  from pairs p
  join dup d on d.outsourcing_group_id = p.outsourcing_group_id and d.nm = p.nm
 where c.id = p.client_id;

/* ── 3. The last artifacts, with no source left to rebuild from ──────── */
update public.activity_events a
   set detail = regexp_replace(a.detail, '(^|\n)(undefined|null|\[object object\])(\n|$)',
                               E'\\1[a ClickUp attachment or embed whose source was edited or removed after import]\\3', 'gi')
 where a.action = 'Imported from ClickUp'
   and a.detail ~* '(^|\n)(undefined|null|\[object object\])(\n|$)';

/* ── 4. Kendra Smith, by hand, with provenance ───────────────────────── */
update public.clients c
   set needs_review = true,
       review_note = case when coalesce(c.review_note, '') like '%[credential conflict]%' then c.review_note
                          else concat_ws(E'\n', nullif(c.review_note, ''),
                               '[credential conflict] smartcredit — two passwords were named at import review (Dee, 2026-09-30); '
                               || 'the second is in the card''s notes, not a password: line. Compare the preserved ClickUp description and notes.') end
 where c.full_name = 'Kendra Smith'
   and exists (select 1 from public.fulfillment_clients fc join public.outsourcing_groups g on g.id = fc.outsourcing_group_id
                where fc.client_id = c.id and g.name = 'Business Made Fair');

/* ── Unchanged value: no rotation, no event ──────────────────────────── */
create or replace function public.client_secret_write(
  p_client uuid, p_kind text, p_secret text, p_label text default null, p_provider text default null,
  p_username text default null, p_url text default null, p_notes text default null, p_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_agency uuid; v_id uuid := p_id; v_secret_id uuid; v_name text; v_row public.client_secrets%rowtype; v_same boolean := false;
begin
  select agency_id into v_agency from public.clients where id = p_client;
  if v_agency is null then raise exception 'No such client' using errcode = '22023'; end if;
  if not public.is_service_caller()
     and not (public.is_staff_of(v_agency) and public.agency_can('creditops.clients.sensitive')) then
    raise exception 'Storing client identity and logins requires permission' using errcode = '42501';
  end if;
  if public.looks_like_a_secret(p_notes) then
    raise exception 'Put the value in the secret field, not the notes. The notes are stored in the clear.'
      using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.client_secrets (agency_id, client_id, kind, label, provider, username, url, notes, updated_by)
    values (v_agency, p_client, p_kind, p_label, p_provider, p_username, p_url, p_notes, auth.uid())
    returning id into v_id;
    insert into public.client_secret_events (secret_row_id, agency_id, actor_id, action)
    values (v_id, v_agency, auth.uid(), 'created');
  else
    select * into v_row from public.client_secrets
     where id = v_id and client_id = p_client and archived_at is null;
    if v_row.id is null then raise exception 'Not found' using errcode = 'P0002'; end if;
    /* Idempotent: the importer re-reads every card. Handing this function
       what it already holds must leave no trace — no rotation, no event. */
    if p_secret is not null and btrim(p_secret) <> '' and v_row.secret_id is not null then
      select (v.decrypted_secret = p_secret) into v_same
        from vault.decrypted_secrets v where v.id = v_row.secret_id;
      v_same := coalesce(v_same, false);
    end if;
    if v_same
       and v_row.kind = p_kind and v_row.label is not distinct from p_label
       and v_row.provider is not distinct from p_provider and v_row.username is not distinct from p_username
       and v_row.url is not distinct from p_url and v_row.notes is not distinct from p_notes then
      return v_id;
    end if;
    update public.client_secrets
       set kind = p_kind, label = p_label, provider = p_provider, username = p_username,
           url = p_url, notes = p_notes, updated_by = auth.uid(), updated_at = now()
     where id = v_id;
    insert into public.client_secret_events (secret_row_id, agency_id, actor_id, action)
    values (v_id, v_agency, auth.uid(), 'updated');
  end if;

  if p_secret is not null and btrim(p_secret) <> '' and not v_same then
    v_name := 'client_secret:' || v_id::text || ':' || gen_random_uuid()::text;
    select vault.create_secret(p_secret, v_name, 'BES client ' || p_kind) into v_secret_id;
    update public.client_secrets
       set secret_id = v_secret_id, last_rotated_at = now(), updated_at = now()
     where id = v_id;
  end if;

  return v_id;
end $$;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.activity_events a
   where a.action = 'Imported from ClickUp' and a.detail ~* '(^|\n)(undefined|null|\[object object\])(\n|$)';
  if v_n > 0 then raise exception '% artifact lines remain', v_n; end if;
  select count(*) into v_n from public.clients where review_note like '%[possible duplicate]%';
  raise notice '% clients flagged as possible duplicates', v_n;
end $$;

commit;
