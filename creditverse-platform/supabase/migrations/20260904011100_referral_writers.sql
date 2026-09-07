-- 0133 — the referral writers, and who may read what.
--
-- Same shape as `compute_commissions_for_deal`: the plan in force is read, the
-- amount is computed in the database, and the figure the percentage was taken
-- FROM is stored so a payout can be checked later. A browser never computes a
-- commission.

-- ---------------------------------------------------------------------------
-- Attributing a consumer. First touch wins, and it is never re-decided.
-- ---------------------------------------------------------------------------
create or replace function public.attribute_referral(p_client uuid, p_code citext)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rc public.referral_codes%rowtype;
  c  public.clients%rowtype;
  v_id uuid;
begin
  select * into rc from public.referral_codes where code = p_code and active;
  if rc.id is null then raise exception 'unknown referral code' using errcode = 'P0002'; end if;
  select * into c from public.clients where id = p_client;
  if c.id is null then raise exception 'client not found' using errcode = 'P0002'; end if;

  /* Already attributed? Return the existing one rather than moving them. The
     first referrer keeps them, which is what "attribution history is preserved"
     means in practice. */
  select id into v_id from public.referral_attributions where client_id = p_client;
  if v_id is not null then return v_id; end if;

  insert into public.referral_attributions (code_id, organization_id, client_id)
  values (rc.id, rc.organization_id, p_client)
  returning id into v_id;

  perform public.log_audit('referral.attributed', 'referral_attribution', v_id::text, rc.organization_id, null,
                           jsonb_build_object('client_id', p_client, 'code', rc.code));
  return v_id;
end $$;
revoke all on function public.attribute_referral(uuid, citext) from public, anon, authenticated;
grant execute on function public.attribute_referral(uuid, citext) to service_role;

-- ---------------------------------------------------------------------------
-- Recording what the consumer did, and pricing it.
--
-- service_role only: these are triggered by the sign-up flow, the payment
-- webhook and the conversion path, none of which is a browser. A partner
-- writing their own commission events would be a partner writing their own
-- invoice.
-- ---------------------------------------------------------------------------
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

  pl := public.commission_plan_for(a.organization_id, 'partner', null, current_date);
  /* The generic partner plan may not be the one for this event kind. */
  select * into pl from public.commission_plans p
   where p.organization_id = a.organization_id
     and p.party_kind = 'partner'
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
  values (v_event, 'partner', pl.party_id, pl.basis, pl.rate_or_amount, v_basis,
          v_amount, 'earned', pl.id, now());

  perform public.log_audit('referral.commission_earned', 'referral_event', v_event::text, a.organization_id, null,
    jsonb_build_object('kind', p_kind, 'amount', v_amount, 'basis', pl.basis, 'plan', pl.id));
  return v_event;
end $$;
revoke all on function public.record_referral_event(uuid, public.referral_event_kind, integer, text) from public, anon, authenticated;
grant execute on function public.record_referral_event(uuid, public.referral_event_kind, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- Codes are managed by the organization's administrators.
-- ---------------------------------------------------------------------------
create or replace function public.set_referral_code(p_org uuid, p_code citext, p_label text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (public.is_org_owner_admin(p_org) or public.is_agency_staff()) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_code !~ '^[A-Za-z0-9_-]{3,32}$' then
    raise exception 'a referral code is 3 to 32 letters, digits, dashes or underscores' using errcode = '22023';
  end if;
  /* Retiring rather than editing: a link already in the wild keeps resolving
     to the attribution it already made. */
  update public.referral_codes set active = false where organization_id = p_org and active and code <> p_code;
  insert into public.referral_codes (organization_id, code, label, created_by)
  values (p_org, p_code, p_label, auth.uid())
  on conflict (code) do update set active = true, label = excluded.label
  returning id into v_id;
  perform public.log_audit('referral.code_set', 'referral_code', v_id::text, p_org, null,
                           jsonb_build_object('code', p_code));
  return v_id;
end $$;
revoke all on function public.set_referral_code(uuid, citext, text) from public, anon;
grant execute on function public.set_referral_code(uuid, citext, text) to authenticated;

-- ---------------------------------------------------------------------------
-- READS. Scope-locked: a partner organization sees ITS OWN referrals.
--
-- And nothing more. Attribution is not access — these tables carry the fact of
-- a referral and the money it earned, and there is no join from here to a
-- credit report, a dispute, a document or a DIY journey. That is not an
-- omission to be filled in later; it is the rule.
-- ---------------------------------------------------------------------------
alter table public.referral_codes enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.referral_events enable row level security;
revoke all on public.referral_codes, public.referral_attributions, public.referral_events from anon;
grant select on public.referral_codes, public.referral_attributions, public.referral_events to authenticated;

create policy referral_codes_select on public.referral_codes for select to authenticated
  using (public.is_org_member(organization_id) or public.is_agency_staff());

create policy referral_attributions_select on public.referral_attributions for select to authenticated
  using (public.is_org_member(organization_id) or public.is_agency_staff());

create policy referral_events_select on public.referral_events for select to authenticated
  using (exists (
    select 1 from public.referral_attributions a
     where a.id = attribution_id
       and (public.is_org_member(a.organization_id) or public.is_agency_staff())
  ));

/* No insert, update or delete policy on any of the three. Attribution and the
   money it earns are written by the service role after something actually
   happened — a browser cannot attribute itself a consumer or book itself a
   commission. */

-- ---------------------------------------------------------------------------
-- The referral list, as the screen needs it, in one bounded query.
--
-- It names the consumer and what they did, because that is what the referrer
-- is owed money for. It does NOT expose their credit data, and there is
-- nothing here that could.
-- ---------------------------------------------------------------------------
create or replace function public.referral_list(p_org uuid)
returns table (
  attribution_id uuid,
  client_id uuid,
  consumer_name text,
  consumer_email text,
  source text,
  attributed_at timestamptz,
  diy_stage text,
  signed_up boolean,
  subscribed boolean,
  converted_credit boolean,
  converted_funding boolean,
  commission_earned numeric,
  commission_paid numeric
) language sql stable security definer set search_path = public as $$
  select
    a.id,
    a.client_id,
    c.full_name,
    c.email::text,
    a.source,
    a.attributed_at,
    j.stage::text,
    exists (select 1 from public.referral_events e where e.attribution_id = a.id and e.kind = 'signup'),
    exists (select 1 from public.referral_events e where e.attribution_id = a.id and e.kind = 'subscription_active'),
    exists (select 1 from public.referral_events e where e.attribution_id = a.id and e.kind = 'converted_credit'),
    exists (select 1 from public.referral_events e where e.attribution_id = a.id and e.kind = 'converted_funding'),
    coalesce((select sum(cm.computed_amount) from public.commissions cm
               join public.referral_events e on e.id = cm.referral_event_id
              where e.attribution_id = a.id and cm.state <> 'reversed' and cm.state <> 'void'), 0),
    coalesce((select sum(cm.computed_amount) from public.commissions cm
               join public.referral_events e on e.id = cm.referral_event_id
              where e.attribution_id = a.id and cm.state = 'paid'), 0)
  from public.referral_attributions a
  join public.clients c on c.id = a.client_id
  left join public.diy_journeys j on j.client_id = a.client_id
  where a.organization_id = p_org
    and (public.is_org_member(p_org) or public.is_agency_staff())
  order by a.attributed_at desc
$$;
revoke all on function public.referral_list(uuid) from public, anon;
grant execute on function public.referral_list(uuid) to authenticated;
