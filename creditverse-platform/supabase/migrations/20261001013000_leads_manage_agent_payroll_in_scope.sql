-- Leads manage agent payroll within their scope (Dee, 2026-10-01,
-- GO_LIVE_STABILIZATION_PASS.md "PAYROLL RULE — IMPORTANT CHANGE").
--
--   Team Lead       → own team's agent payroll
--   Department Lead → department
--   Division Lead   → division
--   Executive       → organization-wide agent payroll
--   Agent           → their own released payslips and rate
--
-- "Do not force people into fake teams or assignments just to grant this
-- access." Scope is therefore the placement the platform already has:
-- `managed_people()` — team leadership, department and division seats, the
-- operations seat — exactly what Schedule, Attendance, EOD and Performance
-- already use. An executive (agency_admin, which includes the owners) reads
-- the whole organization, as does an explicit payroll key (Bryan).
--
-- BRYAN / BES COST STAYS SEPARATE. Agent payroll and the BES-side settlement
-- are two financial concepts. Everything that follows widens the AGENT side
-- only: payslips keep their column grants (the BES columns were revoked in
-- 20260920003300 and stay revoked), compensation_arrangements keeps
-- bes_cost_cents revoked, the three *_internal views keep their
-- compensation.bes_cost.view gate, bes_only adjustments are invisible to
-- agent-payroll eyes, and an arrangement paid through a managing partner can
-- only be changed by somebody who may see BES cost. Enforced here, in the
-- database, never by hiding a column.
--
-- Superseded, deliberately: "money is owner-gated" (0299 / phase 37) for the
-- AGENT side. The BES side is still exactly as gated as it was.

-- ── Scope helpers ──────────────────────────────────────────────────────────

/* Everyone whose AGENT payroll the caller may work with. */
create or replace function public.payroll_people()
returns table(user_id uuid)
language sql stable security definer set search_path = public as $$
  select m.user_id
    from public.agency_memberships m
   where m.status = 'active'
     and (public.is_admin_of(m.agency_id) or public.reads_payroll_of(m.agency_id))
  union
  select mp.user_id from public.managed_people() mp
$$;

