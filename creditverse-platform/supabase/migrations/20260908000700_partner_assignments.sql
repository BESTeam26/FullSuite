-- 0184 — a partner is seen by the people assigned to it, not by all staff.
--
-- ---------------------------------------------------------------------------
-- THE GAP
--
-- `outsourcing_groups_select` was `is_staff_of(agency_id)`. Every BES staff
-- member — every agent — could read every partner BES has. Dee's §13 is
-- explicit and mandatory: a manager does not automatically see every partner,
-- and an agent sees only what is assigned to them.
--
-- With two admins on the roster this changed nothing anybody could observe.
-- It changes everything the moment an agent is invited, which is the week
-- after next.
--
-- ---------------------------------------------------------------------------
-- THE MODEL: ASSIGNMENT, TO A PERSON OR TO A TEAM
--
-- One row per assignment, exactly one of `user_id` or `team_id`. A team
-- assignment is what makes this maintainable — put Team Alpha on Partner A
-- once, and everybody who joins Team Alpha inherits it, everybody who leaves
-- loses it, with no partner-by-partner cleanup (Dee, §20).
--
-- Assignments END rather than disappear: `ended_on` closes one and the row
-- stays, so "who ran this account in March" is still answerable (rule 4).
--
-- ---------------------------------------------------------------------------
-- WHAT ASSIGNMENT DOES AND DOES NOT GRANT
--
-- It grants OPERATIONAL visibility of the partner. It grants NOTHING
-- financial: rates, invoices, payments and expenses live in their own tables
-- behind `partners.financials.view` and this policy does not touch them
-- (Dee, §19). Being assigned to an account is not being trusted with its
-- margin.
-- ---------------------------------------------------------------------------

create table public.partner_assignments (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  group_id    uuid not null references public.outsourcing_groups(id) on delete cascade,
  /** Optional. Set when somebody works ONE service for this partner rather
      than the account as a whole — the CRM team on the BES CRM engagement
      while CreditOps runs separately (Dee, §17). */
  service_id  uuid references public.partner_services(id) on delete cascade,
  /** Exactly one of these. A team assignment is inherited by its members. */
  user_id     uuid references public.profiles(id) on delete cascade,
  team_id     uuid references public.teams(id) on delete cascade,
  /** What they do on this account. Not a permission — a description. */
  assignment_role text not null default 'assigned'
    check (assignment_role in ('account_manager', 'operations_manager',
                               'processor', 'support', 'specialist', 'assigned')),
  /** The one account manager. At most one live per partner. */
  is_primary  boolean not null default false,
  started_on  date not null default current_date,
  /** Set to end it. The row stays — who ran this account in March is a
      question somebody will ask (rule 4). */
  ended_on    date,
  notes       text,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint partner_assignments_one_assignee check ((user_id is null) <> (team_id is null)),
  constraint partner_assignments_dates check (ended_on is null or ended_on >= started_on)
);

create index partner_assignments_group_idx on public.partner_assignments (group_id)
  where ended_on is null;
create index partner_assignments_user_idx on public.partner_assignments (user_id)
  where ended_on is null and user_id is not null;
create index partner_assignments_team_idx on public.partner_assignments (team_id)
  where ended_on is null and team_id is not null;
/* One primary account manager at a time. Partial, so ended assignments and
   ordinary ones do not collide. */
create unique index partner_assignments_primary_idx on public.partner_assignments (group_id)
  where is_primary and ended_on is null;

create trigger partner_assignments_updated_at before update on public.partner_assignments
  for each row execute function public.set_updated_at();

comment on table public.partner_assignments is
  'Who at BES works on which partner. A team assignment is inherited by its members, so joining or leaving the team is the only thing anybody edits. Grants operational visibility only — financial data stays behind its own capability.';

