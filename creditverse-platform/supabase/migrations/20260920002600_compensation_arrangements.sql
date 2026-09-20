-- COMPENSATION ARRANGEMENTS (Dee, 2026-09-20).
--
-- One rate could not tell the truth. Archie's ₱100/hour was BES's COST,
-- wearing the agent's label: BES pays Bryan ₱100, Bryan pays Archie ₱80, and
-- the ₱20 is Bryan's margin — not a BES expense, and never Archie's pay.
--
--   arrangement_type   direct_bes        BES pays the worker
--                      managing_partner  BES pays the partner, who pays them
--   agent_rate_cents   what the WORKER earns
--   bes_cost_cents     what BES pays        (equal, for direct_bes)
--   margin             DERIVED, never stored, never a second expense
--
-- Effective-dated and append-only: a change closes the old row and opens a
-- new one, so a period that spans a change prices each part with the rate
-- that was true then. September is never restated.
--
-- Money is capability-gated, not role-gated: the agent side needs
-- compensation.agent_rate.view, BES cost and margin need
-- compensation.bes_cost.view, and writing needs
-- compensation.arrangement.manage. An administrator holds none of them by
-- being an administrator.

create table if not exists public.compensation_arrangements (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null references public.agencies(id) on delete cascade,
  user_id             uuid not null references public.profiles(id) on delete cascade,
  arrangement_type    text not null check (arrangement_type in ('direct_bes', 'managing_partner')),
  compensation_basis  text not null check (compensation_basis in ('hourly', 'daily', 'monthly', 'per_cutoff')),
  agent_rate_cents    bigint not null check (agent_rate_cents >= 0),
  bes_cost_cents      bigint not null check (bes_cost_cents >= 0),
  managing_partner_id uuid references public.profiles(id) on delete restrict,
  currency            text not null default 'PHP' check (length(currency) = 3),
  effective_from      date not null,
  effective_to        date,
  reason              text,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  /* A direct arrangement has no partner and no margin. */
  check ((arrangement_type = 'managing_partner') = (managing_partner_id is not null)),
  check (arrangement_type <> 'direct_bes' or bes_cost_cents = agent_rate_cents),
  check (effective_to is null or effective_to >= effective_from),
  check (managing_partner_id is distinct from user_id)
);
comment on table public.compensation_arrangements is
  'What a person earns and what BES pays for them, effective-dated. Margin is derived from the two, never stored. Append-only: correcting history means closing a row and opening another.';
create index if not exists compensation_arrangements_user_idx on public.compensation_arrangements (user_id, effective_from desc);
create index if not exists compensation_arrangements_partner_idx on public.compensation_arrangements (managing_partner_id) where managing_partner_id is not null;
/* One arrangement in force at a time, per person. */
create extension if not exists btree_gist with schema extensions;
alter table public.compensation_arrangements drop constraint if exists compensation_arrangements_no_overlap;
alter table public.compensation_arrangements add constraint compensation_arrangements_no_overlap
  exclude using gist (user_id with =, daterange(effective_from, effective_to, '[]') with &&);

alter table public.compensation_arrangements enable row level security;
revoke all on public.compensation_arrangements from public, anon;
grant select, insert, update on public.compensation_arrangements to authenticated;

/** BES cost and partner margin: the internal side of the money. */
create or replace function public.reads_bes_cost(p_agency uuid) returns boolean
language sql stable security definer set search_path = public as $function$
  select public.is_staff_of(p_agency) and public.agency_can('compensation.bes_cost.view')
$function$;
/** What a worker earns — the agent side, and their own row is always theirs. */
create or replace function public.reads_agent_rate(p_agency uuid) returns boolean
language sql stable security definer set search_path = public as $function$
  select public.is_staff_of(p_agency) and (public.agency_can('compensation.agent_rate.view') or public.agency_can('payroll.view') or public.agency_can('payroll.manage'))
$function$;
do $$ begin
  execute 'revoke all on function public.reads_bes_cost(uuid) from public, anon';
  execute 'revoke all on function public.reads_agent_rate(uuid) from public, anon';
  execute 'grant execute on function public.reads_bes_cost(uuid) to authenticated';
  execute 'grant execute on function public.reads_agent_rate(uuid) to authenticated';
end $$;

/* The table itself carries BES cost, so reading a ROW needs the cost key —
   or being the managing partner of that worker, who is owed the cost and
   must be able to see what they are owed. The agent-side-only readers go
   through `agent_compensation`, below, which never selects the cost. */
drop policy if exists compensation_arrangements_select on public.compensation_arrangements;
create policy compensation_arrangements_select on public.compensation_arrangements
  for select to authenticated
  using (public.reads_bes_cost(agency_id) or managing_partner_id = auth.uid());
drop policy if exists compensation_arrangements_insert on public.compensation_arrangements;
create policy compensation_arrangements_insert on public.compensation_arrangements
  for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.agency_can('compensation.arrangement.manage'));
drop policy if exists compensation_arrangements_update on public.compensation_arrangements;
create policy compensation_arrangements_update on public.compensation_arrangements
  for update to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('compensation.arrangement.manage'))
  with check (public.is_staff_of(agency_id) and public.agency_can('compensation.arrangement.manage'));

