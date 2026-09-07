-- 0160 — BES knows why money is owed, when, and whether it arrived.
--
-- ---------------------------------------------------------------------------
-- THE CHAIN THIS BUILDS (Dee, 2026-09-07)
--
--   PARTNER → SERVICE ENGAGEMENT → BILLING TERMS → SCHEDULE
--           → INVOICE / RECEIVABLE → PAYMENT TRANSACTION → COLLECTION
--
-- Five separations the rest of the file exists to protect, because collapsing
-- any of them produces a number that looks right and is wrong:
--
-- 1. AN INVOICE IS NOT A PAYMENT. Sending a bill is not receiving money.
--    "Collected" reads the payment ledger and nothing else.
--
-- 2. FIXED RECURRING IS NOT VARIABLE RECURRING. $299/month is committed;
--    "19 clients × $25" is this month's arithmetic and next month's guess.
--    Both are recurring; only the first is MRR.
--
-- 3. A PROJECT IS NOT MRR. A $3,000 build billed in three instalments is
--    $3,000 of project value and $0 of monthly recurring revenue, however the
--    payments are spread.
--
-- 4. NORMALISED MRR IS NOT THIS MONTH'S COLLECTION. A weekly service is
--    rate × 52 / 12 as a run-rate, and four or five actual charges in a real
--    calendar month. Never the unexplained "× 4".
--
-- 5. TERMS ARE EFFECTIVE-DATED. A rate rising in October does not rewrite
--    what January was billed. So terms are ROWS WITH DATES, not a field that
--    gets overwritten — which is also why `partner_service_billing` gains a
--    surrogate key here and stops being one row per service.
--
-- And one rule that prevents double billing outright: every engagement names
-- ONE `billing_authority`. Whoever it names is the only system allowed to
-- create an obligation; the others may mirror and reconcile, never schedule.
-- ---------------------------------------------------------------------------

create type public.partner_invoice_status as enum
  ('draft', 'scheduled', 'sent', 'partially_paid', 'paid', 'overdue', 'void', 'cancelled');

create type public.partner_payment_status as enum
  ('pending', 'succeeded', 'failed', 'refunded');

/* Which system owns the schedule for one engagement. Exactly one. */
create type public.partner_billing_authority as enum
  ('bes', 'authorize_net_arb', 'ghl', 'paypal', 'manual');

/* Where money actually moved. Distinct from the catalogue of channels a human
   picks on the terms: this is what the ledger says handled the transaction. */
create type public.partner_payment_provider as enum
  ('authorize_net', 'paypal', 'paypal_personal', 'stripe', 'wise', 'ghl',
   'upwork', 'bank_transfer', 'other');

-- ── Terms become effective-dated rows ───────────────────────────────────
alter table public.partner_service_billing
  drop constraint partner_service_billing_pkey;

alter table public.partner_service_billing
  add column id uuid primary key default gen_random_uuid(),
  add column effective_from date not null default current_date,
  add column effective_to   date,
  /** For PER_CLIENT / PER_ROUND: where the quantity comes from each cycle.
      'canonical' counts real client records; 'manual' uses `quantity`. */
  add column quantity_source text not null default 'manual'
    check (quantity_source in ('manual', 'canonical_active_clients')),
  add column quantity numeric check (quantity is null or quantity >= 0),
  add column autopay boolean not null default false,
  add column superseded_by uuid references public.partner_service_billing(id) on delete set null,
  add constraint partner_service_billing_period_ck
    check (effective_to is null or effective_to >= effective_from);

create unique index partner_service_billing_current_idx
  on public.partner_service_billing (service_id, effective_from);
create index partner_service_billing_service_idx
  on public.partner_service_billing (service_id, effective_from desc);

comment on table public.partner_service_billing is
  'BILLING TERMS for one service, effective-dated. A rate change inserts a row and closes the previous one; it never overwrites, because January''s invoices were issued under January''s terms and rewriting them would silently restate history.';

-- ── The engagement says who schedules, and when it ends ─────────────────
alter table public.partner_services
  add column if not exists billing_authority public.partner_billing_authority not null default 'bes',
  add column if not exists cancellation_effective_on date,
  add column if not exists cancellation_reason text,
  /** Total agreed value of a project engagement. Never recurring revenue. */
  add column if not exists contract_value_cents bigint
    check (contract_value_cents is null or contract_value_cents >= 0);

comment on column public.partner_services.billing_authority is
  'The ONE system allowed to create a billing obligation for this engagement. Others may mirror and reconcile. Two schedulers for one $299 is how a partner gets charged twice.';
comment on column public.partner_services.cancellation_effective_on is
  'Future recurring billing stops on this date. Invoices already earned before it stand — cancelling forward is not erasing backwards.';

