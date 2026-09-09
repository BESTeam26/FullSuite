-- =============================================================================
-- Documents & Agreements on the Team Member (People Hub §15/§16, Dee: "this is
-- important"). A person's employment agreement, NDA, policies and
-- acknowledgments — tracked with a signature-lifecycle status, stored as
-- canonical `files` objects, and SEALED at every layer:
--
--   member_documents  who + what + status + when      (new, small, audited)
--   files             the object's row                 (new branch, gated)
--   storage.objects   the bytes                        (new branch, gated)
--
-- Who sees an HR document: a holder of the new `people.documents.manage`
-- capability — never "any staff": an NDA or an agreement carrying pay terms
-- is exactly the kind of file rule 1 exists for — and the person themselves,
-- when the row says visible_to_member. Nothing deletes; superseded and
-- archived are statuses, so history keeps itself (§34, rule 11).
-- =============================================================================

insert into public.permission_keys (key, module, label, description, security_relevant, sort)
values ('people.documents.manage', 'People', 'Team member documents',
        'May see and manage every team member''s employment documents — agreements, NDAs, policies, acknowledgments. Without it a person sees only their own, and only what is marked visible to them.',
        true, 41)
on conflict (key) do nothing;

create type public.member_document_status as enum
  ('draft', 'pending_signature', 'signed', 'acknowledged', 'expired', 'superseded', 'archived');

create table public.member_documents (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references public.agencies(id),
  user_id      uuid not null references public.profiles(id),
  kind         text not null check (kind in ('agreement','nda','confidentiality','policy','acknowledgment','training','other')),
  name         text not null,
  status       public.member_document_status not null default 'draft',
  file_id      uuid references public.files(id) on delete set null,
  sent_at      timestamptz,
  signed_at    timestamptz,
  expires_on   date,
  version      integer not null default 1,
  visible_to_member boolean not null default true,
  notes        text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index member_documents_user on public.member_documents (user_id, status);

alter table public.member_documents enable row level security;

create policy member_documents_select on public.member_documents
  for select to authenticated
  using (
    public.is_staff_of(agency_id)
    and (public.agency_can('people.documents.manage')
         or (user_id = auth.uid() and visible_to_member))
  );

create policy member_documents_insert on public.member_documents
  for insert to authenticated
  with check (
    public.is_staff_of(agency_id)
    and public.agency_can('people.documents.manage')
    and created_by = auth.uid()
    and exists (select 1 from public.agency_memberships m
                 where m.user_id = member_documents.user_id and m.agency_id = member_documents.agency_id)
  );

create policy member_documents_update on public.member_documents
  for update to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('people.documents.manage'))
  with check (public.is_staff_of(agency_id) and public.agency_can('people.documents.manage'));

-- No delete policy: superseded/archived are statuses, history stays.

revoke all on public.member_documents from public, anon;
grant select, insert, update on public.member_documents to authenticated;

-- ── Audit: a document's lifecycle is the person's history (rule 10) ───────
create or replace function public.member_document_record_change()
returns trigger
language plpgsql security definer set search_path = public as $function$
declare
  v_actor text;
begin
  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action, field,
         previous_value, new_value, visibility)
  values (new.agency_id, 'agency_member', new.user_id::text, auth.uid(), v_actor,
          case when tg_op = 'INSERT' then 'Document added: ' || new.name
               else 'Document ' || new.name || ' — ' || replace(new.status::text, '_', ' ') end,
          'member_document',
          case when tg_op = 'UPDATE' then replace(old.status::text, '_', ' ') end,
          replace(new.status::text, '_', ' '),
          'bes_internal');
  return new;
end $function$;

revoke execute on function public.member_document_record_change() from public, anon, authenticated;

create trigger member_documents_record_change
  after insert or update of status on public.member_documents
  for each row execute function public.member_document_record_change();

create trigger member_documents_updated_at
  before update on public.member_documents
  for each row execute function public.set_updated_at();

-- ── The file ROW: an explicit branch, never the any-staff ELSE ─────────────
drop policy if exists files_insert on public.files;
create policy files_insert on public.files
  for insert to authenticated
  with check ((uploaded_by = auth.uid()) and
    case
      when entity_type = 'company_document' then
        ((organization_id is not null and public.member_can(organization_id, 'settings.manage'))
         or (organization_id is null and public.is_staff_of(agency_id) and public.agency_can('hub.files.manage')))
      when entity_type = 'funding_file' and public.is_borrower_of_file(entity_id::uuid) then true
      when entity_type = 'activity_event' then
        ((public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id)))
         and exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(files.entity_id)))
      when entity_type = 'partner' then
        (public.is_staff_of(agency_id) and public.agency_can('partners.files.upload')
         and public.entity_visible(entity_type, entity_id))
      /* HR documents: the capability, not staff status (§40). */
      when entity_type = 'agency_member' then
        (public.is_staff_of(agency_id) and public.agency_can('people.documents.manage')
         and public.entity_visible(entity_type, entity_id))
      else
        ((public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id)))
         and public.entity_visible(entity_type, entity_id))
    end);

drop policy if exists files_select on public.files;
create policy files_select on public.files
  for select to authenticated
  using (
    case
      when entity_type = 'activity_event' then
        exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(files.entity_id))
      when entity_type = 'funding_file' and uploaded_by = auth.uid() and public.is_borrower_of_file(entity_id::uuid) then true
      when entity_type = 'client' then public.client_visible(entity_id::uuid)
      when entity_type = 'funding_file' then
        ((public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id))
          or exists (select 1 from public.funding_files ff
                       join public.funding_clients fc on fc.id = ff.client_id
                      where ff.id = files.entity_id::uuid
                        and fc.client_id in (select public.my_client_ids())))
         and public.entity_visible(entity_type, entity_id))
      /* HR documents: the capability, or your own row that is marked visible.
         Any-staff would read an NDA's very NAME to the whole roster. */
      when entity_type = 'agency_member' then
        (public.is_staff_of(agency_id)
         and (public.agency_can('people.documents.manage')
              or exists (select 1 from public.member_documents md
                          where md.file_id = files.id and md.user_id = auth.uid() and md.visible_to_member)))
      else
        ((public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id)))
         and public.entity_visible(entity_type, entity_id))
    end);

-- ── The BYTES: the agency/member/ subtree leaves the any-staff lane ────────
drop policy if exists bes_files_select on storage.objects;
create policy bes_files_select on storage.objects
  for select to authenticated
  using ((bucket_id = 'bes-files') and
    case
      when public.storage_channel_of(name) is not null then public.channel_auditable(public.storage_channel_of(name))
      /* agency/member/<user_id>/… — HR documents follow the document rule. */
      when (storage.foldername(name))[1] = 'agency' and (storage.foldername(name))[2] = 'member' then
        (public.is_agency_staff()
         and (public.agency_can('people.documents.manage')
              or exists (select 1 from public.files f
                           join public.member_documents md on md.file_id = f.id
                          where f.bucket = 'bes-files' and f.path = objects.name
                            and md.user_id = auth.uid() and md.visible_to_member)))
      when (storage.foldername(name))[1] = 'agency' then public.is_agency_staff()
      else (public.is_agency_staff() or public.is_org_member(((storage.foldername(name))[1])::uuid))
    end);

-- Uploading the object: staff writes into bes-files already route through the
-- existing storage insert policy; the row-level gate above is what decides
-- whether the upload lands as an HR document at all (files_insert refuses the
-- row, and the uploader code removes the orphan object, as partner files do).
