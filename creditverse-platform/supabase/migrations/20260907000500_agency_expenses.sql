-- 0164 — the other half of "what did we make this month".
--
-- ---------------------------------------------------------------------------
-- SCOPE, DELIBERATELY SMALL (Dee, 2026-09-07)
--
-- "The goal is NOT to build Xero." No journals, no chart of accounts, no
-- period close, no tax. This exists to answer one owner question:
--
--   NET CASH THIS MONTH = money collected − expenses actually paid
--
-- An OPERATING figure, not accounting net income, and the interface says so
-- rather than letting somebody file it with a tax return.
--
-- The columns come from the sheet this replaces — its MONTHLY EXPENSES REPORT
-- is Payment Date, Description, Due Date, Transaction Type, Amount, Invoice
-- link, Receipt link — plus the vendor, category and status the spreadsheet
-- kept in people's heads.
--
-- RECURRING EXPENSES ARE A TEMPLATE, NOT A ROW PER MONTH. Vercel, Supabase,
-- Anthropic and Google Workspace arrive every month whether or not anyone
-- remembers to type them, so a template generates the month's expected
-- expense and a person only confirms what was actually paid.
-- ---------------------------------------------------------------------------

create type public.expense_status as enum
  ('upcoming', 'due', 'paid', 'overdue', 'void');

