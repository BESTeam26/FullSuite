-- Fixture data must coexist with real data, never contaminate it (rule 20).
--
-- This morning `[TEST] Team B` was moved into a live CreditOps department so
-- the probe personas on it would keep a work scope (20260921010400). Until
-- today its department — Onboarding — had no real people in it, so nothing
-- was shared. Client Success has three real people, and the moment Team B
-- landed there, `[TEST] Cleo Chan` appeared in Jet Manugas's client list: a
-- fixture client in a real agent's directory. Found by
-- `directory-vs-queues-probe`, which compares the directory against an
-- independent oracle rather than against the policy under test.
--
-- Team B is the NEGATIVE control — the person on it (`bes.restricted`) is
-- meant to reach nothing — so it does not need a real department at all. It
-- goes back into a hidden fixture department. Team A stays in Dispute: it is
-- the positive control, its personas must hold a real CreditOps scope, and
-- that arrangement predates today.

insert into public.departments (agency_id, division, division_id, key, name, description, is_fixture, show_on_chart, sort)
select a.id, 'creditops', d.id, 'fixture', '[TEST] Fixture Department',
       'Holds the RLS probe negative-control team. Never real people, never real work.', true, false, 9999
  from public.agencies a
  join public.divisions d on d.agency_id = a.id and d.service = 'creditops' and d.archived_at is null
 order by a.created_at limit 1
on conflict (agency_id, division, key) do nothing;

update public.teams t
   set department_id = (select id from public.departments
                         where is_fixture and key = 'fixture' and division = 'creditops' limit 1)
 where t.id = 'dddddddd-0000-4000-8000-00000000fa02' and t.is_fixture;
