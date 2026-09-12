-- =============================================================================
-- The headline follows the PRIMARY work, including when the primary work has
-- nobody on it.
--
-- Dee's rule 9, exactly: "if current primary work has an assignee → headline =
-- that assignee. If waiting / Partner-owned / Support-unassigned → headline =
-- Unassigned."
--
-- The first version fell through to "the only actionable assignee" even when a
-- primary department HAD been determined and was simply unassigned. The
-- acceptance probe caught it: a file routed to Support after processing showed
-- the previous processor as its headline, because their Dispute row was still
-- open. That is the exact outcome Dee locked out — "Do NOT automatically
-- assign it back to the previous processor" — arrived at through the summary
-- field instead of the assignment.
--
-- So: a primary department is the answer, assignee or not. The fallback exists
-- only for statuses that route to NO department — terminal and partner-owned —
-- where one lone actionable owner is genuinely the best summary available.
--
-- The per-department assignees are untouched either way. This field is a
-- summary and never an authority (Dee, §9).
-- =============================================================================

create or replace function public.creditops_refresh_headline(p_client uuid)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_primary public.fulfillment_department;
  v_routed boolean := false;
  v_headline uuid;
  v_owners uuid[];
begin
  select r.department, true into v_primary, v_routed
    from public.fulfillment_clients c
    join public.creditops_status_routing r on r.status = c.status
   where c.id = p_client;

  if v_primary is not null then
    /* The primary department's own answer, including "nobody". */
    select s.assignee_id into v_headline
      from public.client_department_statuses s
     where s.client_id = p_client and s.department = v_primary
       and public.creditops_status_is_actionable(s.department, s.status);
  else
    /* No primary — the status routes nowhere. One actionable owner is a fair
       summary; several is not, and naming one would hide the others. */
    select array_agg(distinct s.assignee_id) into v_owners
      from public.client_department_statuses s
     where s.client_id = p_client and s.assignee_id is not null
       and public.creditops_status_is_actionable(s.department, s.status);
    v_headline := case when coalesce(array_length(v_owners, 1), 0) = 1 then v_owners[1] end;
  end if;

  update public.fulfillment_clients
     set assigned_agent_id = v_headline
   where id = p_client and assigned_agent_id is distinct from v_headline;
end $function$;
revoke execute on function public.creditops_refresh_headline(uuid) from public, anon, authenticated;
