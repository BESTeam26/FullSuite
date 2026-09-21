-- Dee, 2026-09-21: "DELETE ALL DUPLICATES."
--
-- The five archived department rows below are the duplicates left by
-- earlier rebuilds of the CreditOps and BES CRM structure. After
-- 20260921010000 nothing points at them — no team, no position, no
-- membership, no management seat, no child department — so removing them
-- erases no history. Listed by id on purpose: the scope of a delete should
-- be readable, not inferred. Each row is guarded again here; a row that has
-- gained a reference since is left alone rather than forced out.
--
--   b642f9f4  Automation Department      bes_crm    (archived 2026-09-21)
--   c4cb3d5e  Client Success             creditops  (archived 2026-09-12)
--   fe7e15ba  Client Success Department  creditops  (archived 2026-09-21)
--   f4d83e39  CRM Support                bes_crm    (archived 2026-09-19)
--   58890864  Dispute Department         creditops  (archived 2026-09-21)
--
-- Team Ally and Team Daniel are NOT removed: work items, partner assignments
-- and clients still record them. They stay archived and out of every list.

delete from public.departments d
 where d.id in (
   'b642f9f4-2f27-4a0f-a11f-06dbe21b9291',
   'c4cb3d5e-eb8a-4642-a3fe-d410f903878a',
   'fe7e15ba-b94b-44de-b9e5-a0c782da79da',
   'f4d83e39-a4b2-4070-a171-8402bac67b3b',
   '58890864-9df7-4f82-b604-df812b7ebdc1')
   and d.archived_at is not null
   and not exists (select 1 from public.departments c where c.parent_department_id = d.id)
   and not exists (select 1 from public.teams t where t.department_id = d.id)
   and not exists (select 1 from public.positions p where p.department_id = d.id)
   and not exists (select 1 from public.agency_memberships m where m.primary_department_id = d.id)
   and not exists (select 1 from public.management_seats s where s.department_id = d.id);
