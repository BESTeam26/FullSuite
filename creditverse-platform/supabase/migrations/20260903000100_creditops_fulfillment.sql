-- =============================================================================
-- BES Platform — Migration 0005: CreditOps Agency Fulfillment Workspace
-- =============================================================================
-- The operational records BES works on behalf of its partners.
--
-- Two intake modes, exactly as modelled in src/lib/fulfillment:
--   saas_pulled      → the partner runs on BES; the client belongs to their
--                      organization and status syncs from their workspace.
--   outsourcing_only → the partner runs an external system; BES keeps a manual
--                      list under an outsourcing group.
--
-- THE identity rule — one email = one file per partner — is enforced here by a
-- unique index, not only in the interface. A tampered client, a CSV import or a
-- future API cannot create the duplicate that the UI refuses (rule 1).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.fulfillment_mode as enum ('saas_pulled', 'outsourcing_only');

create type public.fulfillment_round as enum (
  'Pre-Round', 'Round 1', 'Round 2', 'Round 3', 'Round 4+', 'Completed'
);

create type public.fulfillment_department as enum (
  'Onboarding', 'Dispute', 'Support', 'Complaints', 'Bureau Calling'
);

create type public.outsourcing_group_status as enum ('Active', 'Paused', 'Onboarding');

/**
 * The CreditOps operational status vocabulary. An enum rather than free text:
 * these values drive queue membership and SLA behaviour, so adding one should
 * be a deliberate migration rather than a typo in a form.
 */
create type public.fulfillment_client_status as enum (
  'Onboarding', 'NEW ONBOARDING', 'INCOMPLETE ONBOARDING',
  'Ready for Processing', 'In Processing', 'Ready for QA', 'In Dispute',
  'Awaiting Response', 'Monitoring Issue', 'Completed', 'Attention',
  'BC NEEDED', 'BC IN PROGRESS', 'BC COMPLETED', 'BC NOT NEEDED',
  'LETTERS PENDING', 'LETTERS MAILED', 'CFPB FILED', 'FTC FILED',
  'CM COMPLETED', 'SUPPORT NEW', 'ONBOARDING FOLLOWUP', 'READY FOR REIMPORT',
  'BILLING ISSUE', 'WAITING CLIENT RESPONSE', 'ESCALATED TO MANAGEMENT',
  'SUPPORT RESOLVED', 'Graduated', 'Archived'
);

