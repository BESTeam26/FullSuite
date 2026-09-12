-- =============================================================================
-- `min(uuid)` does not exist in Postgres.
--
-- Found by the acceptance probe, not by reading: `creditops_refresh_headline`
-- used `count(*), min(assignee_id)` to mean "the only actionable assignee, if
-- there is exactly one". It parses, and it throws 42883 the moment a client is
-- routed — which is every insert and every status change.
--
-- Rewritten as the thing it was trying to say: collect the distinct actionable
-- assignees, and take the one only when there is exactly one.
-- =============================================================================

create or replace function public.creditops_refresh_headline(p_client uuid)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_primary public.fulfillment_department;
  v_headline uuid;
  v_owners uuid[];
begin
  select r.department into v_primary
    from public.fulfillment_clients c
    join public.creditops_status_routing r on r.status = c.status
   where c.id = p_client;

  if v_primary is not null then
    select s.assignee_id into v_headline
      from public.client_department_statuses s
     where s.client_id = p_client and s.department = v_primary
       and s.assignee_id is not null
       and public.creditops_status_is_actionable(s.department, s.status);
  end if;

  if v_headline is null then
    select array_agg(distinct s.assignee_id) into v_owners
      from public.client_department_statuses s
     where s.client_id = p_client and s.assignee_id is not null
       and public.creditops_status_is_actionable(s.department, s.status);
    /* Exactly one actionable owner and no primary among them: name them.
       Several, and the summary says nobody rather than picking one and hiding
       the rest — the queues and the client file show each department's own
       assignee, which stays authoritative (Dee, §9). */
    v_headline := case when coalesce(array_length(v_owners, 1), 0) = 1 then v_owners[1] end;
  end if;

  update public.fulfillment_clients
     set assigned_agent_id = v_headline
   where id = p_client and assigned_agent_id is distinct from v_headline;
end $function$;
revoke execute on function public.creditops_refresh_headline(uuid) from public, anon, authenticated;
