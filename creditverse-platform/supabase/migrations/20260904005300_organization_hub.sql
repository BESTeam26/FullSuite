-- 0075 — Organization Hub: the company layer, under three-layer control
--
-- CLAUDE.md rule 18. One Hub framework; BES HQ and every customer organization
-- run the same modules over their own records.
--
--   PRODUCT ENTITLED  and  ORGANIZATION ENABLED  and  USER AUTHORIZED
--
-- The first of those three is enforced *here*, in the writer: an organization
-- cannot switch on a module its subscription does not include. The second is
-- the row this migration stores. The third is `member_can()`, unchanged.
--
-- Nothing in here is a new engine. Every module points at a canonical system
-- that already exists (work_items, profiles, teams, files, announcements,
-- knowledge_articles, production/EOD, the AI gateway); a module row decides
-- whether that system is surfaced as part of the company hub, nothing more.

-- ---------------------------------------------------------------------------
-- 1. The registry: which modules exist, in which package, and whether the
--    screen behind one is actually built yet. `status` keeps us honest —
--    a planned module is offered as "coming", never as a toggle that does
--    nothing (rule 12).
-- ---------------------------------------------------------------------------
create type public.hub_module_status as enum ('available', 'planned');

create table public.hub_modules (
  key          text primary key,
  package      public.product_key not null,
  label        text not null,
  description  text not null,
  /* A module every hub has: it cannot be switched off. */
  always_on    boolean not null default false,
  status       public.hub_module_status not null default 'available',
  /* The canonical system behind it — documentation, and a reviewer's check
     that no module invented its own engine. */
  backed_by    text not null,
  sort         integer not null default 100,
  constraint hub_modules_package check (package in ('hubCore', 'hubOperations', 'hubPerformance', 'hubAi'))
);

insert into public.hub_modules (key, package, label, description, always_on, status, backed_by, sort) values
  ('home',          'hubCore',        'Home',                  'The company front page: what is happening today and what needs you.',        true,  'available', 'work_items + organization figures',        10),
  ('announcements', 'hubCore',        'Announcements',         'Notices from the owner and managers to everyone in the company.',            false, 'available', 'announcements',                            20),
  ('people',        'hubCore',        'People',                'Who works here, what they do, and how to reach them.',                       false, 'available', 'org_memberships + profiles',               30),
  ('departments',   'hubCore',        'Departments',           'How the company is organised, and who belongs where.',                       false, 'available', 'teams / divisions',                        40),
  ('my_work',       'hubCore',        'My Work',               'Everything assigned to a person, across every module.',                      true,  'available', 'work_items',                               50),
  ('knowledge',     'hubCore',        'Knowledge',             'Procedures, scripts and guides the whole company works from.',               false, 'available', 'knowledge_articles',                       60),
  ('files',         'hubCore',        'Files',                 'Shared company documents.',                                                  false, 'available', 'files + storage',                          70),
  ('tools',         'hubCore',        'Tools',                 'Links to the other systems the company uses every day.',                     false, 'available', 'organization_hub_tools',                   80),
  ('calendar',      'hubOperations',  'Calendar',              'Company dates: due work, meetings and events.',                              false, 'available', 'work_items due dates',                    110),
  ('requests',      'hubOperations',  'Requests & Approvals',  'Time off, expenses and internal requests, with an approval trail.',          false, 'planned',   'work_items (planned)',                    120),
  ('forms',         'hubOperations',  'Forms',                 'Internal forms the company collects answers with.',                          false, 'planned',   'work_items (planned)',                    130),
  ('dept_spaces',   'hubOperations',  'Department workspaces', 'A board per department for its own operational work.',                       false, 'available', 'custom workspaces',                       140),
  ('ops_dashboard', 'hubOperations',  'Operational dashboards','Where the work stands, by stage, person and department.',                    false, 'available', 'reporting engine',                        150),
  ('kpis',          'hubPerformance', 'KPIs & scorecards',     'The figures the company tracks, with targets.',                              false, 'available', 'kpi_definitions + organization_kpi_settings', 210),
  ('goals',         'hubPerformance', 'Goals',                 'What the company and each team are working toward this period.',             false, 'planned',   'reporting engine (planned)',              220),
  ('productivity',  'hubPerformance', 'Productivity',          'Time and production per person and per team.',                               false, 'available', 'time entries + production',               230),
  ('eod',           'hubPerformance', 'End of Day',            'The daily summary each person submits.',                                     false, 'available', 'eod reports',                             240),
  ('training',      'hubPerformance', 'Training',              'Courses the company assigns, and who has completed them.',                   false, 'planned',   'knowledge_articles (planned)',            250),
  ('coaching',      'hubPerformance', 'Coaching & reviews',    'One-to-ones, notes and reviews between a manager and their team.',           false, 'planned',   'work_items (planned)',                    260),
  ('assistant',     'hubAi',          'Company assistant',     'Ask questions about the company''s own procedures and records.',             false, 'available', 'ai gateway + ai credits',                 310),
  ('sop_search',    'hubAi',          'Knowledge search',      'Find the right procedure by describing the situation.',                      false, 'planned',   'ai gateway (planned)',                    320);

