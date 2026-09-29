-- A scope's custom column values arrive without the id list.
--
-- The Main Client List asked custom_field_values for the values of every
-- client on screen by id — two GETs carrying 839 ids each on a Vanquish
-- switch, ~400 ms apiece — to receive, today, nothing: no custom client
-- column is defined yet (workspace_fields holds 23 work-item fields, zero
-- for fulfillment_client). Dee, 2026-09-30: "I do not want large ID lists
-- repeatedly sent across the wire when the server already knows the
-- Partner scope."
--
-- `creditops_custom_values(p_group)` returns the values for a partner
-- scope (or everything the caller may see when null) in one statement.
-- Invoker rights: the custom_field_values policy and the client policy
-- apply inside exactly as they do to the id query — the same rows by
-- construction, and the count is compared per account before this ships.
-- The list also stops asking at all while no client column exists.
--
-- Cost impact: less — and zero requests until somebody defines a column.

begin;

create or replace function public.creditops_custom_values(p_group uuid default null)
returns table(entity_id uuid, field_id uuid, value text)
language sql
stable
set search_path to 'public'
as $$
  select v.entity_id, v.field_id, v.value
    from public.custom_field_values v
    join public.fulfillment_clients c on c.id = v.entity_id
   where v.entity_type = 'fulfillment_client'
     and c.archived_at is null and not c.is_fixture
     and (p_group is null or c.outsourcing_group_id = p_group)
$$;

revoke all on function public.creditops_custom_values(uuid) from public;
grant execute on function public.creditops_custom_values(uuid) to authenticated;

comment on function public.creditops_custom_values(uuid) is
  'Custom column values for every active client in a partner scope (or every one the caller may see), '
  'in one statement under the caller''s own policies. What the Main Client List reads.';

commit;
