-- 0170 — the security suite gets its own teams, and stops borrowing Dee's.
--
-- ---------------------------------------------------------------------------
-- WHAT HAPPENED
--
-- The RLS matrix found its team fixtures by NAME — `name like 'CreditOps%Team
-- A%'`. Dee renamed those teams to "Team Daniel" and "Team Ally" and changed
-- who was on them, which is exactly what a Teams screen is for. The rows were
-- never deleted; the matrix simply stopped finding them, and four checks that
-- depend on team scope began measuring nothing.
--
-- The lesson is not "do not rename". It is that a security suite must not
-- measure against rows the product invites somebody to edit. A fixture that a
-- user can rename is a fixture that will be renamed.
--
-- So the matrix gets its own, named the way every other fixture is named,
-- flagged, and hidden from the product. Dee's teams become entirely Dee's:
-- their names, their members, their departments, nobody else's dependency.
-- ---------------------------------------------------------------------------

alter table public.teams add column if not exists is_fixture boolean not null default false;

comment on column public.teams.is_fixture is
  'A team the RLS matrix measures against. Hidden from the product so nobody renames or restaffs it, which is how four security checks quietly stopped measuring anything.';

insert into public.teams (id, agency_id, name, department_id, is_fixture)
select 'dddddddd-0000-4000-8000-00000000fa01', a.id, '[TEST] Team A',
       (select id from public.departments where name = 'Dispute' and division = 'creditops' limit 1), true
  from public.agencies a limit 1
on conflict (id) do nothing;

insert into public.teams (id, agency_id, name, department_id, is_fixture)
select 'dddddddd-0000-4000-8000-00000000fa02', a.id, '[TEST] Team B',
       (select id from public.departments where name = 'Onboarding' and division = 'creditops' limit 1), true
  from public.agencies a limit 1
on conflict (id) do nothing;

/* The fixture clients move onto the fixture teams. They were pointing at the
   two teams Dee has since made their own, which is why a client Dee never
   created was counted inside Dee's team. */
update public.fulfillment_clients
   set team_id = 'dddddddd-0000-4000-8000-00000000fa01'
 where is_fixture and team_id = 'dddddddd-0000-4000-8000-2c946c531ff9';
update public.fulfillment_clients
   set team_id = 'dddddddd-0000-4000-8000-00000000fa02'
 where is_fixture and team_id = 'dddddddd-0000-4000-8000-f21949bb6336';

/* The lead leads Team A; the CreditOps agent is on it. That pair is what the
   team-scope checks measure: a lead sees the team's queue, an assigned-scope
   agent on the same team does not. */
insert into public.team_memberships (team_id, user_id, is_lead)
select 'dddddddd-0000-4000-8000-00000000fa01', p.id, true
  from public.profiles p where p.email = 'bes.lead@bes.test'
on conflict (team_id, user_id) do update set is_lead = true;

insert into public.team_memberships (team_id, user_id, is_lead)
select 'dddddddd-0000-4000-8000-00000000fa01', p.id, false
  from public.profiles p where p.email = 'bes.credit@bes.test'
on conflict (team_id, user_id) do nothing;

insert into public.team_memberships (team_id, user_id, is_lead)
select 'dddddddd-0000-4000-8000-00000000fa02', p.id, false
  from public.profiles p where p.email = 'bes.restricted@bes.test'
on conflict (team_id, user_id) do nothing;
