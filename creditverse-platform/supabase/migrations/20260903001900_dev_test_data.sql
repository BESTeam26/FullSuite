-- =============================================================================
-- Development test data
--
-- Real database-backed records so the application can be driven through actual
-- Auth, RLS, permissions, entitlements and fulfillment engagements instead of
-- frontend placeholder arrays.
--
-- MARKED: every record's display name starts with `[TEST]`, every account uses
-- the reserved `@bes.test` domain, and every id begins `dddddddd-`. Nothing
-- here can be mistaken for a real record at a glance or in a query.
--
-- DETERMINISTIC: ids come from `dev_uuid('stable key')`, so a re-run updates
-- the same rows rather than creating a second set.
--
-- NON-DESTRUCTIVE: inserts and upserts only. There is no delete and no reset —
-- a seed that removes rows is one bad predicate away from destroying real work
-- (rule 11). To start over, drop the test rows by hand.
--
-- NO REAL PII: invented names, `@bes.test` addresses, 555 numbers, no SSNs, no
-- credentials.
--
-- REMOVE BEFORE PRODUCTION: this migration and `dev_seed_user`.
-- =============================================================================

/** Deterministic, obviously-development ids from a stable key. */
create or replace function public.dev_uuid(p_key text)
returns uuid language sql immutable set search_path = public as $$
  select ('dddddddd-0000-4000-8000-' || substr(md5(p_key), 1, 12))::uuid
$$;

do $seed$
declare
  v_agency  uuid;
  -- BES staff
  u_owner uuid; u_admin uuid; u_manager uuid; u_lead uuid;
  u_credit uuid; u_funding uuid; u_restricted uuid;
  -- Organization people
  o_admin uuid; o_manager uuid; o_lead uuid; o_agent uuid;
  o_brm uuid; o_other_admin uuid;
  -- Partners
  org_credit uuid; org_funding uuid; org_both uuid;
  org_saas uuid;   org_full uuid;    grp_outsourced uuid;
