-- The owners are not managed by the workforce engine.
--
-- Dee, 2026-09-21: "AARON AND DEE MUST NOT BE REQUIRED FOR ANYTHING LIKE
-- SCHEDULE OR PERFORMANCE OR PAY, ALL OF THAT IS NOT NEEDED for the owners."
--
-- Three exemptions already existed and each was added one at a time as the
-- problem surfaced: no clock, no attendance bonus, no End of Day. Adding a
-- fourth and fifth column the same way would be four columns describing one
-- fact. The fact is simpler: an owner is not a managed employee.
--
-- So `workforce_managed` is the single switch, and the specific flags remain
-- for the case that is genuinely per-person — Bryan clocks in and files no
-- End of Day, which is not the same as being outside the system entirely.
--
--   workforce_managed = false   → no schedule expected, no performance score,
--                                 no pay rate expected, and by implication
--                                 none of the three earlier flags either
--
-- This does NOT touch what they can SEE. Dee and Aaron read everything; they
-- are simply not measured by it.

alter table public.agency_memberships
  add column if not exists workforce_managed boolean not null default true;

comment on column public.agency_memberships.workforce_managed is
  'Whether the workforce engine manages this person: schedule, attendance, End of Day, performance, pay. False for the owners (Dee, 2026-09-21) — they run the company, they are not measured by it. Unrelated to what they may see.';

do $$
declare v_n int;
begin
  update public.agency_memberships m
     set workforce_managed = false,
         time_tracking_required = false,
         attendance_reward_eligible = false,
         eod_required = false
    from public.profiles p
   where p.id = m.user_id
     and p.full_name in ('Dee Gallardo', 'Aaron Gallardo');
  get diagnostics v_n = row_count;
  raise notice 'Outside workforce management: % (owners)', v_n;
end $$;

/* Nobody outside workforce management can be required to clock in, file a
   report or win an attendance prize. One rule, stated once, rather than
   remembered three times. */
alter table public.agency_memberships drop constraint if exists membership_unmanaged_is_exempt;
alter table public.agency_memberships add constraint membership_unmanaged_is_exempt
  check (workforce_managed
         or (not time_tracking_required and not eod_required and not attendance_reward_eligible));
