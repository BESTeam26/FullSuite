-- 0220 — BES CRM: the build library. Engines, versioned templates, and the
--        master requirement library.
--
-- ===========================================================================
-- 140 SOURCE REQUIREMENTS ≠ 140 LIVE TASKS
-- ===========================================================================
--
-- Dee, 2026-09-08, superseding an earlier design:
--
--   "DO NOT build a system where the CRM Team has to manually manage 140
--    individual tracker rows… THE MASTER TRACKER MAY BE DETAILED. THE TEAM
--    WORKSPACE MUST BE SIMPLE."
--
-- So `BES_GHL_Full_Infrastructure_Build_Tracker.xlsx` becomes a LIBRARY that
-- sits underneath a project, not a task list. Every source row is preserved
-- and classified; a row becomes a live work item only if it is classified as
-- a Work Unit AND its engine was actually purchased.
--
-- NOTHING IN THIS MIGRATION IS A SECOND TASK ENGINE (rule 17b). There is no
-- table here that holds a status, an assignee, a due date or a completion —
-- those live on `work_items`, and 0221 attaches work units to it. What is here
-- is CONFIGURATION: which engines exist, what a good build looks like, and
-- where each source requirement belongs.
--
-- ===========================================================================
-- THE WORKBOOK IS NOT IN THE REPOSITORY YET
-- ===========================================================================
--
-- `crm_requirements` ships EMPTY on purpose. Inventing 140 requirements would
-- put a guessed build standard into the product, which is worse than an empty
-- library — the Metro 2 catalogue was lost exactly once by being read out of
-- chat instead of committed. `crm_requirements_unmapped()` is the gate: the
-- library is not complete while it returns anything.
-- ===========================================================================

----------------------------------------------------------------------
-- 1. Engines — rows, never code branches (rule 17)
----------------------------------------------------------------------
create table public.crm_engines (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]{1,38}$'),
  label       text not null check (length(trim(label)) between 1 and 80),
  description text,
  sort        integer not null default 0
);

comment on table public.crm_engines is
  'The composable BES CRM build engines (Dee §3). A partner buys some of these, not all of them. Adding one is a row plus its template, never a new code branch.';

insert into public.crm_engines (key, label, description, sort) values
  ('project_setup',        'Project Setup / Intake',        'Account, access, assets and scope confirmation before building starts.', 10),
  ('website_funnel',       'Website & Funnel Engine',       'Site structure, pages, funnels, domain and publication.',               20),
  ('sales',                'Sales Engine',                  'Pipeline, calendars, lead capture, routing and follow-up.',            30),
  ('fulfillment',          'Fulfillment Engine',            'Delivery pipeline, onboarding, documents and internal task logic.',    40),
  ('onboarding_support',   'Client Onboarding / Support',   'How a new client is received and supported after go-live.',            50),
  ('communication',        'Communication Engine',          'Email, SMS, chat and templates.',                                      60),
  ('billing',              'Billing / Payment Engine',      'Products, invoices, subscriptions and payment collection.',            70),
  ('integration',          'Integration Engine',            'Third-party systems, webhooks and data flow.',                         80),
  ('marketing_ai',         'Marketing / Reputation / AI',   'Campaigns, reviews, reputation and AI assistance.',                     90),
  ('reporting',            'Reporting / Tracking Engine',   'Dashboards, attribution and tracking.',                                100),
  ('portal_membership',    'Portal / Membership Engine',    'Client portal, memberships and courses.',                              110),
  ('qa_launch',            'QA / Launch',                   'Pre-launch verification and go-live.',                                 120),
  ('support_optimization', 'Support / Optimization',        'Post-launch support and iteration.',                                   130),
  ('custom',               'Custom',                        'Work that does not belong to a standard engine.',                      140);

alter table public.crm_engines enable row level security;
revoke all on public.crm_engines from public, anon;
grant select on public.crm_engines to authenticated;
/* The taxonomy is not secret and carries no customer data; a signed-in person
   may read the list. What they may see OF A PROJECT is decided in 0221. */
create policy crm_engines_select on public.crm_engines
  for select to authenticated using (true);

