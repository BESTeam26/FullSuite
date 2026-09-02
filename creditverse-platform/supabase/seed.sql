-- =============================================================================
-- Development seed — mirrors src/lib/bes-seed-data.ts so live mode looks like
-- demo mode on first run. Idempotent. Does NOT create auth users: sign up in the
-- app first, then run:
--   select public.bootstrap_agency_owner('you@example.com');
-- (from the Supabase SQL editor, which runs as service role).
-- =============================================================================

insert into public.agencies (id, name, slug, branding) values
  ('a0000000-0000-4000-8000-000000000001', 'Blessed Empire Services', 'bes',
   '{"primaryColor":"#EBAA15","tagline":"Credit + Funding Operations. One Connected Platform."}')
on conflict (slug) do nothing;

insert into public.organizations
  (id, agency_id, name, code, principal_name, principal_email, address, status, is_fulfillment_subscriber, branding, joined_at)
values
  ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','Apex Credit Co.','APEX','Alex Rivera','alex@apexcredit.com','100 Wilshire Blvd, Ste 400, Los Angeles, CA','Active',true,
   '{"customDomain":"portal.apexcredit.com","companyTagline":"Premier Credit Restoration & Funding"}','2026-01-15'),
  ('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','Pioneer Credit Solutions','PIONEER','Sarah Jenkins','sarah@pioneercredit.com','30 North Gould Street, Ste N, Sheridan, WY','Active',true,'{}','2026-02-01'),
  ('b0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','Vantage Funding Group','VANTAGE','Marcus Vance','marcus@vantagefunding.com','15720 Brixham Hill Ave, Charlotte, NC','Active',false,'{}','2026-02-10'),
  ('b0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001','CreditFix Solutions','FIX','Derrick Hall','derrick@creditfix.com','444 Alaska Ave Ste #BAN433, Torrance, CA','Active',true,'{}','2025-12-04'),
  ('b0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001','Empire Capital & Credit','EMPIRE','Chloe Sterling','chloe@empirecap.com','6081 Hamilton Blvd, Ste 600, Allentown, PA','Pending Onboarding',false,'{}','2026-08-20')
on conflict (agency_id, code) do nothing;

insert into public.businesses (id, organization_id, name, legal_name, industry, time_in_business_months, monthly_revenue) values
  ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','Apex Credit Co.','Apex Credit Co. LLC','Financial Services',48,8450),
  ('c0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002','Pioneer Credit Solutions','Pioneer Credit Solutions LLC','Credit Services',30,4900),
  ('c0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000003','Vantage Funding Group','Vantage Funding Group LLC','Business Funding',22,3800),
  ('c0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000004','CreditFix Solutions','CreditFix Solutions Inc.','Credit Services',60,12600),
  ('c0000000-0000-4000-8000-000000000005','b0000000-0000-4000-8000-000000000005','Empire Capital & Credit','Empire Capital & Credit LLC','Credit Services',6,1900)
on conflict (id) do nothing;

-- Entitlements: every org gets all five rows so toggles are simple upserts.
insert into public.product_entitlements (organization_id, product, enabled)
select o.id, p.product, false
from public.organizations o
cross join (values ('creditOps'::public.product_key),('fundingOps'),('diyCredit'),('oi'),('crm')) as p(product)
on conflict (organization_id, product) do nothing;

update public.product_entitlements set enabled = true where (organization_id, product::text) in (
  ('b0000000-0000-4000-8000-000000000001','creditOps'),('b0000000-0000-4000-8000-000000000001','fundingOps'),
  ('b0000000-0000-4000-8000-000000000001','diyCredit'),('b0000000-0000-4000-8000-000000000001','oi'),('b0000000-0000-4000-8000-000000000001','crm'),
  ('b0000000-0000-4000-8000-000000000002','creditOps'),('b0000000-0000-4000-8000-000000000002','diyCredit'),
  ('b0000000-0000-4000-8000-000000000003','fundingOps'),('b0000000-0000-4000-8000-000000000003','crm'),
  ('b0000000-0000-4000-8000-000000000004','creditOps'),('b0000000-0000-4000-8000-000000000004','fundingOps'),
  ('b0000000-0000-4000-8000-000000000004','diyCredit'),('b0000000-0000-4000-8000-000000000004','oi'),('b0000000-0000-4000-8000-000000000004','crm'),
  ('b0000000-0000-4000-8000-000000000005','creditOps'),('b0000000-0000-4000-8000-000000000005','diyCredit')
);

-- -----------------------------------------------------------------------------
-- Work engine sample data (migration 0002). Unassigned: claim them in the app,
-- or assign with
--   update public.work_items set assigned_to =
--     (select id from public.profiles where email = 'you@example.com');
-- -----------------------------------------------------------------------------
insert into public.work_items
  (id, scope, organization_id, subject_organization_id, related_type, related_ref, title, stage, priority, due_at)
values
  -- AGENCY scope: BES done-for-you fulfillment for subscribers
  ('d0000000-0000-4000-8000-000000000001','AGENCY',null,'b0000000-0000-4000-8000-000000000001','fulfillment','CR-2041','Round 2 Escalation — Maria Gonzalez','In Processing','Urgent', now() + interval '4 hours'),
  ('d0000000-0000-4000-8000-000000000002','AGENCY',null,'b0000000-0000-4000-8000-000000000001','fulfillment','CR-2043','CFPB Complaint — Anthony Ramos','Ready for QA','High', now() + interval '2 hours'),
  ('d0000000-0000-4000-8000-000000000003','AGENCY',null,'b0000000-0000-4000-8000-000000000004','fulfillment','CR-2044','Experian Manual Upload — Tanya Brooks','Blocked','High', now() - interval '3 hours'),
  ('d0000000-0000-4000-8000-000000000004','AGENCY',null,'b0000000-0000-4000-8000-000000000002','support','SUP-118','Onboarding follow-up — Pioneer Credit','Queued','Normal', now() + interval '2 days'),
  -- ORGANIZATION scope: a customer org's own self-managed work
  ('d0000000-0000-4000-8000-000000000005','ORGANIZATION','b0000000-0000-4000-8000-000000000001',null,'credit_case','CR-2101','Round 1 Processing — Tanya Brooks','In Processing','Normal', now() + interval '12 hours'),
  ('d0000000-0000-4000-8000-000000000006','ORGANIZATION','b0000000-0000-4000-8000-000000000003',null,'funding_deal','FD-2001','Document Review — Vantage Deal','Queued','Normal', now() + interval '36 hours'),
  ('d0000000-0000-4000-8000-000000000007','ORGANIZATION','b0000000-0000-4000-8000-000000000004',null,'project','PRJ-101','GHL CRM Build — CreditFix','Attention','High', now() + interval '1 day')
on conflict (id) do nothing;
