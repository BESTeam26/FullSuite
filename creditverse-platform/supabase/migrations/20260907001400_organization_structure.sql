-- 0173 — Divisions, Departments and Teams become Dee's to manage.
--
-- ---------------------------------------------------------------------------
-- WHY THE CRM / GHL TEAM WAS NOWHERE TO BE FOUND
--
-- Nothing was hidden, filtered or misattached. It simply did not exist.
--
-- `departments` had rows for CreditOps and FundingOps only — twelve of them,
-- seeded when those two workflows were built. `bes_crm` and `talentops` are
-- perfectly valid values of the division enum and always were; nobody had ever
-- created a department under either. A team can exist without a department, so
-- a CRM team COULD have been made — but none had been, and there was no screen
-- to make one with. The gap was a missing capability, not a missing row.
--
-- ---------------------------------------------------------------------------
-- THE MODEL, AND THE ONE THING IT CAREFULLY DOES NOT CHANGE
--
--   BES AGENCY HQ → DIVISION → DEPARTMENT → TEAM → PEOPLE
--
-- Divisions become a TABLE so Dee can add "Corporate Operations" without a
-- migration. But `fulfillment_service` — creditops, fundingops, bes_crm,
-- talentops — is not just a label: it is what `in_scope()` and
-- `bes_may_fulfil()` read to decide who may see a customer's work. Turning it
-- into free text would make authorization depend on a name somebody can edit,
-- which is the exact thing rule 4 forbids.
--
-- So a division row OPTIONALLY carries a `service`. That is its authorization
-- identity, and it is what the enum columns keep reading. A division with no
-- service — Corporate Operations — is an organizational grouping and grants
-- nothing. Renaming a division never touches either.
--
-- Nothing is deleted anywhere here: archiving is the retirement path for a
-- division, a department and a team alike (rule 11), and every existing team
-- keeps its identity so "Team Daniel" is still the same team afterwards.
-- ---------------------------------------------------------------------------

create table public.divisions (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 80),
  description text,
  /** The authorization identity, when this division IS a BES service. NULL for
      an organizational grouping that grants nothing. */
  service     public.fulfillment_service,
  lead_id     uuid references public.profiles(id) on delete set null,
  sort        integer not null default 0,
  archived_at timestamptz,
  is_fixture  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (agency_id, name)
);
create unique index divisions_service_idx on public.divisions (agency_id, service)
  where service is not null;
create trigger divisions_updated_at before update on public.divisions
  for each row execute function public.set_updated_at();

comment on column public.divisions.service is
  'What this division IS to the authorization system. `in_scope()` and `bes_may_fulfil()` read the enum, never the name — so renaming a division cannot widen or narrow what anybody sees. NULL means the division is a grouping and grants nothing.';

-- ── Departments gain a real parent, a manager and a lifecycle ───────────
alter table public.departments
  add column if not exists division_id uuid references public.divisions(id) on delete set null,
  add column if not exists description text,
  add column if not exists manager_id  uuid references public.profiles(id) on delete set null,
  add column if not exists sort        integer not null default 0,
  add column if not exists archived_at timestamptz,
  add column if not exists is_fixture  boolean not null default false;

comment on column public.departments.division is
  'LEGACY but LOAD-BEARING: the enum RLS reads. `division_id` is the editable parent, and a trigger keeps this equal to that division''s service. Write division_id.';

alter table public.teams
  add column if not exists description text,
  add column if not exists sort        integer not null default 0;

-- ── A person's place in the company ─────────────────────────────────────
--
-- Distinct from their SECURITY ROLE, and deliberately so (Dee, §12): somebody
-- whose job title is "GHL Team Lead" may hold any agency role, and managing a
-- department grants no permission by itself.
alter table public.agency_memberships
  add column if not exists job_title            text,
  add column if not exists manager_id           uuid references public.profiles(id) on delete set null,
  add column if not exists primary_team_id      uuid references public.teams(id) on delete set null,
  add column if not exists primary_department_id uuid references public.departments(id) on delete set null,
  add column if not exists primary_division_id  uuid references public.divisions(id) on delete set null;

comment on column public.agency_memberships.primary_team_id is
  'Where this person mainly sits. Secondary teams are ordinary `team_memberships` rows — one person, many teams, one primary reporting line (Dee, §7).';
comment on column public.agency_memberships.job_title is
  'What they do. NOT their agency role: "Operations Manager" is a job, `agency_manager` is a permission set, and inferring one from the other is how a title grants access nobody granted (Dee, §12).';

