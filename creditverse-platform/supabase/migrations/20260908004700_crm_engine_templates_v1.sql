-- 0224 — BES CRM: engine templates v1, from Dee's own worked examples.
--
-- ===========================================================================
-- THIS IS NOT THE BES BUILD STANDARD YET, AND IT SAYS SO
-- ===========================================================================
--
-- Every work unit below is taken VERBATIM from Dee's brief of 2026-09-08 —
-- §4 (Website), §5 (Sales), §6 (Fulfillment) and §13 (Brand & Business
-- Setup). Nothing is invented.
--
-- `BES_GHL_Full_Infrastructure_Build_Tracker.xlsx` is not in this repository,
-- so `provenance = 'provisional_from_brief'` on every template here and the
-- interface must say so. When the workbook arrives its 140 rows are imported
-- into `crm_requirements`, classified, and mapped onto these units — at which
-- point a v2 with `provenance = 'master_tracker'` supersedes these, and
-- existing projects keep the version they were built from (§46, §47).
--
-- ===========================================================================
-- THE NINE ENGINES WITH NO WORKED EXAMPLE STAY DRAFT, ON PURPOSE
-- ===========================================================================
--
-- Onboarding/Support, Communication, Billing, Integration, Marketing/AI,
-- Reporting, Portal/Membership, Support/Optimization and Custom get a template
-- row with NO work units and `status = 'draft'`. `crm_create_project` only
-- accepts a PUBLISHED template, so selecting one of those fails loudly with
-- "No published template for the … engine" instead of quietly creating an
-- empty engine or, worse, work somebody guessed at. That refusal is the
-- correct behaviour until the workbook says what belongs in them.
--
-- ===========================================================================
-- QA IS A WORK UNIT HERE, NOT A FLAG
-- ===========================================================================
--
-- Dee's own examples list "Website QA", "Sales QA" and "QA" as units somebody
-- owns, so that is how they are seeded. The per-unit `requires_qa` flag from
-- §30 exists and works, and is left FALSE everywhere: which individual units
-- need a second pair of eyes is a judgement from the workbook, not one to
-- invent. The flag's behaviour is proved by the matrix, not by seed data.
-- ===========================================================================

do $seed$
declare
  v_agency uuid;
  v_engine text;
  v_tmpl   uuid;