create table public.agency_expense_templates (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  vendor        text not null check (length(trim(vendor)) between 1 and 120),
  description   text,
  category      text,
  amount_cents  bigint not null check (amount_cents >= 0),
  currency      text not null default 'USD',
  /** 'monthly' | 'weekly' | 'quarterly' | 'annual'. */
  cadence       text not null default 'monthly'
    check (cadence in ('weekly', 'monthly', 'quarterly', 'annual')),
  /** Day of the month it falls due, 1-31. Clamped to the month's length. */
  due_day       integer check (due_day between 1 and 31),
  payment_method text,
  transaction_type text check (transaction_type is null or transaction_type in ('business', 'personal')),
  active        boolean not null default true,
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index agency_expense_templates_idx on public.agency_expense_templates (agency_id) where active;
create trigger agency_expense_templates_updated_at before update on public.agency_expense_templates
  for each row execute function public.set_updated_at();

comment on table public.agency_expense_templates is
  'A bill that arrives every cycle. Generates the month''s expected expense so nobody retypes Vercel twelve times a year.';

create table public.agency_expenses (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  template_id   uuid references public.agency_expense_templates(id) on delete set null,
  vendor        text not null check (length(trim(vendor)) between 1 and 120),
  description   text,
  category      text,
  due_date      date,
  /** The CASH DATE. NULL until it is actually paid — which is the whole point:
      an expense that is due is not an expense that is out of the bank. */
  paid_on       date,
  amount_cents  bigint not null check (amount_cents >= 0),
  currency      text not null default 'USD',
  fx_rate_used  numeric check (fx_rate_used is null or fx_rate_used > 0),
  payment_method text,
  transaction_type text check (transaction_type is null or transaction_type in ('business', 'personal')),
  status        public.expense_status not null default 'upcoming',
  invoice_url   text,
  receipt_url   text,
  notes         text,
  recorded_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  /* One generated row per template per period — a second run of the generator
     must not double the month's expected outgoings. */
  unique nulls not distinct (template_id, due_date)
);
create index agency_expenses_month_idx on public.agency_expenses (agency_id, paid_on);
create index agency_expenses_due_idx on public.agency_expenses (agency_id, due_date)
  where status in ('upcoming', 'due', 'overdue');
create trigger agency_expenses_updated_at before update on public.agency_expenses
  for each row execute function public.set_updated_at();

comment on column public.agency_expenses.paid_on is
  'When the money actually left. NULL means the bill exists and has not been paid — the difference between "expenses due" and "expenses paid" on the owner dashboard.';

-- ── Status follows the dates, not a dropdown somebody forgot ────────────
create or replace function public.expense_status_from_dates()
returns trigger language plpgsql set search_path = public as $function$
begin
  if new.status = 'void' then
    return new;
  elsif new.paid_on is not null then
    new.status := 'paid';
  elsif new.due_date is not null and new.due_date < current_date then
    new.status := 'overdue';
  elsif new.due_date is not null and new.due_date <= current_date + 7 then
    new.status := 'due';
  else
    new.status := 'upcoming';
  end if;
  return new;
end;
$function$;

create trigger agency_expenses_status
  before insert or update of paid_on, due_date, status on public.agency_expenses
  for each row execute function public.expense_status_from_dates();

/* Overdue is a fact about today. Applied on a schedule rather than while a
   dashboard renders, so reading a page never writes rows. */
create or replace function public.mark_overdue_expenses()
returns integer language sql volatile security definer set search_path = public as $function$
  with moved as (
    update public.agency_expenses
       set status = 'overdue'
     where status in ('upcoming', 'due') and paid_on is null and due_date < current_date
    returning 1
  )
  select count(*)::integer from moved
$function$;
revoke execute on function public.mark_overdue_expenses() from public, anon;
grant execute on function public.mark_overdue_expenses() to authenticated;

-- ── Generate a month's recurring bills ──────────────────────────────────
create or replace function public.generate_expenses_for_month(
  p_agency uuid,
  p_year   integer,
  p_month  integer
)
returns integer
language plpgsql
security definer
set search_path = public as $function$
declare
  v_made integer := 0;
  v_last integer;
  t record;
  v_due date;
begin
  if not (public.is_staff_of(p_agency) and public.agency_can('expenses.manage')) then
    raise exception 'Not authorized to generate expenses for this agency';
  end if;

  v_last := extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'));

  for t in
    select * from public.agency_expense_templates
     where agency_id = p_agency and active and cadence = 'monthly'
  loop
    /* A 31st-of-the-month bill in February falls on the 28th, not nowhere. */
    v_due := make_date(p_year, p_month, least(coalesce(t.due_day, 1), v_last));
    insert into public.agency_expenses
      (agency_id, template_id, vendor, description, category, due_date,
       amount_cents, currency, payment_method, transaction_type, notes)
    values (p_agency, t.id, t.vendor, t.description, t.category, v_due,
            t.amount_cents, t.currency, t.payment_method, t.transaction_type, t.notes)
    on conflict (template_id, due_date) do nothing;
    if found then v_made := v_made + 1; end if;
  end loop;

  return v_made;
end;
$function$;
revoke execute on function public.generate_expenses_for_month(uuid, integer, integer) from public, anon;
grant execute on function public.generate_expenses_for_month(uuid, integer, integer) to authenticated;

comment on function public.generate_expenses_for_month(uuid, integer, integer) is
  'Creates this month''s expected bills from the recurring templates. Idempotent: running it twice does not double the month, because (template, due date) is unique.';

-- ── Permissions ─────────────────────────────────────────────────────────
insert into public.permission_keys (key, module, label, description, security_relevant, sort) values
  ('expenses.view',   'Partner finance', 'View expenses',   'See what BES owes and has paid.', true, 130),
  ('expenses.manage', 'Partner finance', 'Manage expenses', 'Record bills, mark them paid, and set up recurring ones.', true, 131)
on conflict (key) do nothing;

insert into public.agency_role_permissions (agency_id, role, key, allowed) values
  (null, 'agency_manager',   'expenses.view',   false),
  (null, 'agency_manager',   'expenses.manage', false),
  (null, 'agency_team_lead', 'expenses.view',   false),
  (null, 'agency_team_lead', 'expenses.manage', false),
  (null, 'agency_agent',     'expenses.view',   false),
  (null, 'agency_agent',     'expenses.manage', false)
on conflict do nothing;

alter table public.agency_expenses           enable row level security;
alter table public.agency_expense_templates  enable row level security;
revoke all on public.agency_expenses, public.agency_expense_templates from public, anon;
grant select, insert, update on public.agency_expenses          to authenticated;
grant select, insert, update on public.agency_expense_templates to authenticated;

/* BES's own outgoings. No partner branch, no organization branch — this is not
   customer data and nobody outside BES staff has any business reading it. */
create policy agency_expenses_select on public.agency_expenses for select to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('expenses.view'));
create policy agency_expenses_write on public.agency_expenses for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.agency_can('expenses.manage'));
create policy agency_expenses_update on public.agency_expenses for update to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('expenses.manage'))
  with check (public.is_staff_of(agency_id) and public.agency_can('expenses.manage'));

create policy agency_expense_templates_select on public.agency_expense_templates for select to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('expenses.view'));
create policy agency_expense_templates_write on public.agency_expense_templates for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.agency_can('expenses.manage'));
create policy agency_expense_templates_update on public.agency_expense_templates for update to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('expenses.manage'))
  with check (public.is_staff_of(agency_id) and public.agency_can('expenses.manage'));
