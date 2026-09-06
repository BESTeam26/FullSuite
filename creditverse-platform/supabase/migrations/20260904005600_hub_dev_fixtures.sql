-- 0078 — Hub packages for the deterministic dev fixtures
--
-- The three-layer rule can only be tested against organizations that differ:
--   Lakeside Partners  → Core + Operations + Performance (a Scale customer)
--   Cedar Financial    → Core only                      (a Build customer)
--   Harbor Capital     → nothing                        (never bought the Hub)
-- Test organizations only; no live customer is touched.
insert into public.product_entitlements (organization_id, product, enabled)
select o.id, p.product, true
  from public.organizations o
  cross join (values ('hubCore'::public.product_key), ('hubOperations'), ('hubPerformance')) as p(product)
 where o.name = '[TEST] Lakeside Partners'
on conflict (organization_id, product) do update set enabled = true;

insert into public.product_entitlements (organization_id, product, enabled)
select o.id, 'hubCore'::public.product_key, true
  from public.organizations o
 where o.name = '[TEST] Cedar Financial'
on conflict (organization_id, product) do update set enabled = true;

-- A hub with something switched on, so the navigation has content to show.
insert into public.organization_hub_modules (organization_id, module_key, enabled)
select o.id, m.key, true
  from public.organizations o
  cross join (values ('announcements'), ('people'), ('departments'), ('knowledge'), ('tools'), ('calendar')) as m(key)
 where o.name = '[TEST] Lakeside Partners'
on conflict (organization_id, module_key) do update set enabled = true;

insert into public.organization_hub_modules (organization_id, module_key, enabled)
select o.id, m.key, true
  from public.organizations o
  cross join (values ('announcements'), ('people'), ('knowledge')) as m(key)
 where o.name = '[TEST] Cedar Financial'
on conflict (organization_id, module_key) do update set enabled = true;

insert into public.organization_departments (organization_id, name, description, sort)
select o.id, d.name, d.description, d.sort
  from public.organizations o
  cross join (values
    ('Processing', 'Works the disputes and the letters.', 10),
    ('Sales',      'Brings the clients in.',              20),
    ('Support',    'Answers the clients.',                30)
  ) as d(name, description, sort)
 where o.name = '[TEST] Lakeside Partners'
on conflict (organization_id, name) do nothing;
