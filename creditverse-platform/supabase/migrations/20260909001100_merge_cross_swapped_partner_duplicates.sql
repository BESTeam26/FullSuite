-- =============================================================================
-- Merge partner duplicates the ClickUp import created when name/partner_name
-- were SWAPPED between the systems (rule 2: one canonical record).
--
-- The 0243 import matched existing groups by normalized company name OR person
-- name — but compared name-to-name and person-to-person only. BES held Wavy One
-- as (name 'Quentin Grays', partner_name 'Wavy One Solutions'); ClickUp holds
-- (company 'Wavy One Solutions', person 'Quentin Grays'). The cross-swap missed
-- and a duplicate group was inserted.
--
-- This merges every such cross-swapped pair from that batch:
--   • the ORIGINAL row survives — it holds the real contact email, contacts,
--     clients and history;
--   • the batch row's services and engagements move onto the survivor where
--     the survivor lacks them, and are removed where it already has them;
--   • the survivor takes the ClickUp provenance and the canonical orientation
--     (name = company, partner_name = person);
--   • the duplicate row is deleted.
--
-- Idempotent: with no cross-swapped batch duplicate present, this is a no-op.
-- =============================================================================

do $$
declare
  v_batch constant uuid := '9c2f7a5e-90b1-4e6a-8f43-2026090900aa';
  r record;
  n int := 0;
begin
  for r in
    select dup.id  as dup_id,
           orig.id as orig_id,
           dup.name as company, dup.partner_name as person,
           dup.source_row_ref, dup.source_reference,
           dup.credential_note
      from public.outsourcing_groups dup
      join public.outsourcing_groups orig
        on orig.agency_id = dup.agency_id
       and orig.id <> dup.id
       and orig.import_batch_id is distinct from v_batch
       -- the cross-swap: dup's company is orig's PERSON field, and vice versa
       and regexp_replace(lower(orig.partner_name), '[^a-z0-9]', '', 'g')
         = regexp_replace(lower(dup.name),          '[^a-z0-9]', '', 'g')
       and regexp_replace(lower(orig.name),         '[^a-z0-9]', '', 'g')
         = regexp_replace(lower(dup.partner_name),  '[^a-z0-9]', '', 'g')
     where dup.import_batch_id = v_batch
  loop
    -- Engagements: move where the survivor has no row for that service.
    update public.fulfillment_engagements e
       set outsourcing_group_id = r.orig_id
     where e.outsourcing_group_id = r.dup_id
       and not exists (select 1 from public.fulfillment_engagements e2
                        where e2.outsourcing_group_id = r.orig_id
                          and e2.service = e.service
                          and e2.status in ('pending', 'active', 'paused'));
    delete from public.fulfillment_engagements where outsourcing_group_id = r.dup_id;

    -- Services: move by service_type where the survivor lacks it.
    update public.partner_services ps
       set group_id = r.orig_id
     where ps.group_id = r.dup_id
       and ps.service_type is not null
       and not exists (select 1 from public.partner_services ps2
                        where ps2.group_id = r.orig_id
                          and ps2.service_type = ps.service_type
                          and ps2.status in ('onboarding', 'active', 'paused'));
    delete from public.partner_services where group_id = r.dup_id;

    -- Survivor: canonical orientation + ClickUp provenance. Its contact email,
    -- lifecycle, contacts and clients are live values and stay untouched.
    update public.outsourcing_groups g
       set name             = r.company,
           partner_name     = r.person,
           source_type      = 'clickup',
           source_row_ref   = r.source_row_ref,
           source_reference = r.source_reference,
           import_batch_id  = v_batch,
           imported_at      = now(),
           credential_migration_required = true,
           credential_note  = coalesce(g.credential_note, r.credential_note)
     where g.id = r.orig_id;

    delete from public.outsourcing_groups where id = r.dup_id;
    n := n + 1;
  end loop;

  raise notice 'cross-swapped partner duplicates merged: %', n;
end $$;