----------------------------------------------------------------------
-- 2. Versioned engine templates (Dee §46, §47)
--
--    A project records the exact version it was built from, so a later v2
--    cannot rewrite an active project. Adding work needs an explicit
--    Upgrade Blueprint or Add Engine action.
----------------------------------------------------------------------
create table public.crm_engine_templates (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  engine_key  text not null references public.crm_engines(key) on delete restrict,
  version     integer not null default 1 check (version > 0),
  status      text not null default 'draft'
                check (status in ('draft', 'published', 'retired')),
  /* Where this template's content came from. `provisional_from_brief` means
     it is Dee's own worked example from the brief, NOT the workbook — so the
     interface can say so rather than presenting it as the BES standard. */
  provenance  text not null default 'provisional_from_brief'
                check (provenance in ('provisional_from_brief', 'master_tracker', 'agency_authored')),
  notes       text,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (agency_id, engine_key, version)
);
create index crm_engine_templates_engine_idx
  on public.crm_engine_templates (agency_id, engine_key, status);
create trigger crm_engine_templates_updated_at before update on public.crm_engine_templates
  for each row execute function public.set_updated_at();

comment on column public.crm_engine_templates.provenance is
  'provisional_from_brief = Dee''s worked example, not yet the standard. master_tracker = mapped from BES_GHL_Full_Infrastructure_Build_Tracker.xlsx. The interface must not present the first as the second.';

