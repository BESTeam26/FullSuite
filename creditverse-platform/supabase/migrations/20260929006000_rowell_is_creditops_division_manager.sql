-- Rowell Christian Pena is CreditOps' division manager.
--
-- Dee, 2026-09-29: "division manager is Roel." Asked which profile, because
-- the roster holds both Rowell Christian Pena and Roniel Pena and rule 4 does
-- not let a name decide an authorization: Rowell.
--
-- He already holds `division_manager` on BES CRM (Dee, 2026-09-20) and keeps
-- it. This adds CreditOps. Seats are the only source of management scope
-- (D-021); nothing is written to `divisions.lead_id`.
--
-- What changes as a result, all of it derived, none of it hand-set:
--
--   · Allyssa's and Daniel's department EOD reports now route `division_lead`
--     to Rowell instead of `unrouted` to support.
--   · Rowell's own EOD files a DIVISION report. A person holding two division
--     seats files one report per submission — `eod_route_up_for` takes the
--     newest seat, which is CreditOps from today. BES CRM's division line is
--     still summarised in the organization report; it just has no separate
--     division-level submission from him. Recorded rather than silently
--     chosen; if Dee wants two, that is a design change to propose.
--   · `management_reach` / `has_operations_scope` widen his CreditOps reach
--     to the division. He is agency_admin already, so in practice this names
--     the seat rather than opens a door.
--
-- Cost impact: none.

begin;

do $$
declare
  v_user uuid; v_div uuid; v_agency uuid; v_by uuid;
begin
  select p.id into v_user from public.profiles p where p.full_name = 'Rowell Christian Pena';
  select dv.id, dv.agency_id into v_div, v_agency
    from public.divisions dv where dv.name = 'CreditOps' and dv.archived_at is null;
  select p.id into v_by from public.profiles p where p.full_name = 'Dee Gallardo';

  if v_user is null or v_div is null then
    raise exception 'could not resolve Rowell (%) or the CreditOps division (%)', v_user, v_div;
  end if;

  if exists (
    select 1 from public.management_seats s
     where s.user_id = v_user and s.division_id = v_div and s.seat = 'division_manager'
       and public.seat_is_live(s.effective_from, s.effective_to)
  ) then
    raise notice 'Rowell already holds division_manager on CreditOps — nothing to do';
    return;
  end if;

  insert into public.management_seats
    (agency_id, user_id, seat, division_id, effective_from, reason, created_by)
  values
    (v_agency, v_user, 'division_manager', v_div, current_date,
     'Dee, 2026-09-29: "division manager is Roel" — confirmed as Rowell', v_by);

  raise notice 'seated';
end $$;

/* The consequence that matters: the CreditOps department leads now route up
   to a real person. */
do $$
declare v_to uuid; v_reason text;
begin
  select r.lead_id, r.reason into v_to, v_reason
    from public.profiles p
    cross join lateral public.eod_route_up_for(p.id) r
   where p.full_name = 'Daniel Charles P. Macasiab';
  if v_reason <> 'division_lead'
     or v_to <> (select id from public.profiles where full_name = 'Rowell Christian Pena') then
    raise exception 'Daniel still routes % to % — the seat did not take', v_reason, v_to;
  end if;
  raise notice 'Daniel''s department report routes division_lead → Rowell';
end $$;

commit;
