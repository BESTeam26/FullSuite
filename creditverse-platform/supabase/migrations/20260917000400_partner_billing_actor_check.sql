-- One check, and a capability key that exists.
--
-- 20260917000300 gated the staff branch of three functions on
-- `partners.billing.manage`. There is no such permission key. `agency_can`
-- resolves an unknown key to false, so the branch could never be true: BES
-- staff could not save a card or switch autopay on for a partner, and nothing
-- said why. The same class of defect the release certification found once
-- already — a capability key with nothing behind it.
--
-- The real key is `partners.payments.record`: owner-gated, and already the
-- capability that means "act on this partner's money". Somebody who may record
-- a payment for a partner may keep a card for them; nobody else may.
--
-- Written once, here, so the three functions cannot drift apart.

create or replace function public.may_act_on_partner_billing(p_group uuid, p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.outsourcing_groups g where g.id = p_group)
     and (
       /* The partner's own active portal contact. */
       public.partner_group_of_profile(p_actor) = p_group
       /* Or the caller in their own session, which is the same question when
          the call arrives with a JWT rather than the service role. */
       or public.is_partner_contact_of(p_group)
       /* Or BES staff the owner has delegated partner money to. */
       or (public.is_staff_of((select g.agency_id from public.outsourcing_groups g where g.id = p_group))
           and public.agency_can('partners.payments.record'))
     )
$$;

comment on function public.may_act_on_partner_billing(uuid, uuid) is
  'May this person keep a card, switch autopay, or start a charge for this partner? The partner''s own contact, or BES staff holding the owner-gated partners.payments.record.';

grant execute on function public.may_act_on_partner_billing(uuid, uuid) to authenticated;

-- ── The three functions, now asking the one question ───────────────────────

