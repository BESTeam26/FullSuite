-- An owner does not participate in workforce management. That is the rule.
--
-- Dee, 2026-09-21: "This exemption must come from the canonical workforce
-- participation rule, not names."
--
-- 20260920002000 and 20260921002000 set the flags by matching 'Dee Gallardo'
-- and 'Aaron Gallardo'. That was configuration masquerading as a rule: a third
-- owner would have been silently enrolled in schedules, scoring and payroll,
-- and nobody would have found out until a report chased them for an End of
-- Day. It is also the mistake Dee named months ago — do not hardcode current
-- people's names into authorization.
--
-- The rule is ownership. `is_owner` already carries it, is already what the
-- money capabilities resolve through, and is set deliberately. So the flags
-- FOLLOW it, on every write, and a future owner is exempt the moment they are
-- made one.

create or replace function public.ownership_sets_workforce_participation() returns trigger
language plpgsql set search_path = public as $function$
begin
  if new.is_owner then
    new.workforce_managed := false;
    new.time_tracking_required := false;
    new.eod_required := false;
    new.attendance_reward_eligible := false;
  end if;
  return new;
end $function$;

drop trigger if exists agency_memberships_owner_participation on public.agency_memberships;
create trigger agency_memberships_owner_participation
  before insert or update on public.agency_memberships
  for each row execute function public.ownership_sets_workforce_participation();

comment on trigger agency_memberships_owner_participation on public.agency_memberships is
  'An owner is outside workforce management, derived from is_owner rather than from anybody''s name (Dee, 2026-09-21). A new owner is exempt the moment they are made one.';

/* Re-derive what the name-matching set, and catch anybody it missed. */
do $$
declare v_n int;
begin
  update public.agency_memberships set is_owner = is_owner where is_owner;
  get diagnostics v_n = row_count;
  raise notice 'Owners re-derived through the rule: %', v_n;
end $$;

/* Nobody who is NOT an owner was exempted by this. Ordinary exemptions —
   Bryan's, for instance — stay exactly where they were set by hand. */
do $$
declare r record;
begin
  for r in
    select p.full_name, m.is_owner, m.workforce_managed, m.time_tracking_required,
           m.eod_required, m.attendance_reward_eligible
      from public.agency_memberships m join public.profiles p on p.id = m.user_id
     where m.status = 'active' and not coalesce(p.is_fixture, false)
       and (m.is_owner or not m.workforce_managed or not m.eod_required
            or not m.time_tracking_required or not m.attendance_reward_eligible)
  loop
    raise notice '% owner=% managed=% clocks=% eod=% bonus=%',
      r.full_name, r.is_owner, r.workforce_managed, r.time_tracking_required,
      r.eod_required, r.attendance_reward_eligible;
  end loop;
end $$;