----------------------------------------------------------------------
-- 3. Work unit templates — the meaningful pieces of work
--
--    Dee §7: "Does this represent a meaningful piece of work somebody can
--    own?" Roughly 5-10 per major engine, and not a number to chase.
--
--    `phase` is PLANNING METADATA ONLY (§40). Readiness is decided by the
--    dependency rows below, never by a phase number — that is what lets
--    independent engines run in parallel (§17, §18).
----------------------------------------------------------------------
create table public.crm_work_unit_templates (
  id               uuid primary key default gen_random_uuid(),
  template_id      uuid not null references public.crm_engine_templates(id) on delete cascade,
  title            text not null check (length(trim(title)) between 1 and 160),
  description      text,
  /* §30: not every unit needs QA. The template decides, so no agent creates
     a QA task by hand. */
  requires_qa      boolean not null default false,
  dependency_mode  text not null default 'none'
                     check (dependency_mode in ('none', 'all_required', 'any_required')),
  /* Planning only: scheduling, target dates, reporting. NEVER read by
     `crm_work_unit_ready()`. */
  phase            integer,
  /* Working days from project start, for a suggested due date. */
  target_days      integer check (target_days is null or target_days >= 0),
  sort             integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index crm_work_unit_templates_template_idx
  on public.crm_work_unit_templates (template_id, sort);
create trigger crm_work_unit_templates_updated_at before update on public.crm_work_unit_templates
  for each row execute function public.set_updated_at();

comment on column public.crm_work_unit_templates.phase is
  'Planning metadata: scheduling, target dates and reporting. Never an input to readiness — Dee §19/§40, "do not use Phase number as the primary dependency engine".';

----------------------------------------------------------------------
-- 4. Dependencies (Dee §19)
--
--    no rows                     → NO DEPENDENCY
--    one row                     → SPECIFIC PREREQUISITE
--    many + all_required         → ALL REQUIRED
--    many + any_required         → ANY REQUIRED
--
--    Publish Website needs Website QA AND Domain Ready. Sales Pipeline needs
--    neither, and must not wait for them.
----------------------------------------------------------------------
create table public.crm_work_unit_template_deps (
  work_unit_template_id uuid not null references public.crm_work_unit_templates(id) on delete cascade,
  depends_on_id         uuid not null references public.crm_work_unit_templates(id) on delete cascade,
  primary key (work_unit_template_id, depends_on_id),
  constraint crm_dep_not_self check (work_unit_template_id <> depends_on_id)
);
create index crm_work_unit_template_deps_reverse_idx
  on public.crm_work_unit_template_deps (depends_on_id);

comment on table public.crm_work_unit_template_deps is
  'Per-unit prerequisites. A dependency may point at a unit in ANOTHER engine (Publish Website waits on Domain Ready); when that engine was not purchased the dependency is simply absent from the project, which is why a Website-only build does not wait on Sales.';

----------------------------------------------------------------------
-- 5. Actions inside a work unit (Dee §13)
--
--    The detail from the workbook lives HERE — as a checklist, acceptance
--    criteria and QA checks under one meaningful unit — rather than as
--    dozens of separate tasks. "Upload logo / favicon / colours / fonts /
--    business details / footer / privacy URL / support email" is ONE unit,
--    Brand & Business Setup, with several tracked actions.
----------------------------------------------------------------------
create table public.crm_work_unit_template_actions (
  id                    uuid primary key default gen_random_uuid(),
  work_unit_template_id uuid not null references public.crm_work_unit_templates(id) on delete cascade,
  kind                  text not null
                          check (kind in ('checklist', 'acceptance', 'qa',
                                          'client_requirement', 'prerequisite', 'reference')),
  label                 text not null check (length(trim(label)) between 1 and 300),
  detail                text,
  sort                  integer not null default 0,
  created_at            timestamptz not null default now()
);
create index crm_work_unit_template_actions_unit_idx
  on public.crm_work_unit_template_actions (work_unit_template_id, kind, sort);

comment on column public.crm_work_unit_template_actions.kind is
  'checklist → becomes a work_checklist_items row on the live unit. acceptance/qa/reference → shown as the build standard, never as a task. client_requirement → becomes a crm_client_requirements row. prerequisite → shown, and gates readiness through the dependency rows rather than through itself.';

----------------------------------------------------------------------
-- 6. The master requirement library (Dee §12, §56, §57)
--
--    Every source row is preserved and accounted for. NOTHING IS DISCARDED,
--    and nothing becomes a live task by default.
----------------------------------------------------------------------
create table public.crm_requirements (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null references public.agencies(id) on delete cascade,
  /* Provenance, in the same shape the partner migration uses (rule: legacy
     data and data entered in BES stay tellable apart). */
  source_reference      text not null default 'BES_GHL_Full_Infrastructure_Build_Tracker.xlsx',
  source_row_ref        text not null,
  source_section        text,
  title                 text not null check (length(trim(title)) between 1 and 400),
  detail                text,
  /* Where it belongs. Both nullable until classified — that is the point of
     `crm_requirements_unmapped()`. */
  engine_key            text references public.crm_engines(key) on delete set null,
  work_unit_template_id uuid references public.crm_work_unit_templates(id) on delete set null,
  kind                  text
                          check (kind in ('work_unit', 'checklist', 'acceptance', 'prerequisite',
                                          'client_requirement', 'qa', 'automation', 'reference', 'optional')),
  /* §11: an optional scope item is never instantiated unless selected. */
  optional              boolean not null default false,
  import_batch_id       uuid,
  imported_at           timestamptz not null default now(),
  classified_by         uuid references public.profiles(id) on delete set null,
  classified_at         timestamptz,
  unique (agency_id, source_reference, source_row_ref)
);
create index crm_requirements_engine_idx on public.crm_requirements (agency_id, engine_key);
create index crm_requirements_unit_idx   on public.crm_requirements (work_unit_template_id)
  where work_unit_template_id is not null;

comment on table public.crm_requirements is
  'The master build knowledge from BES_GHL_Full_Infrastructure_Build_Tracker.xlsx. A LIBRARY, not a task list: a row becomes live work only when classified `work_unit` AND its engine was purchased. Ships empty — the workbook is not in the repository yet, and a guessed build standard is worse than none.';

/* Which template action a requirement produced, so the chain
   source row → work unit → checklist action is traceable in both
   directions (rule 13, traceability). */
alter table public.crm_work_unit_template_actions
  add column requirement_id uuid references public.crm_requirements(id) on delete set null;
create index crm_work_unit_template_actions_req_idx
  on public.crm_work_unit_template_actions (requirement_id) where requirement_id is not null;

----------------------------------------------------------------------
-- 7. The completeness gate (§57)
--
--    The import must prove every source row is accounted for. This is what
--    proves it, and it is a function rather than a report so a test can fail
--    on it.
----------------------------------------------------------------------
create or replace function public.crm_requirements_unmapped(p_agency uuid)
returns table (id uuid, source_row_ref text, title text, missing text)
language sql stable security invoker set search_path = public as $function$
  select r.id, r.source_row_ref, r.title,
         case
           when r.engine_key is null and r.kind is null then 'engine and kind'
           when r.engine_key is null then 'engine'
           when r.kind is null then 'kind'
           /* Only a work_unit needs a template of its own; a checklist action
              needs the unit it sits under. A reference needs neither. */
           when r.kind in ('checklist', 'acceptance', 'qa', 'prerequisite', 'client_requirement')
                and r.work_unit_template_id is null then 'work unit'
           else null
         end as missing
    from public.crm_requirements r
   where r.agency_id = p_agency
     and (r.engine_key is null
          or r.kind is null
          or (r.kind in ('checklist', 'acceptance', 'qa', 'prerequisite', 'client_requirement')
              and r.work_unit_template_id is null))
   order by r.source_row_ref
$function$;
revoke execute on function public.crm_requirements_unmapped(uuid) from public, anon;
grant execute on function public.crm_requirements_unmapped(uuid) to authenticated;

comment on function public.crm_requirements_unmapped(uuid) is
  'Every source requirement not yet accounted for, and what it is missing. The library is complete exactly when this returns nothing (Dee §57). A reference row needs no work unit; a checklist action does.';

----------------------------------------------------------------------
-- 8. Authorization
--
--    Reading the build standard is a staff capability; changing it is not.
--    `crm.templates.manage` is off by default for manager, team lead and
--    agent — a build standard is not something an agent edits mid-project.
----------------------------------------------------------------------
alter table public.crm_engine_templates            enable row level security;
alter table public.crm_work_unit_templates         enable row level security;
alter table public.crm_work_unit_template_deps     enable row level security;
alter table public.crm_work_unit_template_actions  enable row level security;
alter table public.crm_requirements                enable row level security;

revoke all on public.crm_engine_templates, public.crm_work_unit_templates,
              public.crm_work_unit_template_deps, public.crm_work_unit_template_actions,
              public.crm_requirements
  from public, anon, authenticated;
grant select on public.crm_engine_templates, public.crm_work_unit_templates,
                public.crm_work_unit_template_deps, public.crm_work_unit_template_actions,
                public.crm_requirements
  to authenticated;
grant insert, update, delete on public.crm_engine_templates, public.crm_work_unit_templates,
                                public.crm_work_unit_template_deps,
                                public.crm_work_unit_template_actions,
                                public.crm_requirements
  to authenticated;

/* A staff member of the agency, narrowed to BES CRM by the same `in_scope`
   the work engine uses — so a CreditOps-only or FundingOps-only agent reaches
   none of it (Dee §50). */
create or replace function public.crm_template_readable(p_agency uuid)
returns boolean language sql stable security invoker set search_path = public as $function$
  select public.is_staff_of(p_agency)
     and public.in_scope(p_agency, 'bes_crm'::public.fulfillment_service, null, null, null)
$function$;
revoke execute on function public.crm_template_readable(uuid) from public, anon;
grant execute on function public.crm_template_readable(uuid) to authenticated;

create or replace function public.crm_template_writable(p_agency uuid)
returns boolean language sql stable security invoker set search_path = public as $function$
  select public.is_staff_of(p_agency) and public.agency_can('crm.templates.manage')
$function$;
revoke execute on function public.crm_template_writable(uuid) from public, anon;
grant execute on function public.crm_template_writable(uuid) to authenticated;

create policy crm_engine_templates_select on public.crm_engine_templates
  for select to authenticated using (public.crm_template_readable(agency_id));
create policy crm_engine_templates_write on public.crm_engine_templates
  for all to authenticated
  using (public.crm_template_writable(agency_id))
  with check (public.crm_template_writable(agency_id));

/* The child tables inherit their parent's answer. One rule, expressed once —
   a second copy of the agency test here is a second thing to get wrong. */
create policy crm_work_unit_templates_select on public.crm_work_unit_templates
  for select to authenticated
  using (exists (select 1 from public.crm_engine_templates t where t.id = template_id));
create policy crm_work_unit_templates_write on public.crm_work_unit_templates
  for all to authenticated
  using (exists (select 1 from public.crm_engine_templates t
                  where t.id = template_id and public.crm_template_writable(t.agency_id)))
  with check (exists (select 1 from public.crm_engine_templates t
                       where t.id = template_id and public.crm_template_writable(t.agency_id)));

create policy crm_work_unit_template_deps_select on public.crm_work_unit_template_deps
  for select to authenticated
  using (exists (select 1 from public.crm_work_unit_templates u where u.id = work_unit_template_id));
create policy crm_work_unit_template_deps_write on public.crm_work_unit_template_deps
  for all to authenticated
  using (exists (select 1 from public.crm_work_unit_templates u
                   join public.crm_engine_templates t on t.id = u.template_id
                  where u.id = work_unit_template_id and public.crm_template_writable(t.agency_id)))
  with check (exists (select 1 from public.crm_work_unit_templates u
                        join public.crm_engine_templates t on t.id = u.template_id
                       where u.id = work_unit_template_id and public.crm_template_writable(t.agency_id)));

create policy crm_work_unit_template_actions_select on public.crm_work_unit_template_actions
  for select to authenticated
  using (exists (select 1 from public.crm_work_unit_templates u where u.id = work_unit_template_id));
create policy crm_work_unit_template_actions_write on public.crm_work_unit_template_actions
  for all to authenticated
  using (exists (select 1 from public.crm_work_unit_templates u
                   join public.crm_engine_templates t on t.id = u.template_id
                  where u.id = work_unit_template_id and public.crm_template_writable(t.agency_id)))
  with check (exists (select 1 from public.crm_work_unit_templates u
                        join public.crm_engine_templates t on t.id = u.template_id
                       where u.id = work_unit_template_id and public.crm_template_writable(t.agency_id)));

create policy crm_requirements_select on public.crm_requirements
  for select to authenticated using (public.crm_template_readable(agency_id));
create policy crm_requirements_write on public.crm_requirements
  for all to authenticated
  using (public.crm_template_writable(agency_id))
  with check (public.crm_template_writable(agency_id));

----------------------------------------------------------------------
-- 9. The permission keys, and their defaults
--
--    Owner and admin hold every agency capability through `agency_can`, so
--    only the lower roles need a row. Managing the build standard is off for
--    all three; VIEWING CRM projects is on for manager and team lead and off
--    for an agent, because an agent reaches their own assigned work through
--    the work engine and does not need the project list.
----------------------------------------------------------------------
/* `agency_role_permissions.key` is a foreign key to the canonical
   `permission_keys` catalogue, so the keys are registered there first — which
   is also what puts them in the Access panel rather than leaving them as
   strings only the code knows. */
insert into public.permission_keys (key, module, label, description, security_relevant, sort) values
  ('crm.projects.view',    'bes_crm', 'View BES CRM projects',
   'See the CRM delivery project list and each project''s progress. An agent reaches their own assigned work through My Work without this.', false, 10),
  ('crm.projects.manage',  'bes_crm', 'Create and configure BES CRM projects',
   'Create a project, choose which build engines are in scope, add or cancel an engine, and override a derived status or health with a reason.', false, 20),
  ('crm.templates.manage', 'bes_crm', 'Edit the BES CRM build standard',
   'Change the engine templates, work units, checklists and the master requirement library. Off by default for every role below admin: a build standard is not edited mid-project.', true, 30)
on conflict (key) do nothing;

insert into public.agency_role_permissions (agency_id, role, key, allowed) values
  (null, 'agency_manager',   'crm.projects.view',    true),
  (null, 'agency_manager',   'crm.projects.manage',  true),
  (null, 'agency_manager',   'crm.templates.manage', false),
  (null, 'agency_team_lead', 'crm.projects.view',    true),
  (null, 'agency_team_lead', 'crm.projects.manage',  false),
  (null, 'agency_team_lead', 'crm.templates.manage', false),
  (null, 'agency_agent',     'crm.projects.view',    false),
  (null, 'agency_agent',     'crm.projects.manage',  false),
  (null, 'agency_agent',     'crm.templates.manage', false)
on conflict do nothing;