begin
  select id into v_agency from public.agencies order by created_at limit 1;
  if v_agency is null then
    raise notice 'no agency row: skipping BES CRM template seed';
    return;
  end if;

  /* ── the nine engines awaiting the workbook ───────────────────────────── */
  foreach v_engine in array array[
    'onboarding_support', 'communication', 'billing', 'integration',
    'marketing_ai', 'reporting', 'portal_membership', 'support_optimization', 'custom']
  loop
    insert into public.crm_engine_templates (agency_id, engine_key, version, status, provenance, notes)
    values (v_agency, v_engine, 1, 'draft', 'provisional_from_brief',
            'Awaiting BES_GHL_Full_Infrastructure_Build_Tracker.xlsx. No work units, and DRAFT deliberately: crm_create_project refuses a draft, so selecting this engine fails loudly rather than creating empty or invented work.')
    on conflict (agency_id, engine_key, version) do nothing;
  end loop;

  /* ── the five with a worked example in the brief ──────────────────────── */
  foreach v_engine in array array['project_setup', 'website_funnel', 'sales', 'fulfillment', 'qa_launch']
  loop
    insert into public.crm_engine_templates (agency_id, engine_key, version, status, provenance, notes)
    values (v_agency, v_engine, 1, 'published', 'provisional_from_brief',
            'Work units taken verbatim from Dee''s brief of 2026-09-08. Provisional until the master tracker is mapped onto them.')
    on conflict (agency_id, engine_key, version) do nothing;
  end loop;

  /* ── work units ───────────────────────────────────────────────────────
     (engine, title, sort, target_days, description) */
  insert into public.crm_work_unit_templates (template_id, title, sort, target_days, description)
  select t.id, x.title, x.sort, x.target_days, x.descr
    from (values
      -- PROJECT SETUP / INTAKE
      ('project_setup', 'Account & Access',          10,  1, 'Confirm the GHL account, sub-account and the access BES needs to build.'),
      ('project_setup', 'Brand & Business Setup',    20,  3, 'Dee §13: one meaningful unit, several tracked actions. Business information consistent across the configured GHL surfaces.'),
      ('project_setup', 'Scope Confirmation',        30,  3, 'Confirm with the partner which engines are in scope and what go-live means for this build.'),
      -- WEBSITE & FUNNEL ENGINE (Dee §4)
      ('website_funnel', 'Intake & Assets',          10,  3, 'Copy, images, brand assets and any existing site to work from.'),
      ('website_funnel', 'Structure / Page Plan',    20,  5, 'The page map and funnel structure, agreed before anything is built.'),
      ('website_funnel', 'Website Build',            30, 12, 'Build the agreed pages.'),
      ('website_funnel', 'Forms & Tracking',         40, 12, 'Forms, tracking and analytics. Runs alongside the build.'),
      ('website_funnel', 'Domain & SSL',             50, 10, 'Domain connection and certificate. Needs DNS access from the client.'),
      ('website_funnel', 'Website QA',               60, 15, 'Review the built site against the acceptance criteria.'),
      ('website_funnel', 'Publish & Handoff',        70, 17, 'Publish, then hand over with what the partner needs to run it.'),
      -- SALES ENGINE (Dee §5)
      ('sales', 'Sales Intake / Offer Map',          10,  3, 'What is being sold, to whom, and the stages a deal really moves through.'),
      ('sales', 'Custom Fields & Tags',              20,  5, 'The fields and tags the pipeline and automations depend on.'),
      ('sales', 'Sales Pipeline',                    30,  8, 'The pipeline, its stages and their meaning.'),
      ('sales', 'Calendars',                         40,  8, 'Booking calendars, availability and confirmations.'),
      ('sales', 'Lead Capture',                      50, 10, 'Forms, landing pages and every route a lead arrives by.'),
      ('sales', 'Lead Routing',                      60, 10, 'Who gets which lead, and what happens when nobody does.'),
      ('sales', 'Speed-to-Lead',                     70, 12, 'First response, measured in minutes rather than intentions.'),
      ('sales', 'Follow-Up Automation',              80, 12, 'The sequences that run when a human does not.'),
      ('sales', 'No-Show / Reactivation',            90, 14, 'What happens after a missed appointment or a cold lead.'),
      ('sales', 'Sales Communication',              100, 14, 'The email and SMS the sales engine actually sends.'),
      ('sales', 'Sales QA',                         110, 16, 'Test the whole path a real lead takes.'),
      -- FULFILLMENT ENGINE (Dee §6)
      ('fulfillment', 'Fulfillment Process Map',     10,  3, 'How delivery actually works for this partner, before it is automated.'),
      ('fulfillment', 'Client Onboarding',           20,  6, 'What a new client receives, signs and provides.'),
      ('fulfillment', 'Fulfillment Pipeline',        30,  6, 'The delivery pipeline and its stages.'),
      ('fulfillment', 'Required Fields & Tags',      40,  8, 'The fields delivery and reporting depend on.'),
      ('fulfillment', 'Document Collection',         50, 10, 'How documents are requested, received and checked.'),
      ('fulfillment', 'Fulfillment Automation',      60, 12, 'The automations that move work and inform people.'),
      ('fulfillment', 'Internal Task & Assignment Logic', 70, 12, 'Who is assigned what, and when it escalates.'),
      ('fulfillment', 'Client Update Logic',         80, 14, 'What the client is told, when, and by what.'),
      ('fulfillment', 'Support & Escalation',        90, 14, 'How a problem reaches somebody who can fix it.'),
      ('fulfillment', 'Fulfillment QA',             100, 16, 'Run a real file end to end.'),
      -- QA / LAUNCH
      ('qa_launch', 'Pre-launch Verification',       10,  2, 'Everything in scope, checked together rather than engine by engine.'),
      ('qa_launch', 'Go-Live',                       20,  3, 'Switch on, watch it, and be ready to reverse.'),
      ('qa_launch', 'Handoff & Training',            30,  5, 'Hand the build over with the training the partner''s team needs.')
    ) as x(engine, title, sort, target_days, descr)
    join public.crm_engine_templates t
      on t.agency_id = v_agency and t.engine_key = x.engine and t.version = 1
   where not exists (
     select 1 from public.crm_work_unit_templates u where u.template_id = t.id and u.title = x.title);

  /* ── dependencies (Dee §19) — resolved by title inside one engine ─────
     Note what is deliberately absent: nothing in `sales` depends on anything
     in `website_funnel`. That is what makes §60's test pass — a Sales-only
     build waits for no website — and it is why `phase` is not the dependency
     engine (§40). */
  insert into public.crm_work_unit_template_deps (work_unit_template_id, depends_on_id)
  select u.id, d.id
    from (values
      ('project_setup', 'Brand & Business Setup',   'Account & Access'),
      ('project_setup', 'Scope Confirmation',       'Account & Access'),
      ('website_funnel', 'Structure / Page Plan',   'Intake & Assets'),
      ('website_funnel', 'Website Build',           'Structure / Page Plan'),
      ('website_funnel', 'Forms & Tracking',        'Structure / Page Plan'),
      ('website_funnel', 'Website QA',              'Website Build'),
      ('website_funnel', 'Website QA',              'Forms & Tracking'),
      ('website_funnel', 'Publish & Handoff',       'Website QA'),
      ('website_funnel', 'Publish & Handoff',       'Domain & SSL'),
      ('sales', 'Custom Fields & Tags',             'Sales Intake / Offer Map'),
      ('sales', 'Sales Pipeline',                   'Custom Fields & Tags'),
      ('sales', 'Calendars',                        'Custom Fields & Tags'),
      ('sales', 'Sales Communication',              'Custom Fields & Tags'),
      ('sales', 'Lead Capture',                     'Sales Pipeline'),
      ('sales', 'Lead Routing',                     'Sales Pipeline'),
      ('sales', 'Follow-Up Automation',             'Sales Pipeline'),
      ('sales', 'Speed-to-Lead',                    'Lead Routing'),
      ('sales', 'No-Show / Reactivation',           'Calendars'),
      ('sales', 'No-Show / Reactivation',           'Follow-Up Automation'),
      ('sales', 'Sales QA',                         'Lead Capture'),
      ('sales', 'Sales QA',                         'Lead Routing'),
      ('sales', 'Sales QA',                         'Follow-Up Automation'),
      ('sales', 'Sales QA',                         'Sales Communication'),
      ('fulfillment', 'Client Onboarding',          'Fulfillment Process Map'),
      ('fulfillment', 'Fulfillment Pipeline',       'Fulfillment Process Map'),
      ('fulfillment', 'Required Fields & Tags',     'Fulfillment Pipeline'),
      ('fulfillment', 'Document Collection',        'Client Onboarding'),
      ('fulfillment', 'Fulfillment Automation',     'Fulfillment Pipeline'),
      ('fulfillment', 'Fulfillment Automation',     'Required Fields & Tags'),
      ('fulfillment', 'Internal Task & Assignment Logic', 'Fulfillment Pipeline'),
      ('fulfillment', 'Client Update Logic',        'Fulfillment Automation'),
      ('fulfillment', 'Support & Escalation',       'Client Onboarding'),
      ('fulfillment', 'Fulfillment QA',             'Document Collection'),
      ('fulfillment', 'Fulfillment QA',             'Fulfillment Automation'),
      ('fulfillment', 'Fulfillment QA',             'Client Update Logic'),
      ('qa_launch', 'Go-Live',                      'Pre-launch Verification'),
      ('qa_launch', 'Handoff & Training',           'Go-Live')
    ) as x(engine, unit, dep)
    join public.crm_engine_templates t
      on t.agency_id = v_agency and t.engine_key = x.engine and t.version = 1
    join public.crm_work_unit_templates u on u.template_id = t.id and u.title = x.unit
    join public.crm_work_unit_templates d on d.template_id = t.id and d.title = x.dep
  on conflict do nothing;

  /* Everything with a dependency needs ALL of them: a QA unit that ran when
     only one of its inputs was finished would be QA of half a build. */
  update public.crm_work_unit_templates u
     set dependency_mode = 'all_required'
   where exists (select 1 from public.crm_work_unit_template_deps d where d.work_unit_template_id = u.id)
     and u.dependency_mode = 'none';

  /* ── actions inside the units ─────────────────────────────────────────
     §13's worked example in full, plus the client requirements the brief
     names (§33's DNS access, §4's assets, §6's documents). Acceptance
     criteria are quoted from the brief where it gives one. */
  insert into public.crm_work_unit_template_actions (work_unit_template_id, kind, label, sort)
  select u.id, x.kind, x.label, x.sort
    from (values
      -- §13, verbatim
      ('project_setup', 'Brand & Business Setup', 'checklist',          'Logo',                   10),
      ('project_setup', 'Brand & Business Setup', 'checklist',          'Favicon',                20),
      ('project_setup', 'Brand & Business Setup', 'checklist',          'Colors / Fonts',         30),
      ('project_setup', 'Brand & Business Setup', 'checklist',          'Business Details',       40),
      ('project_setup', 'Brand & Business Setup', 'checklist',          'Support Contact',        50),
      ('project_setup', 'Brand & Business Setup', 'checklist',          'Required Policy Links',  60),
      ('project_setup', 'Brand & Business Setup', 'acceptance',
         'Business information is consistent across configured GHL surfaces.',                    70),
      -- the access the client owes before anything can be built
      ('project_setup', 'Account & Access',       'client_requirement', 'GHL account access for the BES team', 10),
      ('project_setup', 'Account & Access',       'checklist',          'Sub-account confirmed',  20),
      ('project_setup', 'Account & Access',       'checklist',          'BES team users added',   30),
      -- §33's worked example
      ('website_funnel', 'Domain & SSL',          'client_requirement', 'Provide DNS access',     10),
      ('website_funnel', 'Domain & SSL',          'checklist',          'Domain connected',       20),
      ('website_funnel', 'Domain & SSL',          'checklist',          'Certificate valid',      30),
      ('website_funnel', 'Intake & Assets',       'client_requirement', 'Provide brand assets and copy', 10),
      ('website_funnel', 'Website QA',            'qa',                 'Every page in the agreed plan exists and renders', 10),
      ('website_funnel', 'Website QA',            'qa',                 'Forms submit and the submission arrives',          20),
      ('website_funnel', 'Website QA',            'qa',                 'Readable on a phone',                              30),
      ('sales', 'Sales QA',                       'qa',                 'A test lead reaches the right owner',              10),
      ('sales', 'Sales QA',                       'qa',                 'The follow-up sequence fires once, not twice',     20),
      ('fulfillment', 'Document Collection',      'client_requirement', 'Confirm the document list', 10),
      ('fulfillment', 'Fulfillment QA',           'qa',                 'A real file moves end to end',                     10)
    ) as x(engine, unit, kind, label, sort)
    join public.crm_engine_templates t
      on t.agency_id = v_agency and t.engine_key = x.engine and t.version = 1
    join public.crm_work_unit_templates u on u.template_id = t.id and u.title = x.unit
   where not exists (
     select 1 from public.crm_work_unit_template_actions a
      where a.work_unit_template_id = u.id and a.label = x.label and a.kind = x.kind);
  /* ── milestones (Dee §20, §30) ────────────────────────────────────────
     Every one of these is a concept from Dee's old ClickUp template or from
     §20's list, placed in the MILESTONE layer where it belongs rather than in
     a status field. `Client Presentation`, `User Training` and `Feature
     Active` were statuses there — which is why a project could only be one of
     them at a time, and why moving to Support lost the record that training
     had happened.

     `work_unit_title` is what makes them derive themselves: complete the unit
     and the milestone completes with it (§20, §26). The ones with no unit —
     a presentation, a training session — are the only ones anybody ticks. */
  insert into public.crm_milestone_templates
    (agency_id, key, label, engine_key, work_unit_title, client_visible, sort)
  select v_agency, x.key, x.label, x.engine, x.unit, x.visible, x.sort
    from (values
      ('intake_complete',        'Intake Complete',          'project_setup',  'Scope Confirmation',    false,  10),
      ('architecture_approved',  'Architecture Approved',     'website_funnel', 'Structure / Page Plan',  true,  20),
      ('website_preview_ready',  'Website Preview Ready',     'website_funnel', 'Website Build',          true,  30),
      ('website_ready',          'Website Engine Ready',      'website_funnel', null,                     true,  40),
      ('sales_ready',            'Sales Engine Ready',        'sales',          null,                     true,  50),
      ('fulfillment_ready',      'Fulfillment Engine Ready',  'fulfillment',    null,                     true,  60),
      ('initial_testing_complete','Initial Testing Complete', 'qa_launch',      'Pre-launch Verification', true, 70),
      -- the three that were STATUSES in ClickUp and are events here
      ('client_presentation',    'Client Presentation',        null,            null,                     true,  80),
      ('user_training',          'User Training',              null,            null,                     true,  90),
      ('go_live',                'Go-Live',                    null,            'Go-Live',                true, 100),
      ('feature_active',         'Feature Active',             null,            null,                     true, 110),
      ('support_started',        'Support Started',            null,            null,                     true, 120),
      ('support_completed',      'Support Completed',          null,            null,                     true, 130)
    ) as x(key, label, engine, unit, visible, sort)
   where not exists (
     select 1 from public.crm_milestone_templates m
      where m.agency_id = v_agency and m.key = x.key);
end $seed$;

comment on table public.crm_work_unit_templates is
  'The meaningful pieces of work in an engine. v1 is Dee''s own worked examples from the 2026-09-08 brief — provisional until BES_GHL_Full_Infrastructure_Build_Tracker.xlsx is mapped onto them. Roughly 3-11 per engine: the test is "does this represent a meaningful piece of work somebody can own?" (Dee §7), never a count.';
