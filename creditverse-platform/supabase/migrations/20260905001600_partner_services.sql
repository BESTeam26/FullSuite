-- 0157 — a partner buys several services, and the money lives apart from them.
--
-- ---------------------------------------------------------------------------
-- TWO DECISIONS THAT SHAPE EVERYTHING HERE
--
-- 1. A PARTNER IS ONE ROW, HOWEVER MANY SERVICES THEY BUY.
--
--    The spreadsheet this replaces repeats the company on every billing line,
--    so "Credit by Nainoa" appears three times and nobody can answer "how many
--    partners do we have". Services are a child table; adding a second service
--    adds a row under the partner, never another partner.
--
-- 2. FINANCIAL FIELDS ARE A SEPARATE TABLE, NOT HIDDEN COLUMNS.
--
--    Postgres RLS is row-level: a policy cannot return some columns and
--    withhold others. So "the manager must not RECEIVE the rate" cannot be
--    done by hiding a card in React, and cannot be done with a column
--    permission either. The only honest mechanism is to put the money in its
--    own table with its own policy — then a manager's query returns the
--    service and its status and simply has nowhere to read a rate from.
--
--    That is why `partner_services` holds what a manager needs to run the work
--    and `partner_service_billing` holds what BES charges for it.
-- ---------------------------------------------------------------------------

create type public.partner_service_status as enum ('onboarding', 'active', 'paused', 'ended');

-- ── Operational: what BES does for this partner ─────────────────────────
create table public.partner_services (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.outsourcing_groups(id) on delete cascade,
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 120),
  status        public.partner_service_status not null default 'active',
  started_on    date,
  ended_on      date,
  /** Who runs it. A real person, so attribution survives them leaving. */
  processor_id  uuid references public.profiles(id) on delete set null,
  team_id       uuid references public.teams(id) on delete set null,
  /** How much of it there is — 75 clients, 2 agents, 4 rounds. */
  quantity      numeric check (quantity is null or quantity >= 0),
  quantity_unit text,
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint partner_services_dates_ck check (ended_on is null or started_on is null or ended_on >= started_on)
);
create index partner_services_group_idx on public.partner_services (group_id, status);
create trigger partner_services_updated_at before update on public.partner_services
  for each row execute function public.set_updated_at();

comment on table public.partner_services is
  'One service BES provides to one partner. A partner with three services has three rows here and stays one partner.';

-- ── Financial: what BES charges for it ──────────────────────────────────
create table public.partner_service_billing (
  service_id        uuid primary key references public.partner_services(id) on delete cascade,
  agency_id         uuid not null references public.agencies(id) on delete cascade,
  payment_channel   text,
  transaction_type  text,
  payment_frequency text,
  /** 'Monday' … 'End of month' … or a day number. Free text on purpose: the
      real world has "the Friday after invoicing" in it. */
  invoice_day       text,
  rate_cents        bigint check (rate_cents is null or rate_cents >= 0),
  currency          text not null default 'USD',
  /** What BES expects to collect in a normal month, in cents. */
  expected_monthly_cents bigint check (expected_monthly_cents is null or expected_monthly_cents >= 0),
  pricing_notes     text,
  updated_by        uuid references public.profiles(id) on delete set null,
  updated_at        timestamptz not null default now()
);
create trigger partner_service_billing_updated_at before update on public.partner_service_billing
  for each row execute function public.set_updated_at();

comment on table public.partner_service_billing is
  'What BES charges for a service. A SEPARATE table because RLS is row-level: a policy cannot withhold columns, so the only way a manager''s query genuinely cannot return a rate is for the rate to live where their query does not reach.';

-- ── Monthly revenue, as rows rather than twelve columns ─────────────────
create table public.partner_revenue_entries (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.outsourcing_groups(id) on delete cascade,
  service_id      uuid references public.partner_services(id) on delete set null,
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  /* Year and month, not a date: this is a period, and a period with a day in
     it invites somebody to filter on the wrong thing. */
  year            integer not null check (year between 2000 and 2100),
  month           integer not null check (month between 1 and 12),
  expected_cents  bigint check (expected_cents is null or expected_cents >= 0),
  actual_cents    bigint check (actual_cents is null or actual_cents >= 0),
  currency        text not null default 'USD',
  payment_channel text,
  notes           text,
  /** Where the figure came from — recorded by hand, or from a payment. */
  source          text not null default 'manual',
  recorded_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique nulls not distinct (group_id, service_id, year, month)
);
create index partner_revenue_period_idx on public.partner_revenue_entries (group_id, year, month);
create trigger partner_revenue_entries_updated_at before update on public.partner_revenue_entries
  for each row execute function public.set_updated_at();

