-- =============================================================================
-- The payout currency joins the payroll settings writer, so it is set the same
-- audited way as the cutoff rules rather than by a raw table write.
-- =============================================================================
create or replace function public.set_payroll_settings(
  p_enabled boolean,
  p_split_day integer,
  p_payday_first integer,
  p_payday_second integer,
  p_verify_window_days integer,
  p_timezone text,
  p_payout_currency text default 'USD'
) returns void
language plpgsql security definer set search_path = public as $function$
declare v_agency uuid; v_actor text; v_currency text := upper(trim(coalesce(p_payout_currency, 'USD')));
begin
  select agency_id into v_agency from public.agency_memberships
   where user_id = auth.uid() and status = 'active' limit 1;
  if v_agency is null or not public.agency_can('payroll.manage') then
    raise exception 'Payroll settings need the payroll permission' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Unknown timezone: %', p_timezone;
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'A payout currency is a three-letter code, for example USD or PHP' using errcode = '22023';
  end if;

  insert into public.payroll_settings
        (agency_id, enabled, split_day, payday_first, payday_second, verify_window_days,
         timezone, payout_currency, updated_by)
  values (v_agency, p_enabled, p_split_day, p_payday_first, p_payday_second, p_verify_window_days,
          p_timezone, v_currency, auth.uid())
  on conflict (agency_id) do update
    set enabled = excluded.enabled, split_day = excluded.split_day,
        payday_first = excluded.payday_first, payday_second = excluded.payday_second,
        verify_window_days = excluded.verify_window_days, timezone = excluded.timezone,
        payout_currency = excluded.payout_currency,
        updated_by = excluded.updated_by, updated_at = now();

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, new_value, visibility)
  values (v_agency, 'payroll_settings', v_agency::text, auth.uid(), v_actor,
          'Payroll settings changed', 'settings',
          'payout ' || v_currency || ' · split ' || p_split_day || ' · lock ' || p_verify_window_days || 'd',
          'bes_internal');
end $function$;

drop function if exists public.set_payroll_settings(boolean, integer, integer, integer, integer, text);
