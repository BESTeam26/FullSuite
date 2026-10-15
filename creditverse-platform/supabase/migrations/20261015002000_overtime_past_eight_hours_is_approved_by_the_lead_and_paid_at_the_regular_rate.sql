-- Overtime past eight hours is approved by the lead and paid at the regular rate.
--
-- Dee, 2026-10-15: "what counts as overtime is past 8 hours. OT Pay is just
-- the same as regular rate. Team Lead will Approve." (D-027.)
--
-- Nothing new is invented. Overtime is an APPROVED compensation adjustment —
-- the engine that already sums bonuses, deductions and corrections into
-- payslips (compensation_for_period) — priced by the person's own derived
-- hourly rate (pay_rate_breakdown: a monthly package becomes an hourly
-- figure from the schedule), and approved under the same authority rule as
-- a time correction (decide_time_adjustment): management, a lead of a team
-- the person sits on, or placement. One approval per person per day; the
-- minutes come from the canonical time entries, never typed in.
--
-- What is NOT here, deliberately: no automatic overtime. The clock records
-- the hours; a lead decides they are paid. Rule 9 (deterministic) and Dee's
-- own words ("Approve").
--
-- Cost scales with: one adjustment row and one notification per approved
-- day — a handful a week.

/* 'overtime' joins the adjustment types (20261001012000 last set this list). */
alter table public.compensation_adjustments
  drop constraint if exists compensation_adjustments_adjustment_type_check;
alter table public.compensation_adjustments
  add constraint compensation_adjustments_adjustment_type_check
  check (adjustment_type in ('bonus', 'deduction', 'reimbursement', 'correction', 'fee', 'other', 'manual', 'overtime'));

/* One overtime approval per person per day. */
create unique index if not exists compensation_adjustments_one_overtime_per_day
  on public.compensation_adjustments (user_id, effective_on)
  where adjustment_type = 'overtime';

create or replace function public.approve_overtime(p_user uuid, p_day date, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_agency   uuid;
  v_minutes  int;
  v_overtime int;
  v_rate     bigint;
  v_currency text;
  v_amount   bigint;
  v_actor    text;
  v_id       uuid;
begin
  select m.agency_id into v_agency
    from public.agency_memberships m
   where m.user_id = p_user and m.status = 'active'
   limit 1;
  if v_agency is null then
    raise exception 'That person is not an active member of the agency' using errcode = 'P0002';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot approve your own overtime' using errcode = '42501';
  end if;
  /* Same authority as deciding a time correction (20261001014000): management,
     a lead of a team the person sits on, or placement. */
  if not public.is_staff_of(v_agency)
     or not (public.is_manager_of(v_agency)
             or exists (select 1
                          from public.team_memberships lead_m
                          join public.team_memberships member_m on member_m.team_id = lead_m.team_id
                          join public.teams t on t.id = lead_m.team_id and t.archived_at is null
                         where lead_m.user_id = auth.uid() and lead_m.is_lead
                           and member_m.user_id = p_user)
             or exists (select 1 from public.managed_people() mp where mp.user_id = p_user)) then
    raise exception 'Approving overtime needs a lead or manager of this person' using errcode = '42501';
  end if;
  if exists (select 1 from public.payroll_cutoffs c
              where c.agency_id = v_agency and c.status = 'released'
                and p_day between c.period_start and c.period_end) then
    raise exception 'That day is in a released payroll. Released payroll is history.' using errcode = '22023';
  end if;

  /* The day's worked minutes, from the clock. */
  select coalesce(sum(te.duration_minutes), 0)::int into v_minutes
    from public.time_entries te
   where te.employee_id = p_user and te.kind = 'work'
     and te.ended_at is not null and te.work_date = p_day;
  v_overtime := v_minutes - 480;
  if v_overtime <= 0 then
    raise exception 'No overtime on %: % worked, overtime starts after 8 hours',
      to_char(p_day, 'FMMon DD'), (v_minutes / 60) || 'h ' || (v_minutes % 60) || 'm'
      using errcode = '22023';
  end if;

  /* The regular rate, as the engine derives it for that day. */
  select b.hourly_cents, b.currency into v_rate, v_currency
    from public.pay_rate_breakdown(p_user, p_day) b;
  if v_rate is null then
    raise exception 'This person has no pay rate in force on %', to_char(p_day, 'FMMon DD') using errcode = '22023';
  end if;
  v_amount := round(v_overtime * v_rate / 60.0)::bigint;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();

  insert into public.compensation_adjustments
        (agency_id, user_id, amount_cents, adjustment_type, financial_scope, reason, effective_on,
         approved_by, approved_at, created_by)
  values (v_agency, p_user, v_amount, 'overtime', 'both',
          'Overtime: ' || (v_overtime / 60) || 'h ' || (v_overtime % 60) || 'm past 8 hours on '
            || to_char(p_day, 'FMMon DD, YYYY') || ' at the regular rate, approved by ' || coalesce(v_actor, 'a lead')
            || coalesce(' — ' || nullif(btrim(p_note), ''), ''),
          p_day, auth.uid(), now(), auth.uid())
  returning id into v_id;

  insert into public.notifications
        (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  values (p_user, v_agency, 'payroll', 'profile', p_user::text, 'Pay',
          'Overtime approved',
          (v_overtime / 60) || 'h ' || (v_overtime % 60) || 'm of overtime on ' || to_char(p_day, 'FMMon DD')
            || ' was approved by ' || coalesce(v_actor, 'your lead') || ' and will be on your next payslip.',
          'bes_internal');

  return v_id;
exception
  when unique_violation then
    raise exception 'Overtime for % was already approved', to_char(p_day, 'FMMon DD') using errcode = '22023';
end $function$;

revoke all on function public.approve_overtime(uuid, date, text) from public, anon;
grant execute on function public.approve_overtime(uuid, date, text) to authenticated;

comment on function public.approve_overtime(uuid, date, text) is
  'A lead or manager of the person approves the minutes past 8 hours on one day, from the clock, priced at the regular derived hourly rate, as a compensation adjustment the payslip already sums. One per person per day. Dee, 2026-10-15.';