alter table public.hub_modules enable row level security;
create policy hub_modules_select on public.hub_modules for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 2. What each organization switched on. Absent row = the package default
--    (off, except always_on modules).
-- ---------------------------------------------------------------------------
create table public.organization_hub_modules (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  module_key      text not null references public.hub_modules(key) on delete cascade,
  enabled         boolean not null default false,
  updated_by      uuid references public.profiles(id),
  updated_at      timestamptz not null default now(),
  primary key (organization_id, module_key)
);
create trigger organization_hub_modules_updated_at before update on public.organization_hub_modules
  for each row execute function public.set_updated_at();

alter table public.organization_hub_modules enable row level security;

create policy organization_hub_modules_select on public.organization_hub_modules for select to authenticated
  using (public.can_view_org(organization_id));

-- ---------------------------------------------------------------------------
-- 3. Layer one: is the package purchased? BES HQ is not entitlement-gated —
--    its own hub is its internal operating environment, not a product it buys
--    from itself (rule 16).
-- ---------------------------------------------------------------------------
create or replace function public.hub_package_entitled(p_org uuid, p_package public.product_key)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.product_entitlements e
     where e.organization_id = p_org and e.product = p_package and e.enabled
  )
$$;
revoke all on function public.hub_package_entitled(uuid, public.product_key) from public, anon;
grant execute on function public.hub_package_entitled(uuid, public.product_key) to authenticated;

/* Layers one and two together: entitled AND (always on OR switched on). The
   third layer, the person's permission, stays with member_can() where every
   other authorization decision lives. */
create or replace function public.hub_module_active(p_org uuid, p_module text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.hub_modules m
      left join public.organization_hub_modules o
        on o.organization_id = p_org and o.module_key = m.key
     where m.key = p_module
       and m.status = 'available'
       and public.hub_package_entitled(p_org, m.package)
       and (m.always_on or coalesce(o.enabled, false))
  )
$$;
revoke all on function public.hub_module_active(uuid, text) from public, anon;
grant execute on function public.hub_module_active(uuid, text) to authenticated;

/* One round trip for the whole hub: every module, whether the organization
   owns its package, whether it switched it on, and whether it is live. The
   navigation reads this once instead of asking per module (rule 14). */
create or replace function public.organization_hub(p_org uuid)
returns table (
  key text, package public.product_key, label text, description text,
  always_on boolean, status public.hub_module_status, backed_by text, sort integer,
  entitled boolean, enabled boolean, active boolean
)
language sql stable security definer set search_path = public as $$
  select m.key, m.package, m.label, m.description, m.always_on, m.status, m.backed_by, m.sort,
         public.hub_package_entitled(p_org, m.package) as entitled,
         (m.always_on or coalesce(o.enabled, false)) as enabled,
         (m.status = 'available'
           and public.hub_package_entitled(p_org, m.package)
           and (m.always_on or coalesce(o.enabled, false))) as active
    from public.hub_modules m
    left join public.organization_hub_modules o
      on o.organization_id = p_org and o.module_key = m.key
   where public.can_view_org(p_org)
   order by m.sort
