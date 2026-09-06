-- 0109 — commissions: earned on funding, payable only once the money is real.
--
-- Dee, C6: "configurable flat OR percentage, with optional tiers later.
-- Commission should be earned when the deal is actually funded, and become
-- payable/cleared only after the related commission/revenue is confirmed."
--
-- The two-stage split is the whole design, and it is not bookkeeping pedantry.
-- A deal funds, so the partner has earned their share — that is a real
-- obligation and it must appear immediately. But the organization has not been
-- paid yet, and funding gets clawed back, rescinded and adjusted. Paying a
-- commission on revenue that never arrived is how a funding business loses
-- money quietly, one deal at a time.
--
--   pending   attribution exists, the deal has not funded
--   earned     the deal funded. Owed. Computed and visible. NOT payable.
--   payable    the organization's revenue on that deal is confirmed
--   paid       money out, with a reference
--   reversed   funding was clawed back after the commission was earned
--   void       cancelled before it was ever owed
--
-- Nothing skips a stage, and the two that matter are enforced in the database
-- rather than hoped for in an interface.
--
-- ── What already existed ───────────────────────────────────────────────────
--
-- `commissions` exists with the right columns and pct/flat already allowed.
-- What it had no notion of: a PLAN to compute from, the earned/payable split,
-- or any computation at all — every amount would have been typed by hand.
-- `funding_files.referred_by_membership_id` already records who brought the
-- deal, so attribution is not invented here either.

-- ---------------------------------------------------------------------------
-- 1. The lifecycle.
-- ---------------------------------------------------------------------------
alter table public.commissions drop constraint if exists commissions_state_check;
alter table public.commissions add constraint commissions_state_check
  check (state in ('pending', 'earned', 'payable', 'paid', 'reversed', 'void'));

alter table public.commissions
  add column if not exists plan_id uuid,
  add column if not exists earned_at timestamptz,
  add column if not exists payable_at timestamptz,
  add column if not exists reversed_at timestamptz,
  add column if not exists payment_reference text,
  /** The figure the percentage was taken from, kept so a payout can be checked. */
  add column if not exists basis_amount numeric(14,2);

comment on column public.commissions.basis_amount is
  'The amount the rate was applied to, stored at computation time. A percentage with no record of what it was a percentage OF cannot be audited later.';

-- ---------------------------------------------------------------------------
-- 2. Plans. Configurable, effective-dated, flat OR percentage.
--
-- Effective-dated rather than editable in place: changing a rate must not
-- silently rewrite what somebody already earned. A new rate is a new row.
-- Tiers are deliberately absent — Dee said "optional tiers later", and a tier
-- table nobody uses is a table somebody has to understand.
-- ---------------------------------------------------------------------------
create table public.commission_plans (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label           text not null,
  /** Which kind of party this pays. */
  party_kind      text not null check (party_kind in ('partner', 'org_user', 'lender_referral', 'agency')),
  /** Narrow to one person, or leave null for everybody of that kind. */
  party_id        uuid,
  basis           text not null check (basis in ('pct', 'flat')),
  /** A percentage of the funded amount, or an amount in dollars. */
  rate_or_amount  numeric(12,4) not null check (rate_or_amount >= 0),
  /** Which figure a percentage applies to. Gross and net differ a lot. */
  applies_to      text not null default 'net_funded'
                  check (applies_to in ('gross_funded', 'net_funded', 'accepted_offer_amount')),
  effective_from  date not null default current_date,
  effective_to    date,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint commission_plans_pct_sane check (basis <> 'pct' or rate_or_amount <= 100)
);
create index commission_plans_lookup_idx
  on public.commission_plans (organization_id, party_kind, effective_from desc);

alter table public.commission_plans enable row level security;
create policy commission_plans_select on public.commission_plans for select to authenticated
  using (public.member_can(organization_id, 'fundingops.commissions.view')
         or public.is_staff_of(public.org_agency(organization_id)));
create policy commission_plans_write on public.commission_plans for all to authenticated
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
revoke all on public.commission_plans from anon;
grant select, insert, update, delete on public.commission_plans to authenticated;