-- ── The divisions BES actually has ──────────────────────────────────────
insert into public.divisions (agency_id, name, service, sort, description)
select a.id, v.name, v.service, v.sort, v.description
  from public.agencies a,
       (values
         ('CreditOps',            'creditops'::public.fulfillment_service, 10, 'Credit repair fulfilment for partners'),
         ('FundingOps',           'fundingops'::public.fulfillment_service, 20, 'Business funding files, submissions and offers'),
         ('BES CRM',              'bes_crm'::public.fulfillment_service,    30, 'CRM, GHL, automation, websites and funnels'),
         ('TalentOps',            'talentops'::public.fulfillment_service,  40, 'Staffing and dedicated agents'),
         ('Corporate Operations', null::public.fulfillment_service,         50, 'BES''s own admin, finance and management')
       ) as v(name, service, sort, description)
on conflict (agency_id, name) do nothing;

/* Existing departments adopt their division by the enum they already carry.
   No department is created, moved or renamed — they gain a parent. */
update public.departments d
   set division_id = v.id
  from public.divisions v
 where v.agency_id = d.agency_id and v.service = d.division and d.division_id is null;

/* The structure Dee described for the CRM side. Created only because nothing
   equivalent exists — reconciliation first, seeding second (Dee, §26). */
insert into public.departments (agency_id, division, division_id, key, name, sort)
select v.agency_id, v.service, v.id, x.key, x.name, x.sort
  from public.divisions v,
       (values ('ghl_crm_ops', 'GHL / CRM Operations', 10),
               ('websites_funnels', 'Websites / Funnels', 20),
               ('crm_support', 'CRM Support', 30)
       ) as x(key, name, sort)
 where v.name = 'BES CRM'
   and not exists (select 1 from public.departments d where d.division_id = v.id and d.name = x.name);

insert into public.departments (agency_id, division, division_id, key, name, sort)
select v.agency_id, v.service, v.id, x.key, x.name, x.sort
  from public.divisions v,
       (values ('recruitment', 'Recruitment', 10),
               ('staff_management', 'Staff Management', 20),
               ('training', 'Training', 30)
       ) as x(key, name, sort)
 where v.name = 'TalentOps'
   and not exists (select 1 from public.departments d where d.division_id = v.id and d.name = x.name);

-- ── The enum follows the division, in one place ─────────────────────────
create or replace function public.department_sync_division()
returns trigger language plpgsql set search_path = public as $function$
begin
  if new.division_id is not null then
    select v.service into new.division from public.divisions v where v.id = new.division_id;
  end if;
  return new;
end;
$function$;

create trigger departments_sync_division
  before insert or update of division_id on public.departments
  for each row execute function public.department_sync_division();

comment on function public.department_sync_division() is
  'Keeps the legacy `division` enum equal to the parent division''s service. One writable field, one derived — two writable fields meaning the same thing is how they disagree.';

-- ── Who may change the shape of the company ─────────────────────────────
insert into public.permission_keys (key, module, label, description, security_relevant, sort) values
  ('org.structure.view',   'Organization', 'View organization structure', 'See divisions, departments and teams.', false, 140),
  ('org.structure.manage', 'Organization', 'Manage organization structure', 'Create, rename, move and archive divisions, departments and teams.', true, 141)
on conflict (key) do nothing;

insert into public.agency_role_permissions (agency_id, role, key, allowed) values
  (null, 'agency_manager',   'org.structure.view',   true),
  (null, 'agency_manager',   'org.structure.manage', false),
  (null, 'agency_team_lead', 'org.structure.view',   true),
  (null, 'agency_team_lead', 'org.structure.manage', false),
  (null, 'agency_agent',     'org.structure.view',   false),
  (null, 'agency_agent',     'org.structure.manage', false)
on conflict do nothing;

alter table public.divisions enable row level security;
revoke all on public.divisions from public, anon;
grant select, insert, update on public.divisions to authenticated;

/* Reading the shape of the company is ordinary for staff who work inside it.
   Changing it is an administrator's job — and note what this does NOT do:
   being in a division grants nothing, so a policy here can never widen what
   anybody sees of a customer's work (Dee, §20). */
create policy divisions_select on public.divisions for select to authenticated
  using (public.is_staff_of(agency_id));
create policy divisions_insert on public.divisions for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.agency_can('org.structure.manage'));
create policy divisions_update on public.divisions for update to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('org.structure.manage'))
  with check (public.is_staff_of(agency_id) and public.agency_can('org.structure.manage'));
-- No delete policy: a division is archived (rule 11).

/* Departments were readable and admin-writable already; the capability now
   governs writes so a manager can be granted structure management without
   being made an administrator. */
drop policy if exists departments_write on public.departments;
create policy departments_insert on public.departments for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.agency_can('org.structure.manage'));
create policy departments_update on public.departments for update to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('org.structure.manage'))
  with check (public.is_staff_of(agency_id) and public.agency_can('org.structure.manage'));
