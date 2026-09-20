-- Archie is paid through Bryan.
--
-- Dee, 2026-09-20: BES pays Bryan ₱100 an hour for Archie's work; Bryan pays
-- Archie ₱80. The ₱100 was recorded as Archie's rate because until today
-- there was only one field, so this is not a rate CHANGE — it is the same
-- money, finally recorded as what it always was. Archie's pay does not move;
-- it is stated correctly for the first time.
--
-- Seed/configuration data, found by name, used by id. Nothing here
-- authorizes anybody.

do $$
declare v_archie uuid; v_bryan uuid; v_agency uuid; v_from date;
begin
  select m.user_id, m.agency_id into v_archie, v_agency
    from public.agency_memberships m join public.profiles p on p.id = m.user_id
   where p.full_name ilike 'Archie%' and m.status = 'active' limit 1;
  select m.user_id into v_bryan
    from public.agency_memberships m join public.profiles p on p.id = m.user_id
   where p.full_name ilike 'Bryan%' and m.status = 'active' limit 1;

  if v_archie is null or v_bryan is null then
    raise notice 'Skipped: Archie or Bryan is not an active member here.';
    return;
  end if;

  select effective_from into v_from from public.compensation_arrangements
   where user_id = v_archie and effective_to is null;
  if v_from is null then
    raise notice 'Skipped: Archie has no live arrangement to restate.';
    return;
  end if;

  /* Replaced, not closed and reopened: there was never a period in which BES
     paid Archie ₱100 directly, so leaving that row as history would assert
     something untrue. */
  delete from public.compensation_arrangements where user_id = v_archie and effective_to is null;

  insert into public.compensation_arrangements
        (agency_id, user_id, arrangement_type, compensation_basis, agent_rate_cents,
         bes_cost_cents, managing_partner_id, currency, effective_from, reason)
  values (v_agency, v_archie, 'managing_partner', 'hourly', 8000, 10000, v_bryan, 'PHP', v_from,
          'Restated: the PHP 100/hour on file was BES''s cost paid to the managing partner, not Archie''s pay. '
          'BES pays Bryan PHP 100/hour; Bryan pays Archie PHP 80/hour.');

  /* The agent-side mirror the payslip derives an hour and a day from. */
  update public.member_pay_rates set rate_cents = 8000
   where user_id = v_archie and effective_from = v_from;

  raise notice 'Archie: PHP 80/hour to him, PHP 100/hour BES cost, through Bryan, from %', v_from;
end $$;