comment on table public.partner_revenue_entries is
  'Expected and actual collection for one partner, one service, one month. Rows rather than Jan..Dec columns, so next year needs no migration.';

-- ── Operational configuration: the tools the work runs on ───────────────
create table public.partner_operations (
  group_id             uuid primary key references public.outsourcing_groups(id) on delete cascade,
  agency_id            uuid not null references public.agencies(id) on delete cascade,
  crm_name             text,
  crm_url              text,
  mailing_system       text,
  mailing_url          text,
  ghl_location         text,
  ghl_url              text,
  sop_url              text,
  comm_channel         text,
  comm_url             text,
  account_manager_id   uuid references public.profiles(id) on delete set null,
  operations_manager_id uuid references public.profiles(id) on delete set null,
  team_id              uuid references public.teams(id) on delete set null,
  notes                text,
  updated_by           uuid references public.profiles(id) on delete set null,
  updated_at           timestamptz not null default now()
);
create trigger partner_operations_updated_at before update on public.partner_operations
  for each row execute function public.set_updated_at();

comment on table public.partner_operations is
  'Which CRM, which mailing system, which SOP, which channel. Names, links and notes only — never a credential. Passwords need a mechanism that encrypts them and audits every read, which this is not.';

-- ── Contacts gain a title, since a partner has several kinds of person ──
alter table public.partner_contacts
  add column if not exists title text;

-- ── Who may see what ────────────────────────────────────────────────────
alter table public.partner_services         enable row level security;
alter table public.partner_service_billing  enable row level security;
alter table public.partner_revenue_entries  enable row level security;
alter table public.partner_operations       enable row level security;
revoke all on public.partner_services, public.partner_service_billing,
              public.partner_revenue_entries, public.partner_operations from public, anon;
grant select, insert, update, delete on public.partner_services      to authenticated;
grant select, insert, update, delete on public.partner_service_billing to authenticated;
grant select, insert, update, delete on public.partner_revenue_entries to authenticated;
grant select, insert, update            on public.partner_operations   to authenticated;

/* Operational: any staff member who may see partners. A partner contact may
   see the SERVICES they buy — that is their own relationship — but nothing
   below carries a price, which is the point of the split. */
create policy partner_services_select on public.partner_services for select to authenticated
  using ((public.is_staff_of(agency_id) and public.agency_can('partners.view'))
         or public.is_partner_contact_of(group_id));
create policy partner_services_write on public.partner_services for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.agency_can('partners.edit'));
create policy partner_services_update on public.partner_services for update to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.edit'))
  with check (public.is_staff_of(agency_id) and public.agency_can('partners.edit'));
create policy partner_services_delete on public.partner_services for delete to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.archive'));

/* Financial: the named capability, and nothing else. No partner branch at all
   — a partner never reads what BES's margin on them is. */
create policy partner_billing_select on public.partner_service_billing for select to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.financials.view'));
create policy partner_billing_write on public.partner_service_billing for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.agency_can('partners.financials.edit'));
create policy partner_billing_update on public.partner_service_billing for update to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.financials.edit'))
  with check (public.is_staff_of(agency_id) and public.agency_can('partners.financials.edit'));
create policy partner_billing_delete on public.partner_service_billing for delete to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.financials.edit'));

create policy partner_revenue_select on public.partner_revenue_entries for select to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.financials.view'));
create policy partner_revenue_write on public.partner_revenue_entries for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.agency_can('partners.revenue.record'));
create policy partner_revenue_update on public.partner_revenue_entries for update to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.revenue.record'))
  with check (public.is_staff_of(agency_id) and public.agency_can('partners.revenue.record'));
create policy partner_revenue_delete on public.partner_revenue_entries for delete to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.revenue.record'));

create policy partner_operations_select on public.partner_operations for select to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.view'));
create policy partner_operations_write on public.partner_operations for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.agency_can('partners.operations'));
create policy partner_operations_update on public.partner_operations for update to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.operations'))
  with check (public.is_staff_of(agency_id) and public.agency_can('partners.operations'));
