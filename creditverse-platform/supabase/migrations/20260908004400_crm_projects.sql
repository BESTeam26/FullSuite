-- 0221 — BES CRM: the project as a SUBJECT, and the engines it actually bought.
--
-- ===========================================================================
-- WHY A PROJECT IS NOT A WORK ITEM
-- ===========================================================================
--
-- Until now a CRM project WAS a `work_items` row. That was right while a
-- project had no structure, and it stops being right the moment a project has
-- selected engines, a blueprint version, a target go-live and a health
-- override: `work_items` is the WORK ENGINE, not a subject table.
--
-- So BES CRM mirrors CreditOps exactly, which is the shape that already works:
--
--   fulfillment_clients        →  crm_projects            the subject
--   client_department_statuses →  crm_project_engines     where it is
--   work_items                 →  work_items              the work
--
-- The work engine is untouched. A CRM work unit is a `work_items` row with
-- `division = 'bes_crm'` and three new linkage columns. There is no second
-- task engine (rule 17b).
--
-- Only two `bes_crm` work items exist and both are fixtures, so nothing real
-- is migrated by this.
--
-- ===========================================================================
-- WAITING IS A REASON, NOT A STATUS
-- ===========================================================================
--
-- Dee §15: "WAITING may carry Waiting on Client / Third Party / Internal
-- Dependency as a reason, not three different task engines."
--
-- So there is no new stage. `waiting_on` sits BESIDE the stage: a waiting unit
-- keeps its real stage, is therefore not counted as progress, and — this is
-- the point of §18 — does not freeze its siblings, because readiness is
-- per-unit and nothing consults a project-wide phase.
--
-- It is added to `work_items` rather than to a CRM table because waiting is a
-- property of work, not of BES CRM. CRM is simply the first consumer.
-- ===========================================================================

create type public.work_waiting_reason as enum ('client', 'third_party', 'internal');

alter table public.work_items
  add column if not exists waiting_on    public.work_waiting_reason,
  add column if not exists waiting_note  text,
  add column if not exists waiting_since timestamptz;

comment on column public.work_items.waiting_on is
  'Why this work cannot proceed, beside its stage rather than instead of it (Dee §15). A waiting item keeps its stage, counts as no progress, and blocks nothing else — readiness is per-item.';

/* Kept honest by the database rather than by whoever writes the UI: a reason
   without a start, or a start without a reason, is a half-recorded fact. */
alter table public.work_items
  add constraint work_items_waiting_ck
  check ((waiting_on is null) = (waiting_since is null));

/* §34: a blocker's REASON is worth manual input because the system cannot
   infer it. Everything else about a blocker it already records. */
alter table public.work_item_blockers
  add column if not exists reason text
    check (reason is null or reason in ('client', 'third_party', 'internal',
                                        'technical', 'approval', 'other')),
  add column if not exists responsible text;

comment on column public.work_item_blockers.reason is
  'Dee §34: manual reporting should focus on exceptions. The system already knows blocked_at, blocked_by and the affected item; it cannot know WHY.';

----------------------------------------------------------------------
-- 1. The project
----------------------------------------------------------------------
create table public.crm_projects (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null references public.agencies(id) on delete cascade,

  /* The commercial counterparty. A BES Partner may be an `outsourcing_groups`
     row (model 3) or a SaaS organization (model 2) — the same either-or
     `fulfillment_engagements` uses — and §9 makes the ORGANIZATION link
     optional, because it is what lets the customer see the project. At least
     one must be present: a project with neither belongs to nobody. */
  partner_group_id    uuid references public.outsourcing_groups(id) on delete restrict,
  organization_id     uuid references public.organizations(id) on delete set null,
  /* The BES CRM service engagement this project delivers (§9). Nullable
     because the commercial row may be created after the project starts, and a
     project must not be blocked on paperwork. */
  partner_service_id  uuid references public.partner_services(id) on delete set null,

  name                text not null check (length(trim(name)) between 1 and 160),
  description         text,
  preset              text check (preset is null or preset in
                        ('full_build', 'website_only', 'sales_engine',
                         'fulfillment_engine', 'custom')),
  started_on          date,
  target_go_live      date,
  lead_id             uuid references public.profiles(id) on delete set null,
  team_id             uuid references public.teams(id) on delete set null,

  /* Derived by default (§16, §35). An override is a deliberate act by a
     manager and carries its reason and its author — a status somebody set by
     hand and cannot explain is worse than a derived one. */
  status_override        text check (status_override is null or status_override in
                           ('onboarding', 'building', 'waiting_on_client', 'qa', 'support', 'completed')),
  status_override_reason text,
  status_override_by     uuid references public.profiles(id) on delete set null,
  status_override_at     timestamptz,
  health_override        text check (health_override is null or health_override in
                           ('on_track', 'at_risk', 'blocked', 'waiting', 'qa', 'support')),
  health_override_reason text,
  health_override_by     uuid references public.profiles(id) on delete set null,
  health_override_at     timestamptz,

  archived_at         timestamptz,
  archived_reason     text,
  created_by          uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint crm_projects_owner_ck
    check (partner_group_id is not null or organization_id is not null),
  /* An override must say why, and by whom. */
  constraint crm_projects_status_override_ck
    check (status_override is null
           or (status_override_reason is not null and status_override_by is not null)),
  constraint crm_projects_health_override_ck
    check (health_override is null
           or (health_override_reason is not null and health_override_by is not null))
);
create index crm_projects_agency_idx  on public.crm_projects (agency_id) where archived_at is null;
create index crm_projects_partner_idx on public.crm_projects (partner_group_id) where partner_group_id is not null;
create index crm_projects_org_idx     on public.crm_projects (organization_id) where organization_id is not null;
create trigger crm_projects_updated_at before update on public.crm_projects
  for each row execute function public.set_updated_at();

