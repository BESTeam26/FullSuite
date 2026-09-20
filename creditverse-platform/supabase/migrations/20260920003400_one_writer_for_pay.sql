-- One way to set what somebody is paid.
--
-- Payroll now prices from `compensation_arrangements`. `member_pay_rates` is
-- still read — `pay_rate_breakdown` derives the hourly and daily equivalents
-- a payslip freezes — but it must no longer be written independently, or the
-- rate a manager types and the rate payroll uses become two different
-- numbers (rules 2 and 5).
--
-- So the arrangement is the writer, and the rate table becomes its mirror of
-- the AGENT side. `set_member_pay_rate` keeps its name and signature, because
-- screens and scripts call it, but it now opens a direct arrangement — which
-- is exactly what it always meant when BES paid everybody directly.

/* The rate mirror must be able to hold a daily basis, which arrangements have
   and the old rate table did not. */
alter table public.member_pay_rates drop constraint if exists member_pay_rates_rate_type_check;
alter table public.member_pay_rates add constraint member_pay_rates_rate_type_check
  check (rate_type in ('hourly', 'daily', 'per_cutoff', 'monthly'));

/**
 * Open an arrangement, closing the one it replaces, and mirror the agent side.
 *
 * Both writes are in one statement block, so a failure leaves neither — the
 * alternative is a closed arrangement with no replacement, which is somebody
 * unpriced and therefore unpaid.
 */
create or replace function public.set_compensation_arrangement(
  p_user uuid, p_type text, p_basis text, p_agent_cents bigint, p_bes_cents bigint,
  p_partner uuid, p_currency text, p_from date, p_reason text
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare v_agency uuid; v_id uuid; v_cost bigint;
begin
  select agency_id into v_agency from public.agency_memberships
   where user_id = p_user and status = 'active' limit 1;
  if v_agency is null then raise exception 'That person is not an active member of the agency'; end if;
  if not public.is_staff_of(v_agency) or not public.agency_can('compensation.arrangement.manage') then
    raise exception 'Setting compensation needs the compensation permission' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why this arrangement is being set' using errcode = '22023';
  end if;

  /* A direct arrangement cannot carry a margin: BES pays the worker. */
  v_cost := case when p_type = 'direct_bes' then p_agent_cents else p_bes_cents end;

  update public.compensation_arrangements
     set effective_to = p_from - 1
   where user_id = p_user and effective_to is null and effective_from < p_from;
  /* An arrangement opening the same day as a live one replaces it outright —
     a zero-length row would be a rate nobody was ever paid. */
  delete from public.compensation_arrangements
   where user_id = p_user and effective_from = p_from;

  insert into public.compensation_arrangements
        (agency_id, user_id, arrangement_type, compensation_basis, agent_rate_cents, bes_cost_cents,
         managing_partner_id, currency, effective_from, reason, created_by)
  values (v_agency, p_user, p_type, p_basis, p_agent_cents, v_cost,
          case when p_type = 'managing_partner' then p_partner end,
          upper(p_currency), p_from, btrim(p_reason), auth.uid())
  returning id into v_id;

  /* The mirror: what the WORKER earns, which is what pay_rate_breakdown
     derives an hour and a day from. BES's cost is deliberately absent here. */
  insert into public.member_pay_rates (agency_id, user_id, rate_type, rate_cents, currency, effective_from, created_by)
  values (v_agency, p_user, p_basis, p_agent_cents, upper(p_currency), p_from, auth.uid())
  on conflict (user_id, effective_from) do update
    set rate_type = excluded.rate_type, rate_cents = excluded.rate_cents,
        currency = excluded.currency, created_by = excluded.created_by;

  return v_id;
end $function$;
revoke all on function public.set_compensation_arrangement(uuid, text, text, bigint, bigint, uuid, text, date, text) from public, anon;
grant execute on function public.set_compensation_arrangement(uuid, text, text, bigint, bigint, uuid, text, date, text) to authenticated;

/**
 * Setting a plain rate is setting a direct arrangement.
 *
 * Kept so existing callers keep working, and so there is only ever one path
 * into the money.
 */
create or replace function public.set_member_pay_rate(
  p_user uuid, p_rate_type text, p_rate_cents bigint,
  p_currency text default 'USD',
  p_effective_from date default (now() at time zone 'utc')::date
) returns uuid
language plpgsql security definer set search_path = public as $function$
begin
  if p_rate_type not in ('hourly', 'daily', 'per_cutoff', 'monthly') then
    raise exception 'rate_type is hourly, daily, per_cutoff or monthly';
  end if;
  return public.set_compensation_arrangement(
    p_user, 'direct_bes', p_rate_type, p_rate_cents, p_rate_cents, null,
    p_currency, p_effective_from, 'Rate set. BES pays this worker directly.');
end $function$;
revoke all on function public.set_member_pay_rate(uuid, text, bigint, text, date) from public, anon;
grant execute on function public.set_member_pay_rate(uuid, text, bigint, text, date) to authenticated;

/* Direct table writes are no longer a way in. */
revoke insert, update on public.compensation_arrangements from authenticated;
drop policy if exists compensation_arrangements_insert on public.compensation_arrangements;
drop policy if exists compensation_arrangements_update on public.compensation_arrangements;