/**
 * Append-only, and audited. The only field an existing arrangement may change
 * is `effective_to` — closing it. A rate correction opens a new row, because
 * a payslip already frozen against the old one must stay explicable.
 */
create or replace function public.compensation_arrangements_guard() returns trigger
language plpgsql security definer set search_path = public as $function$
declare v_actor text;
begin
  if tg_op = 'UPDATE' then
    if (new.agent_rate_cents, new.bes_cost_cents, new.arrangement_type, new.compensation_basis,
        new.managing_partner_id, new.currency, new.effective_from, new.user_id)
       is distinct from
       (old.agent_rate_cents, old.bes_cost_cents, old.arrangement_type, old.compensation_basis,
        old.managing_partner_id, old.currency, old.effective_from, old.user_id) then
      raise exception 'An arrangement is history once written. Close it and open a new one instead.' using errcode = '22023';
    end if;
  end if;
  if new.reason is null or length(trim(new.reason)) < 3 then
    raise exception 'Say why this arrangement changed' using errcode = '22023';
  end if;
  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
  values (new.agency_id, 'profile', new.user_id::text, auth.uid(), v_actor,
          case when tg_op = 'INSERT' then 'Compensation arrangement opened' else 'Compensation arrangement closed' end,
          'compensation',
          case when tg_op = 'UPDATE' then old.arrangement_type || ' agent ' || old.agent_rate_cents || ' cost ' || old.bes_cost_cents || ' ' || old.currency || ' from ' || old.effective_from end,
          new.arrangement_type || ' agent ' || new.agent_rate_cents || ' cost ' || new.bes_cost_cents || ' ' || new.currency
            || ' ' || new.effective_from || '→' || coalesce(new.effective_to::text, 'open') || ' · ' || new.reason,
          'bes_internal');
  return new;
end $function$;
drop trigger if exists compensation_arrangements_guard on public.compensation_arrangements;
create trigger compensation_arrangements_guard before insert or update on public.compensation_arrangements
  for each row execute function public.compensation_arrangements_guard();

-- ── Adjustments: who funds this? ────────────────────────────────────────────
-- Dee: "Do not assume every agent adjustment changes BES cost." Each one says
-- explicitly, and the two payables are built from the answer:
--   agent payable = base agent pay + agent_only + both
--   BES payable   = base BES cost  + bes_only   + both
-- The margin follows from the finals. Nothing is booked twice.
create table if not exists public.compensation_adjustments (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null references public.agencies(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  cutoff_id        uuid references public.payroll_cutoffs(id) on delete cascade,
  amount_cents     bigint not null,
  adjustment_type  text not null check (adjustment_type in ('bonus', 'deduction', 'reimbursement', 'correction', 'fee', 'other')),
  financial_scope  text not null check (financial_scope in ('agent_only', 'bes_only', 'both')),
  reason           text not null check (length(trim(reason)) >= 3),
  effective_on     date not null default (now() at time zone 'utc')::date,
  approved_by      uuid references public.profiles(id) on delete set null,
  approved_at      timestamptz,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
comment on table public.compensation_adjustments is
  'A bonus, deduction or fee, and WHO FUNDS IT: agent_only (from the partner''s margin), bes_only (BES side only), both (BES reimburses it). Never inferred from the other.';
create index if not exists compensation_adjustments_cutoff_idx on public.compensation_adjustments (cutoff_id, user_id);

alter table public.compensation_adjustments enable row level security;
revoke all on public.compensation_adjustments from public, anon;
grant select, insert, update on public.compensation_adjustments to authenticated;
drop policy if exists compensation_adjustments_select on public.compensation_adjustments;
create policy compensation_adjustments_select on public.compensation_adjustments
  for select to authenticated using (public.reads_agent_rate(agency_id) or public.reads_bes_cost(agency_id));
drop policy if exists compensation_adjustments_write on public.compensation_adjustments;
create policy compensation_adjustments_write on public.compensation_adjustments
  for insert to authenticated with check (public.is_staff_of(agency_id) and public.agency_can('payroll.manage'));
drop policy if exists compensation_adjustments_update on public.compensation_adjustments;
create policy compensation_adjustments_update on public.compensation_adjustments
  for update to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('payroll.manage'))
  with check (public.is_staff_of(agency_id) and public.agency_can('payroll.manage'));

create or replace function public.compensation_adjustments_audit() returns trigger
language plpgsql security definer set search_path = public as $function$
declare v_actor text;
begin
  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
  values (new.agency_id, 'profile', new.user_id::text, auth.uid(), v_actor, 'Compensation adjustment', 'adjustment', null,
          new.adjustment_type || ' ' || new.amount_cents || ' funded by ' || new.financial_scope || ' · ' || new.reason, 'bes_internal');
  return new;
end $function$;
drop trigger if exists compensation_adjustments_audit on public.compensation_adjustments;
create trigger compensation_adjustments_audit after insert on public.compensation_adjustments
  for each row execute function public.compensation_adjustments_audit();
