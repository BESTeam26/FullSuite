-- =============================================================================
-- Rich note bodies, and attachments that inherit the note's audience
--
-- Two things this adds, and one hole it closes.
--
-- 1. `activity_events.body` — the note as a STRUCTURED document, not HTML.
--    Storing HTML would mean rendering HTML somebody typed, and the only
--    defence would be a sanitizer we would have to keep ahead of. A structured
--    document is rendered node by node into React elements, so there is no
--    parse step for an attacker to aim at: an unknown node type renders as
--    nothing. `detail` keeps a plain-text rendition so search, system events
--    and every existing row keep working unchanged.
--
-- 2. Attachments on notes, reusing `public.files` and the private `bes-files`
--    bucket. No second file system (rule 2).
--
-- 3. The hole. `files_select` is `is_staff_of(agency_id) or
--    is_org_member(organization_id)` — it knows nothing about activity
--    visibility. Attach a screenshot to a BES-internal note on a customer's
--    client and any member of that organization could fetch it, even though
--    the note itself is invisible to them. Association is not publication
--    (rule 16), and a file reached "another route" is still a leak.
--
--    The rule is therefore stated ONCE: an activity attachment is readable
--    exactly when its note is readable. The `files` policy defers to the
--    `activity_events` row, and the storage policy defers to the `files` row.
--    Because policy subqueries run under the caller's own RLS, asking whether
--    the parent activity row is visible IS the visibility check — there is no
--    second copy of `can_view_activity` to drift out of step.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Structured note body
-- -----------------------------------------------------------------------------
alter table public.activity_events
  add column if not exists body jsonb;

comment on column public.activity_events.body is
  'Structured rich-text document for human notes. NULL for system events. '
  '`detail` always holds the plain-text rendition.';

-- -----------------------------------------------------------------------------
-- 2. entity_id is text; activity ids are bigint. Cast without throwing.
-- -----------------------------------------------------------------------------
create or replace function public.try_bigint(t text)
returns bigint language sql immutable parallel safe as $$
  select case when t ~ '^\d+$' then t::bigint end
$$;

revoke all on function public.try_bigint(text) from public, anon;
grant execute on function public.try_bigint(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. An activity attachment is readable exactly when its note is
--
-- The subquery is evaluated under the caller's own row-level security, so it
-- returns a row only when `activity_events_select` would have. That is the
-- whole enforcement: no visibility logic is restated here.
-- -----------------------------------------------------------------------------
drop policy if exists files_select on public.files;
create policy files_select on public.files for select to authenticated
  using (
    case
      when entity_type = 'activity_event' then
        exists (
          select 1 from public.activity_events ae
           where ae.id = public.try_bigint(public.files.entity_id)
        )
      else
        public.is_staff_of(agency_id)
        or (organization_id is not null and public.is_org_member(organization_id))
    end
  );

-- Writing an attachment still requires the tenancy the file is filed under,
-- and the note's own insert policy governs whether the note may exist at all.
drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      public.is_staff_of(agency_id)
      or (organization_id is not null and public.is_org_member(organization_id))
    )
  );

-- -----------------------------------------------------------------------------
-- 4. Storage defers to the files row
--
-- Object paths are `<organization_id | 'agency'>/<entity>/<...>`. Objects under
-- an `activity` second segment are carved out of the general tenancy policy and
-- governed by their `files` row instead — otherwise the two layers could
-- disagree, and the looser one would win (permissive policies OR together).
-- -----------------------------------------------------------------------------
drop policy if exists bes_files_select on storage.objects;
create policy bes_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'bes-files'
    and (storage.foldername(name))[2] is distinct from 'activity'
    and (
      (storage.foldername(name))[1] = 'agency' and public.is_agency_staff()
      or (
        (storage.foldername(name))[1] <> 'agency'
        and (
          public.is_agency_staff()
          or public.is_org_member(((storage.foldername(name))[1])::uuid)
        )
      )
    )
  );

drop policy if exists bes_files_activity_select on storage.objects;
create policy bes_files_activity_select on storage.objects for select to authenticated
  using (
    bucket_id = 'bes-files'
    and (storage.foldername(name))[2] = 'activity'
    and exists (
      select 1 from public.files f
       where f.bucket = 'bes-files'
         and f.path = storage.objects.name
    )
  );

-- An orphan is unreadable by everyone, including its uploader, until the
-- matching `files` row exists. Deleting one's own orphaned upload must stay
-- possible so a failed post can clean up after itself.
drop policy if exists bes_files_delete_own on storage.objects;
create policy bes_files_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'bes-files' and owner = auth.uid());

-- -----------------------------------------------------------------------------
-- 5. Attachments are looked up by their note
-- -----------------------------------------------------------------------------
create index if not exists files_activity_idx
  on public.files (entity_id)
  where entity_type = 'activity_event';
