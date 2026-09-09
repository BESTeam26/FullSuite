----------------------------------------------------------------------
-- 0231  The eight draft engines get their build standard and go live.
--
-- 0224 published the five engines Dee's brief worked through in detail and
-- left the other eight as empty drafts, because a guessed standard is worse
-- than none. The workbook is now in `crm_requirements` (0228, 0230), so each
-- draft's units and actions below come from ITS OWN rows of the tracker —
-- the action labels are the tracker's task titles, near verbatim, and the
-- provenance flips to 'master_tracker' to say so.
--
-- WHERE THE OPTIONAL ITEMS WENT
--
-- Instantiation creates every unit of a purchased engine (0223), so a scope
-- item the partner may not have bought must not be a unit — it would appear
-- in every project and need cancelling. The workbook's "if included" rows
-- are therefore CHECKLIST ACTIONS inside a covering unit: "Connected
-- Integrations" is always real work, and which integrations it covers is
-- decided per project by ticking only what is in scope (§11 applied at the
-- action level).
--
-- `requires_qa` is set where getting it wrong bills somebody, texts somebody
-- who opted out, or moves client data: billing authorization, the STOP/DNC
-- and HELP handlers, connected integrations, campaigns, and the portal.
--
-- Idempotent, same guards as 0224: every insert checks for its own row.
----------------------------------------------------------------------

do $seed$
declare
  v_agency uuid;