create or replace function public.save_partner_card_profile(
  p_group uuid, p_customer_profile text, p_payment_profile text,
  p_brand text, p_last4 text, p_exp_month smallint, p_exp_year smallint, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  g public.outsourcing_groups%rowtype;
  v_id uuid;
begin
  select * into g from public.outsourcing_groups where id = p_group;
  if g.id is null then raise exception 'That partner does not exist' using errcode = '22023'; end if;
  if not public.may_act_on_partner_billing(p_group, p_actor) then
    raise exception 'You cannot save a card for this partner' using errcode = '42501';
  end if;

  /* One default card. The unique index allows exactly one, so the old row
     gives up the flag before the new row takes it. */
  update public.partner_payment_profiles set is_default = false, updated_at = now()
   where group_id = p_group and is_default;

  insert into public.partner_payment_profiles
    (agency_id, group_id, provider, customer_profile_id, payment_profile_id,
     card_brand, last4, exp_month, exp_year, is_default, added_by)
  values (g.agency_id, p_group, 'authorize_net', p_customer_profile, p_payment_profile,
          nullif(btrim(coalesce(p_brand, '')), ''), nullif(btrim(coalesce(p_last4, '')), ''),
          p_exp_month, p_exp_year, true, p_actor)
  returning id into v_id;

  perform public.log_audit('partner.card_saved', 'partner_payment_profile', v_id::text, null, null,
    jsonb_build_object('partner', p_group, 'last4', p_last4, 'brand', p_brand));
  return v_id;
end $$;

revoke all on function public.save_partner_card_profile(uuid, text, text, text, text, smallint, smallint, uuid) from public, authenticated, anon;

create or replace function public.set_partner_autopay(p_group uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_has_card boolean;
begin
  if not public.may_act_on_partner_billing(p_group, auth.uid()) then
    raise exception 'You cannot change autopay for this partner' using errcode = '42501';
  end if;

  select exists (select 1 from public.partner_payment_profiles
                  where group_id = p_group and is_default) into v_has_card;
  /* Autopay without a card is a switch that does nothing — and a partner who
     believes their invoices are being paid. Refuse it rather than accept it. */
  if p_enabled and not v_has_card then
    raise exception 'Save a card first: autopay needs a card on file' using errcode = '22023';
  end if;

  update public.partner_payment_profiles
     set autopay_enabled = p_enabled, updated_at = now()
   where group_id = p_group and is_default;

  perform public.log_audit('partner.autopay_changed', 'outsourcing_group', p_group::text, null, null,
    jsonb_build_object('enabled', p_enabled));
  return p_enabled;
end $$;

grant execute on function public.set_partner_autopay(uuid, boolean) to authenticated;

create or replace function public.begin_partner_card_charge(
  p_group uuid, p_invoice uuid, p_amount_cents bigint,
  p_kind text, p_idempotency_key text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  g        public.outsourcing_groups%rowtype;
  i        public.partner_invoices%rowtype;
  prof     public.partner_payment_profiles%rowtype;
  existing public.partner_card_charges%rowtype;
  v_owed   bigint;
  v_id     uuid;
begin
  /* Idempotency first. A retry must never re-run the checks and charge again —
     it gets the first attempt back, in whatever state it reached. */
  select * into existing from public.partner_card_charges where idempotency_key = p_idempotency_key;
  if existing.id is not null then
    return jsonb_build_object('already', true, 'charge_id', existing.id,
      'status', existing.status, 'provider_txn_id', existing.provider_txn_id,
      'payment_id', existing.payment_id);
  end if;

  select * into g from public.outsourcing_groups where id = p_group;
  if g.id is null then raise exception 'That partner does not exist' using errcode = '22023'; end if;
  if p_kind not in ('pay_now', 'card_on_file', 'autopay') then
    raise exception 'Unknown kind of charge' using errcode = '22023';
  end if;

  /* Autopay is started by the sweep, with nobody behind it. The other two are
     started by a person, and that person must belong to this partner. */
  if p_kind <> 'autopay' and not public.may_act_on_partner_billing(p_group, p_actor) then
    raise exception 'You cannot pay for this partner' using errcode = '42501';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'A payment needs an amount' using errcode = '22023';
  end if;

  if p_invoice is not null then
    select * into i from public.partner_invoices where id = p_invoice for update;
    if i.id is null then raise exception 'That invoice does not exist' using errcode = '22023'; end if;
    if i.group_id <> p_group then
      raise exception 'That invoice belongs to a different partner' using errcode = '22023';
    end if;
    if i.status in ('draft', 'scheduled', 'void', 'cancelled', 'paid', 'refunded') then
      raise exception 'That invoice cannot be paid: it is %', i.status using errcode = '22023';
    end if;
    v_owed := public.invoice_balance_cents(p_invoice);
    if v_owed <= 0 then
      raise exception 'That invoice has nothing left to pay' using errcode = '22023';
    end if;
    /* No overpaying from the portal. An overpayment has to be somebody's
       deliberate act, not a typo in an amount box. */
    if p_amount_cents > v_owed then
      raise exception 'That is more than the % owed on this invoice', v_owed using errcode = '22023';
    end if;
  end if;

  if p_kind <> 'pay_now' then
    select * into prof from public.partner_payment_profiles where group_id = p_group and is_default;
    if prof.id is null then raise exception 'No card on file for this partner' using errcode = '22023'; end if;
    if p_kind = 'autopay' and not prof.autopay_enabled then
      raise exception 'Autopay is not switched on for this partner' using errcode = '42501';
    end if;
  end if;

  insert into public.partner_card_charges
    (agency_id, group_id, invoice_id, profile_id, kind, idempotency_key,
     amount_cents, currency, status, started_by)
  values (g.agency_id, p_group, p_invoice, prof.id, p_kind, p_idempotency_key,
          p_amount_cents, coalesce(i.currency, 'USD'), 'pending',
          case when p_kind = 'autopay' then null else p_actor end)
  returning id into v_id;

  return jsonb_build_object('already', false, 'charge_id', v_id,
    'customer_profile_id', prof.customer_profile_id,
    'payment_profile_id', prof.payment_profile_id,
    'invoice_number', i.invoice_number, 'currency', coalesce(i.currency, 'USD'));
exception
  /* Two callers raced past the first SELECT with the same key. The loser reads
     the winner's row instead of creating a second charge. */
  when unique_violation then
    select * into existing from public.partner_card_charges where idempotency_key = p_idempotency_key;
    return jsonb_build_object('already', true, 'charge_id', existing.id,
      'status', existing.status, 'provider_txn_id', existing.provider_txn_id,
      'payment_id', existing.payment_id);
end $$;

revoke all on function public.begin_partner_card_charge(uuid, uuid, bigint, text, text, uuid) from public, authenticated, anon;
