-- =============================================================================
-- CreditOps fulfillment seed — mirrors src/lib/fulfillment/fulfillment-client-seed.ts
-- Idempotent. Run after seed.sql.
-- =============================================================================

insert into public.outsourcing_groups (id, agency_id, name, partner_name, contact_email, contract_ref, status)
values
  ('e0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
   'CRC Outsourcing — Q3 Cohort','CRC Outsourcing','ops@crcoutsourcing.com','CRC-2026-Q3','Active'),
  ('e0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001',
   'Metro Dispute Partners','Metro Dispute Partners','ops@metrodispute.com','MDP-2026-01','Active')
on conflict (id) do nothing;

-- SaaS-pulled clients belong to a sub-account; outsourcing-only clients to a group.
insert into public.fulfillment_clients
  (id, agency_id, name, email, phone, mode, organization_id, outsourcing_group_id,
   auto_sync, status, round, open_items, due_at)
values
  ('f0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
   'Maria Gonzalez','maria.g@gmail.com','(555) 000-0000','saas_pulled',
   'b0000000-0000-4000-8000-000000000001', null, true, 'In Processing','Round 2', 4, now() + interval '4 hours'),
  ('f0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001',
   'Anthony Ramos','aramos@outlook.com','(555) 555-0198','saas_pulled',
   'b0000000-0000-4000-8000-000000000001', null, true, 'Ready for QA','Round 1', 2, now() + interval '12 hours'),
  ('f0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001',
   'Tanya Brooks','tanya.brooks@gmail.com', null,'saas_pulled',
   'b0000000-0000-4000-8000-000000000004', null, true, 'In Processing','Round 1', 12, now() + interval '18 hours'),
  ('f0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001',
   'Lisa Chen','lisa.chen@gmail.com', null,'saas_pulled',
   'b0000000-0000-4000-8000-000000000004', null, true, 'Attention','Round 2', 1, now() + interval '2 hours'),
  ('f0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001',
   'James Whitaker','jwhitaker@gmail.com', null,'saas_pulled',
   'b0000000-0000-4000-8000-000000000002', null, true, 'Completed','Completed', 0, null),
  ('f0000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-000000000001',
   'Robert Kim','rkim@yahoo.com', null,'outsourcing_only',
   null,'e0000000-0000-4000-8000-000000000001', false, 'In Processing','Round 1', 8, now() + interval '20 hours'),
  ('f0000000-0000-4000-8000-000000000007','a0000000-0000-4000-8000-000000000001',
   'Patricia Doyle','patricia.doyle@gmail.com', null,'outsourcing_only',
   null,'e0000000-0000-4000-8000-000000000001', false, 'Ready for Processing','Pre-Round', 3, now() + interval '30 hours'),
  ('f0000000-0000-4000-8000-000000000008','a0000000-0000-4000-8000-000000000001',
   'Marcus Bell','m.bell@gmail.com', null,'outsourcing_only',
   null,'e0000000-0000-4000-8000-000000000001', false, 'Monitoring Issue','Round 1', 5, null),
  ('f0000000-0000-4000-8000-000000000009','a0000000-0000-4000-8000-000000000001',
   'Diana Reyes','diana.reyes@gmail.com', null,'outsourcing_only',
   null,'e0000000-0000-4000-8000-000000000002', false, 'Onboarding','Pre-Round', 0, null),
  ('f0000000-0000-4000-8000-00000000000a','a0000000-0000-4000-8000-000000000001',
   'Steven Park','steven.park@gmail.com', null,'outsourcing_only',
   null,'e0000000-0000-4000-8000-000000000002', false, 'Ready for Processing','Pre-Round', 0, now() + interval '36 hours')
on conflict (id) do nothing;

-- Every client starts with a row per department.
insert into public.client_department_statuses (client_id, department, status)
select c.id, d.department, d.status
from public.fulfillment_clients c
cross join (values
  ('Onboarding'::public.fulfillment_department, 'OB READY FOR R1'),
  ('Dispute',                                   'In Processing'),
  ('Support',                                   'SUPPORT NEW'),
  ('Complaints',                                'CM NOT NEEDED'),
  ('Bureau Calling',                            'BC NOT NEEDED')
) as d(department, status)
on conflict (client_id, department) do nothing;

-- The two default CRM endpoints, disabled until an operator configures them.
insert into public.webhook_endpoints (id, agency_id, name, type, enabled)
values
  ('d0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','GHL — CreditOps Pipeline','ghl', false),
  ('d0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','DisputeFox — Status Sync','disputefox', false)
on conflict (id) do nothing;