begin
  select id into v_agency from public.agencies order by created_at limit 1;
  if v_agency is null then return; end if;

  ------------------------------------------------------------------
  -- Units
  ------------------------------------------------------------------
  insert into public.crm_work_unit_templates (template_id, title, sort, target_days, requires_qa, description)
  select t.id, x.title, x.sort, x.target_days, x.requires_qa, x.descr
    from (values
      -- COMMUNICATION ENGINE
      ('communication', 'Email Foundation',          10,  3, false, 'The branded sending domain, authenticated, with the warm-up rules written down.'),
      ('communication', 'Phone & SMS Setup',         20,  5, false, 'The number, baseline call routing, and carrier registration where required.'),
      ('communication', 'Call Handling',             30,  8, false, 'What happens when a call arrives, and when it is missed.'),
      ('communication', 'SMS Compliance Handlers',   40,  8, true,  'STOP, DNC and HELP. QA required: a mishandled opt-out is a legal exposure, not a bug.'),
      ('communication', 'Web Chat',                  50, 10, false, 'The site chat widget and where its conversations route.'),
      ('communication', 'Communication QA',          60, 12, false, 'Phone, SMS and email proven end to end before launch depends on them.'),
      -- BILLING / PAYMENT ENGINE
      ('billing', 'Products & Invoicing',            10,  3, false, 'Products and invoice templates, where the scope includes them.'),
      ('billing', 'Billing Authorization',           20,  5, true,  'The manual authorization trigger. QA required: nothing may charge without a recorded yes.'),
      ('billing', 'Payment Failure Handling',        30,  7, false, 'Failed payment and billing hold workflows — what stops, who is told.'),
      ('billing', 'Billing QA',                      40,  9, false, 'A test charge, a test failure, and the paper trail both leave.'),
      -- INTEGRATION ENGINE
      ('integration', 'Integration Scope & Access',  10,  2, false, 'Which external systems are in scope for this partner, and the access each needs.'),
      ('integration', 'Connected Integrations',      20,  8, true,  'The connections themselves. QA required: an integration moves client data.'),
      ('integration', 'Integration QA',              30, 10, false, 'Each connected system exercised with a real record.'),
      -- MARKETING / REPUTATION / AI
      ('marketing_ai', 'Marketing Campaigns',        10,  6, true,  'Lead nurture campaigns. QA required: marketing copy in a regulated space is reviewed for risk before it sends.'),
      ('marketing_ai', 'Reputation',                 20,  6, false, 'The review request workflow.'),
      ('marketing_ai', 'Social & AI Channels',       30,  8, false, 'The channels this partner actually uses — connected, not assumed.'),
      ('marketing_ai', 'Marketing QA',               40, 10, false, 'Campaigns fire once, channels post where they should, the AI stays inside its guardrails.'),
      -- REPORTING / TRACKING ENGINE
      ('reporting', 'Tracking Foundation',           10,  4, false, 'Analytics, pixels where included, and UTM capture — the data the dashboards will stand on.'),
      ('reporting', 'Reporting Dashboards',          20,  7, false, 'The dashboards themselves, built on captured data rather than hope.'),
      ('reporting', 'Reporting QA',                  30,  9, false, 'A known event appears in the right numbers.'),
      -- PORTAL / MEMBERSHIP ENGINE
      ('portal_membership', 'Portal Scope & Content',   10,  3, false, 'What is included — portal, membership, digital products — and the content each needs from the client.'),
      ('portal_membership', 'Portal / Membership Build',20, 10, true,  'The build. QA required: this is the surface the partner''s own clients touch.'),
      ('portal_membership', 'Portal QA',                30, 12, false, 'Sign in as a test client and use everything that was built.'),
      -- CLIENT ONBOARDING / SUPPORT
      ('onboarding_support', 'Support & Risk Pipeline', 10,  4, false, 'The pipeline that catches trouble after go-live.'),
      ('onboarding_support', 'Training Materials',      20,  8, false, 'Owner/admin training and team-role training, prepared for THIS build.'),
      ('onboarding_support', 'Training Delivery',       30, 10, false, 'The sessions themselves, where scheduled.'),
      -- SUPPORT / OPTIMIZATION
      ('support_optimization', 'Journey Review',        10,  5, false, 'Walk the lead-to-client journey as a client would.'),
      ('support_optimization', 'Optimization Pass',     20,  8, false, 'Timing, clarity, and the tag/field cleanup that keeps the system legible.'),
      ('support_optimization', 'SOP & System Overview', 30, 10, false, 'The overview the partner''s team runs the system from.'),
      ('support_optimization', 'Support Setup',         40, 12, false, 'The support tracker and the boundaries of what support covers.')
    ) as x(engine, title, sort, target_days, requires_qa, descr)
    join public.crm_engine_templates t
      on t.agency_id = v_agency and t.engine_key = x.engine and t.version = 1
   where not exists (
     select 1 from public.crm_work_unit_templates u
      where u.template_id = t.id and u.title = x.title);

  ------------------------------------------------------------------
  -- Dependencies, within each engine
  ------------------------------------------------------------------
  insert into public.crm_work_unit_template_deps (work_unit_template_id, depends_on_id)
  select u.id, d.id
    from (values
      ('communication', 'Call Handling',            'Phone & SMS Setup'),
      ('communication', 'SMS Compliance Handlers',  'Phone & SMS Setup'),
      ('communication', 'Communication QA',         'Email Foundation'),
      ('communication', 'Communication QA',         'Call Handling'),
      ('communication', 'Communication QA',         'SMS Compliance Handlers'),
      ('communication', 'Communication QA',         'Web Chat'),
      ('billing', 'Payment Failure Handling',       'Products & Invoicing'),
      ('billing', 'Billing QA',                     'Billing Authorization'),
      ('billing', 'Billing QA',                     'Payment Failure Handling'),
      ('integration', 'Connected Integrations',     'Integration Scope & Access'),
      ('integration', 'Integration QA',             'Connected Integrations'),
      ('marketing_ai', 'Marketing QA',              'Marketing Campaigns'),
      ('marketing_ai', 'Marketing QA',              'Social & AI Channels'),
      ('reporting', 'Reporting Dashboards',         'Tracking Foundation'),
      ('reporting', 'Reporting QA',                 'Reporting Dashboards'),
      ('portal_membership', 'Portal / Membership Build', 'Portal Scope & Content'),
      ('portal_membership', 'Portal QA',            'Portal / Membership Build'),
      ('onboarding_support', 'Training Delivery',   'Training Materials'),
      ('support_optimization', 'Optimization Pass', 'Journey Review')
    ) as x(engine, unit, needs)
    join public.crm_engine_templates t
      on t.agency_id = v_agency and t.engine_key = x.engine and t.version = 1
    join public.crm_work_unit_templates u on u.template_id = t.id and u.title = x.unit
    join public.crm_work_unit_templates d on d.template_id = t.id and d.title = x.needs
   where not exists (
     select 1 from public.crm_work_unit_template_deps p
      where p.work_unit_template_id = u.id and p.depends_on_id = d.id);

  ------------------------------------------------------------------
  -- Actions: the tracker's own tasks, near verbatim.
  -- "(if included)" marks scope decided per project — §11 at action level.
  ------------------------------------------------------------------
  insert into public.crm_work_unit_template_actions (work_unit_template_id, kind, label, sort)
  select u.id, x.kind, x.label, x.sort
    from (values
      ('communication', 'Email Foundation', 'checklist', 'Connect branded email domain', 10),
      ('communication', 'Email Foundation', 'checklist', 'Configure sending domain authentication', 20),
      ('communication', 'Email Foundation', 'checklist', 'Document email warm-up rules', 30),
      ('communication', 'Email Foundation', 'acceptance', 'Mail from the branded domain passes authentication.', 40),
      ('communication', 'Phone & SMS Setup', 'checklist', 'Purchase/connect phone number', 10),
      ('communication', 'Phone & SMS Setup', 'checklist', 'Configure call routing baseline', 20),
      ('communication', 'Phone & SMS Setup', 'checklist', 'Submit A2P/TFN registration (where required)', 30),
      ('communication', 'Call Handling', 'checklist', 'Build inbound call workflow', 10),
      ('communication', 'Call Handling', 'checklist', 'Build missed call workflow', 20),
      ('communication', 'SMS Compliance Handlers', 'checklist', 'Build STOP/DNC handler', 10),
      ('communication', 'SMS Compliance Handlers', 'checklist', 'Build HELP response', 20),
      ('communication', 'SMS Compliance Handlers', 'acceptance', 'A STOP reply suppresses every future SMS to that number.', 30),
      ('communication', 'Web Chat', 'checklist', 'Create and embed web chat widget', 10),
      ('communication', 'Web Chat', 'checklist', 'Build chat routing workflows', 20),
      ('communication', 'Communication QA', 'qa', 'Test phone and SMS end to end', 10),
      ('communication', 'Communication QA', 'qa', 'Test email sending and delivery', 20),

      ('billing', 'Products & Invoicing', 'checklist', 'Create products/invoice templates (if included)', 10),
      ('billing', 'Billing Authorization', 'checklist', 'Build manual billing authorization trigger', 10),
      ('billing', 'Billing Authorization', 'acceptance', 'No charge fires without a recorded manual authorization.', 20),
      ('billing', 'Payment Failure Handling', 'checklist', 'Build failed payment workflow', 10),
      ('billing', 'Payment Failure Handling', 'checklist', 'Build billing hold workflow', 20),
      ('billing', 'Billing QA', 'qa', 'A test payment succeeds and is recorded', 10),
      ('billing', 'Billing QA', 'qa', 'A test failure holds billing and tells the right person', 20),

      ('integration', 'Integration Scope & Access', 'checklist', 'Confirm which integrations are in scope', 10),
      ('integration', 'Integration Scope & Access', 'client_requirement', 'Provide access for each in-scope integration', 20),
      ('integration', 'Connected Integrations', 'checklist', 'Build Zapier/Pabbly integrations (if included)', 10),
      ('integration', 'Connected Integrations', 'checklist', 'Build DisputeFox data flow (if included)', 20),
      ('integration', 'Connected Integrations', 'checklist', 'Build Google Sheets/Drive storage flows', 30),
      ('integration', 'Connected Integrations', 'checklist', 'Build Slack/team alerts (if included)', 40),
      ('integration', 'Connected Integrations', 'checklist', 'Build ManyChat connection (if included)', 50),
      ('integration', 'Integration QA', 'qa', 'Each connected system exercised with a real record', 10),

      ('marketing_ai', 'Marketing Campaigns', 'checklist', 'Build lead nurture campaigns', 10),
      ('marketing_ai', 'Marketing Campaigns', 'acceptance', 'Marketing copy reviewed for risk.', 20),
      ('marketing_ai', 'Reputation', 'checklist', 'Build review request workflow', 10),
      ('marketing_ai', 'Social & AI Channels', 'checklist', 'Connect Facebook page (if included)', 10),
      ('marketing_ai', 'Social & AI Channels', 'checklist', 'Connect Instagram (if included)', 20),
      ('marketing_ai', 'Social & AI Channels', 'checklist', 'Connect TikTok (if included)', 30),
      ('marketing_ai', 'Social & AI Channels', 'checklist', 'Connect Google Business Profile (if included)', 40),
      ('marketing_ai', 'Social & AI Channels', 'checklist', 'Configure AI chat (if included)', 50),
      ('marketing_ai', 'Marketing QA', 'qa', 'Campaigns fire once, not twice', 10),
      ('marketing_ai', 'Marketing QA', 'qa', 'AI compliance guardrails hold under adversarial questions', 20),

      ('reporting', 'Tracking Foundation', 'checklist', 'Connect GA4 (if included)', 10),
      ('reporting', 'Tracking Foundation', 'checklist', 'Connect Meta/Facebook Pixel (if included)', 20),
      ('reporting', 'Tracking Foundation', 'checklist', 'Configure UTM capture and reporting', 30),
      ('reporting', 'Reporting Dashboards', 'checklist', 'Build reporting dashboards', 10),
      ('reporting', 'Reporting QA', 'qa', 'A known test event appears in the right numbers', 10),

      ('portal_membership', 'Portal Scope & Content', 'checklist', 'Confirm portal/membership/product scope', 10),
      ('portal_membership', 'Portal Scope & Content', 'client_requirement', 'Provide portal and course content', 20),
      ('portal_membership', 'Portal / Membership Build', 'checklist', 'Build client portal (if included)', 10),
      ('portal_membership', 'Portal / Membership Build', 'checklist', 'Build membership/course area (if included)', 20),
      ('portal_membership', 'Portal / Membership Build', 'checklist', 'Build ebook/DIY product delivery (if included)', 30),
      ('portal_membership', 'Portal QA', 'qa', 'Sign in as a test client and use everything built', 10),

      ('onboarding_support', 'Support & Risk Pipeline', 'checklist', 'Create Support/Risk pipeline', 10),
      ('onboarding_support', 'Training Materials', 'checklist', 'Prepare owner/admin training', 10),
      ('onboarding_support', 'Training Materials', 'checklist', 'Prepare team-role training', 20),
      ('onboarding_support', 'Training Delivery', 'checklist', 'Deliver user training (if scheduled)', 10),

      ('support_optimization', 'Journey Review', 'checklist', 'Review lead-to-client journey', 10),
      ('support_optimization', 'Optimization Pass', 'checklist', 'Optimize workflow timing', 10),
      ('support_optimization', 'Optimization Pass', 'checklist', 'Optimize page/form clarity', 20),
      ('support_optimization', 'Optimization Pass', 'checklist', 'Clean tag and field usage', 30),
      ('support_optimization', 'SOP & System Overview', 'checklist', 'Prepare system overview', 10),
      ('support_optimization', 'Support Setup', 'checklist', 'Set up 3-month support tracker', 10),
      ('support_optimization', 'Support Setup', 'checklist', 'Define support boundaries', 20)
    ) as x(engine, unit, kind, label, sort)
    join public.crm_engine_templates t
      on t.agency_id = v_agency and t.engine_key = x.engine and t.version = 1
    join public.crm_work_unit_templates u on u.template_id = t.id and u.title = x.unit
   where not exists (
     select 1 from public.crm_work_unit_template_actions a
      where a.work_unit_template_id = u.id and a.label = x.label and a.kind = x.kind);

  ------------------------------------------------------------------
  -- Publish. The content is the workbook's, so the provenance says so.
  ------------------------------------------------------------------
  update public.crm_engine_templates t
     set status = 'published', provenance = 'master_tracker'
   where t.agency_id = v_agency and t.version = 1 and t.status = 'draft'
     and t.engine_key in ('communication', 'billing', 'integration', 'marketing_ai',
                          'reporting', 'portal_membership', 'onboarding_support',
                          'support_optimization')
     /* Publish only a template that actually received its units — an empty
        standard must stay a draft. */
     and exists (select 1 from public.crm_work_unit_templates u where u.template_id = t.id);

  raise notice 'Published engines now: %',
    (select count(*) from public.crm_engine_templates where agency_id = v_agency and status = 'published');
end $seed$;
