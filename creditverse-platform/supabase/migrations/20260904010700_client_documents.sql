-- 0129 — Client-level documents, on the files table that already exists.
--
-- The 360° client record has had a Documents tab since the canonical client
-- landed, and it could only ever show documents belonging to the WORK — a
-- credit case, a funding file. There was nowhere to put the things that belong
-- to the PERSON: a driving licence, a proof of address, a signed agreement.
-- Those follow the client between services, which is the whole reason the
-- client record exists (rule 2).
--
-- No second document engine (rule 6). Same `files` table, same storage bucket,
-- same shape as company documents — a new `entity_type` and the policy branch
-- and writer that make it safe.
--
-- This was blocked until now for a specific reason. `entity_visible()` used to
-- return TRUE for any entity type it had not heard of, so a new type would
-- have been visible-by-default. 0118 made it deny by default and 0119 gave
-- `client` a real check, which is what makes this safe to add today.

-- ---------------------------------------------------------------------------
-- 1. READ. Whoever may see the client may see their documents.
--
-- `client_visible()` already answers that question and answers it once: the
-- person themself through their portal login, a member of the organization
-- that owns them, or BES staff under a live engagement and in scope. There is
-- no second visibility rule here, because a document that is readable by
-- someone who cannot see the client would be a leak with its own opinion.
-- ---------------------------------------------------------------------------
drop policy if exists files_select on public.files;
create policy files_select on public.files for select to authenticated
  using (
    case
      when entity_type = 'activity_event' then exists (
        select 1 from public.activity_events ae where ae.id = public.try_bigint(files.entity_id)
      )
      when entity_type = 'funding_file' and uploaded_by = auth.uid() and public.is_borrower_of_file(entity_id::uuid) then true
      -- Client-level documents: the person, their organization, engaged BES.
      when entity_type = 'client' then public.client_visible(entity_id::uuid)
      when entity_type = 'funding_file' then
        (public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id))
          or exists (
            select 1 from public.funding_files ff
              join public.funding_clients fc on fc.id = ff.client_id
             where ff.id = files.entity_id::uuid
               and fc.client_id in (select public.my_client_ids())
          ))
        and public.entity_visible(entity_type, entity_id)
      else
        (public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id)))
        and public.entity_visible(entity_type, entity_id)
    end
  );

-- ---------------------------------------------------------------------------
-- 2. WRITE. Two kinds of person may add one, and the difference is recorded.
--
--   staff   somebody who may write the client record — either engine's edit
--           key qualifies, the same rule that lets a FundingOps-only
--           organization correct a borrower's phone number
--   the client themself, through their portal
--
-- Both are legitimate and they are not the same act, so `uploaded_by` is what
-- the screen reads to say which. The path is enforced either way, so a client
-- cannot write into another client's folder — or into the company folder.
-- ---------------------------------------------------------------------------
drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and case
      when entity_type = 'company_document' then
        organization_id is not null and public.member_can(organization_id, 'settings.manage')
      when entity_type = 'client' then public.client_visible(entity_id::uuid)
      when entity_type = 'funding_file' and public.is_borrower_of_file(entity_id::uuid) then true
      when entity_type = 'activity_event' then
        (public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id)))
        and exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(public.files.entity_id))
      else
        (public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id)))
        and public.entity_visible(entity_type, entity_id)
    end
  );

-- ---------------------------------------------------------------------------
-- 3. The writer. Path and tenancy come from the CLIENT ROW, never from the
--    caller (rule 16: never trust a supplied tenancy).
-- ---------------------------------------------------------------------------
create or replace function public.save_client_document(
  p_client uuid, p_path text, p_name text, p_mime text, p_size bigint, p_kind text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  c public.clients%rowtype;
  v_id uuid;
  v_by_client boolean;
begin
  select * into c from public.clients where id = p_client;
  if c.id is null then raise exception 'client not found' using errcode = 'P0002'; end if;

  v_by_client := (c.portal_user_id = auth.uid());
  if not v_by_client and not public.client_writable(c.organization_id, c.outsourcing_group_id, c.agency_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  /* The folder is derived, not accepted. `partner_scope_id` is the
     organization for a SaaS client and the outsourcing group for a
     contract-only one, so one rule covers both models (rule 16). */
  if p_path is null or p_path not like (c.partner_scope_id::text || '/clients/' || p_client::text || '/%') then
    raise exception 'a client document must live in that client''s own folder' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'a document needs a name' using errcode = '22023';
  end if;

  insert into public.files (organization_id, agency_id, entity_type, entity_id, bucket, path, name, mime_type, size_bytes, uploaded_by)
  values (c.organization_id, c.agency_id, 'client', p_client::text, 'bes-files', p_path, trim(p_name),
          nullif(p_mime, ''), p_size, auth.uid())
  returning id into v_id;

  perform public.log_audit('client_document.added', 'file', v_id::text, c.organization_id, null,
                           jsonb_build_object('client_id', p_client, 'name', p_name, 'size_bytes', p_size,
                                              'by_client', v_by_client, 'kind', p_kind));
  return v_id;
end $$;
revoke all on function public.save_client_document(uuid, text, text, text, bigint, text) from public, anon;
grant execute on function public.save_client_document(uuid, text, text, text, bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Removal is staff-only, and never the client's.
--
-- A document a client produced is part of their record from the moment it
-- arrives (rule 11) — they cannot withdraw it, and neither can somebody who
-- only has portal access. Staff removal returns the storage path so the object
-- goes with the row rather than being orphaned.
-- ---------------------------------------------------------------------------
create or replace function public.delete_client_document(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  f public.files%rowtype;
  c public.clients%rowtype;
begin
  select * into f from public.files where id = p_id and entity_type = 'client';
  if f.id is null then raise exception 'document not found' using errcode = 'P0002'; end if;
  select * into c from public.clients where id = f.entity_id::uuid;
  if c.id is null then raise exception 'client not found' using errcode = 'P0002'; end if;
  if not public.client_writable(c.organization_id, c.outsourcing_group_id, c.agency_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  delete from public.files where id = p_id;
  perform public.log_audit('client_document.removed', 'file', p_id::text, c.organization_id, to_jsonb(f), null);
  return f.path;
end $$;
revoke all on function public.delete_client_document(uuid) from public, anon;
grant execute on function public.delete_client_document(uuid) to authenticated;

create index if not exists files_client_idx on public.files (entity_id) where entity_type = 'client';
