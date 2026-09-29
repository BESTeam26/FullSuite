-- custom_field_values.value is jsonb; the scope function returns it as such.
-- (20260930027000 declared text; Postgres accepted the definition, but the
-- row shape must match the column so a stored value round-trips unchanged.)
begin;
drop function if exists public.creditops_custom_values(uuid);
create or replace function public.creditops_custom_values(p_group uuid default null)
returns table(entity_id uuid, field_id uuid, value jsonb)
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
