-- 0110 — commissions.deal_id references funding_deals, not funded_deals.
--
-- My bug in 0109, caught by the lifecycle test before any interface was built.
--
-- There are two deal tables and they mean different things:
--
--   funding_deals   the deal being worked — one per lender pursuit
--   funded_deals    the immutable record that a deal actually funded
--
-- `commissions.deal_id` has always referenced `funding_deals`, and 0109 wrote
-- the FUNDED deal's id into it. Every insert failed on the foreign key, which
-- is the good outcome: a wrong id that happened to match nothing would have
-- attached commissions to the wrong deal silently.
--
-- The trigger still fires on `funded_deals`, because funding is the event that
-- earns a commission. It just records the funding_deal the payment is about.
-- Every lookup that walks back from a commission is corrected the same way.

/* The parameter is renamed for clarity, so the old signature is dropped:
   Postgres will not rename an input parameter in place. */
drop function if exists public.compute_commissions_for_deal(uuid);
drop trigger if exists funded_deals_commissions on public.funded_deals;

create or replace function public.compute_commissions_for_deal(p_funded_deal uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  d public.funded_deals;
  v_org uuid;
  v_ref uuid;
  v_party uuid;
  pl public.commission_plans;
  v_basis_amount numeric(14,2);
  v_amount numeric(14,2);
begin
  select * into d from public.funded_deals where id = p_funded_deal;
  if d.id is null then
    raise exception 'Funded deal not found' using errcode = 'P0002';
  end if;

  select fc.organization_id, ff.referred_by_membership_id
    into v_org, v_ref
    from public.funding_files ff
    join public.funding_clients fc on fc.id = ff.client_id
   where ff.id = d.file_id;

  if v_org is null or v_ref is null then return 0; end if;
  select user_id into v_party from public.external_memberships where id = v_ref;
  if v_party is null then return 0; end if;

  pl := public.commission_plan_for(v_org, 'partner', v_party, d.funded_at::date);
  if pl.id is null then return 0; end if;

  /* Keyed on the FUNDING deal, which is what commissions.deal_id references. */
  if exists (select 1 from public.commissions
              where deal_id = d.deal_id and party_id = v_party and state <> 'void') then
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
      raise exception 'Cannot compute a percentage: % is not recorded on this deal', pl.applies_to
        using errcode = '22023';
    end if;
    v_amount := round(v_basis_amount * pl.rate_or_amount / 100.0, 2);
  end if;

  insert into public.commissions
    (deal_id, party_kind, party_id, basis, rate_or_amount, basis_amount,
     computed_amount, state, plan_id, funded_at, earned_at, created_by)
  values (d.deal_id, 'partner', v_party, pl.basis, pl.rate_or_amount, v_basis_amount,
          v_amount, 'earned', pl.id, d.funded_at, now(), d.confirmed_by);

  perform public.log_audit('commission.earned', 'funding_deal', d.deal_id::text, v_org, null,
    jsonb_build_object('party', v_party, 'amount', v_amount, 'basis', pl.basis, 'plan', pl.id));
  return 1;
end $$;
revoke all on function public.compute_commissions_for_deal(uuid) from public, anon, authenticated;

create trigger funded_deals_commissions after insert on public.funded_deals
  for each row execute function public.commissions_on_funded_deal();

drop function if exists public.confirm_deal_revenue(uuid, numeric);

create or replace function public.confirm_deal_revenue(p_funded_deal uuid, p_amount numeric)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_deal uuid; v_count integer;
begin
  select fc.organization_id, d.deal_id into v_org, v_deal
    from public.funded_deals d
    join public.funding_files ff on ff.id = d.file_id
    join public.funding_clients fc on fc.id = ff.client_id
   where d.id = p_funded_deal;
  if v_org is null then raise exception 'Deal not found' using errcode = 'P0002'; end if;
  if not public.is_org_admin(v_org) then
    raise exception 'Only an organization administrator confirms revenue' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'A confirmed revenue amount is required' using errcode = '22023';
  end if;

  update public.funded_deals
     set revenue_amount = p_amount, revenue_confirmed_at = now(), revenue_confirmed_by = auth.uid()
   where id = p_funded_deal and revenue_confirmed_at is null;

  update public.commissions
     set state = 'payable', payable_at = now()
   where deal_id = v_deal and state = 'earned';
  get diagnostics v_count = row_count;

  perform public.log_audit('deal.revenue_confirmed', 'funded_deal', p_funded_deal::text, v_org, null,
    jsonb_build_object('amount', p_amount, 'commissions_released', v_count));
  return v_count;
end $$;
revoke all on function public.confirm_deal_revenue(uuid, numeric) from public, anon;
grant execute on function public.confirm_deal_revenue(uuid, numeric) to authenticated;

/** The organization behind a commission, walked through the funding deal. */
create or replace function public.commission_org(p_commission uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select fc.organization_id
    from public.commissions c
    join public.funding_deals fd on fd.id = c.deal_id
    join public.funding_clients fc on fc.id = fd.client_id
   where c.id = p_commission
$$;
revoke all on function public.commission_org(uuid) from public, anon, authenticated;

create or replace function public.mark_commission_paid(p_commission uuid, p_reference text)
returns void
language plpgsql security definer set search_path = public as $$
declare c public.commissions; v_org uuid;
begin
  select * into c from public.commissions where id = p_commission;
  if c.id is null then raise exception 'Commission not found' using errcode = 'P0002'; end if;
  v_org := public.commission_org(p_commission);
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

create or replace function public.reverse_commission(p_commission uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare c public.commissions; v_org uuid;
begin
  select * into c from public.commissions where id = p_commission;
  if c.id is null then raise exception 'Commission not found' using errcode = 'P0002'; end if;
  v_org := public.commission_org(p_commission);
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

/* One join fewer, and the right one. */
drop policy if exists commissions_select on public.commissions;
create policy commissions_select on public.commissions for select to authenticated
  using (
    party_id = auth.uid()
    or exists (
      select 1 from public.funding_deals fd
        join public.funding_clients fc on fc.id = fd.client_id
       where fd.id = commissions.deal_id
         and (public.member_can(fc.organization_id, 'fundingops.commissions.view')
              or public.is_staff_of(fc.agency_id))
    )
  );
