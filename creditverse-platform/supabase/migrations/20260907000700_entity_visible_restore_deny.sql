-- 0166 — restoring default-deny to `entity_visible`. My regression, in 0159.
--
-- ---------------------------------------------------------------------------
-- WHAT HAPPENED
--
-- 0159 needed one new case — 'partner' — so that a partner activity row could
-- not be written against a partner the writer cannot see. It was written by
-- copying the definition from 0093 and adding the case.
--
-- 0093 was not the current definition. Between it and 0159:
--
--   0118  made the function default DENY, replacing `else true`
--   0119  gave real checks to channel, client, company_document,
--         organization and activity_event, which had been passing on the
--         old `else true`
--
-- Copying the older text silently reverted both. The matrix caught it on the
-- next run: five checks that assert an undefined entity type is INVISIBLE
-- started reporting it as visible, and a channel went back to being waved
-- through instead of checked against membership.
--
-- This restores 0119 exactly and adds the one case 0159 actually wanted.
--
-- The lesson, recorded because it is the second time: a `create or replace`
-- on a function that already exists is a REWRITE, not an edit. Read the live
-- definition first — the newest migration that touches it, not the one that
-- created it — or a later fix is undone by a change that never mentioned it.
-- ---------------------------------------------------------------------------

create or replace function public.entity_visible(p_entity_type text, p_entity_id text)
returns boolean language sql stable security invoker set search_path = public as $function$
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
    -- Added 0159, kept: a partner activity row or file is visible exactly when
    -- the partner is, which the caller's own policies decide.
    when 'partner'            then exists (select 1 from public.outsourcing_groups g where g.id::text = p_entity_id)
    else false
  end
$function$;
revoke all on function public.entity_visible(text, text) from public, anon;
grant execute on function public.entity_visible(text, text) to authenticated;

comment on function public.entity_visible(text, text) is
  'Default DENY (0118). An entity type with no case here is not visible to anyone. Add the case — with a real check, not `true` — when you add the type. Restored in 0166 after 0159 reverted it by copying an older definition.';
