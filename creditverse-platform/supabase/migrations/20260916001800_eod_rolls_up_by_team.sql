-- The organisation's day, by team.
--
-- Dee, 2026-09-16: *"Design the aggregation generically. Agent → Team Lead →
-- Department / Team rollup … Agency Admin/Owner can have an organization-level
-- EOD dashboard WITHOUT becoming fake members of every team."*
--
-- That last clause is the design constraint. Management reads this through the
-- `ops.manage` capability, exactly as they already read every individual report
-- — no membership row is created for them anywhere, so the org chart keeps
-- meaning what it says.
--
-- ── ONE LEVEL, AND HONEST ABOUT IT ─────────────────────────────────────────
--
-- This rolls up BY TEAM and names each team's department, which is the level
-- the data supports: a team has a department, and a lead leads a team. A true
-- department rollup would need a department to have a manager, and
-- `departments.manager_id` is null for all twenty-two of them. Summing teams
-- under a department heading would look like a department rollup while
-- reporting nothing about who is accountable for it, so the department is shown
-- as a LABEL and the lead is shown as the person.
--
-- People on no team are returned under a null team, because leaving them out
-- would make the organisation's totals quietly wrong.

create or replace function public.eod_org_rollup(p_date date)
returns table (
  team_id        uuid,
  team_name      text,
  department     text,
  lead_name      text,
  members        integer,
  submitted      integer,
  missing        integer,
  needs_review   integer,
  with_blockers  integer,
  production     bigint,
  completed      bigint,
  minutes_logged bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with staff as (
    select m.user_id
      from public.agency_memberships m
      join public.profiles p on p.id = m.user_id
     where m.status = 'active' and coalesce(p.is_fixture, false) = false
  ),
  /* A person on two teams is counted under each, because a lead needs their
     whole team's line to be right. The org totals are therefore read from the
     dashboard's own count of people, never by summing these rows. */
  placed as (
    select s.user_id, t.id as team_id, t.name as team_name, d.name as department
      from staff s
      join public.team_memberships tm on tm.user_id = s.user_id
      join public.teams t on t.id = tm.team_id and t.archived_at is null
      left join public.departments d on d.id = t.department_id
    union all
    select s.user_id, null, null, null
      from staff s
     where not exists (
       select 1 from public.team_memberships tm
        join public.teams t on t.id = tm.team_id and t.archived_at is null
       where tm.user_id = s.user_id)
  )
  select placed.team_id,
         coalesce(placed.team_name, 'No team'),
         placed.department,
         (select coalesce(p.full_name, p.email) from public.team_memberships l
           join public.profiles p on p.id = l.user_id
          where l.team_id = placed.team_id and l.is_lead limit 1),
         count(*)::int,
         count(*) filter (where e.submitted_at is not null)::int,
         count(*) filter (where e.submitted_at is null)::int,
         count(*) filter (where e.submitted_at is not null and e.reviewed_at is null)::int,
         count(*) filter (where nullif(trim(e.blockers), '') is not null
                             or nullif(trim(e.escalations), '') is not null)::int,
         /* sum() of all-nulls is null, which is exactly right: nobody reported,
            so nothing is known — not zero (Dee's rule, and it survives here
            only because sum ignores nulls rather than treating them as 0). */
         sum((e.snapshot ->> 'production_units')::int),
         sum((e.snapshot ->> 'actions_completed')::int),
         sum((e.snapshot ->> 'minutes_logged')::int)
    from placed
    left join public.eod_submissions e
           on e.employee_id = placed.user_id and e.work_date = p_date
   where public.is_agency_staff() and public.agency_can('ops.manage')
   group by placed.team_id, placed.team_name, placed.department
   order by coalesce(placed.team_name, 'zzz')
$$;

comment on function public.eod_org_rollup(date) is
  'The organisation''s day grouped by team, for management. Read through ops.manage, so nobody has to be added to a team to see it. A null total means nobody reported, not zero.';

grant execute on function public.eod_org_rollup(date) to authenticated;
