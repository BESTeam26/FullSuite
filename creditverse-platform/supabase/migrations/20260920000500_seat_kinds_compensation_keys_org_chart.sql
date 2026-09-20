-- Dee, 2026-09-20 — three locks.
--
-- 1. Compensation keys are explicit and owner-gated, like payroll:
--    compensation.agent_rate.view · compensation.bes_cost.view ·
--    compensation.arrangement.manage. The two generic keys from 000200 are
--    renamed in place (registry, grants, staged invitations).
-- 2. Seats gain two corporate kinds — managing_partner, executive_assistant.
--    They PLACE a person on the org chart; they grant no record scope (the
--    scope helpers never read them) and no money (capabilities do).
-- 3. The org chart Dee drew: FundingOps is a top-level division; BES CRM's
--    departments are Automation and Website & Funnel Design; TalentOps runs
--    Sales, Marketing, Customer Service and Talent Sourcing; CreditOps'
--    Onboarding keeps its own name (it is a queue). Structure rows only.

-- ── 1. Compensation keys (grants reference the registry by key, so: add the
--       explicit keys, re-point every grant and staged grant, then retire the
--       two generic ones)
insert into public.permission_keys (key, module, label, description, security_relevant, sort, owner_gated)
values
  ('compensation.agent_rate.view', 'payroll', 'View agent compensation rates',
   'See what a worker earns: agent compensation rates and payment statements. Explicit grant only; never implied by admin, placement or payroll.view.', true,
   (select coalesce(max(sort), 0) + 1 from public.permission_keys where module = 'payroll'), true),
  ('compensation.bes_cost.view', 'payroll', 'View BES cost and partner margin',
   'See BES workforce cost rates, managing-partner margins and settlements. Explicit grant only; never implied by admin or placement.', true,
   (select coalesce(max(sort), 0) + 2 from public.permission_keys where module = 'payroll'), true),
  ('compensation.arrangement.manage', 'payroll', 'Manage compensation arrangements',
   'Create and end compensation arrangements with a reason. Explicit grant only.', true,
   (select coalesce(max(sort), 0) + 3 from public.permission_keys where module = 'payroll'), true)
on conflict (key) do update set owner_gated = true, label = excluded.label, description = excluded.description;

insert into public.agency_member_permissions (membership_id, key, allowed)
select membership_id, k, allowed from public.agency_member_permissions, unnest(array['compensation.agent_rate.view','compensation.bes_cost.view']) as k where key = 'compensation.view'
on conflict (membership_id, key) do update set allowed = excluded.allowed;
insert into public.agency_member_permissions (membership_id, key, allowed)
select membership_id, 'compensation.arrangement.manage', allowed from public.agency_member_permissions where key = 'compensation.manage'
on conflict (membership_id, key) do update set allowed = excluded.allowed;
delete from public.agency_member_permissions where key in ('compensation.view', 'compensation.manage');
delete from public.permission_keys where key in ('compensation.view', 'compensation.manage');

update public.invitation_onboarding
   set payload = jsonb_set(payload, '{grants}', (
     select coalesce(jsonb_agg(distinct g2), '[]'::jsonb) from (
       select case g when 'compensation.view' then 'compensation.agent_rate.view' when 'compensation.manage' then 'compensation.arrangement.manage' else g end as g2
         from jsonb_array_elements_text(payload->'grants') g
       union select 'compensation.bes_cost.view' where payload->'grants' ? 'compensation.view') x))
 where payload ? 'grants' and (payload->'grants' ? 'compensation.view' or payload->'grants' ? 'compensation.manage');

-- ── 2. Corporate seat kinds
alter table public.management_seats drop constraint if exists management_seats_seat_check;
alter table public.management_seats add constraint management_seats_seat_check
  check (seat in ('chief_operations', 'division_manager', 'department_manager', 'managing_partner', 'executive_assistant'));
comment on table public.management_seats is
  'Where a person sits in management. chief_operations / division_manager / department_manager grant operational SCOPE through the placement helpers; managing_partner and executive_assistant are corporate seats that place a person on the org chart and grant nothing — capabilities do. Team Lead stays team_memberships.is_lead.';

insert into public.management_seats (agency_id, user_id, seat, effective_from, reason, created_by)
select m.agency_id, p.id, 'managing_partner', coalesce(m.hired_on, current_date), 'Dee''s org chart, 2026-09-20', (select id from public.profiles where email = 'dee@blessedempireservices.com')
  from public.profiles p join public.agency_memberships m on m.user_id = p.id where p.email = 'lordvrye.bes@gmail.com'
   and not exists (select 1 from public.management_seats s where s.user_id = p.id and s.seat = 'managing_partner' and s.effective_to is null);
insert into public.management_seats (agency_id, user_id, seat, effective_from, reason, created_by)
select m.agency_id, p.id, 'executive_assistant', coalesce(m.hired_on, current_date), 'Dee''s org chart, 2026-09-20', (select id from public.profiles where email = 'dee@blessedempireservices.com')
  from public.profiles p join public.agency_memberships m on m.user_id = p.id where p.email = 'navalesjorelynmae.bes@gmail.com'
   and not exists (select 1 from public.management_seats s where s.user_id = p.id and s.seat = 'executive_assistant' and s.effective_to is null);

-- ── 3. The org chart
update public.divisions set parent_division_id = null where service = 'fundingops' and parent_division_id is not null;
update public.departments set name = 'Onboarding' where name = 'Support & Onboarding' and division = 'creditops' and archived_at is null;
update public.departments set name = 'Automation' where name = 'GHL / CRM Operations' and division = 'bes_crm' and archived_at is null;
update public.departments set name = 'Website & Funnel Design', archived_at = null where name = 'Websites / Funnels' and division = 'bes_crm';
update public.departments set name = 'Customer Service' where name = 'Dedicated Support' and division = 'talentops' and archived_at is null;
update public.departments set name = 'Talent Sourcing' where name = 'Recruitment' and division = 'talentops' and archived_at is null;
insert into public.departments (agency_id, division, division_id, key, name, description)
select dv.agency_id, 'talentops', dv.id, 'marketing', 'Marketing', 'Social media & content, graphic design, branding, campaign management, community'
  from public.divisions dv where dv.service = 'talentops' and dv.archived_at is null
   and not exists (select 1 from public.departments d where d.division_id = dv.id and d.name = 'Marketing');
/* Functions the chart lists under Sales and Talent Sourcing that exist today as empty departments become part of those departments. */
update public.departments set archived_at = now() where division = 'talentops' and archived_at is null and name in ('Appointment Setting', 'Training & Development')
   and not exists (select 1 from public.teams t where t.department_id = departments.id and t.archived_at is null);
insert into public.departments (agency_id, division, division_id, key, name, description)
select dv.agency_id, 'fundingops', dv.id, x.key, x.name, x.descr
  from public.divisions dv, (values ('funding_processing', 'Processing', 'Funding processors, application review, document preparation, lender coordination, status tracking'),
                                     ('funding_support', 'Support', 'Client support, file follow up, lender communication, issue resolution, administrative support')) as x(key, name, descr)
 where dv.service = 'fundingops' and dv.archived_at is null
   and not exists (select 1 from public.departments d where d.division_id = dv.id and d.name = x.name);