begin
  select id into v_agency from public.agencies order by created_at limit 1;
  if v_agency is null then
    raise exception 'No agency exists — run the tenancy migration first';
  end if;

  -- ---------------------------------------------------------------------------
  -- 1. BES Agency HQ staff, one per role the schema actually has
  -- ---------------------------------------------------------------------------
  u_owner      := public.dev_seed_user('bes.owner@bes.test',      'DevTest!2026', '[TEST] Ada Owner (BES Super Admin)');
  u_admin      := public.dev_seed_user('bes.admin@bes.test',      'DevTest!2026', '[TEST] Ben Admin (BES Agency Admin)');
  u_manager    := public.dev_seed_user('bes.manager@bes.test',    'DevTest!2026', '[TEST] Cora Manager (BES Manager)');
  u_lead       := public.dev_seed_user('bes.lead@bes.test',       'DevTest!2026', '[TEST] Dev Lead (BES Team Lead)');
  u_credit     := public.dev_seed_user('bes.credit@bes.test',     'DevTest!2026', '[TEST] Eli Credit (CreditOps Agent)');
  u_funding    := public.dev_seed_user('bes.funding@bes.test',    'DevTest!2026', '[TEST] Fay Funding (FundingOps Agent)');
  u_restricted := public.dev_seed_user('bes.restricted@bes.test', 'DevTest!2026', '[TEST] Gus Restricted (assigned-only)');

  insert into public.agency_memberships (id, user_id, agency_id, role) values
    (public.dev_uuid('am-owner'),      u_owner,      v_agency, 'agency_owner'),
    (public.dev_uuid('am-admin'),      u_admin,      v_agency, 'agency_admin'),
    (public.dev_uuid('am-manager'),    u_manager,    v_agency, 'agency_manager'),
    (public.dev_uuid('am-lead'),       u_lead,       v_agency, 'agency_team_lead'),
    (public.dev_uuid('am-credit'),     u_credit,     v_agency, 'agency_agent'),
    (public.dev_uuid('am-funding'),    u_funding,    v_agency, 'agency_agent'),
    (public.dev_uuid('am-restricted'), u_restricted, v_agency, 'agency_agent')
  on conflict (user_id, agency_id) do update set role = excluded.role;

  -- ---------------------------------------------------------------------------
  -- 2. Customer organizations, one per relationship shape
  -- ---------------------------------------------------------------------------
  org_credit  := public.dev_uuid('org-credit-only');
  org_funding := public.dev_uuid('org-funding-only');
  org_both    := public.dev_uuid('org-both-divisions');
  org_saas    := public.dev_uuid('org-saas-only');
  org_full    := public.dev_uuid('org-saas-plus-fulfillment');

  insert into public.organizations
    (id, agency_id, name, code, principal_name, principal_email, status,
     is_fulfillment_subscriber)
  values
    (org_credit,  v_agency, '[TEST] Northgate Credit Co',    'TSTNGC',
     '[TEST] Nia Northgate', 'nia@bes.test',   'Active', true),
    (org_funding, v_agency, '[TEST] Harbor Capital Group',   'TSTHCG',
     '[TEST] Hal Harbor',    'hal@bes.test',   'Active', true),
    (org_both,    v_agency, '[TEST] Cedar Financial',        'TSTCED',
     '[TEST] Cy Cedar',      'cy@bes.test',    'Active', true),
    (org_saas,    v_agency, '[TEST] Ironwood Self-Serve',    'TSTIRN',
     '[TEST] Iris Ironwood', 'iris@bes.test',  'Active', false),
    (org_full,    v_agency, '[TEST] Lakeside Partners',      'TSTLKS',
     '[TEST] Lena Lakeside', 'lena@bes.test',  'Active', true)
  on conflict (id) do update
    set name = excluded.name, status = excluded.status,
        is_fulfillment_subscriber = excluded.is_fulfillment_subscriber;

  -- Model 3: a BES partner with no SaaS tenant at all.
  grp_outsourced := public.dev_uuid('grp-outsourced');
  insert into public.outsourcing_groups
    (id, agency_id, name, partner_name, contact_email, contract_ref, status)
  values
    (grp_outsourced, v_agency, '[TEST] Summit Outsourcing (no SaaS)',
     '[TEST] Sam Summit', 'sam@bes.test', 'TEST-OS-001', 'Active')
  on conflict (id) do update set name = excluded.name, status = excluded.status;

  -- ---------------------------------------------------------------------------
  -- 3. Entitlements — what each organization bought as SOFTWARE
  -- ---------------------------------------------------------------------------
  insert into public.product_entitlements (organization_id, product, enabled) values
    (org_credit,  'creditOps',  true),  (org_credit,  'fundingOps', false),
    (org_funding, 'creditOps',  false), (org_funding, 'fundingOps', true),
    (org_both,    'creditOps',  true),  (org_both,    'fundingOps', true),
    (org_saas,    'creditOps',  true),  (org_saas,    'fundingOps', true),
    (org_full,    'creditOps',  true),  (org_full,    'fundingOps', true)
  on conflict (organization_id, product) do update set enabled = excluded.enabled;

  -- ---------------------------------------------------------------------------
  -- 4. Fulfillment engagements — what BES was separately HIRED to perform
  --
  -- Ironwood deliberately has none: a SaaS subscription is not a fulfillment
  -- authorization, and it is the account that proves BES cannot reach a
  -- self-serve customer's operational data.
  --
  -- Cedar is entitled to both divisions but engages BES for CreditOps only,
  -- which is the case a single boolean could never express.
  -- ---------------------------------------------------------------------------
  insert into public.fulfillment_engagements
    (id, agency_id, organization_id, outsourcing_group_id, service, status, effective_from)
  values
    (public.dev_uuid('eng-credit'),   v_agency, org_credit,  null, 'creditops',  'active', current_date - 90),
    (public.dev_uuid('eng-funding'),  v_agency, org_funding, null, 'fundingops', 'active', current_date - 60),
    (public.dev_uuid('eng-both'),     v_agency, org_both,    null, 'creditops',  'active', current_date - 45),
    (public.dev_uuid('eng-full-c'),   v_agency, org_full,    null, 'creditops',  'active', current_date - 120),
    (public.dev_uuid('eng-full-f'),   v_agency, org_full,    null, 'fundingops', 'active', current_date - 30),
    (public.dev_uuid('eng-outsrc'),   v_agency, null, grp_outsourced, 'creditops', 'active', current_date - 200)
  on conflict (id) do update
    set status = excluded.status, effective_from = excluded.effective_from;

  -- ---------------------------------------------------------------------------
  -- 5. Organization users
  --
  -- The schema has no `org_owner` and no org-level team-lead role, so "Owner"
  -- maps to `org_admin` and "Team Lead" to `org_manager` with a `team_scope`.
  -- Recorded rather than invented — see DEV_TEST_DATA.md.
  -- ---------------------------------------------------------------------------
  o_admin       := public.dev_seed_user('org.owner@bes.test',   'DevTest!2026', '[TEST] Olive Owner (Lakeside Owner/Admin)');
  o_manager     := public.dev_seed_user('org.manager@bes.test', 'DevTest!2026', '[TEST] Piper Manager (Lakeside Manager)');
  o_lead        := public.dev_seed_user('org.lead@bes.test',    'DevTest!2026', '[TEST] Quinn Lead (Lakeside Team Lead)');
  o_agent       := public.dev_seed_user('org.agent@bes.test',   'DevTest!2026', '[TEST] Rae Agent (Lakeside Processor)');
  o_brm         := public.dev_seed_user('org.brm@bes.test',     'DevTest!2026', '[TEST] Sol BRM (Lakeside Sales Partner)');
  o_other_admin := public.dev_seed_user('org2.owner@bes.test',  'DevTest!2026', '[TEST] Tess Other (Northgate Owner/Admin)');

  insert into public.org_memberships
    (id, user_id, organization_id, role, product, assigned_only, team_scope)
  values
    (public.dev_uuid('om-owner'),   o_admin,       org_full,   'org_admin',        'creditOps',  false, null),
    (public.dev_uuid('om-manager'), o_manager,     org_full,   'org_manager',      'creditOps',  false, null),
    (public.dev_uuid('om-lead'),    o_lead,        org_full,   'org_manager',      'creditOps',  false, 'Team Alpha'),
    (public.dev_uuid('om-agent'),   o_agent,       org_full,   'credit_processor', 'creditOps',  true,  'Team Alpha'),
    (public.dev_uuid('om-other'),   o_other_admin, org_credit, 'org_admin',        'creditOps',  false, null)
  on conflict (user_id, organization_id) do update
    set role = excluded.role, team_scope = excluded.team_scope,
        assigned_only = excluded.assigned_only;

  -- BRM / sales partner is an EXTERNAL relationship, not an org membership.
  insert into public.external_memberships (id, user_id, organization_id, role)
  values (public.dev_uuid('ext-brm'), o_brm, org_full, 'brm')
  on conflict (user_id, organization_id, role) do nothing;

  -- ---------------------------------------------------------------------------
  -- 6. CreditOps clients, spread across statuses and assignment
  -- ---------------------------------------------------------------------------
  insert into public.fulfillment_clients
    (id, agency_id, name, email, phone, mode, organization_id, outsourcing_group_id,
     auto_sync, status, round, assigned_agent_id, open_items, due_at, created_by)
  values
    (public.dev_uuid('fc-1'), v_agency, '[TEST] Alice Archer',  'alice.archer@bes.test',  '(555) 010-0001',
     'saas_pulled', org_credit, null, true,  'In Processing',     'Round 1', u_credit, 4, now() + interval '2 days',  u_owner),
    (public.dev_uuid('fc-2'), v_agency, '[TEST] Brian Blake',   'brian.blake@bes.test',   '(555) 010-0002',
     'saas_pulled', org_credit, null, true,  'Awaiting Response', 'Round 2', u_credit, 2, now() + interval '5 days',  u_owner),
    (public.dev_uuid('fc-3'), v_agency, '[TEST] Cleo Chan',     'cleo.chan@bes.test',     '(555) 010-0003',
     'saas_pulled', org_both,   null, true,  'Onboarding',        'Pre-Round', null,   0, now() + interval '7 days',  u_owner),
    (public.dev_uuid('fc-4'), v_agency, '[TEST] Dana Doyle',    'dana.doyle@bes.test',    '(555) 010-0004',
     'saas_pulled', org_full,   null, true,  'Ready for QA',      'Round 3', u_lead,   6, now() + interval '1 day',   u_owner),
    (public.dev_uuid('fc-5'), v_agency, '[TEST] Evan Ellis',    'evan.ellis@bes.test',    '(555) 010-0005',
     'saas_pulled', org_full,   null, true,  'Attention',         'Round 2', u_credit, 3, now() - interval '1 day',   u_owner),
    (public.dev_uuid('fc-6'), v_agency, '[TEST] Fern Fowler',   'fern.fowler@bes.test',   '(555) 010-0006',
     'outsourcing_only', null, grp_outsourced, false, 'In Processing', 'Round 1', u_credit, 5, now() + interval '3 days', u_owner),
    (public.dev_uuid('fc-7'), v_agency, '[TEST] Gil Grant',     'gil.grant@bes.test',     '(555) 010-0007',
     'outsourcing_only', null, grp_outsourced, false, 'Completed',     'Completed', null,  0, null,                     u_owner)
  on conflict (id) do update
    set status = excluded.status, round = excluded.round,
        assigned_agent_id = excluded.assigned_agent_id, open_items = excluded.open_items;

  -- Per-department progress for one file, so the workspace has real stages.
  insert into public.client_department_statuses (client_id, department, status, assignee_id)
  values
    (public.dev_uuid('fc-1'), 'Onboarding', 'Complete',    u_credit),
    (public.dev_uuid('fc-1'), 'Dispute',    'In Progress', u_credit),
    (public.dev_uuid('fc-1'), 'Support',    'Not Started', null)
  on conflict (client_id, department) do update
    set status = excluded.status, assignee_id = excluded.assignee_id;

  -- ---------------------------------------------------------------------------
  -- 7. FundingOps: clients, businesses, files, deals
  -- ---------------------------------------------------------------------------
  insert into public.funding_clients
    (id, agency_id, name, email, phone, mode, provenance, organization_id,
     outsourcing_group_id, auto_sync, status, assigned_agent_id, created_by)
  values
    (public.dev_uuid('fu-1'), v_agency, '[TEST] Harper Holdings', 'harper@bes.test', '(555) 020-0001',
     'saas_pulled', 'bes_saas_synced', org_funding, null, true, 'Lender Matching', u_funding, u_owner),
    (public.dev_uuid('fu-2'), v_agency, '[TEST] Ivy Industries',  'ivy@bes.test',    '(555) 020-0002',
     'saas_pulled', 'bes_saas_synced', org_funding, null, true, 'Stipulations',    u_funding, u_owner),
    (public.dev_uuid('fu-3'), v_agency, '[TEST] Juno Logistics',  'juno@bes.test',   '(555) 020-0003',
     'saas_pulled', 'agency_manual',   org_full,    null, false, 'Offer Received', null,      u_owner)
  on conflict (id) do update
    set status = excluded.status, assigned_agent_id = excluded.assigned_agent_id;

  insert into public.funding_businesses
    (id, client_id, legal_name, dba, industry, ein_last4, annual_revenue, time_in_business_months)
  values
    (public.dev_uuid('fb-1'), public.dev_uuid('fu-1'), '[TEST] Harper Holdings LLC', 'Harper Co', 'Construction', '0001', 1850000, 54),
    (public.dev_uuid('fb-2'), public.dev_uuid('fu-2'), '[TEST] Ivy Industries Inc',  null,        'Manufacturing','0002',  920000, 31),
    (public.dev_uuid('fb-3'), public.dev_uuid('fu-3'), '[TEST] Juno Logistics LLC',  'Juno Freight','Logistics',  '0003', 3400000, 88)
  on conflict (id) do update set legal_name = excluded.legal_name;

  insert into public.funding_files
    (id, agency_id, client_id, business_id, purpose, requested_amount, stage,
     assigned_agent_id, due_at, created_by)
  values
    (public.dev_uuid('ff-1'), v_agency, public.dev_uuid('fu-1'), public.dev_uuid('fb-1'),
     'Equipment purchase', 250000, 'Lender Matching', u_funding, now() + interval '4 days', u_owner),
    (public.dev_uuid('ff-2'), v_agency, public.dev_uuid('fu-2'), public.dev_uuid('fb-2'),
     'Working capital',    120000, 'Stipulations',    u_funding, now() + interval '2 days', u_owner),
    (public.dev_uuid('ff-3'), v_agency, public.dev_uuid('fu-3'), public.dev_uuid('fb-3'),
     'Fleet expansion',    500000, 'Offer Received',  null,      now() + interval '9 days', u_owner)
  on conflict (id) do update set stage = excluded.stage;

  insert into public.funding_deals
    (id, file_id, client_id, lender, program, amount, rate, term, status,
     stips_outstanding, submitted_at)
  values
    (public.dev_uuid('fd-1'), public.dev_uuid('ff-1'), public.dev_uuid('fu-1'),
     '[TEST] Redwood Capital', 'Term Loan', 250000, '12.5%', '36 mo', 'Submitted',      0, now() - interval '3 days'),
    (public.dev_uuid('fd-2'), public.dev_uuid('ff-2'), public.dev_uuid('fu-2'),
     '[TEST] Beacon Funding',  'MCA',       120000, '1.28 factor', '9 mo', 'Stipulations', 3, now() - interval '6 days'),
    (public.dev_uuid('fd-3'), public.dev_uuid('ff-3'), public.dev_uuid('fu-3'),
     '[TEST] Summit Lending',  'Equipment', 500000, '9.9%',  '60 mo', 'Offer Received', 1, now() - interval '10 days')
  on conflict (id) do update set status = excluded.status;

  -- ---------------------------------------------------------------------------
  -- 8. Work records
  -- ---------------------------------------------------------------------------
  insert into public.work_items
    (id, agency_id, scope, organization_id, subject_organization_id, related_type,
     title, description, stage, priority, assigned_to, due_at, created_by)
  values
    (public.dev_uuid('wi-1'), v_agency, 'ORGANIZATION', org_credit, null, 'fulfillment',
     '[TEST] Round 2 dispute prep', 'Prepare Round 2 letters for Northgate cohort.',
     'In Processing', 'High', u_credit, now() + interval '2 days', u_owner),
    (public.dev_uuid('wi-2'), v_agency, 'AGENCY', null, org_full, 'support',
     '[TEST] Partner onboarding call', 'Kickoff for Lakeside FundingOps engagement.',
     'Queued', 'Normal', u_manager, now() + interval '5 days', u_owner),
    (public.dev_uuid('wi-3'), v_agency, 'ORGANIZATION', org_both, null, 'credit_case',
     '[TEST] Bureau escalation', 'Escalate non-response to CFPB path.',
     'Blocked', 'Urgent', u_lead, now() - interval '1 day', u_owner)
  on conflict (id) do update set stage = excluded.stage, priority = excluded.priority;

  -- ---------------------------------------------------------------------------
  -- 9. Human notes at each visibility level
  --
  -- System events are written by the triggers above. These are the authored
  -- notes, one per audience, so the timeline can be exercised end to end.
  -- ---------------------------------------------------------------------------
  insert into public.activity_events
    (id, agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, visibility)
  overriding system value
  values
    (900001, v_agency, org_credit, 'fulfillment_client', public.dev_uuid('fc-1')::text,
     u_credit, '[TEST] Eli Credit (CreditOps Agent)', 'Comment posted',
     '[TEST] QA flagged two tradelines for re-verification before Round 2.', 'bes_internal'),
    (900002, v_agency, org_credit, 'fulfillment_client', public.dev_uuid('fc-1')::text,
     u_credit, '[TEST] Eli Credit (CreditOps Agent)', 'Comment posted',
     '[TEST] Round 1 responses received from all three bureaus.', 'shared_with_partner'),
    (900003, v_agency, org_credit, 'fulfillment_client', public.dev_uuid('fc-1')::text,
     u_credit, '[TEST] Eli Credit (CreditOps Agent)', 'Comment posted',
     '[TEST] Your Round 1 results are ready to review.', 'client_visible'),
    (900004, v_agency, org_full, 'fulfillment_client', public.dev_uuid('fc-4')::text,
     o_manager, '[TEST] Piper Manager (Lakeside Manager)', 'Comment posted',
     '[TEST] Internal: confirm client signed the updated agreement.', 'organization_internal')
  on conflict (id) do update set detail = excluded.detail, visibility = excluded.visibility;

  raise notice 'Development test data seeded for agency %', v_agency;
end
$seed$;