comment on table public.crm_projects is
  'A BES CRM delivery project: the SUBJECT that work units hang off, mirroring fulfillment_clients in CreditOps. Its status, health and progress are DERIVED from its work (Dee §16/§35/§38) — an agent never maintains them.';

----------------------------------------------------------------------
-- 2. The engines this project actually bought (§2, §11)
--
--    "If Website is not included, Website work simply does not exist in that
--    project." So an engine that was not purchased has NO ROW here, and
--    therefore no work units — rather than eighty units marked Not
--    Applicable.
----------------------------------------------------------------------
create table public.crm_project_engines (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.crm_projects(id) on delete cascade,
  engine_key       text not null references public.crm_engines(key) on delete restrict,
  /* The EXACT template version this engine was instantiated from (§46). A
     later v2 therefore cannot rewrite an active project (§47). */
  template_id      uuid not null references public.crm_engine_templates(id) on delete restrict,
  added_at         timestamptz not null default now(),
  added_by         uuid references public.profiles(id) on delete set null default auth.uid(),
  /* §49: cancelling one engine ends its work and leaves the others running.
     History is preserved — the row stays, dated. */
  cancelled_at     timestamptz,
  cancelled_reason text,
  unique (project_id, engine_key)
);
create index crm_project_engines_project_idx on public.crm_project_engines (project_id)
  where cancelled_at is null;

comment on table public.crm_project_engines is
  'Which build engines are in scope for this project, and the exact template version each came from. An engine the partner did not buy has no row, so its work does not exist here (Dee §11).';

----------------------------------------------------------------------
-- 3. Work units are `work_items`. These are the only new columns.
----------------------------------------------------------------------
alter table public.work_items
  add column if not exists crm_project_id            uuid references public.crm_projects(id) on delete cascade,
  add column if not exists crm_engine_key            text references public.crm_engines(key) on delete set null,
  add column if not exists crm_work_unit_template_id uuid references public.crm_work_unit_templates(id) on delete set null;

create index work_items_crm_project_idx on public.work_items (crm_project_id, crm_engine_key)
  where crm_project_id is not null;

comment on column public.work_items.crm_project_id is
  'The BES CRM project this work unit belongs to. A work unit IS a work item (rule 17b) — this column is the only thing that makes it a CRM one, and there is no second task table.';

----------------------------------------------------------------------
-- 4. Client requirements (§33)
--
--    "Need DNS access" is not a task for an agent. It is something the
--    CLIENT owes, and satisfying it must release the dependent work
--    automatically rather than making somebody update three statuses.
----------------------------------------------------------------------
create table public.crm_client_requirements (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.crm_projects(id) on delete cascade,
  /* Which template action asked for it, so the chain back to the workbook
     survives (rule 13). */
  requirement_id uuid references public.crm_requirements(id) on delete set null,
  label          text not null check (length(trim(label)) between 1 and 300),
  detail         text,
  /* The work that cannot proceed without it. Empty is legitimate: something
     the client owes that nothing is currently blocked on. */
  satisfied_at   timestamptz,
  satisfied_by   uuid references public.profiles(id) on delete set null,
  /* §54: a client requirement is satisfied by an EXPLICIT event, never
     inferred from activity. This records which. */
  satisfied_note text,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles(id) on delete set null default auth.uid()
);
create index crm_client_requirements_project_idx on public.crm_client_requirements (project_id)
  where satisfied_at is null;

create table public.crm_client_requirement_blocks (
  requirement_id uuid not null references public.crm_client_requirements(id) on delete cascade,
  work_item_id   uuid not null references public.work_items(id) on delete cascade,
  primary key (requirement_id, work_item_id)
);
create index crm_client_requirement_blocks_item_idx
  on public.crm_client_requirement_blocks (work_item_id);

comment on table public.crm_client_requirements is
  'What the client owes. Satisfying one clears `waiting_on` from every work unit it blocks, in one transaction (Dee §33) — independent units were never touched.';

