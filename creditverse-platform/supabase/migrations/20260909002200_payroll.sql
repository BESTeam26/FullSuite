-- =============================================================================
-- People management, part 3: payroll.
--
-- Dee's rule, stated plainly: the agent's rate lives on their profile, every
-- cutoff computes each person's payslip AUTOMATICALLY from the canonical time
-- and leave records, and a released payroll becomes an EXPENSE. The agent
-- reports nothing and the manager types nothing but the rate — the system
-- does the reporting (rule 17b), and the arithmetic is deterministic SQL
-- (rule 9).
--
--   member_pay_rates   effective-dated: 'hourly' (per work + paid-leave hour)
--                      or 'per_cutoff' (a fixed amount each cutoff — chosen
--                      over "monthly" so a semi-monthly cutoff never needs a
--                      proration rule nobody agreed to)
--   payroll_cutoffs    a period; cutoffs cannot overlap (exclusion constraint)
--   payslips           one per person per cutoff, rate SNAPSHOTTED, gross a
--                      generated column
--   generate_payroll   recomputes a DRAFT cutoff from time_entries (work
--                      minutes only) + approved PAID leave on scheduled days
--   release_payroll    freezes it and writes ONE agency_expenses row for the
--                      total — payroll is an expense the moment it is released
-- =============================================================================

insert into public.permission_keys (key, module, label, description, security_relevant, sort)
values
  ('payroll.view',   'finance', 'View payroll',   'See cutoffs and everyone''s payslips.', true, 810),
  ('payroll.manage', 'finance', 'Manage payroll', 'Set rates, generate, adjust and release payroll.', true, 811)
on conflict (key) do nothing;

-- ── Rates, effective-dated and snapshotted ────────────────────────────────
create table public.member_pay_rates (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  rate_type      text not null check (rate_type in ('hourly', 'per_cutoff')),
  rate_cents     bigint not null check (rate_cents >= 0),
  currency       text not null default 'USD' check (length(currency) = 3),
  effective_from date not null default (now() at time zone 'utc')::date,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint member_pay_rates_one_per_day unique (user_id, effective_from)
);
create index member_pay_rates_user_idx on public.member_pay_rates (user_id, effective_from desc);
alter table public.member_pay_rates enable row level security;

/* A rate is between the person and management — a lead does NOT see it. */
create policy member_pay_rates_select on public.member_pay_rates
  for select to authenticated
  using (is_staff_of(agency_id) and (user_id = auth.uid() or agency_can('payroll.view') or agency_can('payroll.manage')));
/* Writes only through set_member_pay_rate. */

