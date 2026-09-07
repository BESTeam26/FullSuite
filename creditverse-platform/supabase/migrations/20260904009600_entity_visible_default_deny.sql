-- 0118 — `entity_visible()` defaults to DENY.
--
-- The function decides whether a notification is still readable, by asking
-- whether the thing it is about is still visible to this caller. It has always
-- ended with:
--
--     else true
--
-- which means: an entity type it has never heard of is visible to everyone who
-- gets past the other clauses. In a platform whose first rule is default-deny,
-- that is backwards, and it is the reason no new feature could safely adopt a
-- new entity type — a client-level document store, for instance, would have
-- inherited "visible unless someone remembers to add a case".
--
-- Two things make this safe to flip rather than merely correct to want:
--
--   1. Every entity type actually written today is enumerated below. The ones
--      already handled — fulfillment_client, funding_client, work_item,
--      funding_file, eod_submission — keep their exact existing checks. The
--      ones that were falling through — `channel` and `client` — get the real
--      check they should always have had.
--   2. The notification policy also requires `recipient_id = auth.uid()` and
--      `can_view_activity(...)`, so this was never a way to read somebody
--      else's notifications. What it was, was a failure to STOP showing a
--      notification about a record you have since lost access to. That is the
--      hole being closed.
--
-- SECURITY INVOKER is preserved deliberately. Every `exists` below is filtered
-- by that table's own policy as the CALLER — which is the entire mechanism.
-- Making this DEFINER would make every check pass for everyone.

create or replace function public.entity_visible(p_entity_type text, p_entity_id text)
returns boolean language sql stable security invoker set search_path = public as $$
  select case p_entity_type
    when 'fulfillment_client' then exists (select 1 from public.fulfillment_clients c where c.id::text = p_entity_id)
    when 'funding_client'     then exists (select 1 from public.funding_clients c where c.id::text = p_entity_id)
    when 'work_item'          then exists (select 1 from public.work_items w where w.id::text = p_entity_id)
    when 'funding_file'       then exists (select 1 from public.funding_files f where f.id::text = p_entity_id)
    when 'eod_submission'     then exists (select 1 from public.eod_submissions e where e.id::text = p_entity_id)
    -- Falling through to `true` until now. A channel notification stayed
    -- readable after the person was removed from the channel.
    when 'channel'            then exists (select 1 from public.channels c where c.id::text = p_entity_id)
    -- The canonical client. Nothing writes activity against it yet, and this
    -- is what makes it safe to start.
    when 'client'             then exists (select 1 from public.clients c where c.id::text = p_entity_id)
    -- Default DENY. A new entity type is invisible until someone writes its
    -- check here — which is the correct amount of friction for a decision
    -- about who can see what.
    else false
  end
$$;
revoke all on function public.entity_visible(text, text) from public, anon;
grant execute on function public.entity_visible(text, text) to authenticated;

comment on function public.entity_visible(text, text) is
  'Default DENY (0118). An entity type with no case here is not visible to anyone. Add the case when you add the type.';
