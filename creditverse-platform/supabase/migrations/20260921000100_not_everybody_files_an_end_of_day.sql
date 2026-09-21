-- Not everybody files an End of Day.
--
-- Dee, 2026-09-21: "Aaron Dee and Bryan don't need EOD Report."
--
-- A third exemption, and a third column, for the same reason the first two are
-- separate: they do not travel together. Bryan clocks in and is not eligible
-- for the attendance bonus and does not file an End of Day. Dee and Aaron do
-- none of the three. One flag standing for all of it would have to be wrong
-- about somebody.
--
--   time_tracking_required      Dee, Aaron            — no clock
--   attendance_reward_eligible  Dee, Aaron, Bryan     — no bonus
--   eod_required                Dee, Aaron, Bryan     — no report   (new)
--
-- Nobody who does not clock in can be asked for an End of Day, because the
-- report is derived from the day's canonical records and there are none.

alter table public.agency_memberships
  add column if not exists eod_required boolean not null default true;

comment on column public.agency_memberships.eod_required is
  'Whether this person files an End of Day. False for the founders and for management (Dee, 2026-09-21); they are not counted as missing and are not chased.';

do $$
declare v_n int;
begin
  update public.agency_memberships m
     set eod_required = false
    from public.profiles p
   where p.id = m.user_id
     and p.full_name in ('Dee Gallardo', 'Aaron Gallardo', 'Bryan Breva');
  get diagnostics v_n = row_count;
  raise notice 'Exempt from filing an End of Day: %', v_n;
end $$;

/* The rule, stated after the rows satisfy it: an End of Day is derived from
   the day's canonical records, so somebody who does not clock in cannot be
   asked for one. Every founder is already exempt from both; this stops the
   pair drifting apart later. */
alter table public.agency_memberships drop constraint if exists membership_eod_needs_tracking;
alter table public.agency_memberships add constraint membership_eod_needs_tracking
  check (not eod_required or time_tracking_required);
