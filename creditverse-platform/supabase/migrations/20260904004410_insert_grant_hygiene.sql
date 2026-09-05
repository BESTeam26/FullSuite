-- 0064.1 — INSERT grants follow the same rule as UPDATE/DELETE (0063): the API
-- role holds INSERT only where a policy can allow it. Found while verifying
-- 0064: permission_keys and member_permissions carried the default INSERT
-- grant with no insert policy (writes go through the definer-rights
-- functions). Revoked by catalogue query, so any other table in the same
-- state is corrected too; new tables default to SELECT only from here.
do $$
declare r record;
begin
  for r in
    select g.table_name
      from information_schema.role_table_grants g
      join pg_class c on c.relname = g.table_name
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
     where g.grantee = 'authenticated' and g.table_schema = 'public'
       and g.privilege_type = 'INSERT' and c.relkind in ('r', 'p', 'v')
       and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = g.table_name and p.cmd in ('ALL', 'INSERT'))
  loop
    execute format('revoke insert on public.%I from authenticated', r.table_name);
  end loop;
end $$;
alter default privileges for role postgres in schema public revoke insert on tables from authenticated;
