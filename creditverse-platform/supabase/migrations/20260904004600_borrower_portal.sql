-- =============================================================================
-- 0066 — Borrower portal (ARCHITECTURE_PROPOSAL_FUNDING_DOMAIN.md, Addendum D)
--
-- The borrower (funding_clients.portal_user_id) may already read the document
-- requests on their file and insert portal uploads. What refused them: the
-- funding file row itself, the `files` row an upload records first, and the
-- storage bucket. Smallest correction: a narrow view for the file, borrower
-- branches on files and storage, and a dev fixture (Juno Logistics' borrower)
-- for the matrix. Nothing about lenders, offers, flags or notes reaches them.
-- =============================================================================

-- 1. The file, as the borrower may see it -------------------------------------
create policy funding_files_borrower_select on public.funding_files for select to authenticated
  using (public.is_borrower_of_file(id));

create or replace view public.borrower_funding_files
with (security_invoker = true) as
  select f.id, f.public_id, f.purpose, f.requested_amount, f.stage, f.secondary_status, f.waiting_on, f.last_activity_at,
         f.agency_id, c.organization_id
    from public.funding_files f
    join public.funding_clients c on c.id = f.client_id
   where c.portal_user_id = auth.uid();
revoke all on public.borrower_funding_files from public, anon;
grant select on public.borrower_funding_files to authenticated;

-- 2. files rows: organization members of the file's organization (they operate their own files since 0063)
--    and the borrower for their own uploads; BES staff as before ---------------------------------
drop policy if exists files_select on public.files;
create policy files_select on public.files for select to authenticated
  using (public.is_staff_of(agency_id) or public.is_org_member(organization_id)
         or (entity_type = 'funding_file' and uploaded_by = auth.uid() and public.is_borrower_of_file(entity_id::uuid)));
drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert to authenticated
  with check (uploaded_by = auth.uid()
              and (public.is_staff_of(agency_id) or public.is_org_member(organization_id)
                   or (entity_type = 'funding_file' and public.is_borrower_of_file(entity_id::uuid))));

-- 3. storage: uploads live at <organization>/activity/funding_file/<file>/<uuid>.<ext> (activity-attachments.ts);
--    the borrower may put an object there for their own file and read their own objects back ----
drop policy if exists bes_files_borrower_insert on storage.objects;
create policy bes_files_borrower_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bes-files' and owner = auth.uid()
    and (storage.foldername(name))[2] = 'activity' and (storage.foldername(name))[3] = 'funding_file'
    and public.is_borrower_of_file(((storage.foldername(name))[4])::uuid)
  );
drop policy if exists bes_files_borrower_select on storage.objects;
create policy bes_files_borrower_select on storage.objects for select to authenticated
  using (bucket_id = 'bes-files' and owner = auth.uid()
         and (storage.foldername(name))[2] = 'activity' and (storage.foldername(name))[3] = 'funding_file'
         and public.is_borrower_of_file(((storage.foldername(name))[4])::uuid));

-- 4. dev fixture: Juno Logistics' borrower (Lakeside) -------------------------------
do $$
declare v_user uuid; v_org uuid;
begin
  if not exists (select 1 from public.funding_clients where id = public.dev_uuid('fu-3')) then return; end if;
  v_user := public.dev_seed_user('client.portal@bes.test', 'DevTest!2026', '[TEST] Juno Portal (Borrower)');
  select organization_id into v_org from public.funding_clients where id = public.dev_uuid('fu-3');
  insert into public.external_memberships (id, user_id, organization_id, role)
  values (public.dev_uuid('ext-client-juno'), v_user, v_org, 'client')
  on conflict (user_id, organization_id, role) do nothing;
  update public.funding_clients set portal_user_id = v_user where id = public.dev_uuid('fu-3');
end $$;