-- ── Scheduled obligations: instalments, and dated future charges ────────
create table public.partner_billing_schedule (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  group_id     uuid not null references public.outsourcing_groups(id) on delete cascade,
  service_id   uuid references public.partner_services(id) on delete set null,
  /** 'instalment' | 'recurring' | 'one_time'. What KIND of obligation this is,
      which is what keeps a three-part build out of the MRR figure. */
  kind         text not null check (kind in ('instalment', 'recurring', 'one_time')),
  sequence     integer,
  due_on       date not null,
  amount_cents bigint not null check (amount_cents >= 0),
  currency     text not null default 'USD',
  status       text not null default 'scheduled'
    check (status in ('scheduled', 'invoiced', 'cancelled')),
  invoice_id   uuid,
  notes        text,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index partner_billing_schedule_due_idx
  on public.partner_billing_schedule (agency_id, due_on) where status = 'scheduled';
create index partner_billing_schedule_group_idx
  on public.partner_billing_schedule (group_id, due_on);
create trigger partner_billing_schedule_updated_at before update on public.partner_billing_schedule
  for each row execute function public.set_updated_at();

comment on table public.partner_billing_schedule is
  'What is due, and when. A $6,000 build paid in three parts is three rows here and zero MRR anywhere.';

-- ── Invoices ────────────────────────────────────────────────────────────
create table public.partner_invoices (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  group_id       uuid not null references public.outsourcing_groups(id) on delete cascade,
  /** Human-facing and unique per agency. Generated, never typed. */
  invoice_number text not null,
  issue_date     date not null default current_date,
  due_date       date not null,
  currency       text not null default 'USD',
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  tax_cents      bigint not null default 0 check (tax_cents >= 0),
  total_cents    bigint not null default 0 check (total_cents >= 0),
  /** Maintained by the payment ledger's trigger. Never written by a client:
      a screen must not be able to declare an invoice paid. */
  amount_paid_cents bigint not null default 0 check (amount_paid_cents >= 0),
  status         public.partner_invoice_status not null default 'draft',
  payment_provider public.partner_payment_provider,
  external_invoice_id text,
  notes          text,
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  sent_at        timestamptz,
  paid_at        timestamptz,
  voided_at      timestamptz,
  void_reason    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (agency_id, invoice_number)
);
create index partner_invoices_group_idx on public.partner_invoices (group_id, issue_date desc);
create index partner_invoices_open_idx on public.partner_invoices (agency_id, due_date)
  where status in ('scheduled', 'sent', 'partially_paid', 'overdue');
create trigger partner_invoices_updated_at before update on public.partner_invoices
  for each row execute function public.set_updated_at();

alter table public.partner_billing_schedule
  add constraint partner_billing_schedule_invoice_fk
  foreign key (invoice_id) references public.partner_invoices(id) on delete set null;

comment on column public.partner_invoices.amount_paid_cents is
  'Derived from the payment ledger by trigger. A client cannot set it, so "paid" always means money arrived rather than somebody clicked a button.';

create table public.partner_invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.partner_invoices(id) on delete cascade,
  /** Kept where known, so revenue can be attributed to the engagement that
      earned it. An invoice MAY combine services; a line belongs to one. */
  service_id   uuid references public.partner_services(id) on delete set null,
  schedule_id  uuid references public.partner_billing_schedule(id) on delete set null,
  description  text not null,
  quantity     numeric not null default 1 check (quantity >= 0),
  unit_label   text,
  unit_amount_cents bigint not null default 0,
  amount_cents bigint not null default 0,
  sort         integer not null default 0
);
create index partner_invoice_lines_invoice_idx on public.partner_invoice_lines (invoice_id, sort);

