-- The fixture teams need a CreditOps department, not a fixture one.
--
-- 20260921009000 parked `[TEST] Team A` and `[TEST] Team B` in a hidden
-- fixture department keyed 'fixture' so they could never block the owner
-- from archiving a real department. Right goal, wrong place: every CreditOps
-- scope rule maps `departments.key` onto the work model (`onboarding` →
-- Onboarding, `support` → Support, …), and a key of 'fixture' maps to
-- nothing. The probe personas on those teams lost their department, and the
-- full gate showed it (phase 37 "a CreditOps agent sees their ASSIGNED
-- client": 0:0; phase 2's Team A queue check).
--
-- So the fixture teams live in REAL CreditOps departments again — Team A in
-- Dispute, as it always was; Team B in Client Success, because Onboarding is
-- archived and its statuses now route to Client Success (AD-011). What keeps
-- them from ever blocking Dee is what 20260921009000 also did: the archive
-- guard ignores fixture teams, and the structure page hides them.

update public.teams t
   set department_id = (select id from public.departments
                         where division = 'creditops' and key = 'dispute' and archived_at is null and not is_fixture limit 1)
 where t.id = 'dddddddd-0000-4000-8000-00000000fa01' and t.is_fixture;

update public.teams t
   set department_id = (select id from public.departments
                         where division = 'creditops' and key = 'support' and archived_at is null and not is_fixture limit 1)
 where t.id = 'dddddddd-0000-4000-8000-00000000fa02' and t.is_fixture;

/* The fixture department is now empty and referenced by nothing; it goes. */
delete from public.departments d
 where d.is_fixture and d.key = 'fixture'
   and not exists (select 1 from public.teams t where t.department_id = d.id)
   and not exists (select 1 from public.positions p where p.department_id = d.id)
   and not exists (select 1 from public.management_seats s where s.department_id = d.id);
