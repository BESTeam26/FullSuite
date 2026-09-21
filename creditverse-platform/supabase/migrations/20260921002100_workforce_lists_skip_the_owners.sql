-- Every workforce list skips whoever the engine does not manage.
--
-- `managed_people()` is what Schedule, Attendance, Performance, End of Day
-- and the pay roster all read to decide whose row to draw. Adding the
-- exemption in each of those screens would be five places to forget; adding
-- it here is one.
--
-- This narrows who is MANAGED. It does not narrow who may LOOK — Dee and
-- Aaron still read every one of those screens, they simply no longer appear
-- on them as people with a schedule to set or a score to explain.
--
-- Generated — see supabase/scripts/gen-managed-people-skips-owners.mjs.

CREATE OR REPLACE FUNCTION public.managed_people()
 RETURNS TABLE(user_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct m.user_id
    from public.agency_memberships m
    join public.profiles p on p.id = m.user_id
   where m.status = 'active'
     and coalesce(p.is_fixture, false) = false
     /* Dee, 2026-09-21: "AARON AND DEE MUST NOT BE REQUIRED FOR ANYTHING LIKE
        SCHEDULE OR PERFORMANCE OR PAY." An owner appearing here is an owner
        appearing in every management list that reads it — schedules to set,
        performance to score, a pay rate to chase. They run the company; they
        are not measured by it. This limits who is MANAGED, never who may
        look. */
     and coalesce(m.workforce_managed, true)
     and m.user_id <> auth.uid()
     and public.may_view_workforce_record(m.agency_id, m.user_id)
     and (
       exists (select 1 from public.team_memberships tm where tm.user_id = auth.uid() and tm.is_lead)
       or exists (select 1 from public.agency_memberships me
                   where me.user_id = auth.uid() and me.status = 'active'
                     and (me.role = 'agency_admin' or public.agency_can('ops.manage')))
       or exists (select 1 from public.management_seats s where s.user_id = auth.uid() and public.seat_is_live(s.effective_from, s.effective_to))
     )
$function$
;