-- ── The payment ledger ──────────────────────────────────────────────────
create table public.partner_payments (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  group_id      uuid not null references public.outsourcing_groups(id) on delete cascade,
  invoice_id    uuid references public.partner_invoices(id) on delete set null,
  service_id    uuid references public.partner_services(id) on delete set null,
  provider      public.partner_payment_provider not null,
  provider_transaction_id text,
  amount_cents  bigint not null check (amount_cents >= 0),
  currency      text not null default 'USD',
  /** CASH DATE. An invoice issued 28 August and paid 3 September is September
      income on the operating dashboard. Accrual reporting, if it is ever
      wanted, is a different question asked of the same rows. */
  paid_on       date not null default current_date,
  status        public.partner_payment_status not null default 'succeeded',
  method        text,
  /** 'manual' until a provider confirms it. A recorded PayPal Personal payment
      is a person's word, and the screen must not dress it as verified. */
  source        text not null default 'manual'
    check (source in ('manual', 'provider_webhook', 'provider_import', 'reconciled')),
  reconciled_at timestamptz,
  reconciliation_state text not null default 'unreconciled'
    check (reconciliation_state in ('unreconciled', 'matched', 'review_required')),
  refund_amount_cents bigint not null default 0 check (refund_amount_cents >= 0),
  notes         text,
  recorded_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index partner_payments_group_idx on public.partner_payments (group_id, paid_on desc);
create index partner_payments_month_idx on public.partner_payments (agency_id, paid_on);
create index partner_payments_invoice_idx on public.partner_payments (invoice_id);
create trigger partner_payments_updated_at before update on public.partner_payments
  for each row execute function public.set_updated_at();

/* A webhook delivered twice must not become revenue twice. Partial because a
   manually recorded payment has no provider reference and several may exist. */
create unique index partner_payments_provider_txn_idx
  on public.partner_payments (provider, provider_transaction_id)
  where provider_transaction_id is not null;

comment on table public.partner_payments is
  'Money BES actually received. The ONLY source of "collected". An invoice being sent, due, or attached to an active subscription is not a payment.';

-- ── An invoice's state follows its payments ─────────────────────────────
create or replace function public.partner_invoice_recompute(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_paid bigint;
  v_total bigint;
  v_status public.partner_invoice_status;
  v_due date;
  v_current public.partner_invoice_status;
begin
  if p_invoice is null then return; end if;

  select total_cents, due_date, status into v_total, v_due, v_current
    from public.partner_invoices where id = p_invoice;
  if not found then return; end if;

  /* Refunds reduce what was collected against the invoice; a refunded payment
     contributes nothing at all. */
  select coalesce(sum(case when status = 'succeeded'
                           then greatest(amount_cents - refund_amount_cents, 0)
                           else 0 end), 0)
    into v_paid
    from public.partner_payments where invoice_id = p_invoice;

  v_status := case
    /* Void and cancelled are decisions a person made. Money arriving does not
       silently reopen them. */
    when v_current in ('void', 'cancelled') then v_current
    when v_total > 0 and v_paid >= v_total then 'paid'
    when v_paid > 0 then 'partially_paid'
    when v_current = 'draft' then 'draft'
    when v_due < current_date then 'overdue'
    when v_current = 'sent' then 'sent'
    else v_current
  end;

  update public.partner_invoices
     set amount_paid_cents = v_paid,
         status = v_status,
         paid_at = case when v_status = 'paid' then coalesce(paid_at, now()) else null end
   where id = p_invoice;
end;
$function$;
revoke execute on function public.partner_invoice_recompute(uuid) from public, anon;

create or replace function public.partner_payment_touches_invoice()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if tg_op <> 'INSERT' and old.invoice_id is not null then
    perform public.partner_invoice_recompute(old.invoice_id);
  end if;
  if tg_op <> 'DELETE' and new.invoice_id is not null then
    perform public.partner_invoice_recompute(new.invoice_id);
  end if;
  return null;
end;
$function$;

create trigger partner_payments_sync_invoice
  after insert or update or delete on public.partner_payments
  for each row execute function public.partner_payment_touches_invoice();

-- ── Invoice numbers are generated, not typed ────────────────────────────
create sequence if not exists public.partner_invoice_seq;

create or replace function public.next_invoice_number(p_agency uuid)
returns text language sql volatile security definer set search_path = public as $function$
  select 'BES-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.partner_invoice_seq')::text, 5, '0')
$function$;
revoke execute on function public.next_invoice_number(uuid) from public, anon;
grant execute on function public.next_invoice_number(uuid) to authenticated;

-- ── Overdue is a fact about today, applied once a day ───────────────────
create or replace function public.mark_overdue_invoices()
returns integer language sql volatile security definer set search_path = public as $function$
  with moved as (
    update public.partner_invoices
       set status = 'overdue'
     where status in ('sent', 'partially_paid')
       and due_date < current_date
       and amount_paid_cents < total_cents
    returning 1
  )
  select count(*)::integer from moved
$function$;
revoke execute on function public.mark_overdue_invoices() from public, anon;
grant execute on function public.mark_overdue_invoices() to authenticated;

comment on function public.mark_overdue_invoices() is
  'Moves sent invoices past their due date to overdue. Separate from the read path so a dashboard does not mutate rows while rendering.';