create or replace function public.has_payroll_scope(p_agency uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff_of(p_agency)
     and (public.is_admin_of(p_agency)
          or public.reads_payroll_of(p_agency)
          or exists (select 1 from public.managed_people()))
$$;

create or replace function public.manages_agent_payroll_of(p_agency uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff_of(p_agency)
     and (public.is_admin_of(p_agency)
          or public.reads_payroll_of(p_agency)
          or exists (select 1 from public.managed_people() where user_id = p_user))
$$;

/* The two self branches need to look across payslips ⇄ payroll_cutoffs
   without the policies calling each other, which Postgres refuses as
   infinite recursion. Definer helpers break the loop. */
create or replace function public.cutoff_is_released(p_cutoff uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.payroll_cutoffs where id = p_cutoff and status = 'released')
$$;

create or replace function public.my_released_cutoff_ids()
returns table(cutoff_id uuid)
language sql stable security definer set search_path = public as $$
  select p.cutoff_id
    from public.payslips p
    join public.payroll_cutoffs c on c.id = p.cutoff_id
   where p.user_id = auth.uid() and c.status = 'released'
$$;

grant execute on function public.payroll_people() to authenticated;
grant execute on function public.has_payroll_scope(uuid) to authenticated;
grant execute on function public.manages_agent_payroll_of(uuid, uuid) to authenticated;
grant execute on function public.cutoff_is_released(uuid) to authenticated;
grant execute on function public.my_released_cutoff_ids() to authenticated;

-- ── Reading the agent side ─────────────────────────────────────────────────

drop policy if exists payslips_select on public.payslips;
create policy payslips_select on public.payslips for select to authenticated
  using (
    public.is_staff_of(agency_id)
    and (
      user_id in (select pp.user_id from public.payroll_people() pp)
      /* An agent reads their own payslip once it is released; a draft is
         still being verified and can change. */
      or (user_id = auth.uid() and public.cutoff_is_released(cutoff_id))
    )
  );

drop policy if exists member_pay_rates_select on public.member_pay_rates;
create policy member_pay_rates_select on public.member_pay_rates for select to authenticated
  using (
    public.is_staff_of(agency_id)
    and (user_id = auth.uid() or user_id in (select pp.user_id from public.payroll_people() pp))
  );

drop policy if exists payroll_cutoffs_select on public.payroll_cutoffs;
create policy payroll_cutoffs_select on public.payroll_cutoffs for select to authenticated
  using (
    public.is_staff_of(agency_id)
    and (public.has_payroll_scope(agency_id)
         or id in (select r.cutoff_id from public.my_released_cutoff_ids() r))
  );

drop policy if exists payroll_settings_select on public.payroll_settings;
create policy payroll_settings_select on public.payroll_settings for select to authenticated
  using (public.is_staff_of(agency_id) and public.has_payroll_scope(agency_id));

drop policy if exists compensation_arrangements_select on public.compensation_arrangements;
create policy compensation_arrangements_select on public.compensation_arrangements for select to authenticated
  using (
    public.reads_bes_cost(agency_id)
    or public.reads_agent_rate(agency_id)
    or user_id = auth.uid()
    or managing_partner_id = auth.uid()
    or user_id in (select pp.user_id from public.payroll_people() pp)
  );
/* bes_cost_cents stays revoked from `authenticated` (20260920004100); the
   internal view is the only door to it. Re-asserted so a later table grant
   cannot quietly reopen it. */
revoke select (bes_cost_cents) on public.compensation_arrangements from authenticated;

drop policy if exists compensation_adjustments_select on public.compensation_adjustments;
create policy compensation_adjustments_select on public.compensation_adjustments for select to authenticated
  using (
    public.reads_bes_cost(agency_id)
    or (
      financial_scope <> 'bes_only'
      and (public.reads_agent_rate(agency_id)
           or user_id = auth.uid()
           or user_id in (select pp.user_id from public.payroll_people() pp))
    )
  );

drop policy if exists compensation_adjustments_write on public.compensation_adjustments;
create policy compensation_adjustments_write on public.compensation_adjustments for insert to authenticated
  with check (
    public.is_staff_of(agency_id)
    and (public.agency_can('payroll.manage')
         or (financial_scope <> 'bes_only' and public.manages_agent_payroll_of(agency_id, user_id)))
  );

drop policy if exists compensation_adjustments_update on public.compensation_adjustments;
create policy compensation_adjustments_update on public.compensation_adjustments for update to authenticated
  using (
    public.is_staff_of(agency_id)
    and (public.agency_can('payroll.manage')
         or (financial_scope <> 'bes_only' and public.manages_agent_payroll_of(agency_id, user_id)))
  )
  with check (
    public.is_staff_of(agency_id)
    and (public.agency_can('payroll.manage')
         or (financial_scope <> 'bes_only' and public.manages_agent_payroll_of(agency_id, user_id)))
  );

/* Where the money goes. Reading it is part of processing someone's payroll;
   changing it stays with the person and the payroll key. */
drop policy if exists member_payout_accounts_select on public.member_payout_accounts;
create policy member_payout_accounts_select on public.member_payout_accounts for select to authenticated
  using (user_id = auth.uid() or public.manages_agent_payroll_of(agency_id, user_id));

/* Time adjustment requests: the people who may DECIDE one (below) must be
   able to SEE it. Previously only is_manager_of could list the queue, so a
   lead could approve a request they had no way to open. */
drop policy if exists time_adjustments_select on public.time_adjustment_requests;
create policy time_adjustments_select on public.time_adjustment_requests for select to authenticated
  using (
    requested_by = auth.uid()
    or public.is_manager_of(agency_id)
    or requested_by in (select mp.user_id from public.managed_people() mp)
  );

/* Rate and adjustment history follows the same agent-side scope. The
   'compensation' field (arrangements, bes_only adjustments) stays behind
   compensation.bes_cost.view. */
drop policy if exists activity_events_select on public.activity_events;
create policy activity_events_select on public.activity_events for select to authenticated
  using (
    (agency_id, coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), visibility, entity_type) in (
      select c.agency_id, coalesce(c.organization_id, '00000000-0000-0000-0000-000000000000'::uuid), c.visibility, c.entity_type
        from public.activity_view_combos() c)
    and case entity_type
          when 'fulfillment_client' then entity_id in (select c.id::text from public.fulfillment_clients c)
          when 'work_item'          then entity_id in (select w.id::text from public.work_items w)
          when 'channel'            then entity_id in (select ch.id::text from public.channels ch)
          when 'time_entry'         then entity_id in (select te.id::text from public.time_entries te)
          else public.entity_visible(entity_type, entity_id)
        end
    and (entity_type <> 'agency_member'
         or field is null
         or field not in ('member_document', 'signature_request')
         or entity_id = auth.uid()::text
         or public.agency_can('people.documents.manage')
         or public.agency_can('documents.manage'))
    and (coalesce(field, '') <> 'compensation' or public.reads_bes_cost(agency_id))
    and (coalesce(field, '') not in ('rate', 'adjustment')
         or entity_id = auth.uid()::text
         or public.reads_agent_rate(agency_id)
         or entity_id in (select pp.user_id::text from public.payroll_people() pp))
  );

-- ── Working the agent side ─────────────────────────────────────────────────

create or replace function public.adjust_payslip(p_payslip uuid, p_cents bigint, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare s record; v_type text; v_scope text; v_actor text;
begin
  select p.*, c.status as cutoff_status, c.period_end into s
    from public.payslips p join public.payroll_cutoffs c on c.id = p.cutoff_id
   where p.id = p_payslip;
  if not found then raise exception 'Payslip not found'; end if;
  if not public.manages_agent_payroll_of(s.agency_id, s.user_id) then
    raise exception 'Adjusting this payslip needs payroll scope over this person' using errcode = '42501';
  end if;
  if s.cutoff_status <> 'draft' then
    raise exception 'This cutoff is released. Released payroll is history.';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'An adjustment needs a reason';
  end if;

  select arrangement_type into v_type from public.compensation_arrangements
   where user_id = s.user_id and effective_from <= s.period_end
     and (effective_to is null or effective_to >= s.period_end)
   order by effective_from desc limit 1;
  /* Direct: BES pays the worker, so the worker's adjustment IS BES's. Through
     a managing partner: the worker's side only — the settlement is not this
     caller's to move. */
  v_scope := case when coalesce(v_type, 'direct_bes') = 'direct_bes' then 'both' else 'agent_only' end;

  /* One manual adjustment per person per cutoff: setting it replaces it. */
  delete from public.compensation_adjustments
   where cutoff_id = s.cutoff_id and user_id = s.user_id and adjustment_type = 'manual';
  if p_cents <> 0 then
    insert into public.compensation_adjustments
          (agency_id, user_id, cutoff_id, adjustment_type, financial_scope,
           amount_cents, effective_on, reason, approved_by, created_by)
    values (s.agency_id, s.user_id, s.cutoff_id, 'manual', v_scope,
            p_cents, s.period_end, p_note, auth.uid(), auth.uid());
  end if;

  update public.payslips
     set adjustment_cents     = case when p_cents = 0 then 0 else p_cents end,
         bes_adjustment_cents = case when v_scope = 'both' and p_cents <> 0 then p_cents else 0 end,
         adjustment_note      = nullif(btrim(p_note), '')
   where id = p_payslip;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, new_value, visibility)
  values (s.agency_id, 'payslip', p_payslip::text, auth.uid(), v_actor,
          'Payslip adjusted', 'adjustment', p_cents || ' (' || v_scope || '): ' || btrim(p_note), 'bes_internal');
end $$;

/* Generating is a deterministic recomputation from canonical time and
   arrangements; it writes nothing a caller then reads beyond their scope.
   Releasing (which books BES's cost as an expense) stays with payroll.manage. */
create or replace function public.generate_payroll(p_cutoff uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.payroll_cutoffs where id = p_cutoff;
  if not found then raise exception 'Cutoff not found'; end if;
  if not public.has_payroll_scope(c.agency_id) then
    raise exception 'Generating payroll needs payroll scope' using errcode = '42501';
  end if;
  return public.payroll_generate_internal(p_cutoff);
end;
$$;

create or replace function public.set_compensation_arrangement(
  p_user uuid, p_type text, p_basis text, p_agent_cents bigint, p_bes_cents bigint,
  p_partner uuid, p_currency text, p_from date, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_agency uuid; v_id uuid; v_cost bigint; v_current_type text;
begin
  select agency_id into v_agency from public.agency_memberships
   where user_id = p_user and status = 'active' limit 1;
  if v_agency is null then raise exception 'That person is not an active member of the agency'; end if;
  if not public.is_staff_of(v_agency)
     or not (public.agency_can('compensation.arrangement.manage')
             or public.manages_agent_payroll_of(v_agency, p_user)) then
    raise exception 'Setting compensation needs payroll scope over this person' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why this arrangement is being set' using errcode = '22023';
  end if;

  /* The BES-side boundary. Somebody who may not see BES cost may set what a
     DIRECTLY paid worker earns (BES's cost is that same figure), and nothing
     else: not a managing-partner arrangement, not a change to one. */
  if not public.reads_bes_cost(v_agency) then
    select arrangement_type into v_current_type from public.compensation_arrangements
     where user_id = p_user and effective_to is null
     order by effective_from desc limit 1;
    if p_type <> 'direct_bes' or coalesce(v_current_type, 'direct_bes') <> 'direct_bes' then
      raise exception 'This person is paid through a managing partner. Changing that arrangement needs the BES cost permission.'
        using errcode = '42501';
    end if;
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
end $$;

create or replace function public.pay_rate_breakdown(p_user uuid, p_on date default (now() at time zone 'utc')::date)
returns table(rate_type text, rate_cents bigint, currency text, days_per_year integer,
              paid_minutes_per_day integer, daily_cents bigint, hourly_cents bigint)
language sql stable security definer set search_path = public as $$
  with r as (
    select rate_type, rate_cents, currency, agency_id from public.member_pay_rates
     where user_id = p_user and effective_from <= p_on
     order by effective_from desc limit 1
  ), allowed as (
    /* Payroll scope over the person, the person themselves, or the payroll
       generator itself (no session). Nobody else derives anybody's pay. */
    select exists (
      select 1 from r
       where auth.uid() is null
          or p_user = auth.uid()
          or public.manages_agent_payroll_of(r.agency_id, p_user)) as ok
  ), s as (
    select work_days, shift_start, shift_end, lunch_minutes from public.work_schedules
     where user_id = p_user and effective_from <= p_on
     order by effective_from desc limit 1
  ), f as (
    select (365 - 52 * (7 - array_length(s.work_days, 1)))::integer as days_per_year,
           greatest(0, (extract(epoch from (s.shift_end - s.shift_start)) / 60)::integer - s.lunch_minutes)::integer
             as paid_minutes_per_day
      from s
  )
  select r.rate_type, r.rate_cents, r.currency, f.days_per_year, f.paid_minutes_per_day,
         case r.rate_type
           when 'monthly' then round(r.rate_cents * 12.0 / f.days_per_year)::bigint
           when 'hourly'  then round(r.rate_cents * f.paid_minutes_per_day / 60.0)::bigint
         end as daily_cents,
         case r.rate_type
           when 'monthly' then case when f.paid_minutes_per_day > 0
                                 then round(r.rate_cents * 12.0 / f.days_per_year * 60 / f.paid_minutes_per_day)::bigint end
           when 'hourly'  then r.rate_cents
         end as hourly_cents
    from r left join f on true, allowed
   where allowed.ok
$$;

-- ── Time corrections follow placement, not only direct team leadership ─────

create or replace function public.decide_time_adjustment(p_request uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
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
  /* Management authority, or the person is in the caller's placement scope
     (team led, department or division seat) — the same set every other
     people section reads. */
  if not public.is_manager_of(v_req.agency_id)
     and not exists (select 1 from public.managed_people() mp where mp.user_id = v_req.requested_by) then
    raise exception 'Deciding an adjustment needs a lead or manager of this person'
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
end $$;

create or replace function public.record_attendance_correction(p_user uuid, p_date date, p_classification text, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_agency uuid;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_user = v_me then
    raise exception 'You cannot correct your own attendance' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Say why this is being corrected' using errcode = '22023';
  end if;

  select m.agency_id into v_agency
    from public.agency_memberships m
   where m.user_id = p_user and m.status = 'active'
   limit 1;
  if v_agency is null then
    raise exception 'That person is not active staff' using errcode = '42501';
  end if;

  if not (
    public.is_manager_of(v_agency)
    or exists (select 1 from public.managed_people() mp where mp.user_id = p_user)
  ) then
    raise exception 'Correcting attendance needs a lead or manager of this person'
      using errcode = '42501';
  end if;

  insert into public.attendance_corrections
    (agency_id, user_id, work_date, classification, reason, decided_by)
  values (v_agency, p_user, p_date, p_classification, trim(p_reason), v_me)
  returning id into v_id;

  insert into public.notifications
    (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  select p_user, v_agency, 'timer', 'attendance_correction', v_id::text, 'Attendance',
         'Your attendance for ' || to_char(p_date, 'FMMon FMDD') || ' was corrected',
         'Now recorded as ' || replace(p_classification, '_', ' ')
           || ' by ' || coalesce(nullif(trim(pr.full_name), ''), pr.email)
           || '. "' || trim(p_reason) || '"',
         'bes_internal'
    from public.profiles pr where pr.id = v_me;

  return v_id;
end $$;
