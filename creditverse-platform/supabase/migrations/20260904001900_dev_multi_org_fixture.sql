-- Dev fixture (REMOVE BEFORE PRODUCTION, like dev_test_data): one person who is
-- a member of TWO organizations with different entitlements, so organization
-- switching can be exercised with a legitimate identity rather than a dual
-- BES-staff + member account. Lakeside: manager (CreditOps, FundingOps,
-- Workspaces, CRM). Northgate: admin (CreditOps only).
do $$
declare v uuid;
begin
  v := public.dev_seed_user('org.multi@bes.test', 'DevTest!2026', '[TEST] Morgan Multi (Owner of two organizations)');
  insert into public.org_memberships (organization_id, user_id, role) values
    ('dddddddd-0000-4000-8000-80ce8814eb05', v, 'org_manager'),
    ('dddddddd-0000-4000-8000-3f3028d6b8f3', v, 'org_admin')
  on conflict do nothing;
end $$;