-- -----------------------------------------------------------------------------
-- outsourcing_groups — a contract with a company running its own system
-- -----------------------------------------------------------------------------
create table public.outsourcing_groups (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  name           text not null,
  partner_name   text not null,
  contact_email  citext not null,
  contract_ref   text,
  status         public.outsourcing_group_status not null default 'Active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index outsourcing_groups_agency_idx on public.outsourcing_groups(agency_id);
create trigger outsourcing_groups_updated_at before update on public.outsourcing_groups
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- fulfillment_clients — the canonical CreditOps client record
-- -----------------------------------------------------------------------------
create table public.fulfillment_clients (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null references public.agencies(id) on delete cascade,

  name                  text not null,
  email                 citext not null,
  phone                 text,

  mode                  public.fulfillment_mode not null,
  -- Exactly one of these is set; the check below enforces which.
  organization_id       uuid references public.organizations(id) on delete cascade,
  outsourcing_group_id  uuid references public.outsourcing_groups(id) on delete cascade,
  /** Status auto-syncs from the partner's own workspace (mode 1 only). */
  auto_sync             boolean not null default false,

  status                public.fulfillment_client_status not null default 'Onboarding',
  round                 public.fulfillment_round not null default 'Pre-Round',
  assigned_agent_id     uuid references public.profiles(id) on delete set null,
  /** Dispute items currently in work. */
  open_items            integer not null default 0 check (open_items >= 0),
  due_at                timestamptz,

  last_activity_at      timestamptz not null default now(),
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  /**
   * The partner this client belongs to, whichever mode brought them in.
   * Stored (not just computed) so it can carry a unique index.
   */
  partner_scope_id      uuid generated always as (
                          coalesce(organization_id, outsourcing_group_id)
                        ) stored,

  constraint fulfillment_clients_mode_scope_ck check (
    (mode = 'saas_pulled'      and organization_id is not null and outsourcing_group_id is null) or
    (mode = 'outsourcing_only' and outsourcing_group_id is not null and organization_id is null)
  )
);

/**
 * ONE EMAIL = ONE FILE PER PARTNER, enforced by the database.
 *
 * The same person MAY appear on a different partner's list — they cancelled
 * with one company and enrolled with another, or are shopping both. That is
 * allowed and the interface asks the agent to confirm it. What is never
 * allowed is two files for the same email inside one partner.
 */
create unique index fulfillment_clients_one_email_per_partner
  on public.fulfillment_clients (partner_scope_id, lower(email::text));

create index fulfillment_clients_org_idx on public.fulfillment_clients(organization_id)
  where organization_id is not null;
create index fulfillment_clients_group_idx on public.fulfillment_clients(outsourcing_group_id)
  where outsourcing_group_id is not null;
create index fulfillment_clients_status_idx on public.fulfillment_clients(status);
create index fulfillment_clients_assignee_idx on public.fulfillment_clients(assigned_agent_id, status);
create index fulfillment_clients_due_idx on public.fulfillment_clients(due_at)
  where status not in ('Completed', 'Graduated', 'Archived');

create trigger fulfillment_clients_updated_at before update on public.fulfillment_clients
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- client_department_statuses — where a client stands in each department
-- -----------------------------------------------------------------------------
create table public.client_department_statuses (
  client_id     uuid not null references public.fulfillment_clients(id) on delete cascade,
  department    public.fulfillment_department not null,
  status        text not null,
  assignee_id   uuid references public.profiles(id) on delete set null,
  updated_at    timestamptz not null default now(),
  primary key (client_id, department)
);
create trigger client_department_statuses_updated_at
  before update on public.client_department_statuses
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- production_logs — one row per unit of work completed
-- -----------------------------------------------------------------------------
-- Feeds the auto-derived EOD (Phase 4). Employees never type totals; totals are
-- always derived from these rows, and a voided row is excluded rather than
-- deleted so the history stays intact (rule 11).
create table public.production_logs (
  id                       uuid primary key default gen_random_uuid(),
  agency_id                uuid not null references public.agencies(id) on delete cascade,
  employee_id              uuid not null references public.profiles(id) on delete restrict,

  division_id              text not null default 'creditops',
  department               public.fulfillment_department,
  organization_id          uuid references public.organizations(id) on delete set null,
  outsourcing_group_id     uuid references public.outsourcing_groups(id) on delete set null,
  client_id                uuid references public.fulfillment_clients(id) on delete set null,

  /** e.g. "Dispute Letters", "QA Completed". */
  production_unit_type     text not null,
  production_unit_quantity integer not null default 1 check (production_unit_quantity > 0),
  /** The completion actions selected for this unit. */
  actions                  text[] not null default '{}',
  work_notes               text,

  work_date                date not null,
  completed_at             timestamptz not null default now(),

  is_voided                boolean not null default false,
  void_reason              text,
  voided_by                uuid references public.profiles(id) on delete set null,
  voided_at                timestamptz,

  created_at               timestamptz not null default now()
);
create index production_logs_employee_date_idx
  on public.production_logs(employee_id, work_date) where not is_voided;
create index production_logs_client_idx on public.production_logs(client_id);
create index production_logs_agency_date_idx on public.production_logs(agency_id, work_date);

-- A void must say why, so the audit trail explains itself.
alter table public.production_logs
  add constraint production_logs_void_reason_ck
  check (not is_voided or void_reason is not null);

-- -----------------------------------------------------------------------------
-- Outbound CRM webhooks
-- -----------------------------------------------------------------------------
create type public.webhook_endpoint_type as enum ('ghl', 'disputefox', 'generic');
create type public.webhook_delivery_status as enum ('emitted', 'failed', 'skipped');

create table public.webhook_endpoints (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  name          text not null,
  type          public.webhook_endpoint_type not null,
  url           text,
  /**
   * Credentials are NOT stored here. This holds a display hint only (e.g. the
   * last four characters); the secret itself belongs in Vault, read server-side
   * when the delivery is actually sent (rule 1).
   */
  credential_hint text,
  enabled       boolean not null default false,
  last_fired_at timestamptz,
  fires         integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger webhook_endpoints_updated_at before update on public.webhook_endpoints
  for each row execute function public.set_updated_at();

-- Append-only record of every signal the platform emitted, or chose not to.
create table public.webhook_deliveries (
  id               bigint generated always as identity primary key,
  agency_id        uuid not null references public.agencies(id) on delete cascade,
  endpoint_id      uuid references public.webhook_endpoints(id) on delete set null,
  endpoint_name    text not null,
  client_id        uuid references public.fulfillment_clients(id) on delete set null,
  client_name      text not null,
  partner_name     text not null,
  previous_status  text,
  new_status       text not null,
  status           public.webhook_delivery_status not null,
  message          text,
  created_at       timestamptz not null default now()
);
create index webhook_deliveries_agency_idx
  on public.webhook_deliveries(agency_id, created_at desc);

-- =============================================================================
-- Authorization helper
-- =============================================================================

/**
 * Who may see a fulfillment client.
 *
 * Outsourcing-only clients belong to BES's own contract with an external
 * company; no customer organization owns them, so only agency staff see them.
 * SaaS-pulled clients are visible to their organization as well.
 */
create or replace function public.can_view_fulfillment_client(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_agency_staff() or (p_org is not null and public.is_org_member(p_org))
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.outsourcing_groups          enable row level security;
alter table public.fulfillment_clients         enable row level security;
alter table public.client_department_statuses  enable row level security;
alter table public.production_logs             enable row level security;
alter table public.webhook_endpoints           enable row level security;
alter table public.webhook_deliveries          enable row level security;

-- outsourcing_groups: BES's own contracts.
create policy outsourcing_groups_select on public.outsourcing_groups for select to authenticated
  using (public.is_agency_staff());
create policy outsourcing_groups_write on public.outsourcing_groups for all to authenticated
  using (public.is_agency_manager_or_above()) with check (public.is_agency_manager_or_above());

-- fulfillment_clients
create policy fulfillment_clients_select on public.fulfillment_clients for select to authenticated
  using (public.can_view_fulfillment_client(organization_id));

create policy fulfillment_clients_insert on public.fulfillment_clients for insert to authenticated
  with check (public.is_agency_staff());

-- An agent may edit clients assigned to them; managers may edit any.
create policy fulfillment_clients_update on public.fulfillment_clients for update to authenticated
  using (assigned_agent_id = auth.uid() or public.is_agency_manager_or_above())
  with check (public.is_agency_staff());

create policy fulfillment_clients_delete on public.fulfillment_clients for delete to authenticated
  using (public.is_agency_admin());

-- client_department_statuses follow their client's visibility.
create policy client_department_statuses_select
  on public.client_department_statuses for select to authenticated
  using (
    exists (
      select 1 from public.fulfillment_clients c
      where c.id = client_id
        and public.can_view_fulfillment_client(c.organization_id)
    )
  );
create policy client_department_statuses_write
  on public.client_department_statuses for all to authenticated
  using (public.is_agency_staff()) with check (public.is_agency_staff());

-- production_logs: an employee sees their own; managers see the agency's.
create policy production_logs_select on public.production_logs for select to authenticated
  using (employee_id = auth.uid() or public.is_agency_manager_or_above());
create policy production_logs_insert on public.production_logs for insert to authenticated
  with check (employee_id = auth.uid() and public.is_agency_staff());
-- Voiding is an update; correcting history is a manager action.
create policy production_logs_update on public.production_logs for update to authenticated
  using (public.is_agency_manager_or_above())
  with check (public.is_agency_manager_or_above());
-- No delete policy: production history is voided, never removed (rule 11).

-- webhook_endpoints: integration configuration is an admin concern.
create policy webhook_endpoints_select on public.webhook_endpoints for select to authenticated
  using (public.is_agency_staff());
create policy webhook_endpoints_write on public.webhook_endpoints for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

-- webhook_deliveries: readable by staff, insert-only, never edited or deleted.
create policy webhook_deliveries_select on public.webhook_deliveries for select to authenticated
  using (public.is_agency_staff());
create policy webhook_deliveries_insert on public.webhook_deliveries for insert to authenticated
  with check (public.is_agency_staff());

-- Grants (RLS still applies)
grant select, insert, update, delete on public.outsourcing_groups to authenticated;
grant select, insert, update, delete on public.fulfillment_clients to authenticated;
grant select, insert, update, delete on public.client_department_statuses to authenticated;
grant select, insert, update on public.production_logs to authenticated;
grant select, insert, update, delete on public.webhook_endpoints to authenticated;
grant select, insert on public.webhook_deliveries to authenticated;

grant execute on function public.can_view_fulfillment_client(uuid) to authenticated;
revoke execute on function public.can_view_fulfillment_client(uuid) from public, anon;
