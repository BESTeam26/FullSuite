-- An EOD report that knows which Team Lead it belongs to.
--
-- Dee, 2026-09-16: *"Do not determine Team Lead from a person's name/email.
-- Resolve: Employee → Team Membership → Team Lead … If the routing is
-- genuinely ambiguous, surface EOD Routing Review Required. Do not silently
-- send to a random Team Lead."*
--
-- ── WHAT WAS ALREADY HERE ──────────────────────────────────────────────────
--
-- Most of the brief. `eod_submissions` already carries the state machine
-- (draft → submitted → needs_clarification → reviewed → approved), the
-- reviewer fields, and a `snapshot` jsonb frozen at submission.
-- `eod_revisions` already records the previous values on every re-submit, so
-- "verify this behavior is properly audited" was already true. `eod_day_activity()`
-- already derives the automatic half from canonical records.
--
-- What did NOT exist is the HIERARCHY: nothing resolved an employee to their
-- lead, and nothing could roll a team up. That is all this adds.
--
-- ── WHY ROUTING IS STORED, NOT COMPUTED AT READ TIME ───────────────────────
--
-- Who led your team on the day you submitted is a fact about that day. Resolve
-- it live and yesterday's report silently re-routes the moment somebody changes
-- teams — which is rule 4: "Historical attribution must not change when current
-- assignments change." So the answer is written onto the submission when it is
-- submitted, beside the snapshot, and stays.

alter table public.eod_submissions
  add column if not exists routed_to      uuid references public.profiles (id),
  add column if not exists routed_team_id uuid references public.teams (id),
  add column if not exists routing_reason text;

comment on column public.eod_submissions.routed_to is
  'The Team Lead this report was routed to, resolved and FROZEN at submission. Re-resolving later would re-route history when somebody changes teams.';
comment on column public.eod_submissions.routing_reason is
  'How routing resolved: team_lead, no_team, no_lead, is_lead, or ambiguous. Anything but team_lead needs a human to look.';

create index if not exists eod_submissions_routed_idx
  on public.eod_submissions (routed_to, work_date desc) where routed_to is not null;

-- ── Employee → Team Membership → Team Lead ─────────────────────────────────

