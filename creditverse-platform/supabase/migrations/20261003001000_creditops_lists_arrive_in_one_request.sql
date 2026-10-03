-- The CreditOps lists arrive in one request each (Go-Live NEEDS FIX:
-- "CreditOps cold load as the executive: 4.3 s, 18 requests").
--
-- Measured 2026-10-03 in the browser as Dee: the Main Client List and its
-- department rows each needed TWO round trips — PostgREST answers at most
-- 1,000 rows, so pageAll() reads the first page and only then the rest
-- (1,459 live clients, 1,463 department rows for a full-scope viewer). Each
-- round trip is ~1 s on a real link, so the list waited ~2.2 s for rows.
--
-- Two functions return the whole list as ONE jsonb value, which the row cap
-- does not apply to — one request, nothing truncated, nothing to page:
--
--   creditops_client_list()            the same rows the list read before
--                                      (archived and fixture files out), with
--                                      only the columns the list maps — no
--                                      date of birth, breach flags, legacy
--                                      ids or audit columns it never showed.
--   creditops_department_rows_all(g)   exactly creditops_department_rows(g),
--                                      aggregated. One definition of the rows.
--
-- Both are SECURITY INVOKER: every table, including the partner, organization
-- and agent names joined in, is read under the caller's own row rules, just
-- as PostgREST's embedded selects were. Proven per account, old against new.
--
-- Cost impact: fewer requests per CreditOps open; smaller client payload.

begin;

create or replace function public.creditops_client_list()
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name, 'email', c.email, 'phone', c.phone, 'mode', c.mode,
           'organization_id', c.organization_id,
           'organizations', case when o.id is null then null else jsonb_build_object('name', o.name) end,
           'outsourcing_group_id', c.outsourcing_group_id,
           'outsourcing_groups', case when g.id is null then null else jsonb_build_object('name', g.name) end,
           'auto_sync', c.auto_sync, 'status', c.status, 'round', c.round, 'lifecycle', c.lifecycle,
           'archived_at', c.archived_at, 'team_id', c.team_id, 'open_items', c.open_items,
           'due_at', c.due_at, 'processed_on', c.processed_on,
           'assigned_agent_id', c.assigned_agent_id,
           'assigned_agent', case when p.id is null then null else jsonb_build_object('full_name', p.full_name, 'email', p.email) end,
           'description', c.description, 'description_body', c.description_body,
           'next_action', c.next_action, 'last_activity_at', c.last_activity_at, 'created_at', c.created_at)
         order by c.name, c.id), '[]'::jsonb)
    from public.fulfillment_clients c
    left join public.organizations o on o.id = c.organization_id
    left join public.outsourcing_groups g on g.id = c.outsourcing_group_id
    left join public.profiles p on p.id = c.assigned_agent_id
   where c.archived_at is null and not c.is_fixture
$$;

create or replace function public.creditops_department_rows_all(p_group uuid default null)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.client_id, r.department), '[]'::jsonb)
    from public.creditops_department_rows(p_group) r
$$;

revoke execute on function public.creditops_client_list() from anon, public;
revoke execute on function public.creditops_department_rows_all(uuid) from anon, public;
grant execute on function public.creditops_client_list() to authenticated;
grant execute on function public.creditops_department_rows_all(uuid) to authenticated;

commit;
