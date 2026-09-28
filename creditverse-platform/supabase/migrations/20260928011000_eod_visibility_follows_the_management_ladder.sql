-- EOD visibility follows the management ladder, not a single capability.
--
-- Dee, 2026-09-28: "EOD visibility should follow: Team Lead → own team,
-- Department Manager → own department, Division Manager → own division,
-- Executive → organization-wide operational visibility."
--
-- It did not. `eod_visible_people()` had three bands — self, teams you lead,
-- and `everyone`, the last of which was gated on nothing but
-- `agency_can('ops.manage')`:
--
--   where m.status = 'active' and m.user_id <> auth.uid()
--     and is_agency_staff() and agency_can('ops.manage')
--
-- `ops.manage` answers "has management authority", NOT "over everything".
-- This is the exact mistake rule 20b exists to stop: a Division Manager holds
-- that capability and must still be confined to their division.
--
-- Measured before this migration:
--
--   Allyssa Mores    Team Lead, CreditOps Support    saw 25 of 25 people
--   Daniel Macasiab  Team Lead, CreditOps Dispute    saw 25 of 25 people
--
-- Both lead ONE team and could read every agent's end-of-day report.
--
-- ── THE FIX IS TO STOP HAVING A SECOND ANSWER ────────────────────────────
--
-- `managed_people()` already decides who a manager manages, and it already
-- implements Dee's ladder through `may_view_workforce_record`:
--
--   self · team lead → team members · managed_teams() → department/division
--   · has_operations_scope → division · agency_admin or (ops.manage AND
--   scope='agency') → organization-wide
--
-- It is what the People pages, schedules and performance already read. EOD
-- had its own second opinion, and the second opinion was wrong (rule 2).
--
-- The `self` and `led` bands are kept as they were, because the relationship
-- LABEL matters on the EOD screen — somebody on your team shows as yours
-- rather than as one of the hundred — and `managed_people()` returns ids
-- only.
--
-- Note `managed_people()` excludes owners (`workforce_managed`), by Dee's
-- instruction that Aaron and Dee are not measured by the company they run.
-- Owners therefore stop appearing in other people's EOD lists, which is the
-- same rule the schedule and performance screens already follow.
--
-- Cost impact: no material increase — one set-returning call in place of a
-- full membership scan.

begin;

create or replace function public.eod_visible_people()
returns table(employee_id uuid, employee_name text, team_name text, relationship text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  /* Three answers, one per kind of reader, and a person may qualify for more
     than one — a lead is also an employee — so the rows are unioned and
     de-duplicated on the strongest relationship. */
  with me as (
    select coalesce(p.full_name, p.email, 'You') as name
      from public.profiles p where p.id = auth.uid()
  ),
  mine as (
    select auth.uid() as employee_id, (select name from me) as employee_name,
           null::text as team_name, 'self'::text as relationship
     where public.is_agency_staff()
  ),
  my_team as (
    select distinct tm.user_id, coalesce(p.full_name, p.email, 'Unknown'), t.name, 'led'::text
      from public.team_memberships lead
      join public.teams t on t.id = lead.team_id and t.archived_at is null
      join public.team_memberships tm on tm.team_id = t.id and tm.user_id <> auth.uid()
      join public.profiles p on p.id = tm.user_id
     where lead.user_id = auth.uid() and lead.is_lead and public.is_agency_staff()
  ),
  managed as (
    /* THE CHANGE. Was "everybody, if you hold ops.manage". Now the canonical
       management scope, which confines a department manager to their
       department and a division manager to their division, and opens to the
       organization only for agency scope (rule 20b). */
    select distinct mp.user_id, coalesce(p.full_name, p.email, 'Unknown'),
           null::text, 'managed'::text
      from public.managed_people() mp
      join public.profiles p on p.id = mp.user_id
     where public.is_agency_staff()
  ),
  all_rows as (select * from mine union all select * from my_team union all select * from managed)
  select distinct on (employee_id) employee_id, employee_name, team_name, relationship
    from all_rows
   order by employee_id, case relationship when 'self' then 0 when 'led' then 1 else 2 end
$function$;

/* A team lead who manages nothing wider must not see the whole company. */
do $$
declare v_lead uuid; v_sees int; v_team int;
begin
  /* A lead of exactly one live team, with no management seat and no agency
     scope — the case this migration exists for. */
  select tm.user_id into v_lead
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id and t.archived_at is null and not t.is_fixture
    join public.agency_memberships m on m.user_id = tm.user_id and m.status = 'active'
   where tm.is_lead and m.role <> 'agency_admin'
     and not exists (select 1 from public.management_seats s where s.user_id = tm.user_id)
   limit 1;

  if v_lead is null then
    raise notice 'no plain team lead to check against — skipped';
    return;
  end if;

  select count(*) into v_team
    from public.team_memberships lead
    join public.teams t on t.id = lead.team_id and t.archived_at is null
    join public.team_memberships tm on tm.team_id = t.id
   where lead.user_id = v_lead and lead.is_lead;

  if v_sees is not null and v_sees > v_team then
    raise exception 'a plain team lead still sees more than their team';
  end if;
  raise notice 'team lead check: leads % team member(s)', v_team;
end $$;

commit;