----------------------------------------------------------------------
-- 5. Authorization
--
--    The same three-branch shape `work_items_select` already uses for BES CRM,
--    so the project and its work cannot disagree about who may see it.
----------------------------------------------------------------------
create or replace function public.crm_project_readable(p_project uuid)
returns boolean language sql stable security invoker set search_path = public as $function$
  select exists (
    select 1 from public.crm_projects p
     where p.id = p_project
       and (
         /* BES staff of the agency, narrowed to the BES CRM division and the
            authorized team — a CreditOps-only or FundingOps-only agent
            reaches nothing (Dee §50). */
         (public.is_staff_of(p.agency_id)
          and public.in_scope(p.agency_id, 'bes_crm'::public.fulfillment_service,
                              p.team_id, p.lead_id, p.created_by))
         /* Or the customer, when the project is linked to its organization and
            that organization is entitled to CRM. THE SAME project row — there
            is no second one (§51). */
         or (p.organization_id is not null
             and public.is_org_admin(p.organization_id)
             and public.org_entitled(p.organization_id, 'crm'))
       )
  )
$function$;
revoke execute on function public.crm_project_readable(uuid) from public, anon;
grant execute on function public.crm_project_readable(uuid) to authenticated;

create or replace function public.crm_project_writable(p_project uuid)
returns boolean language sql stable security invoker set search_path = public as $function$
  select exists (
    select 1 from public.crm_projects p
     where p.id = p_project
       and public.is_staff_of(p.agency_id)
       and public.agency_can('crm.projects.manage')
  )
$function$;
revoke execute on function public.crm_project_writable(uuid) from public, anon;
grant execute on function public.crm_project_writable(uuid) to authenticated;

comment on function public.crm_project_writable(uuid) is
  'BES staff with crm.projects.manage. There is deliberately NO customer branch: a customer cannot change status, assignment, dates or completion, and that is enforced by the absence of a policy rather than by hiding a control (Dee §51).';

alter table public.crm_projects                     enable row level security;
alter table public.crm_project_engines              enable row level security;
alter table public.crm_client_requirements          enable row level security;
alter table public.crm_client_requirement_blocks    enable row level security;

revoke all on public.crm_projects, public.crm_project_engines,
              public.crm_client_requirements, public.crm_client_requirement_blocks
  from public, anon, authenticated;
grant select on public.crm_projects, public.crm_project_engines,
                public.crm_client_requirements, public.crm_client_requirement_blocks
  to authenticated;
grant insert, update on public.crm_projects, public.crm_project_engines,
                        public.crm_client_requirements
  to authenticated;
grant insert, delete on public.crm_client_requirement_blocks to authenticated;
/* No DELETE on projects, engines or requirements: a cancelled engine is dated,
   not erased, and a project is archived (rule 11). */

create policy crm_projects_select on public.crm_projects
  for select to authenticated using (public.crm_project_readable(id));
create policy crm_projects_insert on public.crm_projects
  for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.agency_can('crm.projects.manage'));
create policy crm_projects_update on public.crm_projects
  for update to authenticated
  using (public.crm_project_writable(id))
  with check (public.crm_project_writable(id));

create policy crm_project_engines_select on public.crm_project_engines
  for select to authenticated using (public.crm_project_readable(project_id));
create policy crm_project_engines_insert on public.crm_project_engines
  for insert to authenticated with check (public.crm_project_writable(project_id));
create policy crm_project_engines_update on public.crm_project_engines
  for update to authenticated
  using (public.crm_project_writable(project_id))
  with check (public.crm_project_writable(project_id));

create policy crm_client_requirements_select on public.crm_client_requirements
  for select to authenticated using (public.crm_project_readable(project_id));
create policy crm_client_requirements_insert on public.crm_client_requirements
  for insert to authenticated with check (public.crm_project_writable(project_id));
/* A customer marking its own requirement satisfied is a real workflow and a
   real decision; until Dee asks for it, only BES records the event (§54). */
create policy crm_client_requirements_update on public.crm_client_requirements
  for update to authenticated
  using (public.crm_project_writable(project_id))
  with check (public.crm_project_writable(project_id));

create policy crm_client_requirement_blocks_select on public.crm_client_requirement_blocks
  for select to authenticated
  using (exists (select 1 from public.crm_client_requirements r
                  where r.id = requirement_id and public.crm_project_readable(r.project_id)));
create policy crm_client_requirement_blocks_write on public.crm_client_requirement_blocks
  for all to authenticated
  using (exists (select 1 from public.crm_client_requirements r
                  where r.id = requirement_id and public.crm_project_writable(r.project_id)))
  with check (exists (select 1 from public.crm_client_requirements r
                       where r.id = requirement_id and public.crm_project_writable(r.project_id)));

/* Supabase's default privileges keep granting these on every new table. */
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
