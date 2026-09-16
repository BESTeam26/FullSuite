-- `eod_route_for` used a temporary table, which a STABLE function may not create:
--
--   0A000: CREATE TABLE is not allowed in a non-volatile function
--
-- It was the wrong instrument regardless. The question — "is there exactly one
-- lead above this person?" — is one query over three joins, and writing it as
-- one puts the five outcomes side by side instead of spreading them across a
-- procedural branch.
--
-- (Second attempt: the first rewrite put a LIMIT inside a UNION ALL branch,
-- which belongs to the whole query and not to one arm of it. One CASE over a
-- single counted row avoids needing either.)
--
-- Same rules, unchanged: live teams only, self excluded, and no guess when more
-- than one lead could be meant.

create or replace function public.eod_route_for(p_employee uuid)
returns table (lead_id uuid, team_id uuid, team_name text, reason text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with my_teams as (
    select t.id, t.name, tm.is_lead
      from public.team_memberships tm
      join public.teams t on t.id = tm.team_id and t.archived_at is null
     where tm.user_id = p_employee
  ),
  /* Somebody ELSE marked is_lead on a team this person is on. Excluding self
     matters: a Team Lead routed to themselves would review their own report. */
  candidates as (
    select distinct lead.user_id as lead_id, t.id as team_id, t.name as team_name
      from my_teams t
      join public.team_memberships lead on lead.team_id = t.id and lead.is_lead
      join public.agency_memberships m on m.user_id = lead.user_id and m.status = 'active'
     where lead.user_id <> p_employee
  ),
  counted as (select count(distinct c.lead_id) as leads from candidates c),
  pick as (select c.lead_id, c.team_id, c.team_name from candidates c limit 1)
  select
    case when counted.leads = 1 then pick.lead_id   end,
    case when counted.leads = 1 then pick.team_id   end,
    case when counted.leads = 1 then pick.team_name end,
    case
      when counted.leads = 1 then 'team_lead'
      /* Dee: "determine which team's work is represented in the report". That
         cannot be settled from membership alone, and guessing would send
         somebody's day to the wrong manager — so it is surfaced, never guessed. */
      when counted.leads > 1 then 'ambiguous'
      when not exists (select 1 from my_teams) then 'no_team'
      /* They lead their own team and nobody leads them: their report belongs to
         management, not to a peer. */
      when exists (select 1 from my_teams where is_lead) then 'is_lead'
      else 'no_lead'
    end::text
    from counted left join pick on true
$$;

comment on function public.eod_route_for(uuid) is
  'Employee → Team Membership → Team Lead. Never by name or email. Returns exactly one row: a lead, or a reason why there is not one.';
