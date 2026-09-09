----------------------------------------------------------------------
-- 0228  The master build tracker becomes the build library.
--
-- All 140 rows of BES_GHL_Full_Infrastructure_Build_Tracker.xlsx, each placed
-- in a Build Engine. `crm_requirements` shipped empty in 0220 on purpose — a
-- guessed build standard is worse than none — and this is the workbook Dee
-- supplied, imported verbatim from the copy committed at
-- docs/bes-crm/sheets/.
--
-- ── 140 SOURCE REQUIREMENTS ARE NOT 140 LIVE TASKS ──────────────────────
--
-- Dee's correction, and the reason this table exists separately from
-- `work_items`. These rows are the STANDARD: what "done" means for a GHL
-- build, and what to ask a client for before one can start. A row becomes
-- live work only when it is classified `work_unit` AND its engine was
-- actually purchased. A partner buying a website gets the website rows; the
-- credit-repair lifecycle rows stay in the library, unbuilt and unassigned.
--
-- Classification is by (phase, section) — 55 judgements, not 140 — using the
-- workbook's own sections, with named exceptions where a section genuinely
-- spans two engines. The generator is
-- docs/bes-crm/scripts/classify-tracker.mjs, which refuses to emit anything
-- while a single row is unplaced, so this file cannot be half a library.
--
-- `optional` is read from the workbook's own words — "if included", "if
-- applicable", "if scheduled" — rather than a second list that would drift
-- from them.
--
-- Idempotent: keyed on (agency, source_reference, source_row_ref), so a
-- re-import updates rather than duplicates.
----------------------------------------------------------------------

do $import$
declare
  v_agency uuid;
  v_batch  uuid := gen_random_uuid();
