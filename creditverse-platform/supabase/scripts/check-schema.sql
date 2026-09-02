-- Paste into the Supabase SQL editor to see exactly what landed.
select
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE')            as tables,
  (select count(*) from information_schema.views
     where table_schema = 'public')                                          as views,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public')                                             as functions,
  (select count(*) from pg_policies where schemaname = 'public')             as rls_policies,
  (select count(*) from public.organizations)                                as seeded_orgs;

-- Expected after a successful apply: 15 tables, 1 view, ~20 functions,
-- ~35 policies, 5 seeded orgs.

select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
