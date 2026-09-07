-- 0146 — association is not publication, for files too.
--
-- The partner file policy I wrote in 0145 let a partner read every file
-- attached to their own record. That is wrong in the same way rule 16 says it
-- is wrong: BES attaches internal things to a partner record all the time —
-- a margin note, a QA sheet, an unsigned draft — and none of it becomes the
-- partner's to read because it is filed against them.
--
-- So a file reaches the portal only when somebody deliberately shares it.
-- Default false: the safe state is the one you get by not thinking about it.
alter table public.files
  add column if not exists shared_with_partner boolean not null default false,
  add column if not exists shared_by           uuid references public.profiles(id) on delete set null,
  add column if not exists shared_at           timestamptz;

comment on column public.files.shared_with_partner is
  'True only when BES deliberately published this file to the partner portal. Filing a document against a partner does not share it.';

drop policy if exists files_partner_select on public.files;
create policy files_partner_select on public.files for select to authenticated
  using (
    shared_with_partner
    and entity_type = 'partner'
    and entity_id = public.partner_group_of_user()::text
  );