begin
  select id into v_agency from public.agencies order by created_at limit 1;
  if v_agency is null then
    raise notice 'No agency row: skipping the build library import.';
    return;
  end if;

  with incoming (source_row_ref, source_section, title, detail, engine_key, kind, optional) as (values
  ('phase-0-access-lock.csv:3', 'Phase 0 · Internal Setup', 'Create internal project folder', 'Create structured project folder with intake, access, compliance, assets, build, testing, delivery, support, and archive folders.', 'project_setup', 'work_unit', false),
  ('phase-0-access-lock.csv:4', 'Phase 0 · Internal Setup', 'Create client asset folder', 'Create shared/client-facing folder for logos, copy, policies, voice notes, references, screenshots, and brand files.', 'project_setup', 'work_unit', false),
  ('phase-0-access-lock.csv:5', 'Phase 0 · Internal Setup', 'Create access tracker', 'Set up tracker for GHL, domain, DNS, email admin, payments, Zapier/Pabbly, ManyChat, social, Drive, ad accounts, pixels, and existing CRM.', 'project_setup', 'work_unit', false),
  ('phase-0-access-lock.csv:6', 'Phase 0 · Internal Setup', 'Create compliance tracker', 'Track privacy, terms, refund, cancellation, SMS consent, email unsubscribe, call recording, credit repair disclosures, funding disclaimers, approved/prohibited claims.', 'project_setup', 'work_unit', false),
  ('phase-0-access-lock.csv:7', 'Phase 0 · Internal Setup', 'Create build checklist', 'Create master tracker for all phases, owners, blockers, dependencies, due dates, QA, and sign-off.', 'project_setup', 'work_unit', false),
  ('phase-0-access-lock.csv:8', 'Phase 0 · Internal Setup', 'Create revision tracker', 'Track revisions, bug fixes, out-of-scope requests, approval status, and completion.', 'project_setup', 'work_unit', false),
  ('phase-0-access-lock.csv:9', 'Phase 0 · Internal Setup', 'Create blocker tracker', 'Track blockers, owner, severity, due date, workaround, and resolution status.', 'project_setup', 'work_unit', false),
  ('phase-0-access-lock.csv:10', 'Phase 0 · Internal Setup', 'Create workflow map', 'Prepare workflow map for lead capture, booking, onboarding, funding, credit repair lifecycle, billing, compliance holds, and support.', 'project_setup', 'work_unit', false),
  ('phase-0-access-lock.csv:11', 'Phase 0 · Internal Setup', 'Create pipeline map', 'Map all required pipelines and stages before building.', 'project_setup', 'work_unit', false),
  ('phase-0-access-lock.csv:12', 'Phase 0 · Client Inputs', 'Collect legal business name and DBA', 'Confirm legal entity, DBA/public brand, authorized representative, and owner.', 'project_setup', 'client_requirement', false),
  ('phase-0-access-lock.csv:13', 'Phase 0 · Client Inputs', 'Collect business contact and operating info', 'Collect address, timezone, currency, support email, support phone, business hours, holiday hours, service areas, and niche category.', 'project_setup', 'client_requirement', false),
  ('phase-0-access-lock.csv:14', 'Phase 0 · Client Inputs', 'Collect team roster and role assignments', 'Collect sales, funding advisor, fulfillment, billing, compliance, support, admin, and VA ownership rules.', 'project_setup', 'client_requirement', false),
  ('phase-0-access-lock.csv:15', 'Phase 0 · Offer Strategy', 'Collect current offers and pricing', 'Collect offer name, price, billing method, payment timing, refund rules, cancellation rules, delivery method, eligibility, required docs, disclosures, included/not included.', 'project_setup', 'client_requirement', false),
  ('phase-0-access-lock.csv:16', 'Phase 0 · Offer Strategy', 'Collect rough offer ideas if final offers do not exist', 'Accept notes, screenshots, voice notes, Google Docs, old funnels, references, draft pricing, and manual process explanations.', 'project_setup', 'client_requirement', false),
  ('phase-0-access-lock.csv:17', 'Phase 0 · Compliance Direction', 'Collect policy URLs or rules', 'If privacy/terms/refund/service agreement URLs do not exist, collect current rules and preferences so BES can structure placeholders/pages.', 'project_setup', 'client_requirement', false),
  ('phase-0-access-lock.csv:18', 'Phase 0 · Compliance Direction', 'Collect credit repair compliance direction', 'Agreement template, disclosures, Consumer Credit File Rights Notice, cancellation language, payment rules, onboarding requirements, consent language, ESIGN language if used.', 'project_setup', 'client_requirement', false),
  ('phase-0-access-lock.csv:19', 'Phase 0 · Compliance Direction', 'Collect funding compliance direction', 'Funding disclosure, eligibility rules, no guarantee language, broker disclosure if applicable, application disclaimers, follow-up messaging rules.', 'project_setup', 'client_requirement', true),
  ('phase-0-access-lock.csv:20', 'Phase 0 · Access', 'Collect GHL owner/admin access', 'Owner/Admin access strongly preferred for full infrastructure build. Limited access can delay or block configuration.', 'project_setup', 'client_requirement', false),
  ('phase-0-access-lock.csv:21', 'Phase 0 · Access', 'Collect domain/DNS access', 'Registrar or DNS access required for domain, SSL, email authentication, tracking domains, and funnel connection.', 'project_setup', 'client_requirement', false),
  ('phase-0-access-lock.csv:22', 'Phase 0 · Access', 'Collect email admin access', 'Google Workspace/Microsoft 365 or provider admin access required for branded email, SPF, DKIM, DMARC, reply-to setup.', 'project_setup', 'client_requirement', false),
  ('phase-0-access-lock.csv:23', 'Phase 0 · Access', 'Collect payment processor access if included', 'Stripe/Authorize/PayPal or other processor access required if payments, invoices, subscriptions, or payment workflows are in scope.', 'project_setup', 'client_requirement', true),
  ('phase-0-access-lock.csv:24', 'Phase 0 · Access', 'Collect integration access if included', 'Zapier/Pabbly, DisputeFox, ManyChat, Google Drive/Dropbox/OneDrive, social channels, ad accounts, pixels, existing CRM.', 'project_setup', 'client_requirement', true),
  ('phase-0-access-lock.csv:25', 'Phase 0 · Brand Assets', 'Collect brand assets or preferences', 'Logo, favicon, colors, fonts, photos, copy, testimonials, disclaimers, social links, screenshots, references. If missing, collect style preferences.', 'project_setup', 'client_requirement', false),
  ('phase-0-access-lock.csv:26', 'Phase 0 · Strategy Lock', 'Approve build architecture', 'Confirm scope, pipeline structure, entry points, offers, compliance rules, payment rules, SMS rules, integrations, and phase plan before heavy build.', 'project_setup', 'work_unit', false),
  ('phase-1-foundation.csv:3', 'Phase 1 · Core Infrastructure', 'Create/verify GHL sub-account', 'Sub-account exists and is assigned to correct agency/client environment.', 'project_setup', 'work_unit', false),
  ('phase-1-foundation.csv:4', 'Phase 1 · Core Infrastructure', 'Complete Business Profile', 'Company name, legal name, address, support email, support phone, website, timezone, currency, category, logo, and hours completed.', 'project_setup', 'work_unit', false),
  ('phase-1-foundation.csv:5', 'Phase 1 · Core Infrastructure', 'Configure business hours and after-hours baseline', 'True operating hours configured. Holiday hours documented if applicable. After-hours logic documented.', 'project_setup', 'work_unit', true),
  ('phase-1-foundation.csv:6', 'Phase 1 · Core Infrastructure', 'Configure role-based users and permissions', 'Admin, Sales, Funding Advisor, Credit Specialist, Fulfillment, Billing, Compliance, Support, VA roles created and restricted.', 'project_setup', 'work_unit', false),
  ('phase-1-foundation.csv:7', 'Phase 1 · Core Infrastructure', 'Test user permissions by role', 'Log in/test each role. Confirm sales no settings, fulfillment no billing, billing no workflows, support no delete, exports restricted.', 'qa_launch', 'qa', false),
  ('phase-1-foundation.csv:8', 'Phase 1 · Core Infrastructure', 'Configure contact deduplication', 'Duplicate by email/phone, merge strategy, owner preservation, workflow restart prevention, manual duplicate review process.', 'project_setup', 'work_unit', false),
  ('phase-1-foundation.csv:9', 'Phase 1 · Core Infrastructure', 'Configure opportunity defaults', 'Default pipeline, default stage, fallback owner, source tracking, won/lost reasons, opportunity naming format.', 'project_setup', 'work_unit', false),
  ('phase-1-foundation.csv:10', 'Phase 1 · Core Infrastructure', 'Create custom values', 'Legal name, DBA, support email/phone, address, website, policy URLs, booking links, offer names, social links, business hours, footer, SMS help/opt-out.', 'project_setup', 'work_unit', false),
  ('phase-1-foundation.csv:11', 'Phase 1 · Core Infrastructure', 'Create custom fields - contact level', 'Preferred language, credit goal, score range, state, consent fields, agreement dates, cooling-off, plan terms, DNC reason, lead source, UTM, service type, intake channel, identity verified, risk flag, external links.', 'project_setup', 'work_unit', false),
  ('phase-1-foundation.csv:12', 'Phase 1 · Core Infrastructure', 'Create custom fields - opportunity level', 'Program type, requested amount, revenue range, years in business, docs dates, lender submission date, terms date, funded date, disqualification reason, deal temperature, advisor, hold reason, manual billing, stage dates.', 'project_setup', 'work_unit', false),
  ('phase-1-foundation.csv:13', 'Phase 1 · Core Infrastructure', 'Create tag library', 'Lead, status, compliance, billing, workflow, source, team, and risk tags created using clean naming conventions.', 'project_setup', 'work_unit', false),
  ('phase-1-foundation.csv:14', 'Phase 1 · Domain & SSL', 'Connect primary domain', 'Add main website/root domain in GHL or configure appropriate subdomain approach.', 'website_funnel', 'work_unit', false),
  ('phase-1-foundation.csv:15', 'Phase 1 · Domain & SSL', 'Connect funnel domain', 'Configure funnel domain/subdomain and set as default funnel domain where applicable.', 'website_funnel', 'work_unit', false),
  ('phase-1-foundation.csv:16', 'Phase 1 · Domain & SSL', 'Configure tracking domain', 'Set branded tracking domain if email/link tracking is included.', 'website_funnel', 'work_unit', false),
  ('phase-1-foundation.csv:17', 'Phase 1 · Domain & SSL', 'Verify DNS and SSL', 'DNS records verified, SSL active, HTTPS enforced, no redirect loops, propagation checked.', 'website_funnel', 'work_unit', false),
  ('phase-1-foundation.csv:18', 'Phase 1 · Domain & SSL', 'Create branded 404 page', '404 page created, assigned, and tested with random URL.', 'website_funnel', 'work_unit', false),
  ('phase-1-foundation.csv:19', 'Phase 1 · Email Foundation', 'Connect branded email domain', 'Business email matches branded domain. No personal Gmail/Yahoo/Outlook sender in production unless temporary/startup exception.', 'communication', 'work_unit', false),
  ('phase-1-foundation.csv:20', 'Phase 1 · Email Foundation', 'Configure sending domain authentication', 'Dedicated sending domain, SPF, DKIM, DMARC, reply-to, from address, tracking domain, email footer, unsubscribe link.', 'communication', 'work_unit', false),
  ('phase-1-foundation.csv:21', 'Phase 1 · Email Foundation', 'Document email warm-up rules', 'Low send limits, no bulk sends during warm-up, segmented sending, suppression behavior, bounce/spam complaint suppression.', 'communication', 'work_unit', false),
  ('phase-1-foundation.csv:22', 'Phase 1 · Phone & SMS Readiness', 'Purchase/connect phone number', 'LC Phone/GHL-native number, local vs toll-free decision, correct country, assigned to sub-account/users, default outbound number.', 'communication', 'work_unit', false),
  ('phase-1-foundation.csv:23', 'Phase 1 · Phone & SMS Readiness', 'Configure call routing baseline', 'Inbound routing, outbound caller ID, voicemail, missed-call text-back, after-hours routing, fallback routing.', 'communication', 'work_unit', false),
  ('phase-1-foundation.csv:24', 'Phase 1 · Phone & SMS Readiness', 'Submit A2P/TFN where required', 'A2P brand/campaign registration or toll-free verification submitted with website, privacy, terms, opt-in description, samples, use case.', 'communication', 'work_unit', true),
  ('phase-1-foundation.csv:25', 'Phase 1 · Website Build', 'Build corporate website pages', 'Home, How It Works, Services, About, FAQ, Schedule Consultation, Contact, disclosures, cancellation, privacy, terms, funding/no-guarantee pages as applicable.', 'website_funnel', 'work_unit', false),
  ('phase-1-foundation.csv:26', 'Phase 1 · Website Build', 'Configure page technical requirements', 'Meta title, meta description, OG image, basic schema if applicable, pixels/GA4 if included, mobile optimization, footer disclosures.', 'website_funnel', 'work_unit', true),
  ('phase-1-foundation.csv:27', 'Phase 1 · Funnel Build', 'Build lead capture funnel', 'Landing page, form, thank-you page, calendar or next step, tracking, hidden fields, pipeline trigger.', 'website_funnel', 'work_unit', false),
  ('phase-1-foundation.csv:28', 'Phase 1 · Funnel Build', 'Build credit consultation funnel if applicable', 'Credit consultation page, booking/lead form, disclaimer placement, thank-you/confirmation page.', 'website_funnel', 'work_unit', true),
  ('phase-1-foundation.csv:29', 'Phase 1 · Funnel Build', 'Build funding/commercial funding funnel if applicable', 'Funding page, intake/application form, no-guarantee language, document/booking CTA, thank-you page.', 'website_funnel', 'work_unit', true),
  ('phase-1-foundation.csv:30', 'Phase 1 · Funnel Build', 'Build clarity/business setup/education funnel if applicable', 'Clarity call, business setup, acquisition, tax, real estate/broker, mentorship or related offer entry point.', 'website_funnel', 'work_unit', true),
  ('phase-1-foundation.csv:31', 'Phase 1 · Forms & Intake', 'Build universal consultation form', 'Hidden UTM fields, SMS/email consent, consent version, service type, lead source, owner assignment, opportunity creation.', 'website_funnel', 'work_unit', false),
  ('phase-1-foundation.csv:32', 'Phase 1 · Forms & Intake', 'Build service-specific intake forms', 'Credit repair, funding, commercial funding, business acquisition, setup assistance, real estate/broker, tax, clarity call as applicable.', 'website_funnel', 'work_unit', false),
  ('phase-1-foundation.csv:33', 'Phase 1 · Forms & Intake', 'Build operations forms', 'Onboarding packet, secure document upload, cancellation request, client update submission, complaint/escalation form.', 'website_funnel', 'work_unit', false),
  ('phase-1-foundation.csv:34', 'Phase 1 · Calendar Setup', 'Create calendars', 'Consultation, credit consultation, funding consultation, business setup, clarity call, onboarding, support as applicable.', 'sales', 'work_unit', false),
  ('phase-1-foundation.csv:35', 'Phase 1 · Calendar Setup', 'Configure calendar sync and conflict prevention', 'Google/Outlook sync, availability, buffers, minimum notice, round robin, confirmation page, reminders connection.', 'sales', 'work_unit', false),
  ('phase-1-foundation.csv:36', 'Phase 1 · Pipelines', 'Create Credit Repair Sales Intake pipeline', 'Stages: New Lead, Contact Attempted, Consultation Scheduled, Consultation Completed, Qualified/Agreement Sent, Agreement Signed, Cooling-Off, Ready for Invoice, Agreement Expired, Not Qualified, Cancelled, Compliance Hold.', 'sales', 'work_unit', false),
  ('phase-1-foundation.csv:37', 'Phase 1 · Pipelines', 'Create Credit Repair Active Lifecycle pipeline', 'Stages: Onboarding Pending, Onboarding Complete, Round 1-6 Sent, Monitoring, Completed, Cancelled, Archived, Compliance Hold.', 'fulfillment', 'work_unit', false),
  ('phase-1-foundation.csv:38', 'Phase 1 · Pipelines', 'Create Business Funding pipeline', 'Stages: New Lead, Docs Requested, Docs Received, Submitted to Lender, Terms Received, Funded, Not Qualified, Nurture.', 'sales', 'work_unit', false),
  ('phase-1-foundation.csv:39', 'Phase 1 · Pipelines', 'Create Clarity/Education pipeline', 'Stages: Booked, Attended, Follow-Up, Converted, Nurture.', 'sales', 'work_unit', false),
  ('phase-1-foundation.csv:40', 'Phase 1 · Pipelines', 'Create Support/Risk pipeline', 'Stages: New Support Request, Billing Issue, Technical Issue, Document Issue, Complaint, Refund Request, Attorney Mention, Compliance Review, Resolved, Closed.', 'onboarding_support', 'work_unit', false),
  ('phase-1-foundation.csv:41', 'Phase 1 · Lead Automation', 'Build basic lead capture routing', 'Form submission creates/updates contact, applies tags/fields, creates opportunity, assigns owner, sends internal alert, triggers confirmation email/SMS if compliant.', 'sales', 'work_unit', false),
  ('phase-2-automations.csv:3', 'Phase 2 · Intake & Routing', 'Build speed-to-lead workflow', 'Immediate lead routing, owner assignment, internal notification, first response email/SMS if allowed.', 'sales', 'work_unit', false),
  ('phase-2-automations.csv:4', 'Phase 2 · Intake & Routing', 'Build service type tagging workflow', 'Apply service tags based on form, funnel, chat, calendar, ManyChat, or manual selection.', 'sales', 'work_unit', false),
  ('phase-2-automations.csv:5', 'Phase 2 · Intake & Routing', 'Build business hours and after-hours logic', 'Route leads differently during open/closed hours. Create callback tasks after hours.', 'sales', 'work_unit', false),
  ('phase-2-automations.csv:6', 'Phase 2 · Phone/SMS', 'Build inbound call workflow', 'Inbound call logs, assigns owner, creates task/notification, updates conversation.', 'communication', 'work_unit', false),
  ('phase-2-automations.csv:7', 'Phase 2 · Phone/SMS', 'Build missed call workflow', 'Compliance-safe missed-call text-back, callback task, owner notification, after-hours handling.', 'communication', 'work_unit', false),
  ('phase-2-automations.csv:8', 'Phase 2 · Phone/SMS', 'Build STOP/DNC handler', 'Detect STOP/CANCEL/UNSUBSCRIBE, apply DND/DNC, stop active workflows, close conversation, create internal log.', 'communication', 'work_unit', false),
  ('phase-2-automations.csv:9', 'Phase 2 · Phone/SMS', 'Build HELP response', 'Compliant HELP auto-response with business identity/support contact.', 'communication', 'work_unit', false),
  ('phase-2-automations.csv:10', 'Phase 2 · Credit Repair Sales', 'Build booking confirmation workflow', 'Email/SMS confirmation if compliant, stage movement, internal notification.', 'sales', 'work_unit', false),
  ('phase-2-automations.csv:11', 'Phase 2 · Credit Repair Sales', 'Build appointment reminders', '24h and 1h reminders, SMS only with consent and approval, email fallback.', 'sales', 'work_unit', false),
  ('phase-2-automations.csv:12', 'Phase 2 · Credit Repair Sales', 'Build no-show recovery', 'No-show stage movement, reschedule follow-up, task, nurture if no response.', 'sales', 'work_unit', false),
  ('phase-2-automations.csv:13', 'Phase 2 · Credit Repair Sales', 'Build consultation outcome routing', 'Routes qualified, not qualified, agreement sent, nurture, compliance hold, or cancelled outcomes.', 'sales', 'work_unit', false),
  ('phase-2-automations.csv:14', 'Phase 2 · Credit Repair Sales', 'Build agreement sent/viewed/signed workflows', 'Agreement reminders, status fields, stage movement, notifications, and next step logic.', 'sales', 'work_unit', false),
  ('phase-2-automations.csv:15', 'Phase 2 · Credit Repair Sales', 'Build cooling-off enforcement', 'Track cooling-off start/end dates and prevent billing/fulfillment advancement until approved timing rules are met.', 'sales', 'work_unit', false),
  ('phase-2-automations.csv:16', 'Phase 2 · Credit Repair Sales', 'Build manual billing authorization trigger', 'Manual billing safeguard for credit repair compliance. No automated charge unless client rules approve.', 'billing', 'work_unit', false),
  ('phase-2-automations.csv:17', 'Phase 2 · Credit Repair Active', 'Build pipeline transfer to active lifecycle', 'Move from agreement/client-ready status into active lifecycle pipeline with onboarding status.', 'fulfillment', 'work_unit', false),
  ('phase-2-automations.csv:18', 'Phase 2 · Credit Repair Active', 'Build onboarding packet reminders', 'Send onboarding request, follow-up reminders, incomplete onboarding tasks, document status updates.', 'fulfillment', 'work_unit', false),
  ('phase-2-automations.csv:19', 'Phase 2 · Credit Repair Active', 'Build credit monitoring issue workflow', 'Applies issue status, creates task, sends approved instructions, pauses related processing where required.', 'fulfillment', 'work_unit', true),
  ('phase-2-automations.csv:20', 'Phase 2 · Credit Repair Active', 'Build round advancement workflow', 'Round 1-6 status movement, internal reminders, client update, archive/completed pathway.', 'fulfillment', 'work_unit', false),
  ('phase-2-automations.csv:21', 'Phase 2 · Credit Repair Active', 'Build cancellation and archive workflow', 'Cancellation processing, stop workflows, update stages, archive automation.', 'fulfillment', 'work_unit', false),
  ('phase-2-automations.csv:22', 'Phase 2 · Funding', 'Build funding consultation reminder', 'Email/SMS if allowed, advisor alert, stage movement.', 'sales', 'work_unit', false),
  ('phase-2-automations.csv:23', 'Phase 2 · Funding', 'Build document request automation', 'Docs requested, reminder sequence, internal task, docs received update.', 'fulfillment', 'work_unit', false),
  ('phase-2-automations.csv:24', 'Phase 2 · Funding', 'Build lender submission/status workflows', 'Submitted to lender, terms received, funded, not qualified, nurture, closed follow-up.', 'fulfillment', 'work_unit', false),
  ('phase-2-automations.csv:25', 'Phase 2 · Clarity/Education', 'Build clarity/education booking and follow-up', 'Booking confirmation, reminder sequence, post-call follow-up, upgrade trigger, nurture.', 'sales', 'work_unit', false),
  ('phase-2-automations.csv:26', 'Phase 2 · Chat & Conversations', 'Create and embed web chat widget', 'Widget embedded sitewide with service selection prompt, consent language, hours logic.', 'communication', 'work_unit', false),
  ('phase-2-automations.csv:27', 'Phase 2 · Chat & Conversations', 'Build chat routing workflows', 'Auto-tag, assign owner, create pipeline opportunity, missed chat follow-up, internal notification, manual takeover rule.', 'communication', 'work_unit', false),
  ('phase-2-automations.csv:28', 'Phase 2 · Payments', 'Create products/invoice templates if included', 'Products, invoice template, receipt template, tax settings, payment links, subscription logic if applicable.', 'billing', 'work_unit', true),
  ('phase-2-automations.csv:29', 'Phase 2 · Payments', 'Build failed payment and billing hold workflows', 'Failed payment automation, past-due reminders, billing hold, payment hold, refund request workflow, billing task.', 'billing', 'work_unit', false),
  ('phase-2-automations.csv:30', 'Phase 2 · Compliance', 'Build compliance hold workflow', 'Stops outbound SMS, removes from nurture, creates compliance task, notifies compliance owner, prevents billing/fulfillment triggers where needed.', 'fulfillment', 'work_unit', false),
  ('phase-2-automations.csv:31', 'Phase 2 · Internal Ops', 'Build internal task workflows', 'New lead, callback, no-show, agreement follow-up, missing docs, funding docs, billing issue, compliance review, refund, attorney mention tasks.', 'project_setup', 'work_unit', false),
  ('phase-2-automations.csv:32', 'Phase 2 · Workflow Documentation', 'Document every workflow', 'Name, purpose, trigger, conditions, actions, tags applied/removed, fields updated, pipeline movement, exit rules, compliance risks, test status.', 'project_setup', 'work_unit', false),
  ('phase-3-integrations.csv:3', 'Phase 3 · Social Channels', 'Connect Facebook page if included', 'Verify access, connect, test inbound messages, route to GHL, apply source tags.', 'marketing_ai', 'work_unit', true),
  ('phase-3-integrations.csv:4', 'Phase 3 · Social Channels', 'Connect Instagram if included', 'Verify access, connect, test DMs, route social leads, apply source tags.', 'marketing_ai', 'work_unit', true),
  ('phase-3-integrations.csv:5', 'Phase 3 · Social Channels', 'Connect TikTok if included', 'Connect where supported, document limitations, set source tracking.', 'marketing_ai', 'work_unit', true),
  ('phase-3-integrations.csv:6', 'Phase 3 · Social Channels', 'Connect Google Business Profile if included', 'Connect GBP/GMB, test messaging/reputation features where applicable.', 'marketing_ai', 'work_unit', true),
  ('phase-3-integrations.csv:7', 'Phase 3 · ManyChat', 'Build ManyChat connection if included', 'Connect ManyChat, map tags/fields, route leads into GHL, booking CTA, keyword triggers, opt-in logic.', 'integration', 'work_unit', true),
  ('phase-3-integrations.csv:8', 'Phase 3 · Reputation', 'Build review request workflow', 'Review link, GBP connection, positive review routing, negative feedback internal alert, post-service trigger.', 'marketing_ai', 'work_unit', false),
  ('phase-3-integrations.csv:9', 'Phase 3 · Marketing Campaigns', 'Build lead nurture campaigns', 'Credit education, funding nurture, commercial funding, clarity, reactivation, DIY product, membership/ebook follow-up as applicable.', 'marketing_ai', 'work_unit', false),
  ('phase-3-integrations.csv:10', 'Phase 3 · Marketing Campaigns', 'Review marketing copy for risk', 'Remove guarantees, income claims, credit score guarantees, funding guarantees, false urgency, misleading financial promises.', 'marketing_ai', 'work_unit', false),
  ('phase-3-integrations.csv:11', 'Phase 3 · AI', 'Configure AI chat if included', 'AI chat setup, knowledge base, response rules, qualification logic, handoff, fallback, restricted claims list, testing.', 'marketing_ai', 'work_unit', true),
  ('phase-3-integrations.csv:12', 'Phase 3 · AI', 'Test AI compliance guardrails', 'AI must not give legal/financial advice, guarantee funding/credit outcomes, promise timelines, override holds, or send SMS without consent.', 'qa_launch', 'qa', false),
  ('phase-3-integrations.csv:13', 'Phase 3 · Integrations', 'Build Zapier/Pabbly integrations if included', 'Configure triggers/actions, field maps, test records, failure alerts, owner/fallback process.', 'integration', 'work_unit', true),
  ('phase-3-integrations.csv:14', 'Phase 3 · Integrations', 'Build Google Sheets/Drive storage flows', 'Lead/client exports, funding tracker, document routing, secure folder links, status updates as included.', 'integration', 'work_unit', false),
  ('phase-3-integrations.csv:15', 'Phase 3 · Integrations', 'Build DisputeFox data flow if included', 'Map fields, send lead/client/onboarding info, create internal tasks, store DisputeFox ID, test handoff, document limits.', 'integration', 'work_unit', true),
  ('phase-3-integrations.csv:16', 'Phase 3 · Integrations', 'Build Slack/team alerts if included', 'Route critical internal alerts for leads, docs, billing issues, compliance holds, complaints.', 'integration', 'work_unit', true),
  ('phase-3-integrations.csv:17', 'Phase 3 · Tracking', 'Connect GA4 if included', 'GA4 installed, page view and conversion events tested.', 'reporting', 'work_unit', true),
  ('phase-3-integrations.csv:18', 'Phase 3 · Tracking', 'Connect Meta/Facebook Pixel if included', 'Pixel installed, lead/booking/application events tested.', 'reporting', 'work_unit', true),
  ('phase-3-integrations.csv:19', 'Phase 3 · Tracking', 'Configure UTM capture and reporting', 'UTM source/medium/campaign fields populate and flow into reporting.', 'reporting', 'work_unit', false),
  ('phase-3-integrations.csv:20', 'Phase 3 · Reporting', 'Build reporting dashboards', 'Lead source report, speed-to-lead, appointment show rate, revenue, funding status, credit lifecycle, billing issue, compliance hold.', 'reporting', 'work_unit', false),
  ('phase-4-optimization.csv:3', 'Phase 4 · Membership/Portal', 'Build client portal if included', 'Client portal/login, resource links, status links, support contact, access rules.', 'portal_membership', 'work_unit', true),
  ('phase-4-optimization.csv:4', 'Phase 4 · Membership/Portal', 'Build membership/course area if included', 'Offer, access rule, login page, welcome email, modules, lessons, drip rules, support channel.', 'portal_membership', 'work_unit', true),
  ('phase-4-optimization.csv:5', 'Phase 4 · Digital Products', 'Build ebook/DIY product delivery if included', 'Payment trigger, access email, download link, support fallback, failed access workflow.', 'portal_membership', 'work_unit', true),
  ('phase-4-optimization.csv:6', 'Phase 4 · Client Experience', 'Review lead-to-client journey', 'Test and optimize entry, booking, agreement, onboarding, funding, credit lifecycle, support, cancellation, complaint paths.', 'support_optimization', 'work_unit', false),
  ('phase-4-optimization.csv:7', 'Phase 4 · Optimization', 'Optimize workflow timing', 'Review wait steps, duplicate notifications, unnecessary alerts, field updates, exit rules.', 'support_optimization', 'work_unit', false),
  ('phase-4-optimization.csv:8', 'Phase 4 · Optimization', 'Optimize page/form clarity', 'Review CTA clarity, form field order, mobile layout, compliance placement, support references.', 'support_optimization', 'work_unit', false),
  ('phase-4-optimization.csv:9', 'Phase 4 · Optimization', 'Clean tag and field usage', 'Remove unused/duplicate tags, confirm custom fields are used correctly, no placeholder values live.', 'support_optimization', 'work_unit', false),
  ('phase-4-optimization.csv:10', 'Phase 4 · Training Prep', 'Prepare owner/admin training', 'Dashboard, contacts, pipelines, conversations, calendars, reporting, what not to edit, support process.', 'onboarding_support', 'work_unit', false),
  ('phase-4-optimization.csv:11', 'Phase 4 · Training Prep', 'Prepare team-role training', 'Sales, funding advisor, credit specialist, fulfillment, billing, compliance, support, VA training notes.', 'onboarding_support', 'work_unit', false),
  ('phase-4-optimization.csv:12', 'Phase 4 · SOP/Handoff', 'Prepare system overview', 'Pipeline guide, workflow guide, form guide, calendar guide, payment guide, integration guide, support process, known limitations.', 'support_optimization', 'work_unit', false),
  ('phase-4-optimization.csv:13', 'Phase 4 · Support System', 'Set up 3-month support tracker', 'Support request categories, priority levels, issue status, owner, response/resolution notes, client updates.', 'support_optimization', 'work_unit', false),
  ('phase-4-optimization.csv:14', 'Phase 4 · Support System', 'Define support boundaries', 'Bug fixes, minor updates, workflow corrections, basic troubleshooting, usage questions included. New builds/major redesigns/custom code/legal review excluded unless approved.', 'support_optimization', 'work_unit', false),
  ('phase-5-qa-delivery.csv:3', 'Phase 5 · Website QA', 'Test all website pages', 'Home, How It Works, Services, About, FAQ, Schedule, Contact, disclosures, privacy, terms, cancellation, funding pages, 404.', 'qa_launch', 'qa', false),
  ('phase-5-qa-delivery.csv:4', 'Phase 5 · Website QA', 'Test page technical quality', 'Mobile, desktop, buttons, footer links, SSL, favicon, meta, OG, pixels, GA4, no broken links.', 'qa_launch', 'qa', false),
  ('phase-5-qa-delivery.csv:5', 'Phase 5 · Form QA', 'Test all lead/intake forms', 'Universal, credit, funding, commercial funding, clarity, onboarding, docs, cancellation, client update, complaint forms.', 'qa_launch', 'qa', false),
  ('phase-5-qa-delivery.csv:6', 'Phase 5 · Form QA', 'Confirm form routing', 'Contact created, fields updated, tags applied, opportunity created, pipeline/stage correct, owner assigned, notification sent, workflow triggered.', 'qa_launch', 'qa', false),
  ('phase-5-qa-delivery.csv:7', 'Phase 5 · Pipeline QA', 'Test all pipelines', 'Credit Sales, Credit Active, Funding, Clarity/Education, Support/Risk. Check stages, movement, duplicates, owner, source tracking.', 'qa_launch', 'qa', false),
  ('phase-5-qa-delivery.csv:8', 'Phase 5 · Workflow QA', 'Test lead and appointment workflows', 'Speed-to-lead, booking confirmation, reminders, no-show, consultation outcome, nurture.', 'qa_launch', 'qa', false),
  ('phase-5-qa-delivery.csv:9', 'Phase 5 · Workflow QA', 'Test agreement/onboarding/credit lifecycle workflows', 'Agreement sent/signed, cooling-off, manual billing safeguard, onboarding, documents, monitoring, round advancement, cancellation/archive.', 'qa_launch', 'qa', false),
  ('phase-5-qa-delivery.csv:10', 'Phase 5 · Workflow QA', 'Test funding workflows', 'Document request, docs received, lender submission, terms received, funded, not qualified, nurture.', 'qa_launch', 'qa', false),
  ('phase-5-qa-delivery.csv:11', 'Phase 5 · Communication QA', 'Test phone and SMS', 'Inbound/outbound calls, inbound/outbound SMS, voicemail, missed-call text-back, after-hours, STOP, HELP, DND, no-consent block.', 'qa_launch', 'qa', false),
  ('phase-5-qa-delivery.csv:12', 'Phase 5 · Communication QA', 'Test email sending', 'Gmail, Outlook, reply-to, footer, unsubscribe, suppression, tracking links, spam placement.', 'qa_launch', 'qa', false),
  ('phase-5-qa-delivery.csv:13', 'Phase 5 · Compliance QA', 'Verify compliance guardrails', 'STOP applies DND, DNC blocks SMS, no-consent SMS blocked, holds stop outbound, cooling-off works, no prohibited claims in pages/templates/AI/voicemail.', 'qa_launch', 'qa', false),
  ('phase-5-qa-delivery.csv:14', 'Phase 5 · Integration QA', 'Test integrations', 'Zapier/Pabbly, DisputeFox, ManyChat, Google Sheets/Drive, Stripe events, Slack/team alerts, social channels, webhooks.', 'qa_launch', 'qa', false),
  ('phase-5-qa-delivery.csv:15', 'Phase 5 · Permission QA', 'Test role permissions', 'Admin, Sales, Funding, Credit, Fulfillment, Billing, Compliance, Support, VA. Confirm restrictions and sensitive access controls.', 'qa_launch', 'qa', false),
  ('phase-5-qa-delivery.csv:16', 'Phase 5 · Cleanup', 'Remove test data and unused assets', 'Test contacts, opportunities, tags, workflows, draft pages, broken links, placeholder values, duplicate workflows, demo forms, test payments.', 'qa_launch', 'work_unit', false),
  ('phase-5-qa-delivery.csv:17', 'Phase 5 · Delivery', 'Prepare final delivery package', 'Testing log, delivery notes, known limitations, pending approvals, training schedule, walkthrough recording, support handoff, sign-off request, support start date.', 'qa_launch', 'work_unit', false),
  ('phase-5-qa-delivery.csv:18', 'Phase 5 · Training', 'Deliver user training if scheduled', 'Owner/admin and team-role training based on selected support/training package.', 'onboarding_support', 'work_unit', true),
  ('phase-5-qa-delivery.csv:19', 'Phase 5 · Go-Live', 'Client go-live confirmation', 'Client approves launch readiness, open risks documented, final support window activated.', 'qa_launch', 'work_unit', false)
  )
  insert into public.crm_requirements
    (agency_id, source_reference, source_row_ref, source_section, title, detail,
     engine_key, kind, optional, import_batch_id, classified_at)
  select v_agency, 'BES_GHL_Full_Infrastructure_Build_Tracker.xlsx',
         i.source_row_ref, i.source_section, i.title, i.detail,
         i.engine_key, i.kind, i.optional, v_batch, now()
    from incoming i
  on conflict (agency_id, source_reference, source_row_ref) do update
     set source_section = excluded.source_section,
         title          = excluded.title,
         detail         = excluded.detail,
         engine_key     = excluded.engine_key,
         kind           = excluded.kind,
         optional       = excluded.optional,
         import_batch_id = excluded.import_batch_id,
         classified_at  = now();

  raise notice 'Build library: % requirements, % unclassified',
    (select count(*) from public.crm_requirements where agency_id = v_agency),
    (select count(*) from public.crm_requirements where agency_id = v_agency and engine_key is null);
end $import$;