$$;
revoke all on function public.organization_hub(uuid) from public, anon;
grant execute on function public.organization_hub(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Layer two's writer. The entitlement check is here, in the database:
--    an organization cannot switch on what it did not buy, whatever the
--    interface sends.
-- ---------------------------------------------------------------------------
create or replace function public.set_hub_module(p_org uuid, p_module text, p_enabled boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_module public.hub_modules;
  v_before jsonb;
begin
  if not public.member_can(p_org, 'settings.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into v_module from public.hub_modules where key = p_module;
  if v_module.key is null then
    raise exception 'unknown hub module %', p_module using errcode = 'P0002';
  end if;
  if v_module.always_on then
    raise exception 'this module is part of every hub and cannot be switched off' using errcode = '42501';
  end if;
  -- Layer one. Never let an organization toggle activate an unpurchased product.
  if p_enabled and not public.hub_package_entitled(p_org, v_module.package) then
    raise exception 'this module is not part of the current subscription' using errcode = '42501';
  end if;
  if p_enabled and v_module.status <> 'available' then
    raise exception 'this module is not built yet' using errcode = '42501';
  end if;
  select to_jsonb(o) into v_before from public.organization_hub_modules o
   where o.organization_id = p_org and o.module_key = p_module;
  insert into public.organization_hub_modules (organization_id, module_key, enabled, updated_by)
  values (p_org, p_module, p_enabled, auth.uid())
  on conflict (organization_id, module_key) do update
    set enabled = excluded.enabled, updated_by = excluded.updated_by;
  perform public.log_audit('hub_module.set', 'hub_module', p_org::text || ':' || p_module, p_org,
                           v_before, jsonb_build_object('module', p_module, 'enabled', p_enabled));
end $$;
revoke all on function public.set_hub_module(uuid, text, boolean) from public, anon;
grant execute on function public.set_hub_module(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Tools: the links a company keeps for its own team (the app launcher).
--    Part of Hub Core, owned by the organization, written with settings.manage.
-- ---------------------------------------------------------------------------
create table public.organization_hub_tools (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label           text not null check (length(label) between 1 and 60),
  url             text not null check (url ~* '^https?://' and length(url) <= 2000),
  note            text check (note is null or length(note) <= 200),
  sort            integer not null default 100,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index organization_hub_tools_org_idx on public.organization_hub_tools (organization_id, sort);
create trigger organization_hub_tools_updated_at before update on public.organization_hub_tools
  for each row execute function public.set_updated_at();

alter table public.organization_hub_tools enable row level security;
create policy organization_hub_tools_select on public.organization_hub_tools for select to authenticated
  using (public.is_org_member(organization_id) and public.hub_module_active(organization_id, 'tools'));

create or replace function public.save_hub_tool(p_id uuid, p_org uuid, p_label text, p_url text, p_note text, p_sort integer)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_row public.organization_hub_tools;
  v_before jsonb;
begin
  if not public.member_can(p_org, 'settings.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not public.hub_module_active(p_org, 'tools') then
    raise exception 'the Tools module is not active for this organization' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.organization_hub_tools (organization_id, label, url, note, sort, created_by)
    values (p_org, p_label, p_url, nullif(p_note, ''), coalesce(p_sort, 100), auth.uid())
    returning * into v_row;
  else
    select to_jsonb(t) into v_before from public.organization_hub_tools t where t.id = p_id and t.organization_id = p_org;
    if v_before is null then
      raise exception 'tool not found' using errcode = 'P0002';
    end if;
    update public.organization_hub_tools
       set label = p_label, url = p_url, note = nullif(p_note, ''), sort = coalesce(p_sort, 100)
     where id = p_id
    returning * into v_row;
  end if;
  perform public.log_audit('hub_tool.saved', 'hub_tool', v_row.id::text, p_org, v_before, to_jsonb(v_row));
  return v_row.id;
end $$;
revoke all on function public.save_hub_tool(uuid, uuid, text, text, text, integer) from public, anon;
grant execute on function public.save_hub_tool(uuid, uuid, text, text, text, integer) to authenticated;

create or replace function public.delete_hub_tool(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.organization_hub_tools;
begin
  select * into v_row from public.organization_hub_tools where id = p_id;
  if v_row.id is null then
    raise exception 'tool not found' using errcode = 'P0002';
  end if;
  if not public.member_can(v_row.organization_id, 'settings.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  delete from public.organization_hub_tools where id = p_id;
  perform public.log_audit('hub_tool.deleted', 'hub_tool', p_id::text, v_row.organization_id, to_jsonb(v_row), null);
end $$;
revoke all on function public.delete_hub_tool(uuid) from public, anon;
grant execute on function public.delete_hub_tool(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Plans: which packages each bundle includes (rule 18's table). Prices are
--    still Dee's to set; this records what a plan contains, not what it costs.
-- ---------------------------------------------------------------------------
update public.plans set products = products || array['hubCore']::public.product_key[]
 where key in ('creditops', 'fundingops') and not ('hubCore' = any (products));
update public.plans set products = products || array['hubCore','hubOperations']::public.product_key[]
 where key = 'growth' and not ('hubCore' = any (products));
update public.plans set products = products || array['hubCore','hubOperations','hubPerformance']::public.product_key[]
 where key = 'full_suite' and not ('hubCore' = any (products));

revoke all on public.hub_modules, public.organization_hub_modules, public.organization_hub_tools from anon;
