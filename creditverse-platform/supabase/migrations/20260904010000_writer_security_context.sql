-- 0122 — three writers given the security context their tables require.
--
-- The matrix found this and it is worth stating precisely, because the failure
-- looked like an authorization success:
--
--   `letter_mailings`, `organization_subscriptions`, `payment_methods` and
--   `payment_transactions` deliberately have NO insert or update policy — the
--   whole point is that a browser cannot write a claim about money or about a
--   letter having been posted. But `begin_letter_mailing`,
--   `choose_subscription_plan` and `cancel_subscription` were written as
--   SECURITY INVOKER, so their own writes were subject to those absent
--   policies and were refused. Every positive probe failed with 42501 while
--   every negative probe passed — for the wrong reason.
--
-- ---------------------------------------------------------------------------
-- ON CONVERTING INVOKER → DEFINER
--
-- This build has already shipped one accidental INVOKER→DEFINER conversion to
-- a live database, so this one is argued rather than assumed.
--
-- It is safe here because each function's authorization does NOT come from the
-- row select being RLS-filtered. Each one calls an explicit predicate —
-- `credit_client_writable`, `is_org_admin` — that reads `auth.uid()` and
-- therefore still answers for the CALLER under DEFINER. The select that
-- follows is to read the row's contents, not to decide access.
--
-- `begin_letter_mailing` gains an explicit visibility check to replace what
-- the INVOKER select was doing implicitly, so nothing is lost: a caller who
-- cannot see the letter is refused before anything else happens.
--
-- The alternative — adding write policies to those tables — was rejected. An
-- INSERT policy on `organization_subscriptions` would let an organization
-- admin write their own row with their own `price_cents`, which is exactly
-- what `choose_subscription_plan` exists to prevent by copying the price from
-- `plans`. Keeping the tables policy-less and the function the only writer is
-- the stronger arrangement.
-- ---------------------------------------------------------------------------

create or replace function public.begin_letter_mailing(
  p_letter    uuid,
  p_to        jsonb,
  p_from      jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  l public.dispute_letters%rowtype;
  v_org uuid;
  v_id uuid;
  v_missing text;
begin
  select * into l from public.dispute_letters where id = p_letter;
  if l.id is null then raise exception 'Letter not found' using errcode = 'P0002'; end if;
  -- Explicit, because DEFINER means the select above no longer filters.
  if not public.credit_client_visible(l.client_id) then
    raise exception 'Letter not visible' using errcode = '42501';
  end if;
  if not public.credit_client_writable(l.client_id) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  select fc.organization_id into v_org from public.fulfillment_clients fc where fc.id = l.client_id;
  perform public.require_permission(v_org, 'creditops.letters.build');

  if l.status not in ('approved', 'printed') then
    raise exception 'Only an approved letter can be posted' using errcode = '22023';
  end if;

  v_missing := coalesce(
    nullif(concat_ws(', ',
      case when coalesce(trim(p_to->>'name'),  '') = '' then 'recipient name' end,
      case when coalesce(trim(p_to->>'line1'), '') = '' then 'recipient street' end,
      case when coalesce(trim(p_to->>'city'),  '') = '' then 'recipient city' end,
      case when coalesce(trim(p_to->>'state'), '') = '' then 'recipient state' end,
      case when coalesce(trim(p_to->>'zip'),   '') = '' then 'recipient ZIP' end,
      case when coalesce(trim(p_from->>'name'),  '') = '' then 'sender name' end,
      case when coalesce(trim(p_from->>'line1'), '') = '' then 'sender street' end,
      case when coalesce(trim(p_from->>'city'),  '') = '' then 'sender city' end,
      case when coalesce(trim(p_from->>'state'), '') = '' then 'sender state' end,
      case when coalesce(trim(p_from->>'zip'),   '') = '' then 'sender ZIP' end
    ), ''), null);
  if v_missing is not null then
    raise exception 'Cannot post: missing %', v_missing using errcode = '22023';
  end if;

  insert into public.letter_mailings (
    letter_id, to_name, to_line1, to_line2, to_city, to_state, to_zip,
    from_name, from_line1, from_line2, from_city, from_state, from_zip, requested_by
  ) values (
    p_letter,
    trim(p_to->>'name'), trim(p_to->>'line1'), nullif(trim(coalesce(p_to->>'line2','')), ''),
    trim(p_to->>'city'), upper(trim(p_to->>'state')), trim(p_to->>'zip'),
    trim(p_from->>'name'), trim(p_from->>'line1'), nullif(trim(coalesce(p_from->>'line2','')), ''),
    trim(p_from->>'city'), upper(trim(p_from->>'state')), trim(p_from->>'zip'),
    auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.begin_letter_mailing(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.begin_letter_mailing(uuid, jsonb, jsonb) to authenticated;

create or replace function public.choose_subscription_plan(
  p_org uuid, p_plan_key text, p_interval text default 'monthly', p_seats integer default 1
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  pl public.plans%rowtype;
  v_price integer;
  v_id uuid;
begin
  if not public.is_org_admin(p_org) and not public.is_agency_staff() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_interval not in ('monthly', 'annual') then
    raise exception 'unknown interval' using errcode = '22023';
  end if;
  select * into pl from public.plans where key = p_plan_key;
  if pl.key is null then raise exception 'unknown plan' using errcode = 'P0002'; end if;

  v_price := case when p_interval = 'annual' then pl.annual_cents else pl.monthly_cents end;
  if v_price is null then
    raise exception 'this plan has no % price', p_interval using errcode = '22023';
  end if;

  update public.organization_subscriptions
     set status = 'cancelled', cancelled_at = now()
   where organization_id = p_org and status in ('trialing', 'active', 'past_due');

  insert into public.organization_subscriptions
    (organization_id, plan_key, status, interval, price_cents, seats, created_by)
  values (p_org, p_plan_key, 'trialing', p_interval, v_price, greatest(p_seats, 1), auth.uid())
  returning id into v_id;

  perform public.log_audit('subscription.chosen', 'organization_subscription', v_id::text, p_org, null,
                           jsonb_build_object('plan', p_plan_key, 'interval', p_interval, 'price_cents', v_price));
  return v_id;
end $$;
revoke all on function public.choose_subscription_plan(uuid, text, text, integer) from public, anon;
grant execute on function public.choose_subscription_plan(uuid, text, text, integer) to authenticated;

create or replace function public.cancel_subscription(p_org uuid, p_immediately boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_admin(p_org) and not public.is_agency_staff() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  update public.organization_subscriptions
     set cancel_at_period_end = not p_immediately,
         status = case when p_immediately then 'cancelled' else status end,
         cancelled_at = case when p_immediately then now() else cancelled_at end
   where organization_id = p_org and status in ('trialing', 'active', 'past_due');
  perform public.log_audit('subscription.cancelled', 'organization_subscription', p_org::text, p_org, null,
                           jsonb_build_object('immediately', p_immediately));
end $$;
revoke all on function public.cancel_subscription(uuid, boolean) from public, anon;
grant execute on function public.cancel_subscription(uuid, boolean) to authenticated;

-- The write grants added in 0120 are no longer needed and are withdrawn: with
-- no write policy they granted nothing, and leaving them implies a capability
-- that does not exist.
revoke insert, update on public.organization_subscriptions from authenticated;
revoke insert on public.letter_mailings from authenticated;
