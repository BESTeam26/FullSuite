-- Who is in my management scope — asked once, answered by the database.
--
-- Dee, 2026-09-19, on Team Management: "each tab proving both UI scope and
-- backend scope before moving on. That keeps the module from becoming another
-- large surface where everything technically exists but permissions drift."
--
-- The UI used to decide scope itself: "if I lead teams, their members;
-- otherwise everyone." That fallback is the leak CLAUDE.md §20b names — a
-- division manager who leads no team saw the whole company. So the question
-- moves to the database and is answered from the SAME predicate that guards
-- every workforce row (`may_view_workforce_record`). What the page lists and
-- what the rows allow cannot drift, because they are one function.
--
--   Agent               nobody — Team Management does not exist for them
--   Team Lead           members of the teams they lead
--   Division Manager    people on teams in their division
--   Department Manager  people on teams in their department
--   Executive           everybody active

create or replace function public.managed_people()
returns table (user_id uuid)
language sql stable security definer set search_path = public as $function$
  select distinct m.user_id
    from public.agency_memberships m
    join public.profiles p on p.id = m.user_id
   where m.status = 'active'
     and coalesce(p.is_fixture, false) = false
     and m.user_id <> auth.uid()
     /* The one predicate. Self is excluded above: you do not manage yourself,
        and a lead with nobody on their team should see an empty team, not a
        team of one. */
     and public.may_view_workforce_record(m.agency_id, m.user_id)
     /* …and only for somebody who HOLDS a management relationship at all.
        `may_view_workforce_record` also says yes to self, which is why an agent
        would otherwise reach this row for themselves. */
     and (
       exists (select 1 from public.team_memberships tm where tm.user_id = auth.uid() and tm.is_lead)
       or exists (select 1 from public.agency_memberships me
                   where me.user_id = auth.uid() and me.status = 'active'
                     and (me.role = 'agency_admin' or public.agency_can('ops.manage')))
     )
$function$;

comment on function public.managed_people() is
  'The people the caller may MANAGE: team members for a lead, a division or department for scoped management, everybody for agency-wide management, nobody for an agent. Same predicate as the row policies, so the list and the rows cannot disagree (§20b).';

revoke all on function public.managed_people() from public, anon;
grant execute on function public.managed_people() to authenticated;
