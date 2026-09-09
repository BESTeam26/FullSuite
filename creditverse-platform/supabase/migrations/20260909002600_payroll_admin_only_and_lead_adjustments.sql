-- =============================================================================
-- Two corrections, 2026-09-09.
--
-- 1 · DEE'S RULE: hours are the agent's to see; MONEY is admin-only. A
--    payslip, a rate, a payroll total is never visible to the agent, a
--    partner, or a teammate — only to BES payroll access. The agent-facing
--    pipeline keeps everything about HOURS: the verify notice, the lock
--    reminder, adjustment requests. The released-payslip notification (which
--    carried the gross) is withdrawn entirely.
--
-- 2 · A LEAD'S APPROVED ADJUSTMENT WAS SILENTLY CLAMPED. The clock-out guard
--    bypasses for the system flag or a MANAGER — but leads are valid deciders
--    of time adjustments, so a lead's approval passed the decision function
--    and then had its corrected time rewritten to the cap by the guard. A
--    new phase-70 probe caught it. The decision function now raises the
--    system flag around its one authorized write: the decision itself is the
--    authorization, and the guard must not re-litigate it.
-- =============================================================================

-- ── 1 · Money is admin-only ───────────────────────────────────────────────
drop policy payslips_select on public.payslips;
create policy payslips_select on public.payslips
  for select to authenticated
  using (is_staff_of(agency_id)
         and (agency_can('payroll.view') or agency_can('payroll.manage')));

drop policy member_pay_rates_select on public.member_pay_rates;
create policy member_pay_rates_select on public.member_pay_rates
  for select to authenticated
  using (is_staff_of(agency_id)
         and (agency_can('payroll.view') or agency_can('payroll.manage')));

comment on table public.payslips is
  'Admin-only (Dee''s rule 2026-09-09): an agent sees their HOURS on My Time, '
  'never a payslip, a rate or a total. No partner or teammate branch exists.';

create or replace function public.release_payroll(p_cutoff uuid)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  c record;
  v_total bigint;
  v_currencies int;
  v_currency text;
  v_people int;
  v_expense uuid;
  v_actor text;
begin
  select * into c from public.payroll_cutoffs where id = p_cutoff;
  if not found then raise exception 'Cutoff not found'; end if;
  if not public.is_staff_of(c.agency_id) or not public.agency_can('payroll.manage') then
    raise exception 'Releasing payroll needs the payroll permission' using errcode = '42501';
  end if;
  if c.status <> 'draft' then raise exception 'Already released'; end if;

  select sum(gross_cents), count(distinct currency), min(currency), count(*)
    into v_total, v_currencies, v_currency, v_people
    from public.payslips where cutoff_id = p_cutoff;
  if coalesce(v_people, 0) = 0 then
    raise exception 'Generate the payroll first — this cutoff has no payslips';
  end if;
  if v_currencies > 1 then
    raise exception 'Payslips carry more than one currency; one expense cannot honestly total them';
  end if;

  insert into public.agency_expenses
        (agency_id, vendor, description, category, due_date, amount_cents, currency, status, notes)
  values (c.agency_id, 'Payroll',
          'Payroll ' || to_char(c.period_start, 'FMMon DD') || '–' || to_char(c.period_end, 'FMMon DD, YYYY'),
          'payroll', coalesce(c.payday, c.period_end), v_total, v_currency, 'due',
          v_people || ' payslips, released from the payroll cutoff. Source: canonical time and leave records.')
  returning id into v_expense;

  update public.payroll_cutoffs
     set status = 'released', released_by = auth.uid(), released_at = now(), expense_id = v_expense
   where id = p_cutoff;

  /* No agent notification here, deliberately: a release notice carried the
     gross, and money never reaches an agent surface (Dee's rule). */

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
  values (c.agency_id, 'payroll_cutoff', c.id::text, auth.uid(), v_actor,
          'Payroll released', 'status', 'draft',
          'released · ' || v_people || ' payslips · total ' || v_total || ' ' || v_currency, 'bes_internal');
  return v_expense;
end;
$function$;

-- ── 2 · The decision is the authorization ─────────────────────────────────
create or replace function public.decide_time_adjustment(p_request uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $function$
declare
  v_req   public.time_adjustment_requests;
  v_entry public.time_entries;
  v_actor text;
begin
  select * into v_req from public.time_adjustment_requests where id = p_request;
  if v_req.id is null then raise exception 'request not found' using errcode = 'P0002'; end if;
  if v_req.status <> 'pending' then
    raise exception 'This request was already decided' using errcode = '22023';
  end if;
  if v_req.requested_by = auth.uid() then
    raise exception 'You cannot decide your own adjustment request' using errcode = '42501';
  end if;
  if not public.is_manager_of(v_req.agency_id)
     and not exists (
       select 1
         from public.team_memberships lead_m
         join public.team_memberships member_m on member_m.team_id = lead_m.team_id
        where lead_m.user_id = auth.uid() and lead_m.is_lead
          and member_m.user_id = v_req.requested_by
     ) then
    raise exception 'Deciding an adjustment needs a lead of their team, or management access'
      using errcode = '42501';
  end if;

  select * into v_entry from public.time_entries where id = v_req.entry_id;

  update public.time_adjustment_requests
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_request;

  if p_approve then
    /* The guard bypasses for managers but not for leads — and a lead IS a
       valid decider here. The decision above is the authorization, so this
       one write declares itself to the guard rather than being re-litigated
       (and silently clamped) by it. */
    perform set_config('bes.time_system', '1', true);
    update public.time_entries
       set ended_at = v_req.requested_ended_at, auto_stopped = false
     where id = v_req.entry_id;
    perform set_config('bes.time_system', '', true);
    v_entry.ended_at := v_req.requested_ended_at;
    perform public.payroll_recompute_for_entry(v_entry);
  end if;

  select coalesce(nullif(trim(full_name), ''), email) into v_actor from public.profiles where id = auth.uid();
  insert into public.audit_log (agency_id, actor_id, action, entity_type, entity_id, before, after)
  values (v_req.agency_id, auth.uid(),
          case when p_approve then 'time_adjustment.approved' else 'time_adjustment.declined' end,
          'time_entry', v_req.entry_id::text,
          jsonb_build_object('ended_at', v_entry.ended_at, 'auto_stopped', v_entry.auto_stopped),
          jsonb_build_object('ended_at', case when p_approve then v_req.requested_ended_at else v_entry.ended_at end,
                             'requested_by', v_req.requested_by, 'reason', v_req.reason,
                             'decided_by', auth.uid(), 'note', v_req.decision_note));

  insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  values (v_req.requested_by, v_req.agency_id, 'timer', 'time_entry', v_req.entry_id::text,
          'My Time',
          case when p_approve then 'Your time adjustment was approved' else 'Your time adjustment was declined' end,
          coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Decided by ' || coalesce(v_actor, 'a manager') || '.'),
          'bes_internal'::public.activity_visibility);
end $function$;
