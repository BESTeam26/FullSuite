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