-- ── May the caller see this partner? ────────────────────────────────────
--
-- SECURITY DEFINER so it can read assignments and team membership without the
-- caller needing rights on either. Every branch is an explicit grant; there is
-- no fall-through that says yes.
create or replace function public.can_see_partner(p_group uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select p_group is not null and exists (
    select 1 from public.outsourcing_groups g
     where g.id = p_group
       and (
         /* An owner or an administrator is agency-wide by ROLE — the same
            rule 0154 established for work and clients. */
         public.is_admin_of(g.agency_id)

         or (
           public.is_staff_of(g.agency_id)
           and exists (
             select 1 from public.partner_assignments a
              where a.group_id = g.id
                and a.ended_on is null
                and (
                  /* Assigned to you by name. */
                  a.user_id = auth.uid()

                  /* Or to a live team you are on — §20, inherited, with no
                     per-partner configuration. */
                  or (a.team_id is not null and exists (
                        select 1
                          from public.team_memberships tm
                          join public.teams t on t.id = tm.team_id
                         where tm.team_id = a.team_id
                           and tm.user_id = auth.uid()
                           and t.archived_at is null))

                  /* Or to a team in a department you manage — a manager's
                     scope, and only over teams that are actually theirs. */
                  or (a.team_id is not null and exists (
                        select 1
                          from public.teams t
                          join public.departments d on d.id = t.department_id
                         where t.id = a.team_id
                           and t.archived_at is null
                           and d.archived_at is null
                           and d.manager_id = auth.uid()))
                )
           )
         )
       )
  )
$function$;
revoke execute on function public.can_see_partner(uuid) from public, anon;
grant execute on function public.can_see_partner(uuid) to authenticated;

comment on function public.can_see_partner(uuid) is
  'Owner and admin see every partner. Everyone else sees the partners assigned to them, to a live team they are on, or to a team in a department they manage. An unassigned partner is visible to owner and admin alone — which is exactly what makes an "Unassigned partners" screen worth having.';

-- ── The narrowed policy ─────────────────────────────────────────────────
drop policy if exists outsourcing_groups_select on public.outsourcing_groups;
create policy outsourcing_groups_select on public.outsourcing_groups
  for select to authenticated
  using (public.is_staff_of(agency_id) and public.can_see_partner(id));

alter table public.partner_assignments enable row level security;
revoke all on public.partner_assignments from public, anon;
grant select, insert, update on public.partner_assignments to authenticated;

/* You can see an assignment on a partner you can see. Managing assignments is
   the existing `partners.assignments` capability — no second permission. */
create policy partner_assignments_select on public.partner_assignments for select to authenticated
  using (public.is_staff_of(agency_id) and public.can_see_partner(group_id));
create policy partner_assignments_insert on public.partner_assignments for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.agency_can('partners.assignments'));
create policy partner_assignments_update on public.partner_assignments for update to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.assignments'))
  with check (public.is_staff_of(agency_id) and public.agency_can('partners.assignments'));
-- No delete policy: an assignment is ended, never removed (rule 11).

-- ── Existing account managers become assignments ────────────────────────
--
-- `outsourcing_groups.account_manager_id` already named somebody on some
-- partners. Those become real assignment rows so nothing that was true stops
-- being true when the policy narrows.
insert into public.partner_assignments
  (agency_id, group_id, user_id, assignment_role, is_primary, started_on)
select g.agency_id, g.id, g.account_manager_id, 'account_manager', true,
       coalesce(g.started_on, current_date)
  from public.outsourcing_groups g
 where g.account_manager_id is not null
   and not exists (
     select 1 from public.partner_assignments a
      where a.group_id = g.id and a.is_primary and a.ended_on is null);

/* Same for a partner-level team. */
insert into public.partner_assignments
  (agency_id, group_id, team_id, assignment_role, started_on)
select g.agency_id, g.id, g.team_id, 'assigned', coalesce(g.started_on, current_date)
  from public.outsourcing_groups g
 where g.team_id is not null
   and not exists (
     select 1 from public.partner_assignments a
      where a.group_id = g.id and a.team_id = g.team_id and a.ended_on is null);

/* And for the processor and team named on each service engagement. */
insert into public.partner_assignments
  (agency_id, group_id, service_id, user_id, assignment_role, started_on)
select s.agency_id, s.group_id, s.id, s.processor_id, 'processor',
       coalesce(s.started_on, current_date)
  from public.partner_services s
 where s.processor_id is not null
   and not exists (
     select 1 from public.partner_assignments a
      where a.service_id = s.id and a.user_id = s.processor_id and a.ended_on is null);

insert into public.partner_assignments
  (agency_id, group_id, service_id, team_id, assignment_role, started_on)
select s.agency_id, s.group_id, s.id, s.team_id, 'assigned',
       coalesce(s.started_on, current_date)
  from public.partner_services s
 where s.team_id is not null
   and not exists (
     select 1 from public.partner_assignments a
      where a.service_id = s.id and a.team_id = s.team_id and a.ended_on is null);