create or replace function public.set_member_pay_rate(
  p_user uuid, p_rate_type text, p_rate_cents bigint,
  p_currency text default 'USD',
  p_effective_from date default (now() at time zone 'utc')::date
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid; v_actor text; v_id uuid; v_before text;
begin
  select agency_id into v_agency from public.agency_memberships
   where user_id = p_user and status = 'active' limit 1;
  if v_agency is null then raise exception 'That person is not an active member of the agency'; end if;
  if not public.is_staff_of(v_agency) or not public.agency_can('payroll.manage') then
    raise exception 'Setting a rate needs the payroll permission' using errcode = '42501';
  end if;
  if p_rate_type not in ('hourly', 'per_cutoff') then
    raise exception 'rate_type is hourly or per_cutoff';
  end if;

  select rate_type || ' ' || rate_cents || ' ' || currency into v_before
    from public.member_pay_rates
   where user_id = p_user and effective_from <= p_effective_from
   order by effective_from desc limit 1;

  insert into public.member_pay_rates (agency_id, user_id, rate_type, rate_cents, currency, effective_from, created_by)
  values (v_agency, p_user, p_rate_type, p_rate_cents, upper(p_currency), p_effective_from, auth.uid())
  on conflict (user_id, effective_from) do update
    set rate_type = excluded.rate_type, rate_cents = excluded.rate_cents,
        currency = excluded.currency, created_by = excluded.created_by
  returning id into v_id;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
  values (v_agency, 'pay_rate', p_user::text, auth.uid(), v_actor,
          'Pay rate set', 'rate', v_before,
          p_rate_type || ' ' || p_rate_cents || ' ' || upper(p_currency) || ' from ' || p_effective_from,
          'bes_internal');
  return v_id;
end;
$function$;
revoke execute on function public.set_member_pay_rate(uuid, text, bigint, text, date) from public, anon;
grant execute on function public.set_member_pay_rate(uuid, text, bigint, text, date) to authenticated;

-- ── Cutoffs ───────────────────────────────────────────────────────────────
create table public.payroll_cutoffs (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  status       text not null default 'draft' check (status in ('draft', 'released')),
  released_by  uuid references public.profiles(id) on delete set null,
  released_at  timestamptz,
  expense_id   uuid references public.agency_expenses(id) on delete set null,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  constraint payroll_cutoffs_dates_ck check (period_end >= period_start and period_end - period_start < 62),
  /* Two cutoffs over the same day would pay the same hour twice. */
  constraint payroll_cutoffs_no_overlap exclude using gist (
    agency_id with =, daterange(period_start, period_end, '[]') with &&
  )
);
alter table public.payroll_cutoffs enable row level security;
create policy payroll_cutoffs_select on public.payroll_cutoffs
  for select to authenticated
  using (is_staff_of(agency_id) and (agency_can('payroll.view') or agency_can('payroll.manage')));
create policy payroll_cutoffs_insert on public.payroll_cutoffs
  for insert to authenticated
  with check (is_staff_of(agency_id) and agency_can('payroll.manage') and status = 'draft');
create policy payroll_cutoffs_delete on public.payroll_cutoffs
  for delete to authenticated
  using (is_staff_of(agency_id) and agency_can('payroll.manage') and status = 'draft');
/* No UPDATE policy: release goes through release_payroll, and a released
   cutoff is history (rule 11). */

-- ── Payslips ──────────────────────────────────────────────────────────────
create table public.payslips (
  id                  uuid primary key default gen_random_uuid(),
  cutoff_id           uuid not null references public.payroll_cutoffs(id) on delete cascade,
  agency_id           uuid not null references public.agencies(id) on delete cascade,
  user_id             uuid not null references public.profiles(id) on delete cascade,
  rate_type           text not null,
  rate_cents          bigint not null,
  currency            text not null,
  work_minutes        integer not null default 0,
  paid_leave_minutes  integer not null default 0,
  base_cents          bigint not null default 0,
  adjustment_cents    bigint not null default 0,
  adjustment_note     text,
  gross_cents         bigint generated always as (base_cents + adjustment_cents) stored,
  created_at          timestamptz not null default now(),
  constraint payslips_one_per_person unique (cutoff_id, user_id)
);
create index payslips_user_idx on public.payslips (user_id, created_at desc);
alter table public.payslips enable row level security;

/* Your own payslip is yours to read, always. Everyone else's needs payroll. */
create policy payslips_select on public.payslips
  for select to authenticated
  using (is_staff_of(agency_id)
         and (user_id = auth.uid() or agency_can('payroll.view') or agency_can('payroll.manage')));
/* All writes go through the functions below. */

-- ── Generation: deterministic, from the canonical records ─────────────────
create or replace function public.generate_payroll(p_cutoff uuid)
returns integer
language plpgsql security definer set search_path = public as $function$
declare
  c record;
  n integer;
begin
  select * into c from public.payroll_cutoffs where id = p_cutoff;
  if not found then raise exception 'Cutoff not found'; end if;
  if not public.is_staff_of(c.agency_id) or not public.agency_can('payroll.manage') then
    raise exception 'Generating payroll needs the payroll permission' using errcode = '42501';
  end if;
  if c.status <> 'draft' then
    raise exception 'This cutoff is released. Released payroll is history.';
  end if;

  /* Regenerating a draft replaces it wholesale — a draft is a computation,
     not a record. Manual adjustments are re-entered deliberately. */
  delete from public.payslips where cutoff_id = p_cutoff;

  insert into public.payslips
        (cutoff_id, agency_id, user_id, rate_type, rate_cents, currency,
         work_minutes, paid_leave_minutes, base_cents)
  select p_cutoff, c.agency_id, m.user_id, r.rate_type, r.rate_cents, r.currency,
         coalesce(t.work_min, 0),
         coalesce(pl.paid_leave_min, 0),
         case r.rate_type
           when 'per_cutoff' then r.rate_cents
           else ((coalesce(t.work_min, 0) + coalesce(pl.paid_leave_min, 0))::numeric
                 * r.rate_cents / 60)::bigint
         end
    from public.agency_memberships m
    /* The rate in force at the END of the period, snapshotted. No rate, no
       payslip — an unpriced person is surfaced by their absence, not paid 0. */
    join lateral (
      select rate_type, rate_cents, currency
        from public.member_pay_rates r
       where r.user_id = m.user_id and r.effective_from <= c.period_end
       order by r.effective_from desc limit 1
    ) r on true
    left join lateral (
      select sum(te.duration_minutes)::int as work_min
        from public.time_entries te
       where te.employee_id = m.user_id and te.kind = 'work'
         and te.ended_at is not null
         and te.work_date between c.period_start and c.period_end
    ) t on true
    /* Approved PAID leave, on days the schedule says they work: each such day
       pays the scheduled shift minus the unpaid lunch. */
    left join lateral (
      select sum(
               greatest(0, (extract(epoch from (s.shift_end - s.shift_start)) / 60)::int - s.lunch_minutes)
             )::int as paid_leave_min
        from public.leave_requests lr
        join public.leave_types lt on lt.id = lr.type_id and lt.paid
        cross join lateral generate_series(
          greatest(lr.starts_on, c.period_start),
          least(lr.ends_on, c.period_end), interval '1 day') as d(day)
        join lateral (
          select * from public.work_schedules ws
           where ws.user_id = m.user_id and ws.effective_from <= d.day::date
           order by ws.effective_from desc limit 1
        ) s on extract(isodow from d.day)::smallint = any (s.work_days)
       where lr.user_id = m.user_id and lr.status = 'approved'
    ) pl on true
   where m.agency_id = c.agency_id and m.status = 'active';

  get diagnostics n = row_count;
  return n;
end;
$function$;
revoke execute on function public.generate_payroll(uuid) from public, anon;
grant execute on function public.generate_payroll(uuid) to authenticated;

-- ── A manager's adjustment, before release ────────────────────────────────
create or replace function public.adjust_payslip(p_payslip uuid, p_cents bigint, p_note text)
returns void
language plpgsql security definer set search_path = public as $function$
declare s record;
begin
  select p.*, c.status as cutoff_status into s
    from public.payslips p join public.payroll_cutoffs c on c.id = p.cutoff_id
   where p.id = p_payslip;
  if not found then raise exception 'Payslip not found'; end if;
  if not public.is_staff_of(s.agency_id) or not public.agency_can('payroll.manage') then
    raise exception 'Adjusting a payslip needs the payroll permission' using errcode = '42501';
  end if;
  if s.cutoff_status <> 'draft' then
    raise exception 'This cutoff is released. Released payroll is history.';
  end if;
  if nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'An adjustment states its reason';
  end if;
  update public.payslips
     set adjustment_cents = p_cents, adjustment_note = trim(p_note)
   where id = p_payslip;
end;
$function$;
revoke execute on function public.adjust_payslip(uuid, bigint, text) from public, anon;
grant execute on function public.adjust_payslip(uuid, bigint, text) to authenticated;

-- ── Release: the payroll becomes an expense ───────────────────────────────
create or replace function public.release_payroll(p_cutoff uuid)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  c record;
  v_total bigint;
  v_currencies int;
  v_currency text;
  v_people int;
  v_expense uuid;
  v_actor text;
begin
  select * into c from public.payroll_cutoffs where id = p_cutoff;
  if not found then raise exception 'Cutoff not found'; end if;
  if not public.is_staff_of(c.agency_id) or not public.agency_can('payroll.manage') then
    raise exception 'Releasing payroll needs the payroll permission' using errcode = '42501';
  end if;
  if c.status <> 'draft' then raise exception 'Already released'; end if;

  select sum(gross_cents), count(distinct currency), min(currency), count(*)
    into v_total, v_currencies, v_currency, v_people
    from public.payslips where cutoff_id = p_cutoff;
  if coalesce(v_people, 0) = 0 then
    raise exception 'Generate the payroll first — this cutoff has no payslips';
  end if;
  if v_currencies > 1 then
    raise exception 'Payslips carry more than one currency; one expense cannot honestly total them';
  end if;

  insert into public.agency_expenses
        (agency_id, vendor, description, category, due_date, amount_cents, currency, status, notes)
  values (c.agency_id, 'Payroll',
          'Payroll ' || to_char(c.period_start, 'FMMon DD') || '–' || to_char(c.period_end, 'FMMon DD, YYYY'),
          'payroll', c.period_end, v_total, v_currency, 'due',
          v_people || ' payslips, released from the payroll cutoff. Source: canonical time and leave records.')
  returning id into v_expense;

  update public.payroll_cutoffs
     set status = 'released', released_by = auth.uid(), released_at = now(), expense_id = v_expense
   where id = p_cutoff;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
  values (c.agency_id, 'payroll_cutoff', c.id::text, auth.uid(), v_actor,
          'Payroll released', 'status', 'draft',
          'released · ' || v_people || ' payslips · total ' || v_total || ' ' || v_currency, 'bes_internal');
  return v_expense;
end;
$function$;
revoke execute on function public.release_payroll(uuid) from public, anon;
grant execute on function public.release_payroll(uuid) to authenticated;

-- entity_visible learns the two new audit types.
create or replace function public.entity_visible(p_entity_type text, p_entity_id text)
returns boolean language sql stable set search_path = public as $function$
  select case p_entity_type
    when 'fulfillment_client' then exists (select 1 from public.fulfillment_clients c where c.id::text = p_entity_id)
    when 'funding_client'     then exists (select 1 from public.funding_clients c where c.id::text = p_entity_id)
    when 'work_item'          then exists (select 1 from public.work_items w where w.id::text = p_entity_id)
    when 'funding_file'       then exists (select 1 from public.funding_files f where f.id::text = p_entity_id)
    when 'eod_submission'     then exists (select 1 from public.eod_submissions e where e.id::text = p_entity_id)
    when 'channel'            then exists (select 1 from public.channels c where c.id::text = p_entity_id)
    when 'channel_message'    then exists (select 1 from public.messages m where m.id = public.try_bigint(p_entity_id))
    when 'client'             then exists (select 1 from public.clients c where c.id::text = p_entity_id)
    when 'announcement'       then exists (select 1 from public.announcements a where a.id::text = p_entity_id)
    when 'crm_project'        then exists (select 1 from public.crm_projects p where p.id::text = p_entity_id)
    when 'time_entry'         then exists (select 1 from public.time_entries te where te.id::text = p_entity_id)
    when 'company_document'   then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
                                or exists (select 1 from public.agencies a where a.id::text = p_entity_id)
    when 'organization'       then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
    when 'activity_event'     then exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(p_entity_id))
    when 'partner'            then exists (select 1 from public.outsourcing_groups g where g.id::text = p_entity_id)
    when 'work_schedule'      then exists (select 1 from public.work_schedules ws where ws.user_id::text = p_entity_id)
    when 'leave_request'      then exists (select 1 from public.leave_requests lr where lr.id::text = p_entity_id)
    /* A rate event is visible exactly when the person's rate rows are. */
    when 'pay_rate'           then exists (select 1 from public.member_pay_rates r where r.user_id::text = p_entity_id)
    when 'payroll_cutoff'     then exists (select 1 from public.payroll_cutoffs pc where pc.id::text = p_entity_id)
    else false
  end
$function$;
