-- =============================================================================
-- 0068 — 0066 corrections (found by the full matrix, phase ≤ 27: 388/391)
--
-- 1. files_select / files_insert: 0066 rewrote them from the 0035 text and
--    dropped entity_visible() (0044) — a restricted BES user could see files
--    and an organization owner could record a file on another organization's
--    item. Restored to the 0044 bodies verbatim, plus one borrower branch each.
-- 2. borrower_funding_files ran with invoker rights and joined funding_clients,
--    which the borrower cannot read, so it returned nothing. It now runs with
--    owner rights, filtered by auth.uid(), exposing only its listed columns.
-- =============================================================================

drop policy if exists files_select on public.files;
create policy files_select on public.files for select to authenticated
  using (
    case
      when entity_type = 'activity_event' then
        exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(public.files.entity_id))
      when entity_type = 'funding_file' and uploaded_by = auth.uid() and public.is_borrower_of_file(entity_id::uuid) then true
      else
        (public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id)))
        and public.entity_visible(entity_type, entity_id)
    end
  );

drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and case
      when entity_type = 'funding_file' and public.is_borrower_of_file(entity_id::uuid) then true
      when entity_type = 'activity_event' then
        (public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id)))
        and exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(public.files.entity_id))
      else
        (public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id)))
        and public.entity_visible(entity_type, entity_id)
    end
  );

drop view if exists public.borrower_funding_files;
create view public.borrower_funding_files
with (security_invoker = false) as
  select f.id, f.public_id, f.purpose, f.requested_amount, f.stage, f.secondary_status, f.waiting_on, f.last_activity_at,
         f.agency_id, c.organization_id
    from public.funding_files f
    join public.funding_clients c on c.id = f.client_id
   where c.portal_user_id = auth.uid();
revoke all on public.borrower_funding_files from public, anon;
grant select on public.borrower_funding_files to authenticated;
