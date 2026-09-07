-- 0134 — a referral is owed to the ORGANIZATION, not to a person.
--
-- `record_referral_event` tried to write a commission with `party_id` taken
-- from the plan, which is NULL when the plan applies to every partner rather
-- than one named person — and `commissions.party_id` is NOT NULL. The first
-- run of phase 51 returned 23502 on every earning probe.
--
-- The deeper point is that the party was wrong, not just missing. A funded
-- deal pays a PERSON: the BRM or sales partner whose external membership is on
-- the file. A DIY referral pays the referring ORGANIZATION — Dee's reference
-- shows the commission accruing to Summit Capital Group, not to whoever at
-- Summit clicked something.
--
-- `party_id` has no foreign key and is keyed by `party_kind`, so an
-- organization can be a party. It just needs a kind that says so, and a read
-- policy that lets that organization see what it is owed.

alter table public.commissions drop constraint if exists commissions_party_kind_check;
alter table public.commissions add constraint commissions_party_kind_check
  check (party_kind in ('agency', 'org_user', 'partner', 'lender_referral', 'organization'));

comment on column public.commissions.party_id is
  'Keyed by party_kind: a profile id for agency/org_user/partner/lender_referral, an organization id for ''organization'' (a DIY referral is owed to the referring company). No foreign key, because the target table differs by kind.';

create or replace function public.record_referral_event(
  p_client uuid,
  p_kind public.referral_event_kind,
  p_amount_cents integer default null,
  p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  a public.referral_attributions%rowtype;
  pl public.commission_plans%rowtype;
  v_event uuid;
  v_basis numeric(14,2);
  v_amount numeric(14,2);
begin
  select * into a from public.referral_attributions where client_id = p_client;
  /* Not attributed to anybody — a BES-direct consumer. Not an error, and
     nothing is owed. */
  if a.id is null then return null; end if;

  insert into public.referral_events (attribution_id, kind, amount_cents, note)
  values (a.id, p_kind, p_amount_cents, p_note)
  on conflict (attribution_id, kind) do nothing
  returning id into v_event;
  if v_event is null then return null; end if;   -- already recorded; not paid twice

  select * into pl from public.commission_plans p
   where p.organization_id = a.organization_id
     and p.applies_to = public.referral_applies_to(p_kind)
     and p.effective_from <= current_date
     and (p.effective_to is null or p.effective_to >= current_date)
   order by p.effective_from desc limit 1;

  if pl.id is null then
    /* No plan for this event: the event is still recorded — it happened — and
       nothing is owed. A missing plan must never invent a rate. */
    return v_event;
  end if;

  if pl.basis = 'flat' then
    v_amount := pl.rate_or_amount;
    v_basis := null;
  else
    if p_amount_cents is null then
      raise exception 'Cannot take a percentage of an amount that was not recorded' using errcode = '22023';
    end if;
    v_basis := p_amount_cents / 100.0;
    v_amount := round(v_basis * pl.rate_or_amount / 100.0, 2);
  end if;

  insert into public.commissions
    (referral_event_id, party_kind, party_id, basis, rate_or_amount, basis_amount,
     computed_amount, state, plan_id, earned_at)
  values (v_event, 'organization', a.organization_id, pl.basis, pl.rate_or_amount, v_basis,
          v_amount, 'earned', pl.id, now());

  perform public.log_audit('referral.commission_earned', 'referral_event', v_event::text, a.organization_id, null,
    jsonb_build_object('kind', p_kind, 'amount', v_amount, 'basis', pl.basis, 'plan', pl.id));
  return v_event;
end $$;
revoke all on function public.record_referral_event(uuid, public.referral_event_kind, integer, text) from public, anon, authenticated;
grant execute on function public.record_referral_event(uuid, public.referral_event_kind, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- The read policy learns the second kind of commission.
--
-- The existing policy answered "is this MY commission" by `party_id =
-- auth.uid()` and by walking the funded deal's organization. Neither reaches a
-- referral commission, whose party is an organization and whose deal_id is
-- null — so a referrer could not see what it had earned.
-- ---------------------------------------------------------------------------
drop policy if exists commissions_select on public.commissions;
create policy commissions_select on public.commissions for select to authenticated
  using (
    -- The person it is owed to.
    party_id = auth.uid()
    -- The organization it is owed to.
    or (party_kind = 'organization' and public.is_org_member(party_id))
    -- The organization whose funded deal earned it, and BES.
    or exists (
      select 1 from public.funding_deals d
        join public.funding_files f on f.id = d.file_id
        join public.funding_clients fc on fc.id = f.client_id
       where d.id = commissions.deal_id
         and (public.is_staff_of(f.agency_id)
              or (fc.organization_id is not null and public.is_org_member(fc.organization_id)))
    )
    -- The organization whose referral earned it, and BES.
    or exists (
      select 1 from public.referral_events e
        join public.referral_attributions ra on ra.id = e.attribution_id
       where e.id = commissions.referral_event_id
         and (public.is_org_member(ra.organization_id) or public.is_agency_staff())
    )
  );
