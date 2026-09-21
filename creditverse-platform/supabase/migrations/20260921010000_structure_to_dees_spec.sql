-- Dee, 2026-09-21: the structure as it really is.
--
--   CreditOps   four departments, one team each: Client Success · Dispute ·
--               Complaints & Mailing · Bureau Calling (no members yet).
--               Onboarding goes.
--   BES CRM     one team, CRM Team — roles differ, the team does not.
--   Management  the team-lead group becomes "Management Team"; an "Admin
--               Team" (Aaron, Dee, Bryan) for executive discussion. Both
--               under a Management department in the Corporate division.
--   "DELETE ALL DUPLICATES."
--
-- What "delete" means here (rules 4 and 11): an archived duplicate that
-- nothing references is removed outright; one that history still points at
-- (work items, partner assignments, clients) stays archived and hidden,
-- because deleting it would erase who did what. Positions that still pointed
-- at retired teams are re-pointed to the live team they meant.

-- 1. CreditOps is flat. The live departments had `parent_department_id`
--    pointing at ARCHIVED copies of themselves, left by an earlier rebuild;
--    the org chart nested live departments under ghosts.
update public.departments d
   set parent_department_id = null
 where d.division = 'creditops' and d.archived_at is null and not d.is_fixture;

-- 2. Positions follow the live teams and departments.
update public.positions p
   set team_id = (select id from public.teams where name = 'CreditOps Dispute Processing Team' and archived_at is null limit 1)
 where p.team_id = (select id from public.teams where name = 'Team Daniel' limit 1);
update public.positions p
   set team_id = (select id from public.teams where name = 'CreditOps Client Success / Support Team' and archived_at is null limit 1)
 where p.team_id = (select id from public.teams where name = 'Team Ally' limit 1);
update public.positions p
   set department_id = (select id from public.departments where name = 'Automation Department' and division = 'bes_crm' and archived_at is null limit 1)
 where p.department_id = (select id from public.departments where name = 'CRM Support' and division = 'bes_crm' limit 1);

-- 3. Management under Corporate.
insert into public.departments (agency_id, division, division_id, key, name, description, sort)
select dv.agency_id, 'corporate', dv.id, 'management', 'Management',
       'Team leads and the executive team.', 0
  from public.divisions dv
 where dv.id = '6126b81b-a3de-4713-a70a-fdb5d1ce2e4c'
on conflict (agency_id, division, key) do nothing;

update public.teams
   set name = 'Management Team',
       department_id = (select id from public.departments where key = 'management' and division = 'corporate' and archived_at is null limit 1)
 where id = '744078cd-826c-4f68-ad50-fba3774becaf';

insert into public.teams (agency_id, name, department_id, description)
select d.agency_id, 'Admin Team', d.id, 'Executive — high-level discussion.'
  from public.departments d
 where d.key = 'management' and d.division = 'corporate' and d.archived_at is null
   and not exists (select 1 from public.teams t where t.name = 'Admin Team' and t.department_id = d.id);

insert into public.team_memberships (team_id, user_id, is_lead)
select t.id, p.id, false
  from public.teams t, public.profiles p
 where t.name = 'Admin Team' and t.archived_at is null
   and p.email in ('aaron@blessedempireservices.com', 'dee@blessedempireservices.com', 'lordvrye.bes@gmail.com')
on conflict (team_id, user_id) do nothing;

-- 4. Departments that are now empty shells leave the active structure.
update public.departments
   set archived_at = now()
 where archived_at is null and not is_fixture
   and ((division = 'creditops'  and key = 'onboarding')
     or (division = 'bes_crm'    and name = 'Website & Funnel Design')
     or (division = 'talentops'  and name = 'Staff Management'));

-- 5. Archived duplicates that nothing references are removed in the next
--    migration, by explicit id, so the scope of the delete is readable.

-- 6. The two management conversations match the two management teams.
insert into public.channel_members (channel_id, user_id)
select '8828953a-2277-4770-96db-a345b6503163', p.id
  from public.profiles p where p.email = 'aaron@blessedempireservices.com'
on conflict do nothing;
insert into public.channel_members (channel_id, user_id)
select '45dd8313-548b-4bd4-b94e-d22fd74ab6a8', m.user_id
  from public.team_memberships m
 where m.team_id = '744078cd-826c-4f68-ad50-fba3774becaf'
on conflict do nothing;