-- ── Who may see and touch the money ─────────────────────────────────────
insert into public.permission_keys (key, module, label, description, security_relevant, sort) values
  ('partners.invoices.view',   'Partner finance', 'View invoices',    'See invoices raised against partners.', true, 123),
  ('partners.invoices.manage', 'Partner finance', 'Manage invoices',  'Create, send, void and schedule partner invoices.', true, 124),
  ('partners.payments.record', 'Partner finance', 'Record payments',  'Record money received against an invoice.', true, 125),
  ('finance.dashboard.view',   'Partner finance', 'Financial dashboard', 'Agency-wide MRR, expected collection and collected revenue.', true, 126)
on conflict (key) do nothing;

/* Manager defaults to OFF for every one of them, exactly as with the existing
   financial keys. Owner and admin hold them through their role. */
insert into public.agency_role_permissions (agency_id, role, key, allowed) values
  (null, 'agency_manager',   'partners.invoices.view',   false),
  (null, 'agency_manager',   'partners.invoices.manage', false),
  (null, 'agency_manager',   'partners.payments.record', false),
  (null, 'agency_manager',   'finance.dashboard.view',   false),
  (null, 'agency_team_lead', 'partners.invoices.view',   false),
  (null, 'agency_team_lead', 'partners.invoices.manage', false),
  (null, 'agency_team_lead', 'partners.payments.record', false),
  (null, 'agency_team_lead', 'finance.dashboard.view',   false),
  (null, 'agency_agent',     'partners.invoices.view',   false),
  (null, 'agency_agent',     'partners.invoices.manage', false),
  (null, 'agency_agent',     'partners.payments.record', false),
  (null, 'agency_agent',     'finance.dashboard.view',   false)
on conflict do nothing;

alter table public.partner_billing_schedule enable row level security;
alter table public.partner_invoices         enable row level security;
alter table public.partner_invoice_lines    enable row level security;
alter table public.partner_payments         enable row level security;
revoke all on public.partner_billing_schedule, public.partner_invoices,
              public.partner_invoice_lines, public.partner_payments from public, anon;
grant select, insert, update, delete on public.partner_billing_schedule to authenticated;
grant select, insert, update          on public.partner_invoices        to authenticated;
grant select, insert, update, delete on public.partner_invoice_lines   to authenticated;
grant select, insert, update          on public.partner_payments        to authenticated;

/* No partner branch anywhere below. A partner never reads BES's ledger — not
   their own invoices through this surface, and certainly not BES's margin.
   A partner-facing invoice view, if it is ever wanted, is a deliberate build
   with its own policy, not a side effect of one written here. */
create policy partner_billing_schedule_select on public.partner_billing_schedule for select to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.financials.view'));
create policy partner_billing_schedule_write on public.partner_billing_schedule for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.agency_can('partners.invoices.manage'));
create policy partner_billing_schedule_update on public.partner_billing_schedule for update to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.invoices.manage'))
  with check (public.is_staff_of(agency_id) and public.agency_can('partners.invoices.manage'));
create policy partner_billing_schedule_delete on public.partner_billing_schedule for delete to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.invoices.manage'));

create policy partner_invoices_select on public.partner_invoices for select to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.invoices.view'));
create policy partner_invoices_write on public.partner_invoices for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.agency_can('partners.invoices.manage'));
create policy partner_invoices_update on public.partner_invoices for update to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.invoices.manage'))
  with check (public.is_staff_of(agency_id) and public.agency_can('partners.invoices.manage'));
-- No delete policy: an issued invoice is voided, never removed (rule 11).

create policy partner_invoice_lines_select on public.partner_invoice_lines for select to authenticated
  using (exists (select 1 from public.partner_invoices i where i.id = invoice_id));
create policy partner_invoice_lines_write on public.partner_invoice_lines for insert to authenticated
  with check (exists (
    select 1 from public.partner_invoices i
     where i.id = invoice_id and public.agency_can('partners.invoices.manage')));
create policy partner_invoice_lines_update on public.partner_invoice_lines for update to authenticated
  using (exists (
    select 1 from public.partner_invoices i
     where i.id = invoice_id and public.agency_can('partners.invoices.manage')))
  with check (exists (
    select 1 from public.partner_invoices i
     where i.id = invoice_id and public.agency_can('partners.invoices.manage')));
create policy partner_invoice_lines_delete on public.partner_invoice_lines for delete to authenticated
  using (exists (
    select 1 from public.partner_invoices i
     where i.id = invoice_id and i.status = 'draft'
       and public.agency_can('partners.invoices.manage')));

create policy partner_payments_select on public.partner_payments for select to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.financials.view'));
create policy partner_payments_write on public.partner_payments for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.agency_can('partners.payments.record'));
create policy partner_payments_update on public.partner_payments for update to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.payments.record'))
  with check (public.is_staff_of(agency_id) and public.agency_can('partners.payments.record'));
-- No delete policy: a payment that happened stays (rule 11). Refund it.
