-- The managing partner is outside workforce management (Dee, 2026-10-01):
--
--   "Bryan never ask for schedule or place violation he is managing partner
--    and no need to login every time."
--
-- The owners were taken outside workforce management on 2026-09-21
-- (20260921002000: `workforce_managed = false` → no schedule expected, no
-- attendance score, no End of Day expected, no reminders, not in any
-- management list). The managing partner is the same case: he runs a side of
-- the business; the workforce engine does not measure him. His pay
-- arrangement is untouched — payroll prices every live arrangement, and his
-- own Time & Attendance pages remain his to use.
--
-- The rule is the SEAT, not the name: whoever holds a live managing_partner
-- seat is outside workforce management. One row today (Bryan).

update public.agency_memberships m
   set workforce_managed = false,
       time_tracking_required = false,
       eod_required = false,
       attendance_reward_eligible = false
  from public.management_seats s
 where s.user_id = m.user_id
   and s.agency_id = m.agency_id
   and s.seat = 'managing_partner'
   and public.seat_is_live(s.effective_from, s.effective_to)
   and m.status = 'active'
   and m.workforce_managed;
