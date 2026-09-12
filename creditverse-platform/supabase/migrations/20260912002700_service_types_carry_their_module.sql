-- =============================================================================
-- A service type says which MODULE it belongs to.
--
-- Dee, 2026-09-12: "Add a canonical module relationship to
-- `partner_service_types`. This should solve the problem for ALL modules, not
-- just Marketing… Do NOT use `category` for this. `category` and `module` are
-- different dimensions."
--
-- She is right that they are different, and the gap was real: nothing derived
-- a module from a service. `category` says what KIND of work it is —
-- Fulfillment, Project, Staffing — and two services in the same category can
-- belong to different modules. GHL Build and Website Build are both `Project`;
-- both are BES CRM. TalentOps and Client Support are both `Staffing`; one is
-- TalentOps and one is CreditOps support.
--
-- ── AMBIGUOUS STAYS NULL ────────────────────────────────────────────────────
--
-- Dee: "Do not guess ambiguous service types. If ambiguous: leave module null
-- and surface them for review. Do not accidentally make every current Partner
-- appear in every module."
--
-- So only the unambiguous ones are mapped. CONSULTING, CUSTOM and
-- MONTHLY_RETAINER are deliberately left null: a monthly retainer could be for
-- any module, and filing it under one would put partners in a module nobody
-- sold them.
--
-- ── THE STAFFING ONES ───────────────────────────────────────────────────────
--
-- CLIENT_SUPPORT, CLIENT_SUCCESS, DEDICATED_STAFF, EXECUTIVE_ASSISTANT,
-- HOURLY_SUPPORT and OPERATIONS_MANAGEMENT are people BES supplies. They are
-- TalentOps by nature — but they are ALSO what `module_categories` already
-- uses to file a partner under CreditOps Outsourcing. Mapping them to
-- TalentOps here would not disturb that, because CreditOps visibility reads
-- `fulfillment_engagements.service`, not this column. Left null anyway: they
-- are exactly the "ambiguous" Dee named, and nothing needs them today.
-- =============================================================================

alter table public.partner_service_types
  add column if not exists module public.fulfillment_service;

comment on column public.partner_service_types.module is
  'Which FullSuite module this service belongs to. A different dimension from `category`: GHL Build and Website Build are both Project-category and both BES CRM, while TalentOps and Client Support are both Staffing-category and belong to different modules. Null means nobody has decided — surfaced for review rather than guessed (Dee, 2026-09-12).';

update public.partner_service_types set module = 'creditops'  where code = 'CREDITOPS_FULFILLMENT';
update public.partner_service_types set module = 'fundingops' where code = 'FUNDINGOPS';
update public.partner_service_types set module = 'bes_crm'
 where code in ('BES_CRM', 'GHL_BUILD', 'AUTOMATION_BUILD', 'WEBSITE_BUILD', 'FUNNEL_BUILD');
update public.partner_service_types set module = 'talentops' where code = 'TALENTOPS';

-- ── The smallest Marketing catalogue that proves the architecture ───────────
/**
 * Dee, 2026-09-12: "Do NOT invent a large Marketing service catalog… Keep the
 * first catalogue SMALL and editable… Service catalogue labels are not
 * permission to invent BES pricing."
 *
 * Five operational types, no price attached to any of them, all renameable
 * and de-activatable as rows. Nothing here creates a package or a commitment.
 */
insert into public.partner_service_types (code, label, category, module, sort, active) values
  ('SOCIAL_MEDIA',      'Social Media Management',        'Marketing', 'sales_marketing', 10, true),
  ('CONTENT_CREATIVE',  'Content & Creative',             'Marketing', 'sales_marketing', 20, true),
  ('MARKETING_OPS',     'Marketing Operations',           'Marketing', 'sales_marketing', 30, true),
  ('LEAD_GENERATION',   'Lead Generation',                'Marketing', 'sales_marketing', 40, true),
  ('APPOINTMENT_SETTING','Appointment Setting / Sales Support','Marketing','sales_marketing', 50, true)
on conflict (code) do update
  set label = excluded.label, category = excluded.category,
      module = excluded.module, active = true;

-- ── Module capabilities, the same shape as every other module ──────────────
/* `permission_keys.module` is the GROUPING LABEL the access screen shows, a
   separate thing from `partner_service_types.module` which is the canonical
   service→module relationship. Same word, two jobs; matched to the existing
   display convention rather than the enum. */
insert into public.permission_keys (key, module, label, description, security_relevant, sort, owner_gated) values
  ('marketing.workspace.view', 'Sales & Marketing', 'Sales & Marketing — view',
   'See the Sales & Marketing module, its partners and their work.', false, 10, false),
  ('marketing.tasks.manage', 'Sales & Marketing', 'Sales & Marketing — work',
   'Create, assign and complete marketing tasks, content and campaigns.', false, 20, false)
on conflict (key) do update
  set module = excluded.module, label = excluded.label, description = excluded.description;

-- ── What still needs a decision ────────────────────────────────────────────
create or replace view public.service_types_needing_module as
  select code, label, category
    from public.partner_service_types
   where active and module is null;

comment on view public.service_types_needing_module is
  'Active service types nobody has assigned a module to. Surfaced rather than guessed: filing a monthly retainer under one module would put partners in a module nobody sold them (Dee, 2026-09-12).';

grant select on public.service_types_needing_module to authenticated;
