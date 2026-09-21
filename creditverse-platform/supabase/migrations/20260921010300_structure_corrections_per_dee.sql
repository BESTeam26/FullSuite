-- Dee's two corrections before the structure clean-up is closed (2026-09-21).
--
-- 1. MANAGEMENT ACCESS COMES FROM PLACEMENT, NOT MEMBERSHIP.
--    Allyssa and Daniel were ordinary members of all three CreditOps teams —
--    memberships minted to give them visibility. Visibility is the seat's job
--    (AD-008: placement is scope). Each keeps ONE operational team as its
--    lead; their reach over the other departments is their department_manager
--    seat, which already exists. Complaints & Mailing keeps its agents and is
--    managed by Daniel through his seat, not by a fake membership.
--
-- 2. ONBOARDING IS A WORKFLOW STAGE, NOT A DEPARTMENT.
--    "New Client Onboarded → Client Success → Client Success Team" and
--    "Incomplete Onboarding → Client Success → Client Success Team". The
--    Onboarding department is archived and is not to be recreated because
--    these statuses exist. The five client files still parked in the
--    Onboarding queue move to Client Success so somebody actually sees them.
--
-- Also here, from the same message: the two management channels take the
-- names of the teams they mirror (they remain conversations, never an
-- authorization source), and BES CRM's one department stops being called
-- "Automation" — Automation is a kind of work, and the team's differences
-- live in Positions.

-- ── 1. Memberships and seats ─────────────────────────────────────────────
delete from public.team_memberships m
 using public.teams t, public.profiles p
 where m.team_id = t.id and m.user_id = p.id
   and p.email = 'alyssamores.bes@gmail.com'
   and t.name in ('CreditOps Dispute Processing Team', 'CreditOps Complaints & Mailing Team');

delete from public.team_memberships m
 using public.teams t, public.profiles p
 where m.team_id = t.id and m.user_id = p.id
   and p.email = 'dmacasiab.bes@gmail.com'
   and t.name in ('CreditOps Client Success / Support Team', 'CreditOps Complaints & Mailing Team');

/* Leads of their own teams — already true, stated so it cannot drift. */
update public.team_memberships m set is_lead = true
  from public.teams t, public.profiles p
 where m.team_id = t.id and m.user_id = p.id
   and ((p.email = 'alyssamores.bes@gmail.com' and t.name = 'CreditOps Client Success / Support Team')
     or (p.email = 'dmacasiab.bes@gmail.com'   and t.name = 'CreditOps Dispute Processing Team'));

/* A seat on an archived department ends; seats are dated, never deleted. */
update public.management_seats s set effective_to = current_date
  from public.departments d
 where d.id = s.department_id and d.archived_at is not null and s.effective_to is null;

-- ── 2. Routing: both onboarding statuses go to Client Success ────────────
update public.creditops_status_routing
   set department = 'Support', kind = 'actionable', entry_status = 'SUPPORT NEW',
       note = 'Onboarding is a workflow stage, not a department (Dee, 2026-09-21): Client Success takes the new client.'
 where status::text in ('New Client', 'NEW ONBOARDING', 'Onboarding');

update public.creditops_status_routing
   set department = 'Support', kind = 'actionable', entry_status = 'ONBOARDING FOLLOWUP',
       note = 'Onboarding is a workflow stage, not a department (Dee, 2026-09-21): Client Success follows up.'
 where status::text in ('Incomplete Onboarding', 'INCOMPLETE ONBOARDING');

/* The files already parked in the Onboarding queue. Each moves to Client
   Success at the matching entry status, unassigned so the team's fair
   distribution picks it up; where the client already has a Client Success
   record, the Onboarding one is simply closed. Completed rows are history and
   stay as they are. */
update public.client_department_statuses cds
   set department = 'Support',
       status = case cds.status when 'OB INCOMPLETE' then 'ONBOARDING FOLLOWUP' else 'SUPPORT NEW' end,
       assignee_id = null, assignment_method = null, assigned_at = null,
       updated_at = now()
 where cds.department = 'Onboarding'
   and cds.status in ('OB NOT STARTED', 'OB IN REVIEW', 'OB INCOMPLETE')
   and not exists (select 1 from public.client_department_statuses s
                    where s.client_id = cds.client_id and s.department = 'Support');

update public.client_department_statuses cds
   set status = 'Complete', updated_at = now()
 where cds.department = 'Onboarding'
   and cds.status in ('OB NOT STARTED', 'OB IN REVIEW', 'OB INCOMPLETE');

-- ── 3. Channels named after the teams they mirror ────────────────────────
update public.channels set name = 'Management Team' where id = '45dd8313-548b-4bd4-b94e-d22fd74ab6a8';
update public.channels set name = 'Admin Team'      where id = '8828953a-2277-4770-96db-a345b6503163';

-- ── 4. BES CRM: one neutral department, differences in Positions ─────────
update public.departments
   set name = 'CRM Operations',
       description = 'The one BES CRM team. Roles differ by position, not by department.'
 where division = 'bes_crm' and key = 'ghl_crm_ops' and archived_at is null;

update public.positions set title = 'CRM Team Lead'
 where title = 'Operations Manager / Team Lead'
   and department_id = (select id from public.departments where division = 'bes_crm' and key = 'ghl_crm_ops');

update public.positions p
   set department_id = (select id from public.departments where division = 'bes_crm' and key = 'ghl_crm_ops')
 where p.title = 'Website & Funnel Specialist' and p.archived_at is null;

update public.positions set archived_at = now()
 where title = 'CRM Support Specialist' and archived_at is null;