alter table public.commissions
  add constraint commissions_plan_fk foreign key (plan_id)
  references public.commission_plans(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. Revenue confirmation. The gate between earned and payable.
-- ---------------------------------------------------------------------------
alter table public.funded_deals
  add column if not exists revenue_amount numeric(14,2) check (revenue_amount is null or revenue_amount >= 0),
  add column if not exists revenue_confirmed_at timestamptz,
  add column if not exists revenue_confirmed_by uuid references public.profiles(id) on delete set null;

comment on column public.funded_deals.revenue_confirmed_at is
  'When the organization confirmed it actually received its fee on this deal. Until this is set, commissions on the deal are earned but never payable.';

-- ---------------------------------------------------------------------------
-- 4. Computing what is owed. Deterministic; no interface arithmetic.
-- ---------------------------------------------------------------------------
create or replace function public.commission_plan_for(
  p_org uuid, p_party_kind text, p_party uuid, p_on date
) returns public.commission_plans
language sql stable security definer set search_path = public as $$
  select * from public.commission_plans
   where organization_id = p_org
     and party_kind = p_party_kind
     and (party_id is null or party_id = p_party)
     and effective_from <= p_on
     and (effective_to is null or effective_to >= p_on)
   /* A plan naming this person beats the catch-all for their kind. */
   order by (party_id is not null) desc, effective_from desc
   limit 1
$$;
revoke all on function public.commission_plan_for(uuid, text, uuid, date) from public, anon;
grant execute on function public.commission_plan_for(uuid, text, uuid, date) to authenticated;

/**
 * Turn a funded deal into what is owed.
 *
 * Called by the trigger below rather than by anyone's hand, so a commission
 * cannot exist for a deal that did not fund. Idempotent: running it twice does
 * not pay a partner twice.
 */
create or replace function public.compute_commissions_for_deal(p_deal uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  d public.funded_deals;
  v_org uuid;
  v_ref uuid;           -- the membership that brought the deal in
  v_party uuid;
  pl public.commission_plans;
  v_basis_amount numeric(14,2);
  v_amount numeric(14,2);
  v_made integer := 0;
begin
  select * into d from public.funded_deals where id = p_deal;
  if d.id is null then
    raise exception 'Funded deal not found' using errcode = 'P0002';
  end if;

  select fc.organization_id, ff.referred_by_membership_id
    into v_org, v_ref
    from public.funding_files ff
    join public.funding_clients fc on fc.id = ff.client_id
   where ff.id = d.file_id;

  if v_org is null or v_ref is null then
    return 0;   -- nobody to pay, and an unattributed deal is not an error
  end if;

  select user_id into v_party from public.external_memberships where id = v_ref;
  if v_party is null then return 0; end if;

  pl := public.commission_plan_for(v_org, 'partner', v_party, d.funded_at::date);
  if pl.id is null then
    return 0;   -- no plan in force: nothing is owed, and nothing is invented
  end if;

  /* Already computed for this deal and party? Do not pay twice. */
  if exists (select 1 from public.commissions
              where deal_id = p_deal and party_id = v_party and state <> 'void') then
    return 0;
  end if;

  v_basis_amount := case pl.applies_to
    when 'gross_funded' then d.gross_funded
    when 'accepted_offer_amount' then d.accepted_offer_amount
    else d.net_funded
  end;

  if pl.basis = 'flat' then
    v_amount := pl.rate_or_amount;
  else
    if v_basis_amount is null then
      /* A percentage of nothing is not zero, it is unknown. Refuse rather than
         quietly book a nil commission somebody has genuinely earned. */
      raise exception 'Cannot compute a percentage: % is not recorded on this deal', pl.applies_to
        using errcode = '22023';
    end if;
    v_amount := round(v_basis_amount * pl.rate_or_amount / 100.0, 2);
  end if;

  insert into public.commissions
    (deal_id, party_kind, party_id, basis, rate_or_amount, basis_amount,
     computed_amount, state, plan_id, funded_at, earned_at, created_by)
  values (p_deal, 'partner', v_party, pl.basis, pl.rate_or_amount, v_basis_amount,
          v_amount, 'earned', pl.id, d.funded_at, now(), d.confirmed_by);
  v_made := 1;

  perform public.log_audit('commission.earned', 'funded_deal', p_deal::text, v_org, null,
    jsonb_build_object('party', v_party, 'amount', v_amount, 'basis', pl.basis, 'plan', pl.id));
  return v_made;
end $$;
revoke all on function public.compute_commissions_for_deal(uuid) from public, anon, authenticated;

/* Earned the moment the deal is funded, and only then. */
create or replace function public.commissions_on_funded_deal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.compute_commissions_for_deal(new.id);
  return new;
end $$;
revoke all on function public.commissions_on_funded_deal() from public, anon, authenticated;
create trigger funded_deals_commissions after insert on public.funded_deals
  for each row execute function public.commissions_on_funded_deal();

-- ---------------------------------------------------------------------------
-- 5. The gate: earned -> payable, only on confirmed revenue.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_deal_revenue(p_deal uuid, p_amount numeric)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_count integer;
begin
  select fc.organization_id into v_org
    from public.funded_deals d
    join public.funding_files ff on ff.id = d.file_id
    join public.funding_clients fc on fc.id = ff.client_id
   where d.id = p_deal;
  if v_org is null then raise exception 'Deal not found' using errcode = 'P0002'; end if;

  /* Confirming money arrived is an owner's act, not an agent's. */
  if not public.is_org_admin(v_org) then
    raise exception 'Only an organization administrator confirms revenue' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'A confirmed revenue amount is required' using errcode = '22023';
  end if;

  update public.funded_deals
     set revenue_amount = p_amount, revenue_confirmed_at = now(), revenue_confirmed_by = auth.uid()
   where id = p_deal and revenue_confirmed_at is null;

  update public.commissions
     set state = 'payable', payable_at = now()
   where deal_id = p_deal and state = 'earned';
  get diagnostics v_count = row_count;

  perform public.log_audit('deal.revenue_confirmed', 'funded_deal', p_deal::text, v_org, null,
    jsonb_build_object('amount', p_amount, 'commissions_released', v_count));
  return v_count;
end $$;
revoke all on function public.confirm_deal_revenue(uuid, numeric) from public, anon;
grant execute on function public.confirm_deal_revenue(uuid, numeric) to authenticated;

/** Pay one. Only from payable, so the gate cannot be stepped over. */
create or replace function public.mark_commission_paid(p_commission uuid, p_reference text)
returns void
language plpgsql security definer set search_path = public as $$
declare c public.commissions; v_org uuid;
begin
  select * into c from public.commissions where id = p_commission;
  if c.id is null then raise exception 'Commission not found' using errcode = 'P0002'; end if;

  select fc.organization_id into v_org
    from public.funded_deals d
    join public.funding_files ff on ff.id = d.file_id
    join public.funding_clients fc on fc.id = ff.client_id
   where d.id = c.deal_id;
  if not public.is_org_admin(v_org) then
    raise exception 'Only an organization administrator records a payment' using errcode = '42501';
  end if;
  if c.state <> 'payable' then
    raise exception 'A commission is paid from payable, not from %', c.state using errcode = '22023';
  end if;

  update public.commissions
     set state = 'paid', paid_at = now(), payment_reference = nullif(trim(p_reference), '')
   where id = p_commission;

  perform public.log_audit('commission.paid', 'commission', p_commission::text, v_org,
    to_jsonb(c), jsonb_build_object('reference', p_reference));
end $$;
revoke all on function public.mark_commission_paid(uuid, text) from public, anon;
grant execute on function public.mark_commission_paid(uuid, text) to authenticated;

/** Funding clawed back after the fact. Reversed, never deleted (rule 11). */
create or replace function public.reverse_commission(p_commission uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare c public.commissions; v_org uuid;
begin
  select * into c from public.commissions where id = p_commission;
  if c.id is null then raise exception 'Commission not found' using errcode = 'P0002'; end if;
  select fc.organization_id into v_org
    from public.funded_deals d
    join public.funding_files ff on ff.id = d.file_id
    join public.funding_clients fc on fc.id = ff.client_id
   where d.id = c.deal_id;
  if not public.is_org_admin(v_org) then
    raise exception 'Only an organization administrator reverses a commission' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reversal needs a reason' using errcode = '22023';
  end if;

  update public.commissions
     set state = 'reversed', reversed_at = now(),
         note = coalesce(note || ' | ', '') || 'Reversed: ' || trim(p_reason)
   where id = p_commission;

  perform public.log_audit('commission.reversed', 'commission', p_commission::text, v_org,
    to_jsonb(c), jsonb_build_object('reason', p_reason));
end $$;
revoke all on function public.reverse_commission(uuid, text) from public, anon;
grant execute on function public.reverse_commission(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. A partner sees their own, and only their own.
-- ---------------------------------------------------------------------------
drop policy if exists commissions_select on public.commissions;
create policy commissions_select on public.commissions for select to authenticated
  using (
    /* The partner themself. */
    party_id = auth.uid()
    or exists (
      select 1 from public.funded_deals d
        join public.funding_files ff on ff.id = d.file_id
        join public.funding_clients fc on fc.id = ff.client_id
       where d.id = commissions.deal_id
         and (public.member_can(fc.organization_id, 'fundingops.commissions.view')
              or public.is_staff_of(fc.agency_id))
    )
  );

/* Amounts and states move only through the functions above. No update policy
   at all: a commission that could be edited in place is not a record. */
drop policy if exists commissions_update on public.commissions;
drop policy if exists commissions_insert on public.commissions;
