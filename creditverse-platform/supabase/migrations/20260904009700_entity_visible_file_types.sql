-- 0119 — the entity types that live on `files`, given real checks.
--
-- 0118 made `entity_visible()` default to deny, and the matrix immediately
-- caught what that broke: company documents disappeared. The `files` SELECT
-- policy ends with
--
--     (is_staff_of(agency_id) or is_org_member(organization_id))
--       and entity_visible(entity_type, entity_id)
--
-- and `company_document` had never had a case, so it had been passing on the
-- old `else true`. Default-deny turned a silent pass into a silent block.
--
-- This is the right correction rather than a retreat: each of these types now
-- gets the check it should always have had. Note that none of them is `true` —
-- a company document is keyed to its organization, and asking whether that
-- organization is visible is a real question with a real answer.
--
-- SECURITY INVOKER preserved: every `exists` is filtered by that table's own
-- policy as the caller, which is the entire mechanism.

create or replace function public.entity_visible(p_entity_type text, p_entity_id text)
returns boolean language sql stable security invoker set search_path = public as $$
  select case p_entity_type
    when 'fulfillment_client' then exists (select 1 from public.fulfillment_clients c where c.id::text = p_entity_id)
    when 'funding_client'     then exists (select 1 from public.funding_clients c where c.id::text = p_entity_id)
    when 'work_item'          then exists (select 1 from public.work_items w where w.id::text = p_entity_id)
    when 'funding_file'       then exists (select 1 from public.funding_files f where f.id::text = p_entity_id)
    when 'eod_submission'     then exists (select 1 from public.eod_submissions e where e.id::text = p_entity_id)
    when 'channel'            then exists (select 1 from public.channels c where c.id::text = p_entity_id)
    when 'client'             then exists (select 1 from public.clients c where c.id::text = p_entity_id)
    -- Keyed to the organization that owns it (0059: entity_id IS the org id).
    when 'company_document'   then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
    when 'organization'       then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
    -- An attachment on a note is visible exactly when the note is.
    when 'activity_event'     then exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(p_entity_id))
    else false
  end
$$;
revoke all on function public.entity_visible(text, text) from public, anon;
grant execute on function public.entity_visible(text, text) to authenticated;

comment on function public.entity_visible(text, text) is
  'Default DENY (0118). An entity type with no case here is not visible to anyone. Add the case — with a real check, not `true` — when you add the type.';