create or replace function public.eod_route_for(p_employee uuid)
returns table (lead_id uuid, team_id uuid, team_name text, reason text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_teams int;
  v_leads int;
begin
  /* Live teams only. A lead on an archived team leads nobody. */
  select count(*) into v_teams
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id and t.archived_at is null
   where tm.user_id = p_employee;

  if v_teams = 0 then
    return query select null::uuid, null::uuid, null::text, 'no_team'::text;
    return;
  end if;

  /* Candidate leads: somebody ELSE marked is_lead on a team this person is on.
     Excluding self matters — a Team Lead must not be routed to themselves,
     which would make their own report its own review. */
  create temporary table if not exists eod_route_tmp (
    lead_id uuid, team_id uuid, team_name text
  ) on commit drop;
  delete from eod_route_tmp;

  insert into eod_route_tmp
  select distinct lead.user_id, t.id, t.name
    from public.team_memberships mine
    join public.teams t on t.id = mine.team_id and t.archived_at is null
    join public.team_memberships lead on lead.team_id = t.id and lead.is_lead
    join public.agency_memberships m on m.user_id = lead.user_id and m.status = 'active'
   where mine.user_id = p_employee
     and lead.user_id <> p_employee;

  select count(distinct eod_route_tmp.lead_id) into v_leads from eod_route_tmp;

  if v_leads = 1 then
    return query select r.lead_id, r.team_id, r.team_name, 'team_lead'::text
                   from eod_route_tmp r limit 1;
  elsif v_leads > 1 then
    /* Dee: "determine which team's work is represented in the report". That
       cannot be decided from membership alone, and guessing would send
       somebody's day to the wrong manager — so it is surfaced, not guessed. */
    return query select null::uuid, null::uuid, null::text, 'ambiguous'::text;
  elsif exists (select 1 from public.team_memberships tm
                 join public.teams t on t.id = tm.team_id and t.archived_at is null
                where tm.user_id = p_employee and tm.is_lead) then
    /* They lead their own team and nobody leads them. Their report belongs to
       management, not to a peer. */
    return query select null::uuid, null::uuid, null::text, 'is_lead'::text;
  else
    return query select null::uuid, null::uuid, null::text, 'no_lead'::text;
  end if;
end $$;

comment on function public.eod_route_for(uuid) is
  'Employee → Team Membership → Team Lead. Never by name or email. Returns a reason rather than guessing when no single lead can be resolved.';

grant execute on function public.eod_route_for(uuid) to authenticated;

-- ── Freeze the routing at submission ───────────────────────────────────────

create or replace function public.eod_set_routing()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record;
begin
  /* Only on the transition INTO submitted, and only once: a later edit must
     not re-route a report somebody has already been asked to review. */
  if new.submitted_at is not null
     and (tg_op = 'INSERT' or old.submitted_at is null)
     and new.routing_reason is null then
    select * into r from public.eod_route_for(new.employee_id);
    new.routed_to      := r.lead_id;
    new.routed_team_id := r.team_id;
    new.routing_reason := r.reason;
  end if;
  return new;
end $$;

drop trigger if exists eod_submissions_routing on public.eod_submissions;
create trigger eod_submissions_routing
  before insert or update on public.eod_submissions
  for each row execute function public.eod_set_routing();

-- ── The Team Lead's rollup: Part 2 of their own EOD ────────────────────────

create or replace function public.eod_team_rollup(p_lead uuid, p_date date)
returns table (
  employee_id     uuid,
  employee_name   text,
  team_name       text,
  submitted       boolean,
  auto_submitted  boolean,
  state           text,
  production      integer,
  completed       integer,
  in_progress     integer,
  blocked         integer,
  minutes_logged  integer,
  blockers        text,
  help_needed     text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  /* Everybody on a live team this person leads, minus themselves — Part 1 of
     their EOD is their own work and Part 2 is their team's. */
  with led as (
    select distinct tm.user_id, t.name as team_name
      from public.team_memberships lead
      join public.teams t on t.id = lead.team_id and t.archived_at is null
      join public.team_memberships tm on tm.team_id = t.id
     where lead.user_id = p_lead and lead.is_lead and tm.user_id <> p_lead
  )
  select led.user_id,
         coalesce(p.full_name, p.email, 'Unknown'),
         led.team_name,
         e.submitted_at is not null,
         coalesce(e.auto_submitted, false),
         coalesce(e.state::text, 'not_started'),
         /* From the SNAPSHOT, not from live tasks: yesterday's report must not
            change because a task moved today. Null — not zero — when there is
            no snapshot, because zero is a claim and "no report" is not one. */
         (e.snapshot ->> 'production_units')::int,
         (e.snapshot ->> 'actions_completed')::int,
         jsonb_array_length(coalesce(e.snapshot -> 'in_progress', '[]'::jsonb)),
         jsonb_array_length(coalesce(e.snapshot -> 'blocked', '[]'::jsonb)),
         (e.snapshot ->> 'minutes_logged')::int,
         e.blockers,
         e.escalations
    from led
    left join public.profiles p on p.id = led.user_id
    left join public.eod_submissions e
           on e.employee_id = led.user_id and e.work_date = p_date
   where public.is_agency_staff()
     and (p_lead = auth.uid() or public.agency_can('ops.manage'))
   order by coalesce(p.full_name, p.email)
$$;

comment on function public.eod_team_rollup(uuid, date) is
  'The team half of a Team Lead''s EOD. Figures come from each report''s frozen snapshot, so a rollup of a past day does not move when today''s tasks do. Readable by that lead, or by management holding ops.manage.';

grant execute on function public.eod_team_rollup(uuid, date) to authenticated;
