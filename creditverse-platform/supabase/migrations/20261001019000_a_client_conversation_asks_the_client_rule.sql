-- A client's conversation asks the client rule (Go-Live Stabilization Pass,
-- full review, 2026-10-01 night).
--
-- Found by matrix phase 47 ("no SECURITY DEFINER function calls a helper
-- whose correctness depends on caller RLS"), then proven with real accounts:
--
--   client_feed() and client_posts() are SECURITY DEFINER and authorised the
--   caller with entity_visible('fulfillment_client', id) — an INVOKER helper
--   that is only honest under the caller's row rules. Inside a definer it
--   runs with the owner's rights and answers TRUE for any client that
--   exists. The only check left standing was can_see_partner(), so anybody
--   who could see a partner could read every comment on every client of that
--   partner, including people the client rule shows no clients at all:
--
--     JM (executive assistant, sees 0 clients)  13,661 comments, 2,146 clients
--     James (sees 0 clients)                     1,510 comments,   111 clients
--
--   It needed a direct call with a client's id; no screen offered it. Hidden
--   ids are not protection (rule 1).
--
-- The fix: fulfillment_client_readable() evaluates EXACTLY the select policy
-- of fulfillment_clients for one client, as a definer, so it is honest inside
-- other definers too. Both conversation functions now ask it. Matrix phase 47
-- asserts, per persona, that it agrees with the table's own row rules — two
-- copies of one rule are only safe while something proves they match.

create or replace function public.fulfillment_client_readable(p_client uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  /* Keep this predicate identical to the fulfillment_clients_select policy
     (and fulfillment_clients_portal_select, which its first clause covers).
     Matrix phase 47 fails the release if they ever disagree. */
  select exists (
    select 1 from public.fulfillment_clients c
     where c.id = p_client
       and (
         (c.client_id in (select public.my_client_ids()))
         or (c.assigned_agent_id = auth.uid() and public.is_staff_of(c.agency_id))
         or (c.outsourcing_group_id is not null
             and c.outsourcing_group_id in (select public.creditops_visible_group_ids())
             and ((c.agency_id in (select public.creditops_directory_agency_ids()))
                  or (public.agency_can('partners.view')
                      and public.creditops_any_reach()
                      and public.in_scope(c.agency_id, 'creditops'::public.fulfillment_service, c.team_id, c.assigned_agent_id, c.created_by))))
         or (c.outsourcing_group_id is null and c.organization_id is not null
             and public.bes_may_fulfil(c.organization_id, null::uuid, 'creditops'::public.fulfillment_service)
             and public.in_scope(c.agency_id, 'creditops'::public.fulfillment_service, c.team_id, c.assigned_agent_id, c.created_by))
         or (c.outsourcing_group_id is null and c.organization_id is null
             and public.is_staff_of(c.agency_id)
             and public.in_scope(c.agency_id, 'creditops'::public.fulfillment_service, c.team_id, c.assigned_agent_id, c.created_by))
         or (c.organization_id is not null
             and public.org_has_product(c.organization_id, 'creditOps'::public.product_key)
             and public.org_scope_allows(c.organization_id, c.assigned_agent_id))
       ))
$$;

grant execute on function public.fulfillment_client_readable(uuid) to authenticated;

do $$
declare v_def text;
begin
  /* Swap the one predicate in each function, in place, so nothing else in
     their bodies (the comment rules, reactions, files) changes. Refuse loudly
     if the text is not found rather than ship a no-op. */
  select pg_get_functiondef('public.client_feed(uuid)'::regprocedure) into v_def;
  if position($q$public.entity_visible('fulfillment_client', p_client::text)$q$ in v_def) = 0 then
    raise exception 'client_feed: expected predicate not found';
  end if;
  execute replace(v_def,
    $q$public.entity_visible('fulfillment_client', p_client::text)$q$,
    $q$public.fulfillment_client_readable(p_client)$q$);

  select pg_get_functiondef('public.client_posts(uuid)'::regprocedure) into v_def;
  if position($q$public.entity_visible('fulfillment_client', p_client::text)$q$ in v_def) = 0 then
    raise exception 'client_posts: expected predicate not found';
  end if;
  execute replace(v_def,
    $q$public.entity_visible('fulfillment_client', p_client::text)$q$,
    $q$public.fulfillment_client_readable(p_client)$q$);
end $$;
